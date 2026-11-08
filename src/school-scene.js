import Phaser from 'phaser';
import {createArenaGround} from './arena-ground.js';
import {createPlayer} from './player.js';
import {createPlayerVisual,assetUrl,validPngHeader} from './character-visual.js';
import {createCaptainArrival} from './captain-arrival.js';
import {createJoystick} from './joystick.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {arenaHudLayout} from './ui-layout.js';
import {normalizeInput} from './movement.js';
import {facingOf} from './combat-contract.js';
import {currentCampaignRun,prepareActStart,awardRunArtifact,completeCampaignAct} from './campaign-run.js';
import {availableWeapons,cycleUnlockedWeapon,selectUnlockedWeapon,WEAPONS} from './weapon-progression.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {createSchoolCombat} from './school-combat.js';
import {createAmbientBarks} from './ambient-bark-view.js';
import {seededRandom} from './arena-layout.js';
import {createDialogueState,beginDialogue} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {createSchoolBlazej} from './school-blazej.js';
import {BLAZEJ_BICYCLE_ID,BLAZEJ_START,CHAPEL_RETURN,BLAZEJ_OBSERVER_BARKS,BLAZEJ_BOSS_BARKS} from './school-finale.js';
import {SCHOOL_COMBAT_MS} from './school-combat.js';
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
    this.introActive=!['act4-school','act4-combat','act4-wave4','act4-blazej','act4-boss','act4-finale'].includes(this.debugCheckpoint);
    this.schoolPhase='INTRO';this.defeated=false;this.defeatVisualAt=null;
    this.captainDeparting=false;
    this.storyBusy=false;this.openingPending=false;this.openingDialogueStarted=false;this.bossConfronted=false;
    this.bossDefeatHandled=false;this.actCompleted=false;this.rewardArmedAt=0;this.bicycleTexture=null;
    this.dialogueState=createDialogueState();
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
      if(!this.controlsAllowed()||this.introActive||this.storyBusy||this.dialogueState?.id||this.defeated)return;
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
    // Tiny compatibility surface for the approved Act I bark view; no fork.
    this.enemies=this.combat.enemies;
    this.enemyRenderers=this.combat.renderers;
    this.episode={ended:false,state:'active'};
    this.narrativeEvents=new Set(); // Act I story beats do not run in School.
    this.canResume=()=>this.controlsAllowed()&&!this.introActive&&!this.defeated&&!this.storyBusy&&
      this.run.hp>0&&!this.dialogueLoading&&!this.dialogueState?.id&&
      (this.schoolPhase==='COMBAT'||this.schoolPhase==='CLEANUP'||this.schoolPhase==='BLAZEJ_BOSS');
    this.ambientBarks=createAmbientBarks(this,seededRandom((104^0x46babc)>>>0),{
      guest:{
        rng:seededRandom((104^0x46ba22)>>>0),
        speaker:()=>this.blazej?.actor,
        phase:()=>['COMBAT','CLEANUP'].includes(this.schoolPhase)?'observer':
          this.schoolPhase==='BLAZEJ_BOSS'?'boss':null,
        phrases:{observer:BLAZEJ_OBSERVER_BARKS,boss:BLAZEJ_BOSS_BARKS}
      }
    });
    this.blazej=createSchoolBlazej(this,Phaser);
    this.dialoguePanel=createDialoguePanel(this,Phaser,id=>this.onSchoolDialogueEnded(id));
    this.createBicycleRewardUi();
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
      this.resizeBicycleRewardUi();
      this.syncControls();
    };
    const reset=()=>{this.combat?.suspend();this.ambientBarks?.suspend();this.resetMovement();};
    const sync=()=>{this.combat?.suspend();this.ambientBarks?.guard();this.syncControls();};
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
      this.bicycleWorld?.destroy();
    });
    this.captainArrival=createCaptainArrival(this);
    resize();
    if(!this.introActive){
      const stage=['act4-blazej','act4-boss','act4-finale'].includes(this.debugCheckpoint);
      this.combat.start({wave4:stage||this.debugCheckpoint==='act4-wave4'});
      if(stage&&this.run.isDebugRun){
        this.combat.qa?.setElapsedMs(SCHOOL_COMBAT_MS);
        this.combat.update(0,performance.now());
        if(this.debugCheckpoint!=='act4-blazej'&&this.combat.enterBoss()&&this.blazej.activate()&&
            this.debugCheckpoint==='act4-finale')this.blazej.damage(this.blazej.actor.hp,this.player,this.time.now);
      }
    }
    this.cameras.main.fadeIn(360,0,0,0);
    if(this.introActive){
      void this.captainArrival.loading.then(()=>{
        if(this.disposed)return;
        if(!this.captainArrival.start()){
          this.introActive=false;this.openingPending=true;this.syncControls();
        }
      });
    }
    enforceOrientationOnSceneStart(this);
  }
  beginSchoolDialogue(id){
    if(this.disposed||this.defeated||this.storyBusy||this.dialogueState.id||
       !this.controlsAllowed()||!beginDialogue(this.dialogueState,id))return false;
    this.storyBusy=true;
    this.combat.suspend();this.ambientBarks.suspend();
    this.resetMovement();this.syncControls();
    this.dialoguePanel.show(this.dialogueState);
    return true;
  }
  onSchoolDialogueEnded(id){
    if(this.disposed||this.defeated)return;
    if(id==='act4-maciek-seba'){
      this.storyBusy=false;
      this.beginSchoolDialogue('act4-blazej-observer');
    }else if(id==='act4-blazej-observer'){
      this.storyBusy=false;
      this.beginSchoolDialogue('act4-blazej-confrontation');
    }else if(id==='act4-blazej-confrontation'){
      this.storyBusy=false;
      this.combat.start(); // The first ordinary wave begins only after DALEJ.
      this.combat.suspend();this.syncControls();
    }else if(id==='act4-blazej-final'){
      this.storyBusy=false;
      if(this.combat.enterBoss())this.blazej.activate();
      this.combat.suspend();this.syncControls();
    }else if(id==='act4-chapel-ending')this.completeActFour();
  }
  onBlazejDefeated(){
    if(this.disposed||this.defeated||this.bossDefeatHandled||
       this.schoolPhase!=='BLAZEJ_BOSS')return;
    this.bossDefeatHandled=true;this.storyBusy=true;
    this.combat.stopFire();this.ambientBarks.suspend();this.resetMovement();this.syncControls();
    // The existing Żubrokryptyda pixel burst completes before the reward.
    this.time.delayedCall(470,()=>{
      if(!this.disposed&&!this.defeated&&this.combat.advanceFinale('BLAZEJ_REWARD'))
        this.showBicycleReward();
    });
  }
  createBicycleRewardUi(){
    const w=()=>this.scale.width,h=()=>this.scale.height;
    this.rewardRoot=this.add.container(0,0).setScrollFactor(0).setDepth(210).setVisible(false);
    const bg=this.add.rectangle(0,0,w(),h(),0x101417,.96).setOrigin(0);
    this.rewardTitle=this.add.text(w()/2,h()*.23,'ZDOBYŁEŚ ARTEFAKT',
      {fontFamily:'monospace',fontSize:'23px',fontStyle:'bold',color:'#f2d18c'}).setOrigin(.5);
    this.rewardName=this.add.text(w()/2,h()*.48,'ROWER BŁAŻEJA',
      {fontFamily:'monospace',fontSize:'22px',fontStyle:'bold',color:'#f3e9d5',
       align:'center',wordWrap:{width:w()-30}}).setOrigin(.5);
    this.rewardDetail=this.add.text(w()/2,h()*.68,'ARTEFAKT 3/3',
      {fontFamily:'monospace',fontSize:'17px',color:'#f2d18c'}).setOrigin(.5);
    this.rewardRoot.add([bg,this.rewardTitle,this.rewardName,this.rewardDetail]);
    this.rewardBg=bg;this.rewardImage=null;
    this.rewardButton=this.add.rectangle(w()/2,h()-28,135,40,0x655039)
      .setStrokeStyle(2,0xd9bd80).setScrollFactor(0).setDepth(212)
      .setInteractive({useHandCursor:true}).setVisible(false);
    this.rewardButtonLabel=this.add.text(w()/2,h()-28,'DALEJ',
      {fontFamily:'monospace',fontSize:'18px',color:'#fff2d6'})
      .setOrigin(.5).setScrollFactor(0).setDepth(213).setVisible(false);
    this.rewardButton.on('pointerdown',()=>{
      if(this.schoolPhase!=='BLAZEJ_REWARD'||!this.controlsAllowed()||
         this.game.loop.time<this.rewardArmedAt)return;
      this.rewardRoot.setVisible(false);this.rewardButton.setVisible(false);
      this.rewardButtonLabel.setVisible(false);
      if(this.combat.advanceFinale('BICYCLE_RIDE'))this.startBicycleRide();
    });
    // Optional approved future 192x192 RGBA PNG; a missing file stays text-only.
    void (async()=>{
      try{
        // The approved upload appeared on main as artifact-blazej-bike.png
        // after the audited base; keep the contracted future name too.
        let response=null;
        for(const path of ['artifacts/artifact-blazej-bicycle.png',
          'artifacts/artifact-blazej-bike.png']){
          const candidate=await fetch(assetUrl(import.meta.env.BASE_URL,path),{cache:'no-cache'});
          if(candidate.ok){response=candidate;break;}
        }
        if(!response)return;
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(!validPngHeader(bytes,{width:192,height:192}))return;
        const blob=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        try{
          const image=new Image();
          await new Promise((resolve,reject)=>{
            image.onload=resolve;image.onerror=reject;image.src=blob;
          });
          if(this.disposed||image.naturalWidth!==192||image.naturalHeight!==192)return;
          const key='artifact-blazej-bicycle';
          if(!this.textures.exists(key))this.textures.addImage(key,image);
          this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
          this.bicycleTexture=key;
          this.rewardImage=this.add.image(0,0,key).setDisplaySize(110,110);
          this.rewardRoot.addAt(this.rewardImage,2);
          this.resizeBicycleRewardUi();
        }finally{URL.revokeObjectURL(blob);}
      }catch{ /* The production artifact PNG is not yet included. */ }
    })();
  }
  resizeBicycleRewardUi(){
    if(!this.rewardRoot)return;
    const w=this.scale.width,h=this.scale.height,x=w/2;
    this.rewardBg.setSize(w,h);
    this.rewardTitle.setPosition(x,h*.23).setFontSize(Math.min(23,h*.065));
    this.rewardName.setPosition(x,this.rewardImage?h*.70:h*.48)
      .setWordWrapWidth(w-30).setFontSize(Math.min(22,h*.058));
    this.rewardDetail.setPosition(x,this.rewardImage?h*.83:h*.68);
    this.rewardImage?.setPosition(x,h*.44)
      .setDisplaySize(Math.min(110,h*.32),Math.min(110,h*.32));
    this.rewardButton.setPosition(x,h-26);
    this.rewardButtonLabel.setPosition(x,h-26);
  }
  showBicycleReward(){
    if(this.disposed||this.defeated||this.schoolPhase!=='BLAZEJ_REWARD')return false;
    if(!this.run.artifacts.has(BLAZEJ_BICYCLE_ID))
      awardRunArtifact(this.run,BLAZEJ_BICYCLE_ID);
    this.rewardArmedAt=this.game.loop.time+220;
    this.rewardRoot.setVisible(true);this.rewardButton.setVisible(true);
    this.rewardButtonLabel.setVisible(true);this.syncControls();return true;
  }
  startBicycleRide(){
    if(this.disposed||this.schoolPhase!=='BICYCLE_RIDE')return;
    this.storyBusy=true;this.resetMovement();this.combat.suspend();
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,()=>{
      if(this.disposed||this.schoolPhase!=='BICYCLE_RIDE')return;
      if(this.bicycleTexture){
        // Stage on a known-safe outdoor route beside the bicycle rack; never
        // tween through the school even if the boss died on its far side.
        this.player.setPosition(BLAZEJ_START.x,BLAZEJ_START.y);
        this.player.body.reset(this.player.x,this.player.y);
        // Approved PNG alone; no replacement bike, rider sheet or riding controls.
        this.bicycleWorld=this.add.image(this.player.x,this.player.y+10,this.bicycleTexture)
          .setScale(.48).setDepth(10);
        this.cameras.main.fadeIn(150,0,0,0);
        this.tweens.add({targets:this.player,x:CHAPEL_RETURN.x,y:CHAPEL_RETURN.y,
          duration:1100,ease:'Sine.easeInOut',onComplete:()=>this.returnToChapel()});
      }else{
        // Without approved bike art the intended ride remains an honest fade.
        this.player.setPosition(CHAPEL_RETURN.x,CHAPEL_RETURN.y);
        this.player.body.reset(CHAPEL_RETURN.x,CHAPEL_RETURN.y);
        this.cameras.main.centerOn(CHAPEL_RETURN.x,CHAPEL_RETURN.y);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE,
          ()=>this.returnToChapel());
        this.cameras.main.fadeIn(350,0,0,0);
      }
    });
    this.cameras.main.fadeOut(280,0,0,0);
  }
  returnToChapel(){
    if(this.disposed||this.defeated||this.schoolPhase!=='BICYCLE_RIDE')return false;
    this.bicycleWorld?.destroy();this.bicycleWorld=null;
    this.player.setPosition(CHAPEL_RETURN.x,CHAPEL_RETURN.y);
    this.player.body.reset(CHAPEL_RETURN.x,CHAPEL_RETURN.y);
    this.playerVisual.update(this.facing,false,0);
    if(!this.combat.advanceFinale('CHAPEL_RETURN'))return false;
    this.storyBusy=false;
    return this.beginSchoolDialogue('act4-chapel-ending');
  }
  completeActFour(){
    if(this.disposed||this.actCompleted||this.defeated||
       this.schoolPhase!=='CHAPEL_RETURN'||!this.run.artifacts.has(BLAZEJ_BICYCLE_ID))return false;
    const committed=completeCampaignAct(this.run,'act4',{
      hp:this.run.hp,maxHp:this.run.maxHp,unlockedWeapons:this.run.unlockedWeapons,
      selectedWeapon:this.weapon,kills:this.combat.kills+Number(this.blazej.defeated),
      activeCombatMs:this.combat.elapsedMs
    });
    if(!committed)return false;
    this.actCompleted=true;this.storyBusy=true;
    this.combat.advanceFinale('ACT_IV_COMPLETE');
    this.combat.suspend();this.ambientBarks.suspend();this.resetMovement();
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,()=>{
      if(!this.disposed)this.scene.start('Menu'); // Act V remains unimplemented.
    });
    this.cameras.main.fadeOut(520,0,0,0);
    return true;
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
    const allow=this.controlsAllowed()&&!this.introActive&&!this.defeated&&!this.storyBusy&&!this.dialogueState?.id&&this.run.hp>0;
    if(this.joystick.enabled!==allow)this.joystick.setEnabled(allow);
    if(this.aimJoystick.enabled!==allow)this.aimJoystick.setEnabled(allow);
  }
  resetMovement(){
    this.joystick?.setEnabled(false);
    this.aimJoystick?.setEnabled(false);
    this.input.keyboard?.resetKeys();
  }
  captureSchoolDefeat(){
    if(this.defeated)return false;
    // Match ArenaScene: convert actual world death position to the Menu's
    // screen-space pixel burst coordinates before pausing the camera.
    const camera=this.cameras.main,origin=camera.getWorldPoint(0,0);
    this.defeatVisualAt={x:(this.player.x-origin.x)*camera.zoom,
      y:(this.player.y-origin.y)*camera.zoom};
    this.defeated=true;
    this.playerVisual.sprite?.setVisible(false);
    this.playerVisual.shadow?.setVisible(false);
    this.player.setVisible(false);
    return true;
  }
  openMenu(){
    if(this.scene.isPaused()||this.scene.isActive('Menu')||!this.controlsAllowed())return;
    this.combat?.suspend();
    this.ambientBarks?.suspend();
    this.blazej?.clearAttacks();
    this.resetMovement();
    this.scene.pause();
    this.scene.launch('Menu');
    this.scene.bringToTop('Menu');
  }
  update(_time,delta){
    if(this.disposed)return;
    this.ambientBarks?.guard();
    this.blazej?.updateVfx(delta);
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
          this.openingPending=true;
          this.syncControls();
        }});
    }
    if(this.openingPending&&!this.openingDialogueStarted&&this.controlsAllowed()){
      this.openingDialogueStarted=this.beginSchoolDialogue('act4-maciek-seba');
      if(this.openingDialogueStarted)this.openingPending=false;
    }
    this.syncControls();
    if(!this.controlsAllowed()||this.introActive||this.defeated){this.combat.suspend();return;}
    if(this.storyBusy||this.dialogueState.id){
      this.combat.suspend();
      if(this.schoolPhase==='BICYCLE_RIDE'){
        this.player.body.reset(this.player.x,this.player.y);
        this.playerVisual.update(this.facing,true,Math.min(50,delta));
        this.bicycleWorld?.setPosition(this.player.x,this.player.y+10);
      }
      return;
    }
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
    const now=performance.now();
    this.combat.update(delta,now,aim,this.aimJoystick.held);
    if(this.schoolPhase==='BLAZEJ_PENDING'&&!this.bossConfronted){
      this.bossConfronted=this.beginSchoolDialogue('act4-blazej-final');
    }
    if(this.schoolPhase==='BLAZEJ_BOSS')this.blazej.update(delta,now);
    if(this.defeated)return;
    this.ambientBarks.tick(this.combat.elapsedMs);
    this.hpFace.update(delta);
  }
}
