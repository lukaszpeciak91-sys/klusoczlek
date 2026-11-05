import Phaser from 'phaser';
import {AIRSHIP_WORLD,DECK_POLYGON,AIRSHIP_LAYERS,stepDeckPosition,scrollCloudLayers,clampToDeck,avoidWheelhouse} from './airship-contract.js';
import {createHorizontalParallaxLayer} from './airship-parallax.js';
import {PADDLEWHEEL_MOUNT,paddlewheelDisplaySize,advancePaddlewheelAngle} from './airship-paddlewheel.js';
import {currentCampaignRun,prepareActStart,updateRunEquipment,completeCampaignAct} from './campaign-run.js';
import {createPlayer} from './player.js';
import {createPlayerVisual,assetUrl} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {arenaHudLayout} from './ui-layout.js';
import {normalizeInput} from './movement.js';
import {facingOf} from './combat-contract.js';
import {WEAPONS,cycleUnlockedWeapon} from './weapon-progression.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {createGliderDelivery} from './glider-visual.js';
import {AIRSHIP_CAPTAIN_START,AIRSHIP_ALOES_START,createCaptainPatrol,advanceCaptainPatrol,ACT2_BATTLE_CRIES,eligibleAct2Bark} from './act2-staging.js';
import {playerFrame} from './combat-contract.js';
import {DIALOGUES,createDialogueState,beginDialogue} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {CAPTAIN_VISUAL_SCALE,createCaptainArrival} from './captain-arrival.js';
import {createAirshipDefense,AIRSHIP_SURVIVAL_MS,AIRSHIP_GROUND_CAP,tickAirshipDefense,finishAirshipDefense} from './airship-defense.js';
import {createAirshipCombat} from './airship-combat.js';
import {updateRunHealth} from './campaign-run.js';
import {resolveAim} from './shooting.js';
import {formatGameplayClock,advanceGameplayClock} from './gameplay-clock.js';
import {updateBursts} from './pixel-death-vfx.js';

const DECK_TEXTURE='airship-deck-approved';
export class AirshipScene extends Phaser.Scene {
  constructor(){super('Airship');}
  init(data={}){this.handoff=data.handoff??null;this.debugCheckpoint=data.debugCheckpoint??null;}
  create(){
    this.campaignRun=currentCampaignRun(this.game);
    const registered=new Set(Object.keys(this.scene.manager.keys));
    if(!prepareActStart(this.campaignRun,this.handoff,registered)){
      console.warn('[Airship] Missing or invalid Act II campaign handoff');
      this.scene.start('Menu');return;
    }
    this.cameras.main.setBackgroundColor('#6b9db7');
    this.cameras.main.setBounds(0,0,AIRSHIP_WORLD.width,AIRSHIP_WORLD.height);
    this.physics.world.setBounds(0,0,AIRSHIP_WORLD.width,AIRSHIP_WORLD.height);
    this.layers=[];
    this.optionalArtStatus={};
    this.artAbort=new AbortController();
    this.artAlive=true;
    const skyColors=[0x6798b4,0xd0d7d3,0xb9ced0,0xf0e7d9];
    for(let i=0;i<AIRSHIP_LAYERS.length;i++){
      const def=AIRSHIP_LAYERS[i],key='airship-fallback-'+def.id;
      if(!this.textures.exists(key)){
        const graphics=this.make.graphics({x:0,y:0});
        graphics.fillStyle(i===0?skyColors[0]:skyColors[i],i===0?1:0.65);
        graphics.fillRect(0,0,512,256);
        if(i>0){
          graphics.fillStyle(0xffffff,0.4+i*.11);
          for(let k=0;k<6;k++){
            const x=k*96+17,y=58+(k%3)*63;
            graphics.fillEllipse(x,y,130,45);
            graphics.fillEllipse(x+35,y-12,91,37);
          }
        }
        graphics.generateTexture(key,512,256);
        graphics.destroy();
      }
      const layer=createHorizontalParallaxLayer(this,def,key);
      this.layers.push(layer);
      void this.loadOptional(def.path,'airship-approved-'+def.id,layer);
    }
    const geometry=this.add.graphics().setDepth(0);
    geometry.fillStyle(0x141e25,0.46).fillEllipse(480,289,855,410);
    geometry.fillStyle(0x6c4c32).fillPoints(DECK_POLYGON,true);
    geometry.lineStyle(7,0xd2ac67,1).strokePoints(DECK_POLYGON,true);
    geometry.lineStyle(2,0x332a27,1).strokePoints(DECK_POLYGON,true);
    geometry.lineStyle(2,0x96734d,0.55);
    for(let y=124;y<452;y+=27)geometry.lineBetween(132,y,828,y);
    this.deckVisual=geometry;
    this.deckArt=this.add.image(480,270,'airship-fallback-sky').setDepth(1).setVisible(false);
    // Approved PNG owns its silhouette; prototype polygon is fallback only.
    // Provisional rails remain only when the approved deck is unavailable.
    this.rails=this.add.graphics().setDepth(5);
    this.rails.lineStyle(6,0x2b2423,1).strokePoints(DECK_POLYGON,true);
    this.rails.lineStyle(3,0xe4c183,1).strokePoints(DECK_POLYGON,true);
    // The fallback rail object must exist before a cached texture can hide it.
    void this.loadOptional('arenas/airship-deck.png',DECK_TEXTURE,this.deckArt,'deck');
    // Tall building and wheel are art sprites; the roof is not a collision box.
    this.wheelhouse=this.add.image(480,218,'airship-fallback-sky')
      .setOrigin(.5,1).setDepth(9).setVisible(false);
    void this.loadOptional('obstacles/airship-wheelhouse.png','airship-wheelhouse-approved',this.wheelhouse,'wheelhouse');
    // Approved symmetric wheel: one Image rotating about its hub.
    this.paddlewheel=this.add.image(PADDLEWHEEL_MOUNT.x,PADDLEWHEEL_MOUNT.y,'airship-fallback-sky')
      .setOrigin(.5,.5).setDepth(PADDLEWHEEL_MOUNT.depth).setVisible(false);
    void this.loadOptional('obstacles/airship-paddlewheel.png','airship-paddlewheel-approved',this.paddlewheel,'paddlewheel');
    this.player=createPlayer(this,AIRSHIP_ALOES_START.x,AIRSHIP_ALOES_START.y);
    this.player.body.setVelocity(0,0);
    // Keep UI/joystick pixels at 1:1; follow in world space instead of zooming the HUD.
    this.cameras.main.startFollow(this.player,true,0.12,0.12);
    this.facingMarker=this.add.triangle(this.player.x,this.player.y,0,-28,-7,-15,7,-15,0xe9d6ab).setDepth(11);
    this.playerVisual=createPlayerVisual(this,this.player,this.facingMarker,Phaser);
    this.weapon=this.campaignRun.selectedWeapon;
    this.unlockedWeapons=new Set(this.campaignRun.unlockedWeapons);
    // During the opening conversation Aloes carries no visible weapon.
    // The actual equipped weapon and entitlements remain unchanged in campaign state.
    void this.playerVisual.setVariant('unarmed');
    this.playerHp=this.campaignRun.hp;
    this.maxHp=this.campaignRun.maxHp;
    this.invulnerableUntil=0;
    this.focusSuspended=false;
    this.openingPhase='overview';
    this.openingElapsed=0;
    this.shakeTriggered=0;
    this.defense=createAirshipDefense();
    this.joystick=createJoystick(this,'left');
    this.aimJoystick=createJoystick(this,'right');
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.lastFacing='e';
    this.mouseHeld=false;
    this.mouseAim={x:0,y:0};
    const onWeaponKey=event=>{
      if(event.repeat||this.openingPhase!=='active')return;
      if(event.code==='KeyQ')this.cycleWeapon();
      else {
        const weapon=({Digit1:'blunderbuss',Digit2:'rifle',Digit3:'flamethrower'})[event.code];
        if(weapon)this.selectWeapon(weapon);
      }
    };
    this.input.keyboard.on('keydown',onWeaponKey);
    const mouseDown=pointer=>{
      if(pointer.wasTouch!==false||!pointer.leftButtonDown()||!this.canFire())return;
      const l=this.hudLayout;
      if(Math.abs(pointer.x-l.menuX)<=l.menuWidth/2+8&&Math.abs(pointer.y-l.menuY)<=l.menuHeight/2+8)return;
      if(Math.hypot(pointer.x-l.switchX,pointer.y-l.switchY)<=l.switchSize/2+8)return;
      this.mouseHeld=true;
    };
    const mouseUp=pointer=>{if(pointer.wasTouch===false||!pointer)this.mouseHeld=false;};
    this.input.on('pointerdown',mouseDown);
    for(const event of ['pointerup','pointerupoutside','pointercancel'])this.input.on(event,mouseUp);
    this.hudLayout=arenaHudLayout(this.scale.height,this.scale.width);
    this.menuButton=this.add.rectangle(0,0,80,38,0x2b3324,0.95)
      .setStrokeStyle(2,0xb9a16b).setScrollFactor(0).setDepth(60).setInteractive({useHandCursor:true});
    this.menuLabel=this.add.text(0,0,'MENU',{fontFamily:'monospace',fontSize:'17px',color:'#e8d6a5'})
      .setOrigin(.5).setScrollFactor(0).setDepth(61);
    this.menuButton.on('pointerdown',()=>this.openMenu());
    this.hpFace=createHpFaceHud(this,Phaser);
    this.hpFace.setHp(this.playerHp);
    this.hpText=this.add.text(0,0,'HP '+this.playerHp+'/'+this.maxHp,{fontFamily:'monospace',fontSize:'13px',color:'#f3e8d1'})
      .setOrigin(.5,0).setScrollFactor(0).setDepth(81);
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponBody=this.add.circle(0,0,21,0x303b2b).setStrokeStyle(2,0xb9a16b);
    this.weaponText=this.add.text(0,0,'—',{fontFamily:'monospace',fontSize:'21px',color:'#ffffff'}).setOrigin(.5);
    this.weaponToken.add([this.weaponBody,this.weaponText]);
    this.switchLabel=this.add.text(0,0,'',{fontFamily:'monospace',fontSize:'11px',color:'#f6e9cc'})
      .setOrigin(.5).setScrollFactor(0).setDepth(67);
    this.syncWeaponHud();
    this.pressureBar=this.add.graphics().setScrollFactor(0).setDepth(68);
    this.gliderDelivery=createGliderDelivery(this);
    this.combat=createAirshipCombat(this,this.gliderDelivery);
    // Non-combat Captain, visually reused from Act I's already loaded 8-frame sheet.
    this.captainActor=this.add.container(AIRSHIP_CAPTAIN_START.x,AIRSHIP_CAPTAIN_START.y).setDepth(11);
    this.captainPatrol=createCaptainPatrol();
    this.captainSprite=null;
    this.captainActor.add(this.add.ellipse(0,1,38,10,0x241b16,0.24));
    if(this.textures.exists('npc-captain')){
      const height=this.textures.get('npc-captain').source[0].height;
      this.captainSprite=this.add.sprite(0,-height*CAPTAIN_VISUAL_SCALE/2,'npc-captain',4).setScale(CAPTAIN_VISUAL_SCALE);
      this.captainActor.add(this.captainSprite);
    }else{
      this.captainActor.add(this.add.rectangle(0,-26,38,51,0x456e83));
      this.captainActor.add(this.add.circle(0,-63,16,0xe7b28d));
      // DEBUG may enter Act II before Act I has loaded the approved Captain PNG.
      // Reuse its existing validated eight-direction loader, never a new sheet.
      const captainLoader=createCaptainArrival(this);
      void captainLoader.loading.then(()=>{
        if(!this.sys.isActive()||!this.captainActor?.active||
            this.captainSprite||!this.textures.exists('npc-captain'))return;
        for(const fallback of this.captainActor.list.slice(1))fallback.destroy();
        const height=this.textures.get('npc-captain').source[0].height;
        this.captainSprite=this.add.sprite(0,-height*CAPTAIN_VISUAL_SCALE/2,
          'npc-captain',playerFrame(this.openingPhase==='active'?this.captainPatrol.facing:'w'))
          .setScale(CAPTAIN_VISUAL_SCALE);
        this.captainActor.add(this.captainSprite);
      });
    }
    this.act2Bark=this.add.text(0,0,'',{fontFamily:'monospace',fontSize:'13px',fontStyle:'bold',color:'#fff1c9',backgroundColor:'#1c2028',padding:{x:5,y:3}})
      .setOrigin(.5,1).setDepth(49).setVisible(false);
    this.barkElapsed=0;this.barkUntil=0;this.barkOrdinal=0;
    this.dialogueState=createDialogueState();
    this.dialoguePanel=createDialoguePanel(this,Phaser,id=>{
      if(id==='act2-opening')this.startDefense();
      if(id==='act2-finale')this.beginFinalResultsFade();
    },state=>{
      if(state.id==='act2-opening'&&state.index===DIALOGUES['act2-opening'].findIndex(line=>line[2]==='O nie! Kłusoczłeku! Chwyć za broń!')&&this.shakeTriggered===0){
        this.shakeTriggered=1;this.cameras.main.shake(200,0.005);
      }
    });
    this.objectiveText=this.add.text(0,0,'WYTRZYMAJ 03:00',{
      fontFamily:'monospace',fontSize:'18px',fontStyle:'bold',color:'#ffdd95'
    }).setOrigin(.5).setScrollFactor(0).setDepth(80).setVisible(false);
    this.defenseKillsText=this.add.text(0,0,'POKONANI 0',{
      fontFamily:'monospace',fontSize:'12px',color:'#f4e8cf'
    }).setOrigin(.5).setScrollFactor(0).setDepth(80).setVisible(false);
    this.resultOverlay=this.add.container(0,0).setScrollFactor(0).setDepth(175).setVisible(false);
    this.resultBackground=this.add.rectangle(0,0,1,1,0x11181e,0.96).setOrigin(0);
    this.resultLabel=this.add.text(0,0,'',{fontFamily:'monospace',fontSize:'21px',fontStyle:'bold',color:'#f3ca76',align:'center'}).setOrigin(.5);
    this.resultDetails=this.add.text(0,0,'',{fontFamily:'monospace',fontSize:'14px',color:'#e9d9c2',align:'center'}).setOrigin(.5);
    this.resultOverlay.add([this.resultBackground,this.resultLabel,this.resultDetails]);
    this.resultsButton=this.add.rectangle(0,0,114,35,0x655039)
      .setStrokeStyle(2,0xd9bd80).setScrollFactor(0).setDepth(194)
      .setInteractive({useHandCursor:true}).setVisible(false);
    this.resultsButtonText=this.add.text(0,0,'DALEJ',{
      fontFamily:'monospace',fontSize:'17px',color:'#fff2d6'
    }).setOrigin(.5).setScrollFactor(0).setDepth(195).setVisible(false);
    this.resultsArmedAt=Infinity;
    this.resultsButton.on('pointerdown',()=>this.completeAct2());
    this.pickup=null;
    if(this.weapon===null){
      this.pickup=this.add.container(563,275).setDepth(12).setVisible(false);
      this.pickup.add(this.add.circle(0,0,19,0xb49a4e).setStrokeStyle(2,0x392d26));
      this.pickup.add(this.add.text(0,0,'ϟ',{fontFamily:'monospace',fontSize:'24px',color:'#f5e6b4'}).setOrigin(.5));
    }
    this.cameras.main.stopFollow();
    this.frameFullShip();
    const touchSwitch=pointer=>{
      if(pointer.id===this.joystick.pointerId||pointer.id===this.aimJoystick.pointerId)return;
      const l=this.hudLayout;
      if(Math.hypot(pointer.x-l.switchX,pointer.y-l.switchY)<l.switchSize/2)this.cycleWeapon();
    };
    this.input.on('pointerdown',touchSwitch);
    const resize=()=>{
      const w=this.scale.width,h=this.scale.height,l=arenaHudLayout(h,w);
      this.hudLayout=l;
      this.mouseHeld=false;
      this.combat?.stopFire();
      for(const layer of this.layers)layer.setSize(w,h);
      this.joystick.reposition(l.joystickX,l.joystickY,l.joystickRadius);
      this.aimJoystick.reposition(l.aimX,l.aimY,l.joystickRadius);
      this.menuButton.setPosition(l.menuX,l.menuY).setSize(l.menuWidth,l.menuHeight);
      this.menuLabel.setPosition(l.menuX,l.menuY).setFontSize(l.menuFont);
      this.hpFace.resize(l);this.hpText.setPosition(l.hpX,l.hpY);
      this.weaponToken.setPosition(l.switchX,l.switchY).setScale(l.switchSize/42);
      this.switchLabel.setPosition(l.switchX,l.switchY-l.switchSize/2-12);
      if(this.openingPhase==='overview')this.frameFullShip();
      else if(this.openingPhase!=='zoom')this.cameras.main.setZoom(1);
      this.objectiveText.setPosition(w/2,Math.max(13,l.menuY-2));
      this.defenseKillsText.setPosition(w/2,Math.max(30,l.menuY+22));
      this.resultBackground.setSize(w,h);
      this.resultLabel.setPosition(w/2,h*.43).setWordWrapWidth(w-20);
      this.resultDetails.setPosition(w/2,h*.62).setWordWrapWidth(w-20);
      this.resultsButton.setPosition(w/2,h-25);
      this.resultsButtonText.setPosition(w/2,h-25);
      this.onFocus?.();
    };
    resize();
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.artAlive=false;this.artAbort.abort();
      for(const layer of this.layers)layer.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE,resize);
      this.input.off('pointerdown',touchSwitch);
      this.input.keyboard.off('keydown',onWeaponKey);
      this.input.off('pointerdown',mouseDown);
      for(const event of ['pointerup','pointerupoutside','pointercancel'])this.input.off(event,mouseUp);
      window.removeEventListener('blur',this.onBlur);
      window.removeEventListener('focus',this.onFocus);
      document.removeEventListener('visibilitychange',this.onVisibility);
      this.gliderDelivery?.shutdown();
      this.combat?.cleanup();
      this.pressureBar?.destroy();this.resultsButton?.destroy();this.resultsButtonText?.destroy();
      this.playerVisual.destroy();this.hpFace.destroy();
    });
    this.resetMovement=()=>{
      this.joystick.reset();this.aimJoystick.reset();this.input.keyboard.resetKeys();
      this.mouseHeld=false;this.mouseAim={x:0,y:0};
      this.combat.stopFire();
    };
    this.onBlur=()=>{
      this.focusSuspended=true;
      advanceGameplayClock(this.defense.clock,0,false);
      this.resetMovement();this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
      this.combat.stopFire();
    };
    this.onFocus=()=>{
      if(document.hasFocus())this.focusSuspended=false;
      const allowed=this.openingPhase==='active'&&!this.focusSuspended&&!document.hidden&&document.hasFocus()&&
        window.innerWidth>=window.innerHeight&&!this.scene.isPaused();
      this.joystick.setEnabled(allowed);this.aimJoystick.setEnabled(allowed);
      if(!allowed)advanceGameplayClock(this.defense.clock,0,false);
    };
    this.onVisibility=()=>document.hidden?this.onBlur():this.onFocus();
    window.addEventListener('blur',this.onBlur);
    window.addEventListener('focus',this.onFocus);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.events.on(Phaser.Scenes.Events.RESUME,()=>{
      document.getElementById('fullscreen-button').hidden=true;this.onFocus();
    });
    document.getElementById('fullscreen-button').hidden=true;
    this.onFocus();
    this.setOpeningHud(false);
    if(this.debugCheckpoint)this.applyDebugCheckpoint(this.debugCheckpoint);
    this.cameras.main.fadeIn(240,0,0,0);
    enforceOrientationOnSceneStart(this);
  }
  async loadOptional(path,key,target,kind=null){
    try{
      if(!this.textures.exists(key)){
        const response=await fetch(assetUrl(import.meta.env.BASE_URL,path),{signal:this.artAbort.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        const blob=await response.blob(),image=await createImageBitmap(blob);
        if(!this.artAlive){image.close();return;}
        this.textures.addImage(key,image);
      }
      if(!this.artAlive)return;
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      target.setTexture(key);
      if(kind==='deck'){
        const tex=this.textures.get(key).getSourceImage();
        const fit=Math.min(804/tex.width,384/tex.height);
        target.setDisplaySize(tex.width*fit,tex.height*fit).setVisible(true);
        this.deckVisual.setVisible(false);this.rails.setVisible(false);
      }else if(kind==='wheelhouse'){
        target.setDisplaySize(120,174).setVisible(true);
      }else if(kind==='paddlewheel'){
        const source=this.textures.get(key).getSourceImage();
        const size=paddlewheelDisplaySize(source.width,source.height);
        target.setOrigin(.5,.5).setDisplaySize(size.width,size.height).setVisible(true);
      }
      this.optionalArtStatus[path]='loaded';
    }catch(error){
      if(this.artAlive){this.optionalArtStatus[path]='fallback';console.info('[Airship] procedural fallback for '+path+': '+error.message);}
    }
  }
  syncWeaponHud(){
    const def=this.weapon?WEAPONS[this.weapon]:null;
    this.weaponText?.setText(def?.symbol??'—');
    this.weaponBody?.setFillStyle(def?.color??0x6b6153);
    this.switchLabel?.setText(def?.label??'BEZ BRONI');
  }
  canFire(){
    return this.openingPhase==='active'&&!this.focusSuspended&&!document.hidden&&
      document.hasFocus()&&!this.scene.isPaused()&&!this.scene.isActive('Menu')&&
      window.innerWidth>=window.innerHeight;
  }
  selectWeapon(weapon){
    if(!this.canFire()||!this.unlockedWeapons.has(weapon)||this.weapon===weapon)return false;
    this.combat.stopFire();
    this.weapon=weapon;
    updateRunEquipment(this.campaignRun,this.unlockedWeapons,weapon);
    if(Object.hasOwn(WEAPONS,weapon))void this.playerVisual.setVariant(weapon);
    this.syncWeaponHud();
    return true;
  }
  cycleWeapon(){
    if(this.scene.isPaused()||document.hidden||this.openingPhase!=='active')return false;
    const next=cycleUnlockedWeapon(this.weapon,this.unlockedWeapons);
    if(!next||next===this.weapon)return false;
    return this.selectWeapon(next);
  }
  openMenu(){
    if(this.scene.isPaused()||this.scene.isActive('Menu'))return;
    this.resetMovement();this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
    advanceGameplayClock(this.defense.clock,0,false);
    this.combat.stopFire();
    this.scene.pause();this.scene.launch('Menu');this.scene.bringToTop('Menu');
  }
  renderPressureBar(){
    const g=this.pressureBar;
    g.clear();
    if(this.openingPhase!=='active'||this.weapon!=='flamethrower')return;
    const l=this.hudLayout,w=l.switchSize,x=l.switchX-w/2,y=l.switchY+l.switchSize/2+5;
    g.fillStyle(0x382721,0.95).fillRect(x,y,w,4);
    g.fillStyle(this.combat.pressure.value<20?0x9b3932:0xee903a).fillRect(x,y,w*this.combat.pressure.value/100,4);
  }
  applyDebugCheckpoint(id){
    if(!['act2-opening','act2-defense','act2-last15','act2-results'].includes(id))return false;
    if(id==='act2-opening')return true;
    // The combat checkpoint omits the introductory movie without faking its dialogue.
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(this.player.x,this.player.y);
    this.cameras.main.startFollow(this.player,true,0.12,0.12);
    this.openingPhase='dialogue';
    if(!this.startDefense())return false;
    if(id==='act2-last15'){
      this.defense.clock.elapsedMs=165000;
      this.defense.clock.lastNow=null;
      this.defense.elapsedMs=165000;
      this.defense.nextDeliveryMs=165500;
      this.objectiveText.setText('WYTRZYMAJ 00:15');
    }else if(id==='act2-results'){
      this.defense.clock.elapsedMs=180000;
      this.defense.elapsedMs=180000;
      this.finishDefense('survived');
    }
    return true;
  }
  frameFullShip(){
    const zoom=Math.min(this.scale.width/AIRSHIP_WORLD.width,this.scale.height/AIRSHIP_WORLD.height);
    this.cameras.main.setZoom(Math.min(1,zoom)).centerOn(AIRSHIP_WORLD.start.x,AIRSHIP_WORLD.start.y);
  }
  setOpeningHud(visible){
    this.menuButton.setVisible(visible);this.menuLabel.setVisible(visible);
    this.hpFace.root.setVisible(visible);this.hpText.setVisible(visible);
    this.weaponToken.setVisible(visible);this.switchLabel.setVisible(visible);
    this.objectiveText.setVisible(visible);this.defenseKillsText.setVisible(visible);
    if(!visible){this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);}
  }
  beginOpeningDialogue(){
    if(this.openingPhase!=='zoom')return;
    this.openingPhase='dialogue-loading';
    this.playerVisual.update('e',false,0);
    this.captainSprite?.setFrame(playerFrame('w'));
    void this.playerVisual.setVariant('unarmed');
    this.cameras.main.startFollow(this.player,true,0.12,0.12);
    this.cameras.main.setZoom(1);
    this.dialoguePanel.loading.finally(()=>{
      if(!this.sys.isActive()||this.openingPhase!=='dialogue-loading')return;
      this.openingPhase='dialogue';
      beginDialogue(this.dialogueState,'act2-opening');
      this.dialoguePanel.show(this.dialogueState);
    });
  }
  startDefense(){
    if(this.defense.state!=='ready'||this.openingPhase!=='dialogue')return false;
    this.defense.state='active';
    this.openingPhase='active';
    if(this.weapon)void this.playerVisual.setVariant(this.weapon);
    this.playerVisual.update('e',false,0);
    this.cameras.main.resetFX();
    this.setOpeningHud(true);
    this.pickup?.setVisible(true);
    this.onFocus();
    return true;
  }
  updateCaptainDefense(delta){
    const result=advanceCaptainPatrol(this.captainPatrol,this.captainActor,delta);
    this.captainActor.setPosition(result.x,result.y);
    if(this.captainSprite?.active){
      this.captainSprite.setFrame(playerFrame(result.facing));
      const baseline=-this.captainSprite.frame.height*CAPTAIN_VISUAL_SCALE/2;
      this.captainSprite.setY(baseline-(result.moving?Math.abs(Math.sin(this.captainPatrol.travel/8))*1.8:0));
    }
  }
  updateAct2Barks(delta){
    this.barkElapsed+=Math.max(0,Math.min(50,delta));
    if(this.barkUntil&&this.barkElapsed>=this.barkUntil){
      this.act2Bark.setVisible(false);this.barkUntil=0;
    }
    if(this.barkUntil||this.barkElapsed<6500+this.barkOrdinal*8500)return;
    // A single non-interactive in-world bubble; no global Act I bark changes.
    const speakers=this.gliderDelivery.groundEnemies.filter(e=>eligibleAct2Bark(e,this.cameras.main.worldView));
    if(!speakers.length)return;
    const speaker=speakers[this.barkOrdinal%speakers.length];
    this.act2Bark.setText(ACT2_BATTLE_CRIES[this.barkOrdinal%ACT2_BATTLE_CRIES.length])
      .setPosition(speaker.x,speaker.y-56).setVisible(true);
    this.barkUntil=this.barkElapsed+1350;this.barkOrdinal++;
  }
  applyDamage(next,source=null){
    if(this.defense.ended)return;
    this.playerHp=Math.max(0,Math.min(this.maxHp,Math.floor(next)));
    updateRunHealth(this.campaignRun,this.playerHp,this.maxHp);
    this.hpFace.setHp(this.playerHp);
    this.hpText.setText('HP '+this.playerHp+'/'+this.maxHp);
    if(source)this.playerVisual.hit(source);
    if(this.playerHp<=0)this.finishDefense('defeat');
  }
  finishDefense(outcome){
    if(outcome==='survived'&&this.playerHp<=0)outcome='defeat';
    if(!finishAirshipDefense(this.defense,outcome))return false;
    this.openingPhase='complete';
    this.act2Bark.setVisible(false);
    const facePlayer=facingOf(this.player.x-this.captainActor.x,this.player.y-this.captainActor.y,'w');
    this.captainSprite?.setFrame(playerFrame(facePlayer));
    this.playerVisual.update(facingOf(this.captainActor.x-this.player.x,this.captainActor.y-this.player.y,'e'),false,0);
    this.gliderDelivery.stop();
    this.combat.stop({neutralize:outcome==='survived'});
    this.resetMovement();
    this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
    this.pickup?.setVisible(false);
    this.objectiveText.setVisible(false);this.defenseKillsText.setVisible(false);
    this.pressureBar.clear();
    // Defense resolves once; campaign totals are booked at narrative completion.
    const result=this.defense.result;
    this.resultLabel.setText(outcome==='survived'?'KONIEC AKTU II — PAROSTATEK':'KONIEC GRY');
    this.resultDetails.setText('POKONANI WROGOWIE — '+result.kills+
      '\nCZAS WALKI — '+formatGameplayClock(result.activeCombatMs));
    if(outcome==='survived'){
      // Existing pixel-death bursts stay visible before the fade.
      this.time.delayedCall(520,()=>{
        if(!this.sys.isActive()||this.defense.state!=='survived')return;
        this.cameras.main.once('camerafadeoutcomplete',()=>{
          if(!this.sys.isActive())return;
          this.cameras.main.once('camerafadeincomplete',()=>{
            this.dialoguePanel.loading.finally(()=>{
              if(!this.sys.isActive()||this.defense.state!=='survived')return;
              if(beginDialogue(this.dialogueState,'act2-finale'))this.dialoguePanel.show(this.dialogueState);
            });
          });
          this.cameras.main.fadeIn(450,0,0,0);
        });
        this.cameras.main.fadeOut(450,0,0,0);
      });
    }else{
      this.resultDetails.setText(this.resultDetails.text+'\nMENU — WZNÓW / NOWA GRA');
      this.resultOverlay.setVisible(true);
      this.menuButton.setVisible(true).setDepth(192);
      this.menuLabel.setVisible(true).setDepth(193);
    }
    return true;
  }
  beginFinalResultsFade(){
    if(this.defense.state!=='survived'||this.finalResultsPending)return;
    this.finalResultsPending=true;
    this.cameras.main.once('camerafadeoutcomplete',()=>{
      if(!this.sys.isActive())return;
      this.resultOverlay.setVisible(true);
      this.resultsArmedAt=this.game.loop.time+200;
      this.resultsButton.setVisible(true);
      this.resultsButtonText.setVisible(true);
      this.menuButton.setVisible(false);this.menuLabel.setVisible(false);
      this.cameras.main.resetFX();
    });
    this.cameras.main.fadeOut(450,0,0,0);
  }
  completeAct2(){
    if(!this.finalResultsPending||!this.resultOverlay.visible||
        this.game.loop.time<this.resultsArmedAt||document.hidden)return false;
    const result=this.defense.result;
    if(!result||result.outcome!=='survived')return false;
    if(!completeCampaignAct(this.campaignRun,'act2',{
      hp:this.playerHp,maxHp:this.maxHp,
      unlockedWeapons:this.unlockedWeapons,selectedWeapon:this.weapon,
      kills:result.kills,activeCombatMs:result.activeCombatMs
    }))return false;
    this.resultsButton.disableInteractive();
    this.scene.start('Menu');
    return true;
  }
  update(time,delta){
    const allowed=!this.focusSuspended&&!document.hidden&&document.hasFocus()&&window.innerWidth>=window.innerHeight&&!this.scene.isPaused();
    if(!allowed){
      advanceGameplayClock(this.defense.clock,0,false);
      this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
      this.combat.stopFire();
      return;
    }
    // Scene pause and focus/portrait guard above suspend wheel rotation.
    // The wheel reuses its existing Image and never allocates frames.
    if(this.paddlewheel?.active&&this.paddlewheel.visible){
      this.paddlewheel.rotation=advancePaddlewheelAngle(this.paddlewheel.rotation,delta);
    }
    scrollCloudLayers(this.layers,delta);
    for(const layer of this.layers)layer.update();
    if(this.openingPhase==='overview'){
      this.openingElapsed+=Math.min(50,delta);
      if(this.openingElapsed>=650){
        this.openingPhase='zoom';this.openingElapsed=0;
        this.cameras.main.zoomTo(1,1050,'Sine.easeInOut');
      }
      return;
    }
    if(this.openingPhase==='zoom'){
      this.openingElapsed+=Math.min(50,delta);
      if(this.openingElapsed>=1100)this.beginOpeningDialogue();
      return;
    }
    if(this.openingPhase==='complete'){
      updateBursts(this.combat.bursts,delta);
      return;
    }
    if(this.openingPhase!=='active'){
      advanceGameplayClock(this.defense.clock,0,false);
      return;
    }
    const defenseEvent=tickAirshipDefense(this.defense,performance.now(),{
      active:true,
      ground:this.gliderDelivery.groundEnemies.filter(e=>!e.dead).length,
      airborne:this.gliderDelivery.activeGliders,
      pending:this.gliderDelivery.pendingPassengers,
    });
    if(defenseEvent?.outcome){this.finishDefense('survived');return;}
    if(defenseEvent?.delivery)this.gliderDelivery.request(defenseEvent.delivery);
    this.gliderDelivery.update(delta);
    this.updateCaptainDefense(delta);
    this.updateAct2Barks(delta);
    const key=this.keys;
    const input=normalizeInput(this.joystick.direction.x+Number(key.D.isDown||key.RIGHT.isDown)-Number(key.A.isDown||key.LEFT.isDown),
      this.joystick.direction.y+Number(key.S.isDown||key.DOWN.isDown)-Number(key.W.isDown||key.UP.isDown));
    let point=stepDeckPosition(this.player,input,delta);
    if(this.wheelhouse.visible)point=clampToDeck(avoidWheelhouse(point),25);
    this.player.setPosition(point.x,point.y);
    this.player.body.reset(point.x,point.y);
    if(this.pickup?.active&&Math.hypot(point.x-this.pickup.x,point.y-this.pickup.y)<42){
      this.pickup.destroy();this.pickup=null;
      this.weapon='blunderbuss';this.unlockedWeapons.add('blunderbuss');
      updateRunEquipment(this.campaignRun,this.unlockedWeapons,this.weapon);
      void this.playerVisual.setVariant('blunderbuss');this.syncWeaponHud();
    }
    const pointer=this.input.activePointer;
    if(pointer.wasTouch===false){
      const world=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
      this.mouseAim=resolveAim(world.x-this.player.x,world.y-this.player.y,12);
    }
    const aim=this.aimJoystick.held?resolveAim(this.aimJoystick.direction.x,this.aimJoystick.direction.y):
      this.mouseHeld?this.mouseAim:{x:0,y:0};
    const held=this.aimJoystick.held||this.mouseHeld;
    this.lastFacing=facingOf(aim.x||input.x,aim.y||input.y,this.lastFacing);
    this.facingMarker.setPosition(point.x,point.y);
    this.playerVisual.update(this.lastFacing,Math.hypot(input.x,input.y)>0.1,delta);
    this.combat.update(aim,Boolean(held&&(aim.x||aim.y)),Math.min(50,delta),this.time.now);
    this.renderPressureBar();
    this.hpFace.update(delta);
    this.objectiveText.setText('WYTRZYMAJ '+formatGameplayClock(Math.max(0,AIRSHIP_SURVIVAL_MS-this.defense.elapsedMs)));
    this.defenseKillsText.setText('POKONANI '+this.defense.kills);
  }
}
