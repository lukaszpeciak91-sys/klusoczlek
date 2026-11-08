import Phaser from 'phaser';
import {createArenaGround} from './arena-ground.js';
import {createPlayer} from './player.js';
import {createPlayerVisual} from './character-visual.js';
import {createCaptainArrival} from './captain-arrival.js';
import {createJoystick} from './joystick.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {arenaHudLayout} from './ui-layout.js';
import {normalizeInput} from './movement.js';
import {facingOf} from './combat-contract.js';
import {currentCampaignRun,prepareActStart} from './campaign-run.js';
import {availableWeapons,cycleUnlockedWeapon,selectUnlockedWeapon,WEAPONS} from './weapon-progression.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {createSchoolCombat} from './school-combat.js';
import {SCHOOL_WORLD,SCHOOL_PLACES,SCHOOL_OBSTACLES,SCHOOL_WAVE_COUNT,schoolStep,schoolDebugPoint} from './school-contract.js';

// PR105 attaches approved Act I combat via the small School adapter.
export class SchoolScene extends Phaser.Scene {
  constructor(){super('School');}
  init(data={}){this.handoff=data.handoff??null;this.debugCheckpoint=data.debugCheckpoint??null;}
  create(){
    this.run=currentCampaignRun(this.game);
    const registered=new Set(Object.keys(this.scene.manager.keys));
    if(this.run.actId!=='act4'&&!prepareActStart(this.run,this.handoff,registered)){
      console.error('[School] Invalid Act IV campaign handoff');
      this.scene.start('Menu');return;
    }
    this.disposed=false;
    this.obstacles=SCHOOL_OBSTACLES;
    this.introActive=!['act4-school','act4-combat','act4-wave4'].includes(this.debugCheckpoint);
    this.schoolPhase='INTRO';this.defeated=false;
    this.captainDeparting=false;
    this.cameras.main.setBackgroundColor('#283c32');
    this.cameras.main.setBounds(0,0,SCHOOL_WORLD.width,SCHOOL_WORLD.height);
    this.physics.world.setBounds(0,0,SCHOOL_WORLD.width,SCHOOL_WORLD.height);
    createArenaGround(this,SCHOOL_WORLD.width,SCHOOL_WORLD.height,Phaser,{border:0x6c6150});
    this.drawPrototypePlaces();

    const spawn=schoolDebugPoint(this.debugCheckpoint);
    this.player=createPlayer(this,spawn.x,spawn.y);
    this.playerVisual=createPlayerVisual(this,this.player,this.player,Phaser);
    this.cameras.main.startFollow(this.player,true,.12,.12);
    this.facing='s';
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick=createJoystick(this,'left');
    this.aimJoystick=createJoystick(this,'right');

    // Unlock history retains Act III water, but only Act I's three weapons
    // can be selected or cycled in Act IV (and Act V).
    const allowed=availableWeapons(this.run.unlockedWeapons,'act4');
    this.weapon=selectUnlockedWeapon(this.run.selectedWeapon,this.run.unlockedWeapons,'act4')
      ??(allowed.includes('rifle')?'rifle':allowed[0]??'blunderbuss');
    this.run.selectedWeapon=this.weapon;
    void this.playerVisual.setVariant(this.weapon);
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponBody=this.add.circle(0,0,21,0x303b2b,.92).setStrokeStyle(2,0xb9a16b);
    this.weaponLabel=this.add.text(0,0,WEAPONS[this.weapon].symbol,
      {fontFamily:'monospace',fontSize:'21px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5);
    this.weaponToken.add([this.weaponBody,this.weaponLabel]);
    const switchWeapon=()=>{
      if(!this.controlsAllowed()||this.introActive)return;
      const next=cycleUnlockedWeapon(this.weapon,this.run.unlockedWeapons,'act4');
      if(!next||next===this.weapon)return;
      this.combat?.stopFire();
      this.weapon=next;this.run.selectedWeapon=next;
      this.weaponLabel.setText(WEAPONS[next].symbol);
      this.weaponBody.setFillStyle(WEAPONS[next].color,.92);
      void this.playerVisual.setVariant(next);
    };
    const touchSwitch=pointer=>{
      if(pointer.id===this.joystick.pointerId||pointer.id===this.aimJoystick.pointerId)return;
      const l=this.hudLayout;
      if(l&&Math.hypot(pointer.x-l.switchX,pointer.y-l.switchY)<=l.switchSize/2)switchWeapon();
    };
    this.input.on('pointerdown',touchSwitch);
    const weaponKey=event=>{if(event.code==='KeyQ'&&!event.repeat)switchWeapon();};
    this.input.keyboard.on('keydown',weaponKey);

    this.menuButton=this.add.rectangle(0,0,80,38,0x2b3324,.95)
      .setStrokeStyle(2,0xb9a16b).setScrollFactor(0).setDepth(60).setInteractive({useHandCursor:true});
    this.menuLabel=this.add.text(0,0,'MENU',{fontFamily:'monospace',fontSize:'17px',color:'#e8d6a5'})
      .setOrigin(.5).setScrollFactor(0).setDepth(61);
    this.menuButton.on('pointerdown',()=>this.openMenu());
    this.waveText=this.add.text(0,0,'FALE 0/'+SCHOOL_WAVE_COUNT,
      {fontFamily:'monospace',fontSize:'16px',color:'#f2d18c',stroke:'#17211c',strokeThickness:3})
      .setOrigin(.5,0).setScrollFactor(0).setDepth(65);
    this.hpFace=createHpFaceHud(this,Phaser);
    this.hpFace.setHp(this.run.hp);
    this.hpText=this.add.text(0,0,'HP '+this.run.hp+'/'+this.run.maxHp,
      {fontFamily:'monospace',fontSize:'13px',color:'#f3e8d1'})
      .setOrigin(.5,0).setScrollFactor(0).setDepth(81);
    this.skullIcon=this.add.text(0,0,'☠',{fontFamily:'sans-serif',fontSize:'22px',color:'#d7b978'})
      .setOrigin(.5).setScrollFactor(0).setDepth(66);
    this.killsText=this.add.text(0,0,'0',{fontFamily:'monospace',fontSize:'17px',color:'#f0e4ca'})
      .setOrigin(0,.5).setScrollFactor(0).setDepth(66);
    this.pressureBar=this.add.graphics().setScrollFactor(0).setDepth(67);
    this.objectiveText=this.add.text(0,0,'IDŹ DO SZKOŁY',
      {fontFamily:'monospace',fontSize:'12px',color:'#f6d6a4',stroke:'#17211c',strokeThickness:2})
      .setOrigin(.5,0).setScrollFactor(0).setDepth(66).setVisible(false);
    this.combat=createSchoolCombat(this,Phaser);
    this.fullscreenButton=document.getElementById('fullscreen-button');
    this.fullscreenPreviousHidden=this.fullscreenButton?.hidden??false;
    if(this.fullscreenButton)this.fullscreenButton.hidden=true;

    const resize=()=>{
      const l=arenaHudLayout(this.scale.height,this.scale.width);
      this.hudLayout=l;
      this.joystick.reposition(l.joystickX,l.joystickY,l.joystickRadius);
      this.aimJoystick.reposition(l.aimX,l.aimY,l.joystickRadius);
      this.weaponToken.setPosition(l.switchX,l.switchY).setScale(l.switchSize/42);
      this.menuButton.setPosition(l.menuX,l.menuY).setSize(l.menuWidth,l.menuHeight);
      this.menuLabel.setPosition(l.menuX,l.menuY).setFontSize(l.menuFont);
      const waveY=Math.max(8,l.menuY-l.menuHeight/2);
      this.waveText.setPosition(this.scale.width/2,waveY).setFontSize(Math.max(10,Math.min(16,this.scale.height*.044)));
      this.skullIcon.setPosition(this.scale.width/2-105,waveY+11);
      this.killsText.setPosition(this.scale.width/2-88,waveY+11);
      this.objectiveText.setPosition(this.scale.width/2,waveY+20);
      this.hpFace.resize(l);this.hpText.setPosition(l.hpX,l.hpY);
      this.syncControls();
    };
    const reset=()=>{this.combat?.suspend();this.resetMovement();};
    const sync=()=>{this.combat?.suspend();this.syncControls();};
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.on(Phaser.Scenes.Events.RESUME,sync);
    this.events.on(Phaser.Scenes.Events.PAUSE,reset);
    window.addEventListener('blur',reset);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.disposed=true;
      this.scale.off(Phaser.Scale.Events.RESIZE,resize);
      this.events.off(Phaser.Scenes.Events.RESUME,sync);
      this.events.off(Phaser.Scenes.Events.PAUSE,reset);
      window.removeEventListener('blur',reset);
      window.removeEventListener('focus',sync);
      document.removeEventListener('visibilitychange',sync);
      this.input.off('pointerdown',touchSwitch);
      this.input.keyboard.off('keydown',weaponKey);
      if(this.fullscreenButton)this.fullscreenButton.hidden=this.fullscreenPreviousHidden;
      this.playerVisual.destroy();this.hpFace.destroy();
    });
    this.captainArrival=createCaptainArrival(this);
    resize();
    if(!this.introActive)this.combat.start({wave4:this.debugCheckpoint==='act4-wave4'});
    this.cameras.main.fadeIn(360,0,0,0);
    if(this.introActive){
      void this.captainArrival.loading.then(()=>{
        if(this.disposed)return;
        if(!this.captainArrival.start()){
          this.introActive=false;this.combat.start();this.syncControls();
        }
      });
    }
    enforceOrientationOnSceneStart(this);
  }
  drawPrototypePlaces(){
    // These labels and blocks are disposable visual placeholders, NOT PNG masks.
    const colors={chapel:0x86725d,school:0x706a5f,bicycleRack:0x837c56};
    for(const obstacle of this.obstacles){
      const p=SCHOOL_PLACES[obstacle.id];
      this.add.rectangle(p.x,p.y,p.width,p.height,colors[obstacle.id])
        .setStrokeStyle(5,0x272923).setDepth(-9);
      this.add.text(p.x,p.y,p.label,{fontFamily:'monospace',fontSize:'28px',
        fontStyle:'bold',color:'#f8e6c3',align:'center'}).setOrigin(.5).setDepth(-8);
    }
    const pitch=SCHOOL_PLACES.pitch;
    this.add.rectangle(pitch.x,pitch.y,pitch.width,pitch.height,0x426a50,.73)
      .setStrokeStyle(5,0xd9dfcb).setDepth(-10);
    this.add.line(pitch.x,pitch.y,0,-pitch.height/2,0,pitch.height/2,0xd9dfcb,.7)
      .setLineWidth(3).setDepth(-9);
    this.add.circle(pitch.x,pitch.y,66).setStrokeStyle(4,0xd9dfcb,.7).setDepth(-9);
    this.add.text(pitch.x,pitch.y-120,'BOISKO',{fontFamily:'monospace',fontSize:'28px',color:'#ffffff'})
      .setOrigin(.5).setDepth(-8);
    const entrance=SCHOOL_PLACES.schoolEntrance;
    this.add.text(entrance.x,entrance.y,'WEJŚCIE DO SZKOŁY',
      {fontFamily:'monospace',fontSize:'16px',color:'#f6e9b9'}).setOrigin(.5).setDepth(-7);
    const chapelDoor=SCHOOL_PLACES.chapelDoor;
    this.add.rectangle(chapelDoor.x,chapelDoor.y,85,12,0xaa8c5e).setDepth(-7);
  }
  controlsAllowed(){
    return !this.disposed&&!document.hidden&&document.hasFocus()&&
      window.innerWidth>=window.innerHeight&&!this.scene.isPaused();
  }
  syncControls(){
    if(!this.joystick||!this.aimJoystick)return;
    const allow=this.controlsAllowed()&&!this.introActive&&!this.defeated&&this.run.hp>0;
    if(this.joystick.enabled!==allow)this.joystick.setEnabled(allow);
    if(this.aimJoystick.enabled!==allow)this.aimJoystick.setEnabled(allow);
  }
  resetMovement(){
    this.joystick?.setEnabled(false);
    this.aimJoystick?.setEnabled(false);
    this.input.keyboard?.resetKeys();
  }
  openMenu(){
    if(this.scene.isPaused()||this.scene.isActive('Menu')||!this.controlsAllowed())return;
    this.combat?.suspend();
    this.resetMovement();
    this.scene.pause();
    this.scene.launch('Menu');
    this.scene.bringToTop('Menu');
  }
  update(_time,delta){
    if(this.disposed)return;
    this.captainArrival.update(delta);
    if(this.introActive&&this.captainArrival.arrived&&!this.captainDeparting){
      this.captainDeparting=true;
      const actor=this.captainArrival.actor;
      const door=SCHOOL_PLACES.chapelDoor;
      this.tweens.add({targets:actor,x:door.x,y:door.y,alpha:0,duration:1100,
        ease:'Sine.easeInOut',onComplete:()=>{
          if(this.disposed)return;
          actor?.destroy();
          this.introActive=false;
          this.combat.start();
          this.syncControls();
        }});
    }
    this.syncControls();
    if(!this.controlsAllowed()||this.introActive||this.defeated){this.combat.suspend();return;}
    const k=this.keys;
    const input=normalizeInput(
      this.joystick.direction.x+Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),
      this.joystick.direction.y+Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown));
    const next=schoolStep(this.player,input,delta);
    this.player.setPosition(next.x,next.y);
    this.player.body.reset(next.x,next.y);
    const aim=this.aimJoystick.direction;
    if(Math.hypot(aim.x,aim.y)>.05)this.facing=facingOf(aim.x,aim.y,this.facing);
    else if(Math.hypot(input.x,input.y)>.05)this.facing=facingOf(input.x,input.y,this.facing);
    this.playerVisual.update(this.facing,Math.hypot(input.x,input.y)>.05,Math.min(50,delta));
    this.combat.update(delta,performance.now(),aim,this.aimJoystick.held);
    this.hpFace.update(delta);
  }
}
