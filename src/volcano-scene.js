import {createVolcanoFinaleState,HORN_ID,formatEscape} from './volcano-finale.js';
import {createPixelBurst} from './pixel-death-vfx.js';
import Phaser from 'phaser';
import {ARENA,PLAYER_SPEED,PLAYER_RADIUS,normalizeInput} from './movement.js';
import {createPlayer} from './player.js';
import {createPlayerVisual,assetUrl} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {currentCampaignRun,prepareActStart,grantWaterFlamethrower,awardRunArtifact,completeCampaignAct} from './campaign-run.js';
import {createDialogueState,beginDialogue} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {createCaptainArrival} from './captain-arrival.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {arenaHudLayout} from './ui-layout.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {WEAPONS,availableWeapons,cycleUnlockedWeapon} from './weapon-progression.js';
import {resolveAim} from './shooting.js';
import {facingOf} from './combat-contract.js';
import {createVolcanoCombat} from './volcano-combat.js';
import {createVolcanoNpcs,fairyTrigger,createNpcReadiness,shouldRevealFairy} from './volcano-npcs.js';
import {createBogdanEncounter,apartmentReached,findMarlenaRoute} from './volcano-bogdan.js';
import {volcanoFootprintAllowed,volcanoStep,VOLCANO_START,VOLCANO_ASSETS,VOLCANO_DEPTH,advanceVolcanoLava,validVolcanoPng,volcanoControlsAllowed,volcanoFacing,createVolcanoWalkability,nearestVolcanoSpawn} from './volcano-contract.js';

// Scene owns only two persistent world layers. Missing production art is safe.
export class VolcanoScene extends Phaser.Scene {
  constructor(){super('Volcano');}
  init(data={}){this.handoff=data.handoff??null;this.debugCheckpoint=data.debugCheckpoint??null;}
  create(){
    this.run=currentCampaignRun(this.game);
    if(this.run.actId!=='act3'&&!prepareActStart(this.run,this.handoff,new Set(Object.keys(this.scene.manager.keys)))){
      this.scene.start('Menu');return;
    }
    this.disposed=false;
    this.openingComplete=false;
    this.walkability=null;
    this.combatPending=false;
    this.lawosStarted=false;
    this.lawosReadiness=createNpcReadiness();
    this.lawosComplete=false;
    this.fairyRevealRequested=false;
    this.fairyStarted=false;
    this.fairyComplete=false;
    this.fairyReady=false;
    this.apartmentPending=false;
    this.apartmentComplete=false;
    this.bogdanDialogueStarted=false;
    this.defeated=false;
    this.finale=createVolcanoFinaleState();
    this.openingSafeUntil=0;
    this.escapeBurst=null;this.escapeSpawnAt=0;this.escapeSpawned=0;this.escapeEnemies=[];
    this.escapeCheckpoint=null;this.extractionPoint=null;this.extractionActor=null;this.extractionLoading=false;
    this.dialogueState=createDialogueState();
    this.obstacles=[];
    this.pendingLoads=new Set();
    this.cameras.main.setBackgroundColor('#220b08');
    this.physics.world.setBounds(0,0,ARENA.width,ARENA.height);
    this.cameras.main.setBounds(0,0,ARENA.width,ARENA.height);

    // Fallback is generated once per scene, never once per frame.
    const fallbackKey='volcano-lava-fallback';
    if(!this.textures.exists(fallbackKey)){
      const g=this.add.graphics().setVisible(false);
      g.fillStyle(0x721c0c).fillRect(0,0,512,512);
      for(let y=0;y<512;y+=64){
        g.lineStyle(6,0xf0771c,.8);
        g.beginPath();
        for(let x=0;x<=512;x+=16){
          const v=y+Math.sin(x*Math.PI*2/128)*9;
          if(x===0)g.moveTo(x,v);else g.lineTo(x,v);
        }
        g.strokePath();
      }
      g.generateTexture(fallbackKey,512,512);g.destroy();
    }
    this.lava=this.add.tileSprite(0,0,ARENA.width,ARENA.height,fallbackKey)
      .setOrigin(0).setDepth(VOLCANO_DEPTH.lava);
    this.lava.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.terrain=this.add.graphics().setDepth(VOLCANO_DEPTH.terrain);
    this.terrain.fillStyle(0x4b3b32).fillRoundedRect(155,120,1490,960,45);
    this.terrain.fillStyle(0x655247).fillRoundedRect(188,150,1424,900,35);
    this.terrain.lineStyle(7,0x251b1a).strokeRoundedRect(155,120,1490,960,45);
    this.terrainImage=this.add.image(0,0,fallbackKey).setOrigin(0).setVisible(false)
      .setDepth(VOLCANO_DEPTH.terrain);

    this.player=createPlayer(this,VOLCANO_START.x,VOLCANO_START.y);
    // The collision marker is hidden by createPlayerVisual after its sprite loads.
    this.playerVisual=createPlayerVisual(this,this.player,this.player,Phaser);
    this.facing='s';
    this.captainArrival=createCaptainArrival(this);
    this.dialoguePanel=createDialoguePanel(this,Phaser,id=>{
      if(id==='act3-opening'){
        this.openingComplete=true;
        this.openingSafeUntil=this.time.now+2200;
        this.resetMovement();
        this.syncControls();
        if(this.lawosReadiness.started&&!this.lawosStarted)this.startLawosEncounter(this.lawosReadiness.state);
      }else if(id==='act3-lawostworki'){
        this.lawosComplete=true;
        this.npcs.finishLawos();
        this.revealFairyAfterLawos();
        if(this.walkability)this.combat.start();
        else this.combatPending=true;
        this.resetMovement();
        this.syncControls();
      }else if(id==='act3-apartment-argument'){
        this.apartmentComplete=true;
        this.boss.depart();
        this.resetMovement();this.syncControls();
      }else if(id==='act3-bogdan-confrontation'){
        this.boss.activate();
        this.resetMovement();this.syncControls();
      }else if(id==='act3-bogdan-final'){
        if(this.finale.advance('FINAL_DIALOGUE'))this.showHornReward();
      }else if(id==='act3-eruption-warning'){
        this.startEscape();
      }else if(id==='act3-captain-extraction'){
        if(this.finale.advance('CAPTAIN_EXTRACTION'))this.completeActThree();
      }else if(id==='act3-swinia-wrozka'){
        this.fairyComplete=true;
        this.npcs.departFairy();
        this.resetMovement();
        this.syncControls();
      }
    });
    this.cameras.main.startFollow(this.player,true,.12,.12);
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick=createJoystick(this,'left');
    this.aimJoystick=createJoystick(this,'right');
    grantWaterFlamethrower(this.run);
    this.weapon='water-flamethrower';
    this.run.selectedWeapon=this.weapon;
    void this.playerVisual.setVariant(this.weapon==='water-flamethrower'?'flamethrower':this.weapon);
    this.playerInvulnerableUntil=0;
    this.combat=createVolcanoCombat(this);
    this.npcs=createVolcanoNpcs(this,Phaser);
    this.boss=createBogdanEncounter(this,Phaser);
    this.createFinaleUi();
    const switchWeapon=()=>{
      if(!this.openingComplete||!this.controlsAllowed())return;
      this.combat.stopFire();
      this.weapon=cycleUnlockedWeapon(this.weapon,this.run.unlockedWeapons,'act3');
      this.run.selectedWeapon=this.weapon;
      this.refreshWeaponHud();
      void this.playerVisual.setVariant(this.weapon==='water-flamethrower'?'flamethrower':this.weapon);
    };
    // Match the existing Act I/II weapon token, including its fixed 42px
    // visual footprint and layout-driven touch target left of the aim stick.
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponBody=this.add.circle(0,0,21,0x303b2b,0.92).setStrokeStyle(2,0xb9a16b);
    this.weaponLabel=this.add.text(0,0,WEAPONS[this.weapon]?.symbol??'—',
      {fontFamily:'monospace',fontSize:'21px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5);
    this.weaponToken.add([this.weaponBody,this.weaponLabel]);
    this.pressureBar=this.add.graphics().setScrollFactor(0).setDepth(67);
    this.refreshWeaponHud();
    const touchSwitch=pointer=>{
      if(pointer.id===this.joystick.pointerId||pointer.id===this.aimJoystick.pointerId)return;
      const l=this.hudLayout;
      if(Math.hypot(pointer.x-l.switchX,pointer.y-l.switchY)<=l.switchSize/2)switchWeapon();
    };
    this.input.on('pointerdown',touchSwitch);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.input.off('pointerdown',touchSwitch));
    const weaponKey=e=>{if(e.code==='KeyQ'&&!e.repeat)switchWeapon();};
    this.input.keyboard.on('keydown',weaponKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.input.keyboard.off('keydown',weaponKey));
    this.hudLayout=arenaHudLayout(this.scale.height,this.scale.width);
    this.menuButton=this.add.rectangle(0,0,80,38,0x2b3324,0.95)
      .setStrokeStyle(2,0xb9a16b).setScrollFactor(0).setDepth(60)
      .setInteractive({useHandCursor:true});
    this.menuLabel=this.add.text(0,0,'MENU',{
      fontFamily:'monospace',fontSize:'17px',color:'#e8d6a5'
    }).setOrigin(.5).setScrollFactor(0).setDepth(61);
    this.menuButton.on('pointerdown',()=>this.openMenu());
    this.hpFace=createHpFaceHud(this,Phaser);
    this.hpFace.setHp(this.run.hp);
    this.hpText=this.add.text(0,0,'HP '+this.run.hp+'/'+this.run.maxHp,{
      fontFamily:'monospace',fontSize:'13px',color:'#f3e8d1'
    }).setOrigin(.5,0).setScrollFactor(0).setDepth(81);
    // The fullscreen DOM button is not part of active Act III gameplay HUD.
    this.fullscreenButton=document.getElementById('fullscreen-button');
    this.fullscreenPreviousHidden=this.fullscreenButton?.hidden??false;
    if(this.fullscreenButton)this.fullscreenButton.hidden=true;
    const resize=()=>{
      const layout=arenaHudLayout(this.scale.height,this.scale.width);
      this.joystick.reposition(layout.joystickX,layout.joystickY,layout.joystickRadius);
      this.aimJoystick.reposition(layout.aimX,layout.aimY,layout.joystickRadius);
      this.hudLayout=layout;
      this.weaponToken.setPosition(layout.switchX,layout.switchY).setScale(layout.switchSize/42);
      this.renderPressureBar();
      this.menuButton.setPosition(layout.menuX,layout.menuY).setSize(layout.menuWidth,layout.menuHeight);
      this.menuLabel.setPosition(layout.menuX,layout.menuY).setFontSize(layout.menuFont);
      this.hpFace.resize(layout);this.hpText.setPosition(layout.hpX,layout.hpY);
      this.syncControls();
    };
    const resume=()=>this.syncControls();
    const pause=()=>this.resetMovement();
    const focus=()=>this.syncControls();
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.on(Phaser.Scenes.Events.RESUME,resume);
    this.events.on(Phaser.Scenes.Events.PAUSE,pause);
    window.addEventListener('focus',focus);
    window.addEventListener('blur',pause);
    document.addEventListener('visibilitychange',focus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.disposed=true;
      for(const controller of this.pendingLoads)controller.abort();
      this.pendingLoads.clear();
      this.scale.off(Phaser.Scale.Events.RESIZE,resize);
      this.events.off(Phaser.Scenes.Events.RESUME,resume);
      this.events.off(Phaser.Scenes.Events.PAUSE,pause);
      window.removeEventListener('focus',focus);
      window.removeEventListener('blur',pause);
      document.removeEventListener('visibilitychange',focus);
      if(this.fullscreenButton)this.fullscreenButton.hidden=this.fullscreenPreviousHidden;
      this.pressureBar.destroy();this.playerVisual.destroy();this.hpFace.destroy();
      this.escapeBurst?.destroy();this.extractionActor?.destroy();
    });
    resize();
    enforceOrientationOnSceneStart(this);
    this.syncControls();
    // Reuse the campaign title card before entering this scene. The world fades
    // in with the Captain and existing dialogue UI; exploration stays locked.
    this.cameras.main.fadeIn(400,0,0,0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE,()=>{
      if(this.disposed)return;
      this.captainArrival.start();
      if(beginDialogue(this.dialogueState,'act3-opening')){
        grantWaterFlamethrower(this.run);
        this.dialoguePanel.show(this.dialogueState);
      }
    });
    void this.loadOptionalVolcano('lava');
    void this.loadOptionalVolcano('terrain');
  }
  async loadOptionalVolcano(kind){
    const def=VOLCANO_ASSETS[kind],controller=new AbortController();
    this.pendingLoads.add(controller);
    let objectUrl=null;
    try{
      const response=await fetch(assetUrl(import.meta.env.BASE_URL,def.path),
        {cache:'no-cache',signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(!validVolcanoPng(bytes,def))throw Error('invalid PNG IHDR');
      objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
      const image=new Image();
      await new Promise((resolve,reject)=>{
        image.onload=resolve;image.onerror=()=>reject(Error('PNG decode failed'));
        image.src=objectUrl;
      });
      if(image.naturalWidth!==def.width||image.naturalHeight!==def.height)
        throw Error('decoded image size mismatch');
      if(this.disposed||controller.signal.aborted)return;
      const key='volcano-production-'+kind;
      if(!this.textures.exists(key))this.textures.addImage(key,image);
      if(kind==='lava'){
        const previous=this.lava.tilePositionY;
        this.lava.setTexture(key).setSize(ARENA.width,ARENA.height);
        this.lava.tilePositionY=previous;
        this.lava.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }else{
        // Decode the exact world-sized RGBA terrain once, before enabling gameplay.
        const canvas=document.createElement('canvas');
        canvas.width=def.width;canvas.height=def.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)throw Error('terrain collision canvas unavailable');
        context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,def.width,def.height);
        const mask=createVolcanoWalkability(pixels.data,def.width,def.height);
        const playerStart=nearestVolcanoSpawn(mask,this.player.x,this.player.y,PLAYER_RADIUS);
        if(!playerStart)throw Error('no valid player spawn in terrain mask');
        this.walkability=mask;
        this.player.setPosition(playerStart.x,playerStart.y);
        this.player.body.reset(playerStart.x,playerStart.y);
        void this.boss.prepare().then(ready=>{
          if(this.disposed||this.defeated)return;
          if(!ready)console.warn('[Volcano Boss] apartment encounter unavailable');
          else if(this.apartmentPending)this.tryApartmentEncounter();
        });
        void this.npcs.place().then(ready=>{
          if(this.disposed||this.defeated||this.run.hp<=0)return;
          this.resolveLawosReadiness(ready);
        }).catch(error=>{
          if(this.disposed)return;
          console.error('[Volcano NPC] placement failed:',error);
          this.resolveLawosReadiness(false);
        });
        if(this.lawosComplete&&this.combatPending){this.combat.start();this.combatPending=false;}
        this.terrainImage.setTexture(key).setPosition(0,0).setOrigin(0).setDisplaySize(ARENA.width,ARENA.height).setVisible(true);
        this.terrain.setVisible(false);
      }
    }catch(error){
      if(!controller.signal.aborted&&!this.disposed)
        console.error('[Volcano] '+kind+' asset failure: '+error.message+(kind==='terrain'?'; collision and gameplay remain disabled':''));
    }finally{
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      this.pendingLoads.delete(controller);
    }
  }
  resolveLawosReadiness(ready){
    const decision=this.lawosReadiness.resolve(ready);
    if(decision)this.startLawosEncounter(decision);
  }
  startLawosEncounter(decision){
    if(this.disposed||this.defeated||this.run.hp<=0||this.lawosStarted||!this.openingComplete||!this.walkability)return;
    if(decision==='ready'&&this.npcs.lawosReady){
      if(beginDialogue(this.dialogueState,'act3-lawostworki')){
        this.lawosStarted=true;
        this.resetMovement();
        this.dialoguePanel.show(this.dialogueState);
        return;
      }
    }
    // A failed production PNG must not permanently lock Act III.
    this.lawosStarted=true;
    this.lawosComplete=true;
    this.npcs.finishLawos();
    this.revealFairyAfterLawos();
    console.warn('[Volcano NPC] Lawostworki dialogue skipped because both sprites are not available');
    this.combat.start();
    this.resetMovement();
    this.syncControls();
  }
  revealFairyAfterLawos(){
    if(!shouldRevealFairy(this.lawosComplete,this.fairyRevealRequested)||this.disposed||this.defeated)return;
    if(!this.walkability)return;
    this.fairyRevealRequested=true;
    void this.npcs.revealFairy(findMarlenaRoute).then(ready=>{
      if(this.disposed)return;
      this.fairyReady=ready;
      if(!ready){this.fairyRevealRequested=false;console.error('[Volcano] fairy route unavailable; apartment story gate remains locked until safe spawn is found');}
    }).catch(error=>{if(!this.disposed){this.fairyRevealRequested=false;console.error('[Volcano] fairy reveal failed:',error);}});
  }
  tryApartmentEncounter(){
    if(!this.openingComplete||!this.lawosComplete||!this.fairyComplete||this.dialogueState.id||this.defeated||!this.boss.ready)return false;
    if(!this.boss.beginArgument())return false;
    if(beginDialogue(this.dialogueState,'act3-apartment-argument')){
      this.resetMovement();this.dialoguePanel.show(this.dialogueState);return true;
    }
    return false;
  }
  createFinaleUi(){
    const w=()=>this.scale.width,h=()=>this.scale.height;
    this.escapeClock=this.add.text(w()/2,20,'',{fontFamily:'monospace',fontSize:'23px',fontStyle:'bold',color:'#ffe7a4',stroke:'#220a07',strokeThickness:5}).setOrigin(.5,0).setScrollFactor(0).setDepth(100).setVisible(false);
    this.finaleShade=this.add.rectangle(0,0,w(),h(),0x080609,.68).setOrigin(0).setScrollFactor(0).setDepth(105).setVisible(false);
    this.rewardRoot=this.add.container(0,0).setScrollFactor(0).setDepth(210).setVisible(false);
    const bg=this.add.rectangle(0,0,w(),h(),0x101417,.96).setOrigin(0);
    const title=this.add.text(w()/2,h()*.23,'ZDOBYŁEŚ ARTEFAKT',{fontFamily:'monospace',fontSize:'23px',fontStyle:'bold',color:'#f2d18c'}).setOrigin(.5);
    const horn=this.add.text(w()/2,h()*.48,'RÓG MYŚLIWSKI BOGDANA',{fontFamily:'monospace',fontSize:'22px',fontStyle:'bold',color:'#f3e9d5',align:'center',wordWrap:{width:w()-30}}).setOrigin(.5);
    const detail=this.add.text(w()/2,h()*.68,'ARTEFAKT 2/3',{fontFamily:'monospace',fontSize:'17px',color:'#f2d18c'}).setOrigin(.5);
    this.rewardRoot.add([bg,title,horn,detail]);
    this.rewardButton=this.add.rectangle(w()/2,h()-28,135,40,0x655039).setStrokeStyle(2,0xd9bd80).setScrollFactor(0).setDepth(212).setInteractive({useHandCursor:true}).setVisible(false);
    this.rewardButtonLabel=this.add.text(w()/2,h()-28,'DALEJ',{fontFamily:'monospace',fontSize:'18px',color:'#fff2d6'}).setOrigin(.5).setScrollFactor(0).setDepth(213).setVisible(false);
    this.rewardButton.on('pointerdown',()=>{if(this.finale.state!=='ARTIFACT_REWARD'||this.game.loop.time<this.rewardArmedAt)return;
      this.rewardRoot.setVisible(false);this.rewardButton.setVisible(false);this.rewardButtonLabel.setVisible(false);
      if(this.finale.advance('ARTIFACT_REWARD'))this.explodeBogdan();
    });
    this.retryRoot=this.add.container(0,0).setScrollFactor(0).setDepth(220).setVisible(false);
    const retryBg=this.add.rectangle(w()/2,h()/2,w(),h(),0x160a09,.96);
    const retryText=this.add.text(w()/2,h()*.42,'WULKAN WYBUCHŁ!\\nSPRÓBUJ PONOWNIE',{fontFamily:'monospace',fontSize:'23px',color:'#f2d18c',align:'center'}).setOrigin(.5);
    const retryButton=this.add.rectangle(w()/2,h()*.70,185,46,0x655039).setStrokeStyle(2,0xd9bd80).setInteractive({useHandCursor:true});
    const retryLabel=this.add.text(w()/2,h()*.70,'PONÓW UCIECZKĘ',{fontFamily:'monospace',fontSize:'15px',color:'#fff2d6'}).setOrigin(.5);
    this.retryRoot.add([retryBg,retryText,retryButton,retryLabel]);
    retryButton.on('pointerdown',()=>this.retryEscape());
    const resize=()=>{const x=w()/2,y=h();this.escapeClock.setPosition(x,12);this.finaleShade.setSize(w(),h());bg.setSize(w(),h());
      title.setPosition(x,y*.22).setFontSize(Math.min(23,y*.065));horn.setPosition(x,y*.47).setWordWrapWidth(w()-30).setFontSize(Math.min(22,y*.058));detail.setPosition(x,y*.66);
      this.rewardButton.setPosition(x,y-26);this.rewardButtonLabel.setPosition(x,y-26);
      retryBg.setPosition(x,y/2).setSize(w(),h());retryText.setPosition(x,y*.42);retryButton.setPosition(x,y*.70);retryLabel.setPosition(x,y*.70);};
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.scale.off(Phaser.Scale.Events.RESIZE,resize));
    resize();
  }
  startBogdanFinale(){
    this.resetMovement();this.combat.stopFire();
    this.finaleShade.setVisible(true);
    if(this.finale.advance('BOGDAN_DEFEATED')&&beginDialogue(this.dialogueState,'act3-bogdan-final'))this.dialoguePanel.show(this.dialogueState);
  }
  showHornReward(){
    awardRunArtifact(this.run,HORN_ID);
    this.finaleShade.setVisible(false);this.rewardArmedAt=this.game.loop.time+220;
    this.rewardRoot.setVisible(true);this.rewardButton.setVisible(true);this.rewardButtonLabel.setVisible(true);
    this.resetMovement();
  }
  explodeBogdan(){
    const actor=this.boss.bogdan;
    if(actor){this.escapeBurst=createPixelBurst(this,'marcin',actor.x,actor.y,93);this.boss.removeDefeatedSprite();}
    this.time.delayedCall(750,()=>{
      if(this.disposed||this.finale.state!=='BOGDAN_EXPLOSION')return;
      if(this.finale.advance('BOGDAN_EXPLOSION')&&beginDialogue(this.dialogueState,'act3-eruption-warning'))this.dialoguePanel.show(this.dialogueState);
    });
  }
  findExtractionPoint(){
    if(!this.walkability)return null;
    const mask=this.walkability,from={x:this.player.x,y:this.player.y};
    // All candidates are in the established lower-left exit area.
    // Require actual connected walkability from the current boss position.
    const candidates=[VOLCANO_START,{x:350,y:970},{x:405,y:1010},{x:280,y:930},{x:460,y:1040},{x:220,y:1020}];
    for(const target of candidates){
      const point=nearestVolcanoSpawn(mask,target.x,target.y,PLAYER_RADIUS,0,null,45);
      if(!point||Math.hypot(point.x-from.x,point.y-from.y)<180)continue;
      const route=findMarlenaRoute(mask,from,point,{radius:PLAYER_RADIUS,cell:10,maxNodes:26000});
      if(route?.length&&route.every(p=>volcanoFootprintAllowed(mask,p.x,p.y,PLAYER_RADIUS)))return point;
    }
    return null;
  }
  startEscape(){
    if(this.disposed||this.finale.state!=='ALOES_WARNING')return;
    const point=this.findExtractionPoint();
    if(!point){
      console.error('[Volcano Finale] no verified reachable extraction; countdown not started');
      this.retryRoot.setVisible(true);this.resetMovement();return;
    }
    this.extractionPoint=point;
    this.escapeCheckpoint={x:this.player.x,y:this.player.y,hp:Math.max(1,this.run.hp)};
    if(!this.finale.advance('ALOES_WARNING'))return;
    this.escapeSpawnAt=this.time.now+4500;
    this.escapeClock.setVisible(true).setText('UCIEKAJ! '+formatEscape(this.finale.remaining));
    void this.spawnExtractionCaptain();
    this.syncControls();
  }
  async spawnExtractionCaptain(){
    if(this.extractionLoading||this.disposed||!this.extractionPoint)return;
    this.extractionLoading=true;
    try{
      const key='npc-captain',point=this.extractionPoint;
      if(!this.textures.exists(key))await this.captainArrival.loading;
      if(this.disposed||!this.extractionPoint)return;
      if(this.textures.exists(key))this.extractionActor=this.add.sprite(point.x,point.y,key,2).setOrigin(.5,1).setScale(.75).setDepth(13);
      else this.extractionActor=this.add.circle(point.x,point.y-35,23,0x477b8e).setDepth(13);
    }finally{this.extractionLoading=false;}
  }
  updateEscape(delta){
    if(this.finale.tick(delta)){this.escapeFailed();return;}
    this.escapeClock.setText('UCIEKAJ! '+formatEscape(this.finale.remaining));
    if(this.extractionPoint&&Math.hypot(this.player.x-this.extractionPoint.x,this.player.y-this.extractionPoint.y)<72){
      if(this.finale.advance('ESCAPE_ACTIVE')){
        this.escapeClock.setVisible(false);this.resetMovement();this.combat.clearEscapeEnemies();
        if(beginDialogue(this.dialogueState,'act3-captain-extraction'))this.dialoguePanel.show(this.dialogueState);
      }
      return;
    }
    if(this.time.now>=this.escapeSpawnAt&&this.escapeSpawned<12){
      this.escapeSpawnAt=this.time.now+Math.max(2800,5500-this.escapeSpawned*170);
      this.escapeSpawned++;
      const alive=this.combat.enemies.filter(e=>!e.dead);
      if(alive.length<6){
        const p=nearestVolcanoSpawn(this.walkability,this.player.x+180,this.player.y+110,24,0,[{x:this.player.x,y:this.player.y,radius:110}],90);
        if(p)this.combat.spawnEscapeEnemy(p,this.escapeSpawned%4===0?'lawostworek-2':'lawostworek-1');
      }
    }
    if(Math.floor(this.finale.remaining/1000)%9===0&&this.finale.remaining%9000<delta){
      this.cameras.main.shake(180,.002);
      this.cameras.main.flash(110,180,28,15,false);
    }
  }
  escapeFailed(){
    if(this.finale.state==='ESCAPE_ACTIVE')this.finale.fail();
    if(this.finale.state!=='ESCAPE_RETRY')return;
    this.resetMovement();this.combat.clearTransientShots();this.combat.clearEscapeEnemies();this.escapeClock.setVisible(false);this.retryRoot.setVisible(true);
  }
  retryEscape(){
    if(this.finale.state==='ALOES_WARNING'){this.retryRoot.setVisible(false);this.startEscape();return;}
    if(!this.finale.retry()||!this.escapeCheckpoint)return;
    this.retryRoot.setVisible(false);
    this.combat.clearEscapeEnemies();this.escapeSpawned=0;this.escapeSpawnAt=this.time.now+4500;
    this.run.hp=Math.max(2,Math.min(this.run.maxHp,this.escapeCheckpoint.hp));
    this.playerInvulnerableUntil=this.time.now+1400;
    this.player.setPosition(this.escapeCheckpoint.x,this.escapeCheckpoint.y);this.player.body.reset(this.player.x,this.player.y);
    this.escapeClock.setVisible(true).setText('UCIEKAJ! '+formatEscape(this.finale.remaining));
    this.hpFace.setHp(this.run.hp);this.hpText.setText('HP '+this.run.hp+'/'+this.run.maxHp);
    this.syncControls();
  }
  completeActThree(){
    if(this.disposed||this.finale.state!=='ACT_III_COMPLETE')return;
    this.resetMovement();this.combat.clearEscapeEnemies();this.escapeClock.setVisible(false);
    completeCampaignAct(this.run,'act3',{hp:this.run.hp,maxHp:this.run.maxHp,unlockedWeapons:this.run.unlockedWeapons,selectedWeapon:this.weapon,kills:0,activeCombatMs:0});
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,()=>{if(!this.disposed)this.scene.start('Menu');});
    this.cameras.main.fadeOut(550,0,0,0);
  }
  refreshWeaponHud(){
    const selected=WEAPONS[this.weapon];
    this.weaponLabel.setText(selected?.symbol??'—');
    this.weaponBody.setFillStyle(selected?.color??0x6b6153,0.92);
    this.renderPressureBar();
  }
  renderPressureBar(){
    const g=this.pressureBar;
    if(!g||!this.hudLayout)return;
    g.clear();
    if(this.weapon!=='water-flamethrower'&&this.weapon!=='flamethrower')return;
    const l=this.hudLayout,w=l.switchSize,x=l.switchX-w/2,y=l.switchY+w/2+5;
    const value=this.combat?.pressure.value??100;
    g.fillStyle(0x382721,0.95).fillRect(x,y,w,4);
    g.fillStyle(value<20?0x9b3932:0xee903a).fillRect(x,y,w*value/100,4);
  }
  controlsAllowed(){
    return volcanoControlsAllowed({
      hidden:document.hidden,focused:document.hasFocus(),
      landscape:window.innerWidth>=window.innerHeight,
      paused:this.scene.isPaused()
    });
  }
  syncControls(){
    const enabled=!this.defeated&&this.run.hp>0&&['BOGDAN_ACTIVE','ESCAPE_ACTIVE'].includes(this.finale.state)&&this.controlsAllowed()&&this.openingComplete&&Boolean(this.walkability)&&!this.dialogueState.id;
    if(this.joystick.enabled!==enabled)this.joystick.setEnabled(enabled);
    if(this.aimJoystick.enabled!==enabled)this.aimJoystick.setEnabled(enabled);
  }
  resetMovement(){
    this.joystick?.setEnabled(false);
    this.aimJoystick?.setEnabled(false);
    this.input.keyboard?.resetKeys();
    this.combat?.stopFire();
  }
  lockDeath(){
    if(this.defeated)return;
    this.defeated=true;
    this.resetMovement();
    this.player.body.setVelocity(0,0);
    this.player.body.setAcceleration(0,0);
    this.hpFace.setHp(0);
    this.hpText.setText('HP 0/'+this.run.maxHp);
    // Match Act I: capture the screen-space death location, hide Aloes,
    // freeze combat, then show the existing Menu defeat title and pixel burst.
    const camera=this.cameras.main;
    const screen=camera.getWorldPoint(0,0),zoom=camera.zoom;
    this.defeatVisualAt={x:(this.player.x-screen.x)*zoom,y:(this.player.y-screen.y)*zoom};
    this.playerVisual.sprite?.setVisible(false);
    this.player.setVisible(false);
    this.physics.world.pause();
    this.scene.pause();
    this.scene.launch('Menu');
    this.scene.bringToTop('Menu');
  }
  openMenu(){
    if(this.scene.isPaused()||this.scene.isActive('Menu')||!this.controlsAllowed())return;
    this.resetMovement();
    this.scene.pause();
    this.scene.launch('Menu');
    this.scene.bringToTop('Menu');
  }
  update(_time,delta){
    if(this.finale.state==='ESCAPE_RETRY')return;
    if(this.run.hp<=0){if(this.finale.state==='ESCAPE_ACTIVE'){this.escapeFailed();return;}this.lockDeath();return;}
    this.syncControls();
    if(!this.controlsAllowed()||this.defeated)return;
    this.captainArrival.update(delta);
    if(!this.openingComplete||!this.walkability||this.dialogueState.id){this.resetMovement();return;}
    this.lava.tilePositionY=advanceVolcanoLava(this.lava.tilePositionY,delta);
    const k=this.keys;
    const input=normalizeInput(
      this.joystick.direction.x+Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),
      this.joystick.direction.y+Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown));
    if(!this.lawosStarted&&Math.hypot(input.x,input.y)>.05){
      const decision=this.lawosReadiness.requestMovement();
      if(decision)this.startLawosEncounter(decision);
      if(!this.lawosStarted||this.dialogueState.id){this.resetMovement();return;}
    }
    if(!this.lawosStarted&&this.lawosReadiness.state==='pending'&&this.lawosReadiness.movement){
      this.resetMovement();return;
    }
    if(this.lawosReadiness.started&&!this.lawosStarted){
      this.resetMovement();return;
    }
    if(!['BOGDAN_ACTIVE','ESCAPE_ACTIVE'].includes(this.finale.state)){this.resetMovement();return;}
    const next=volcanoStep(this.player,input,delta,PLAYER_SPEED,PLAYER_RADIUS,this.walkability);
    this.player.setPosition(next.x,next.y);this.player.body.reset(next.x,next.y);
    if(this.finale.state==='BOGDAN_ACTIVE'&&!this.fairyComplete&&this.lawosComplete&&!this.fairyRevealRequested)this.revealFairyAfterLawos();
    if(this.finale.state==='BOGDAN_ACTIVE'&&!this.boss.argumentStarted&&apartmentReached(this.player)){
      this.apartmentPending=true;
      if(this.tryApartmentEncounter())return;
    }
    if(this.finale.state==='BOGDAN_ACTIVE'&&this.boss.leftApartment&&!this.bogdanDialogueStarted&&this.boss.bogdan&&
       Math.hypot(this.player.x-this.boss.bogdan.x,this.player.y-this.boss.bogdan.y)<155){
      if(this.boss.beginConfrontation()&&beginDialogue(this.dialogueState,'act3-bogdan-confrontation')){
        this.bogdanDialogueStarted=true;this.resetMovement();this.dialoguePanel.show(this.dialogueState);return;
      }
    }
    if(this.finale.state==='BOGDAN_ACTIVE'&&this.lawosComplete&&this.fairyReady&&!this.fairyStarted&&this.npcs.fairy&&fairyTrigger(this.player,this.npcs.fairy.position)){
      this.fairyStarted=true;
      if(beginDialogue(this.dialogueState,'act3-swinia-wrozka')){
        this.resetMovement();this.dialoguePanel.show(this.dialogueState);return;
      }
    }
    const aim=resolveAim(this.aimJoystick.direction.x,this.aimJoystick.direction.y);
    // Like Acts I/II, the weapon sheet follows the right stick while firing;
    // movement controls only locomotion, never the direction of the muzzle.
    this.facing=(aim.x||aim.y)?facingOf(aim.x,aim.y,this.facing):volcanoFacing(input,this.facing);
    this.playerVisual.update(this.facing,Boolean(input.x||input.y),Math.min(delta,50));
    if(this.finale.state==='BOGDAN_ACTIVE')this.combat.update(delta,this.time.now,aim,this.aimJoystick.held,this.weapon);
    else if(this.finale.state==='ESCAPE_ACTIVE')this.combat.update(delta,this.time.now,aim,this.aimJoystick.held,this.weapon);
    else this.combat.stopFire();
    this.boss.update(delta,this.time.now);
    if(this.boss.consumeDefeat()&&this.finale.advance('BOGDAN_ACTIVE'))this.startBogdanFinale();
    if(this.finale.state==='ESCAPE_ACTIVE')this.updateEscape(delta);
    if(this.escapeBurst&&!this.escapeBurst.done)this.escapeBurst.update(delta);
    this.renderPressureBar();
    if(this.run.hp<=0){if(this.finale.state==='ESCAPE_ACTIVE'){this.escapeFailed();return;}this.lockDeath();return;}
    this.hpFace.setHp(this.run.hp);
    this.hpText.setText('HP '+this.run.hp+'/'+this.run.maxHp);
    this.hpFace.update(delta);
  }
}
