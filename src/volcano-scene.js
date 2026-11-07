import Phaser from 'phaser';
import {ARENA,PLAYER_SPEED,PLAYER_RADIUS,normalizeInput} from './movement.js';
import {createPlayer} from './player.js';
import {createPlayerVisual,assetUrl} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {currentCampaignRun,prepareActStart,grantWaterFlamethrower} from './campaign-run.js';
import {createDialogueState,beginDialogue} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {createCaptainArrival} from './captain-arrival.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {arenaHudLayout} from './ui-layout.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {WEAPONS,availableWeapons,cycleUnlockedWeapon} from './weapon-progression.js';
import {resolveAim} from './shooting.js';
import {createVolcanoCombat} from './volcano-combat.js';
import {volcanoStep,VOLCANO_START,VOLCANO_ASSETS,VOLCANO_DEPTH,advanceVolcanoLava,validVolcanoPng,volcanoControlsAllowed,volcanoFacing,createVolcanoWalkability,nearestVolcanoSpawn} from './volcano-contract.js';

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
    this.defeated=false;
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
        if(this.walkability)this.combat.start();
        else this.combatPending=true;
        this.resetMovement();
        this.syncControls();
      }
    });
    this.cameras.main.startFollow(this.player,true,.12,.12);
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick=createJoystick(this,'left');
    this.aimJoystick=createJoystick(this,'right');
    this.weapon=availableWeapons(this.run.unlockedWeapons,'act3').includes(this.run.selectedWeapon)?this.run.selectedWeapon:'water-flamethrower';
    this.run.selectedWeapon=this.weapon;
    void this.playerVisual.setVariant(this.weapon==='water-flamethrower'?'flamethrower':this.weapon);
    this.playerInvulnerableUntil=0;
    this.combat=createVolcanoCombat(this);
    const switchWeapon=()=>{
      if(!this.openingComplete||!this.controlsAllowed())return;
      this.combat.stopFire();
      this.weapon=cycleUnlockedWeapon(this.weapon,this.run.unlockedWeapons,'act3');
      this.run.selectedWeapon=this.weapon;
      this.weaponLabel.setText(WEAPONS[this.weapon]?.symbol??'—');
      void this.playerVisual.setVariant(this.weapon==='water-flamethrower'?'flamethrower':this.weapon);
    };
    // Match the existing Act I/II weapon token, including its fixed 42px
    // visual footprint and layout-driven touch target left of the aim stick.
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponBody=this.add.circle(0,0,21,0x303b2b,0.92).setStrokeStyle(2,0xb9a16b);
    this.weaponLabel=this.add.text(0,0,WEAPONS[this.weapon]?.symbol??'—',
      {fontFamily:'monospace',fontSize:'21px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5);
    this.weaponToken.add([this.weaponBody,this.weaponLabel]);
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
      this.playerVisual.destroy();this.hpFace.destroy();
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
        if(this.openingComplete&&this.combatPending){this.combat.start();this.combatPending=false;}
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
  controlsAllowed(){
    return volcanoControlsAllowed({
      hidden:document.hidden,focused:document.hasFocus(),
      landscape:window.innerWidth>=window.innerHeight,
      paused:this.scene.isPaused()
    });
  }
  syncControls(){
    const enabled=!this.defeated&&this.run.hp>0&&this.controlsAllowed()&&this.openingComplete&&Boolean(this.walkability);
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
  }
  openMenu(){
    if(this.scene.isPaused()||this.scene.isActive('Menu')||!this.controlsAllowed())return;
    this.resetMovement();
    this.scene.pause();
    this.scene.launch('Menu');
    this.scene.bringToTop('Menu');
  }
  update(_time,delta){
    if(this.run.hp<=0){this.lockDeath();return;}
    this.syncControls();
    if(!this.controlsAllowed()||this.defeated)return;
    this.captainArrival.update(delta);
    if(!this.openingComplete||!this.walkability){this.resetMovement();return;}
    this.lava.tilePositionY=advanceVolcanoLava(this.lava.tilePositionY,delta);
    const k=this.keys;
    const input=normalizeInput(
      this.joystick.direction.x+Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),
      this.joystick.direction.y+Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown));
    const next=volcanoStep(this.player,input,delta,PLAYER_SPEED,PLAYER_RADIUS,this.walkability);
    this.player.setPosition(next.x,next.y);this.player.body.reset(next.x,next.y);
    this.facing=volcanoFacing(input,this.facing);
    this.playerVisual.update(this.facing,Boolean(input.x||input.y),Math.min(delta,50));
    const aim=resolveAim(this.aimJoystick.direction.x,this.aimJoystick.direction.y);
    this.combat.update(delta,this.time.now,aim,this.aimJoystick.held,this.weapon);
    if(this.run.hp<=0){this.lockDeath();return;}
    this.hpFace.setHp(this.run.hp);
    this.hpText.setText('HP '+this.run.hp+'/'+this.run.maxHp);
    this.hpFace.update(delta);
  }
}
