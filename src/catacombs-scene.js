import Phaser from 'phaser';
import {retroAudio} from './retro-audio.js';
import {createBossBarks,KLUSOCZLEK_BARKS} from './boss-barks.js';
import {createPlayer} from './player.js';
import {createPlayerVisual} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {arenaHudLayout} from './ui-layout.js';
import {normalizeInput,PLAYER_RADIUS} from './movement.js';
import {playerFrame,facingOf,resolvePose} from './combat-contract.js';
import {createPixelBurst,updateBursts,destroyBursts} from './pixel-death-vfx.js';
import {segmentRudolfHit,rudolfFlameVisible,FAIRY_ARRIVAL} from './act5-final-visuals.js';
import {createContinuousWeaponState,drawContinuousStream,emitContinuousParticle,updateContinuousParticles} from './continuous-weapon.js';
import {muzzlePoint,resolveAim} from './shooting.js';
import {currentCampaignRun,prepareActStart,completeCampaignAct,updateRunHealth} from './campaign-run.js';
import {clearCampaignCheckpoint} from './campaign-save.js';
import {recordActCompletion} from './act-unlocks.js';
import {availableWeapons,selectUnlockedWeapon,cycleUnlockedWeapon,WEAPONS} from './weapon-progression.js';
import {COMBAT_TUNING,createFiringState,firingStep,resetFiring,inFlameCone,cooldownReady} from './weapon-combat.js';
import {createDialogueState,beginDialogue} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {beginSceneReveal} from './scene-reveal-gate.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {CATACOMBS,CATACOMBS_OBSTACLES,CATACOMBS_SUMMON_SITES,
 catacombsWalkable,catacombsStep,catacombsResolve,catacombsFairyArrival,MARIAN_FINAL_ASSETS,CATACOMBS_ART,catacombsArtPlacement} from './catacombs-contract.js';
import {createFinalBossState,FINAL_BOSS,finalBossStart,finalBossStep,finalBossDamage,
 finalBossBeginSummon,finalBossAddSummon,finalBossClearSummon} from './marian-final-boss.js';
import {segmentObstacleHit} from './obstacles.js';
import {createBobrozombiRenderer,createBocianolakRenderer,createZubrokryptydaRenderer} from './enemy-visual.js';

export class CatacombsScene extends Phaser.Scene{
 constructor(){super('Catacombs');}
 init(data={}){this.handoff=data.handoff??null;this.debugCheckpoint=data.debugCheckpoint??null;}
 create(){retroAudio.enter('Catacombs');
    this.events.on(Phaser.Scenes.Events.RESUME,()=>retroAudio.enter('Catacombs'));
  this.disposed=false;this.entryGateReady=false;this.phase='opening';
  this.defeated=false;this.completed=false;this.finalized=false;
  this.transformationStarted=false;this.transformationCompleted=false;
  this.summons=[];this.shots=[];this.bossShots=[];this.shotCooldowns=new Map();
  this.killCount=0;this.combatMs=0;this.facing='n';this.bossFacing='s';this.hitUntil=0;
  this.deathBursts=[];this.bossDeathClock=0;this.lastShotAim={x:0,y:-1};
  this.boss=createFinalBossState();
  this.run=currentCampaignRun(this.game);
  const registered=new Set(Object.keys(this.scene.manager.keys));
  if(this.run.actId!=='act5'&&!prepareActStart(this.run,this.handoff,registered)){
   this.scene.start('Menu');return;
  }
  updateRunHealth(this.run,this.run.maxHp);
  this.physics.world.setBounds(0,0,CATACOMBS.width,CATACOMBS.height);
  this.cameras.main.setBounds(0,0,CATACOMBS.width,CATACOMBS.height);
  // Only Act V's opening uses a wide shot: the actual 256px Rudolf atlas
  // expands to 256*.62*1.23 px during flashing, and Aloes stands south
  // of the altar. Reserve the lower dialogue panel in screen pixels.
  this.openingCameraZoom=()=>{
   const transformedTop=CATACOMBS.marianStart.y-256*.62*1.23;
   const playerBottom=CATACOMBS.playerStart.y+64*.65;
   // Dialogue UI has measured its actual wrapped height by this point.
   // Leave at least 45 screen pixels for breathing room and safe areas.
   const dialogueTop=this.dialoguePanel?.shell?.list?.[0]?.y??this.scale.height*.66;
   return Math.min(.58,Math.max(.08,(dialogueTop-45)/(playerBottom-transformedTop)));
  };
  this.openingCameraScroll=()=>{
   const zoom=this.openingCameraZoom();
   const transformedTop=CATACOMBS.marianStart.y-256*.62*1.23;
   // Phaser zoom is around the viewport center. The camera scroll is
   // calibrated so transformed head projects 12px below the top edge.
   return {x:CATACOMBS.width/2-this.scale.width/2,
    y:transformedTop+((1-zoom)*this.scale.height/2-12)/zoom};
  };
  this.resizeCamera=()=>{
   const opening=this.phase==='opening'||this.phase==='transform';
   if(opening){
    const {x,y}=this.openingCameraScroll();
    // Opening art may be narrower than the physical landscape viewport.
    // Do not clamp it to the left wall; symmetrical margins are deliberate.
    this.cameras.main.removeBounds();
    this.cameras.main.setZoom(this.openingCameraZoom()).setScroll(x,y);
   }else if(['boss-death','fairy','magic'].includes(this.phase))
    this.cameras.main.setZoom(1).centerOn(CATACOMBS.width/2,350);
  };
  this.drawCatacombs();
  const start=CATACOMBS.playerStart;
  if(!catacombsWalkable(start))throw Error('Act V unsafe player start');
  this.player=createPlayer(this,start.x,start.y);
  this.playerVisual=createPlayerVisual(this,this.player,this.player,Phaser);
  const selected=availableWeapons(this.run.unlockedWeapons,'act5');
  this.weapon=selectUnlockedWeapon(this.run.selectedWeapon,this.run.unlockedWeapons,'act5')
   ??(selected.includes('rifle')?'rifle':selected[0]??'blunderbuss');
  this.run.selectedWeapon=this.weapon;
  void this.playerVisual.setVariant(this.weapon).then(()=>{
   if(!this.disposed)this.playerVisual.update(this.facing,false,0);
  });
  this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
  this.joystick=createJoystick(this,'left');
  this.aimJoystick=createJoystick(this,'right');
  this.firing=createFiringState();
  this.fire=createContinuousWeaponState();
  this.flameStream=this.add.graphics().setDepth(17);
  this.flameBlocked=(from,to)=>Boolean(segmentObstacleHit(from,to,CATACOMBS_OBSTACLES,0));
  this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
  this.weaponBody=this.add.circle(0,0,21,0x303b2b,.92).setStrokeStyle(2,0xb9a16b);
  this.weaponLabel=this.add.text(0,0,WEAPONS[this.weapon].symbol,{
   fontFamily:'monospace',fontSize:'21px',color:'#fff'}).setOrigin(.5);
  this.weaponToken.add([this.weaponBody,this.weaponLabel]);
  this.menuButton=this.add.rectangle(0,0,80,38,0x2b3324,.95)
   .setStrokeStyle(2,0xb9a16b).setScrollFactor(0).setDepth(60).setInteractive({useHandCursor:true});
  this.menuLabel=this.add.text(0,0,'MENU',{fontFamily:'monospace',fontSize:'17px',color:'#e8d6a5'})
   .setOrigin(.5).setScrollFactor(0).setDepth(61);
  this.menuButton.on('pointerdown',()=>this.openMenu());
  this.hpFace=createHpFaceHud(this,Phaser);
  this.hpFace.setHp(this.run.hp);
  this.hpText=this.add.text(0,0,'HP '+this.run.hp+'/'+this.run.maxHp,{
   fontFamily:'monospace',fontSize:'13px',color:'#f3e8d1'})
   .setOrigin(.5,0).setScrollFactor(0).setDepth(81);
  this.objective=this.add.text(0,0,'KATAKUMBY KAPLICY',{
   fontFamily:'monospace',fontSize:'15px',color:'#e8c883'}).setOrigin(.5,0).setScrollFactor(0).setDepth(70);
  this.dialogueState=createDialogueState();
  this.dialoguePanel=createDialoguePanel(this,Phaser,id=>this.afterDialogue(id),state=>this.onDialogueAdvance(state));
  this.enemyRenderers={
   bobrozombi:createBobrozombiRenderer(this,Phaser),
   bocianolak:createBocianolakRenderer(this,Phaser),
   zubrokryptyda:createZubrokryptydaRenderer(this,Phaser)
  };
  this.bossActor=this.add.container(CATACOMBS.marianStart.x,CATACOMBS.marianStart.y).setDepth(13);
  this.bossShadow=this.add.ellipse(0,3,43,14,0x000000,.42);
  this.bossFallback=this.add.ellipse(0,-29,53,83,0x515171,.95).setStrokeStyle(4,0xd2bc8a);
  this.bossFallbackHat=this.add.rectangle(0,-73,65,12,0x46402d);
  this.bossArt=this.add.sprite(0,0,'__DEFAULT').setOrigin(.5,1).setVisible(false);
  this.bossActor.add([this.bossShadow,this.bossFallback,this.bossFallbackHat,this.bossArt]);
  this.bossBarks=createBossBarks(this,{
   phrases:KLUSOCZLEK_BARKS,speaker:()=>this.bossActor,
   offsetY:129,allowed:()=>this.canPlay()&&!this.boss.defeated&&
    (this.boss.phase==='gun'||this.boss.phase==='summon')
  });
  this.bossHp=this.add.graphics().setScrollFactor(0).setDepth(75);
  this.bossHpLabel=this.add.text(0,0,'RUDOLF / KŁUSOCZŁEK',{
   fontFamily:'monospace',fontSize:'12px',color:'#ffb4a1'
  }).setOrigin(.5).setScrollFactor(0).setDepth(76).setVisible(false);
  this.bossTintClock=0;
  this.fairyActor=null;
  this.fairyQueued=false;this.fairyDialogueQueued=false;this.endingFadeQueued=false;
  this.finalRecoveryCleanups=new Set();
  this.finaleText=null;
  this.transitionVeil=this.add.rectangle(0,0,this.scale.width,this.scale.height,0x08050d,0)
   .setOrigin(0).setScrollFactor(0).setDepth(96);
  const switchWeapon=()=>{
   if(!this.canPlay())return;
   const next=cycleUnlockedWeapon(this.weapon,this.run.unlockedWeapons,'act5');
   if(!next||next===this.weapon)return;
   this.weapon=next;this.run.selectedWeapon=next;
   this.weaponLabel.setText(WEAPONS[next].symbol);
   this.weaponBody.setFillStyle(WEAPONS[next].color,.92);
   resetFiring(this.firing,this.weapon);
   this.stopFlame();
   void this.playerVisual.setVariant(next);
  };
  const pointer=ptr=>{
   if(ptr.id===this.joystick.pointerId||ptr.id===this.aimJoystick.pointerId)return;
   const l=this.hudLayout;
   if(l&&Math.hypot(ptr.x-l.switchX,ptr.y-l.switchY)<=l.switchSize/2)switchWeapon();
  };
  const keyboard=e=>{if(e.code==='KeyQ'&&!e.repeat)switchWeapon();};
  this.input.on('pointerdown',pointer);
  this.input.keyboard.on('keydown',keyboard);
  const resize=()=>{
   const l=arenaHudLayout(this.scale.height,this.scale.width);
   this.hudLayout=l;
   this.resizeCamera();
   if(this.phase==='fairy'&&this.fairyActor?.active){
    const view=this.fairyVisibleBounds(),actor=this.fairyActor;
    if(actor.x<view.left+39||actor.x>view.right-39||actor.y<view.top+39||actor.y>view.bottom-39){
     const point=catacombsFairyArrival(this.bossActor,this.player,CATACOMBS.fairyStart,view);
     if(point)actor.setPosition(point.x,point.y);
    }
   }
   this.joystick.reposition(l.joystickX,l.joystickY,l.joystickRadius);
   this.aimJoystick.reposition(l.aimX,l.aimY,l.joystickRadius);
   this.weaponToken.setPosition(l.switchX,l.switchY).setScale(l.switchSize/42);
   this.menuButton.setPosition(l.menuX,l.menuY).setSize(l.menuWidth,l.menuHeight);
   this.menuLabel.setPosition(l.menuX,l.menuY).setFontSize(l.menuFont);
   this.hpFace.resize(l);this.hpText.setPosition(l.hpX,l.hpY);
   this.objective.setPosition(this.scale.width/2,Math.max(7,l.menuY-l.menuHeight/2));
   this.transitionVeil.setSize(this.scale.width,this.scale.height);
   this.finaleText?.setPosition(this.scale.width/2,this.scale.height/2);
   this.syncControls();
  };
  const reset=()=>{this.resetMovement();this.stopFlame();resetFiring(this.firing,this.weapon);};
  const sync=()=>this.syncControls();
  this.scale.on(Phaser.Scale.Events.RESIZE,resize);
  this.events.on(Phaser.Scenes.Events.PAUSE,reset);
  this.events.on(Phaser.Scenes.Events.RESUME,sync);
  window.addEventListener('blur',reset);
  window.addEventListener('focus',sync);
  document.addEventListener('visibilitychange',sync);
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
   this.disposed=true;
   for(const cancel of [...this.finalRecoveryCleanups])cancel();
   this.scale.off(Phaser.Scale.Events.RESIZE,resize);
   this.events.off(Phaser.Scenes.Events.PAUSE,reset);
   this.events.off(Phaser.Scenes.Events.RESUME,sync);
   window.removeEventListener('blur',reset);window.removeEventListener('focus',sync);
   document.removeEventListener('visibilitychange',sync);
   this.input.off('pointerdown',pointer);this.input.keyboard.off('keydown',keyboard);
   this.playerVisual.destroy();this.hpFace.destroy();
   for(const renderer of Object.values(this.enemyRenderers))renderer.shutdown();
   this.clearShots();this.clearSummons();destroyBursts(this.deathBursts);
   this.stopFlame(true);this.flameStream.destroy();
  });
  this.fullscreenButton=document.getElementById('fullscreen-button');
  this.fullscreenPreviousHidden=this.fullscreenButton?.hidden??false;
  if(this.fullscreenButton)this.fullscreenButton.hidden=true;
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
   if(this.fullscreenButton)this.fullscreenButton.hidden=this.fullscreenPreviousHidden;
  });
  resize();this.resetMovement();
  const required=()=>Promise.allSettled([
   this.playerVisual.loading,this.dialoguePanel.loading,
   ...Object.values(this.enemyRenderers).map(x=>x.loading)
  ]);
  this.entryGate=beginSceneReveal(this,required,{onReady:()=>{
   if(this.disposed)return;
   this.selectMarianAppearance(false);
   if(this.debugCheckpoint==='act5-boss')this.startBoss();
   else if(this.debugCheckpoint==='act5-ending')this.defeatBoss(true);
   else this.showDialogue('act5-betrayal');
   this.syncControls();
  }});
  enforceOrientationOnSceneStart(this);
 }
 drawCatacombs(){
  // Production art is prepared by ActTitle; never draw the procedural overlay
  // on top of a valid production background or obstacle image.
  const background=CATACOMBS_ART.background;
  this.catacombsBackground=null;
  this.catacombsObstacleArt=[];
  if(this.textures.exists(background.key)){
   this.catacombsBackground=this.add.image(0,0,background.key)
    .setOrigin(0,0).setDisplaySize(CATACOMBS.width,CATACOMBS.height).setDepth(-20);
   this.catacombsBackground.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }else{
   // Emergency fallback for direct scene entry without approved assets.
   // A normal ActTitle transition does not reveal until its PNGs validate.
   const g=this.add.graphics().setDepth(-20);
   g.fillStyle(0x14131a).fillRect(0,0,CATACOMBS.width,CATACOMBS.height);
   g.fillStyle(0x39343b).fillRect(CATACOMBS.wall,CATACOMBS.wall,
    CATACOMBS.width-2*CATACOMBS.wall,CATACOMBS.height-2*CATACOMBS.wall);
   g.lineStyle(8,0x776c70).strokeRect(CATACOMBS.wall,CATACOMBS.wall,
    CATACOMBS.width-2*CATACOMBS.wall,CATACOMBS.height-2*CATACOMBS.wall);
  }
  for(const obstacle of CATACOMBS_OBSTACLES){
   const placement=catacombsArtPlacement(obstacle);
   if(this.textures.exists(placement.key)){
    const art=this.add.image(placement.x,placement.y,placement.key)
     .setOrigin(placement.originX,placement.originY)
     .setDisplaySize(placement.width,placement.height)
     .setDepth(obstacle.id==='altar'?12:16);
    art.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    art.setData('catacombsObstacleId',obstacle.id);
    this.catacombsObstacleArt.push(art);
   }else{
    // Isolated fallback; do not duplicate other validated obstacle textures.
    const {width,height}=obstacle.footprint;
    const g=this.add.graphics().setDepth(12);
    g.fillStyle(0x393039).fillRoundedRect(obstacle.x-width/2,
     obstacle.y-height/2,width,height,6);
    g.lineStyle(2,0xc0afa8).strokeRoundedRect(obstacle.x-width/2,
     obstacle.y-height/2,width,height,6);
    g.setData('catacombsObstacleId',obstacle.id);
    this.catacombsObstacleArt.push(g);
   }
  }
 }
 selectMarianAppearance(transformed){
  const key=transformed?MARIAN_FINAL_ASSETS.transformed.key:MARIAN_FINAL_ASSETS.normal.key;
  const effective=this.textures.exists(key)?key:this.textures.exists(MARIAN_FINAL_ASSETS.normal.key)?
   MARIAN_FINAL_ASSETS.normal.key:null;
  if(effective){
   this.bossArt.setTexture(effective,playerFrame(this.bossFacing)).setScale(effective===MARIAN_FINAL_ASSETS.transformed.key?.62:.72).setVisible(true);
   this.bossFallback.setVisible(false);this.bossFallbackHat.setVisible(false);
  }else{
   this.bossArt.setVisible(false);this.bossFallback.setVisible(true);this.bossFallbackHat.setVisible(true);
  }
  this.transformedVisual=transformed;
 }
 showDialogue(id){
  if(this.disposed||this.dialogueState.id||!beginDialogue(this.dialogueState,id))return false;
  this.resetMovement();this.stopFlame();this.dialoguePanel.show(this.dialogueState);
  if(this.phase==='opening')this.resizeCamera();
  return true;
 }
 onDialogueAdvance(state){
  // Only the first panel may trigger transformation. Keep the panel's
  // index at 1, suspend taps, then resume the next panel after animation.
  if(state.id!=='act5-betrayal'||state.index!==1||this.transformationStarted)return;
  this.dialoguePanel.suspend();
  this.startTransformation();
 }
 afterDialogue(id){
  if(this.disposed)return;
  if(id==='act5-betrayal'&&this.transformationCompleted)this.startBoss();
  else if(id==='act5-fairy')this.showFairyEnding();
 }
 startTransformation(){
  if(this.phase!=='opening'||this.transformationStarted||this.dialogueState.id!=='act5-betrayal'||this.dialogueState.index!==1)return false;
  this.transformationStarted=true;
  this.phase='transform';this.resetMovement();this.stopFlame();this.syncControls();
  // Focus on Marian during the original blinking evolution; no camera snap.
  this.cameras.main.zoomTo(Math.min(.82,this.openingCameraZoom()*1.16),340,'Sine.easeInOut');
  this.cameras.main.pan(CATACOMBS.marianStart.x,215,340,'Sine.easeInOut');
  this.transitionVeil.setFillStyle(0x0d0815,.55).setAlpha(.55);
  this.selectMarianAppearance(false);
  let pulses=0;
  const flash=()=>{
   if(this.disposed||this.phase!=='transform')return;
   const lit=++pulses%2===1;
   this.bossActor.setAlpha(lit?1:.35).setScale(lit?1.23:.94);
   this.bossArt.setTint(lit?0xffffff:0x9f63f0);
   this.bossFallback.setFillStyle(lit?0xe5defa:0x515171);
  };
  flash();
  this.transformTimer=this.time.addEvent({delay:155,repeat:12,callback:flash});
  this.time.delayedCall(FINAL_BOSS.transformationMs,()=>{
   if(this.disposed||this.phase!=='transform')return;
   this.bossActor.setAlpha(1).setScale(1);
   this.bossArt.clearTint();this.transitionVeil.setAlpha(0);
   this.selectMarianAppearance(true);
   this.transformationCompleted=true;
   this.phase='opening';this.syncControls();
   this.dialoguePanel.resume();
   const {x,y}=this.openingCameraScroll();
   this.cameras.main.zoomTo(this.openingCameraZoom(),340,'Sine.easeInOut');
   this.tweens.add({targets:this.cameras.main,scrollX:x,scrollY:y,duration:340,ease:'Sine.easeInOut'});
  });
  return true;
 }
 startBoss(){
  if(this.disposed||this.phase==='boss'||this.boss.defeated)return false;
  this.phase='boss';this.selectMarianAppearance(true);
  this.bossHpLabel.setVisible(true);
  // Restore player-follow before enabling damage/combat. Phaser's lerp
  // avoids a hard camera snap while the existing local zoom eases to 1.
  this.cameras.main.setBounds(0,0,CATACOMBS.width,CATACOMBS.height);
  // Keep Rudolf's full 256px transformed sprite in view at combat entry,
  // without losing normal smooth follow of Aloes or changing world physics.
  this.cameras.main.startFollow(this.player,true,.12,.12,0,108);
  this.cameras.main.zoomTo(1,320,'Sine.easeInOut');
  this.transitionVeil.setAlpha(0);
  finalBossStart(this.boss);
  this.objective.setText('POKONAJ KŁUSOCZŁEKA!');
  this.syncControls();return true;
 }
 summonWave(){
  if(!finalBossBeginSummon(this.boss))return false;
  this.clearShots();this.bossArt.setTint(0xb4a9f3);
  const sites=CATACOMBS_SUMMON_SITES.slice(0,FINAL_BOSS.maxSummons);
  for(const [i,site] of sites.entries()){
   if(!catacombsWalkable(site,CATACOMBS.enemyRadius))continue;
   const enemy={id:'horn-'+this.boss.summonIndex+'-'+i,type:site.type,
    x:site.x,y:site.y,hp:site.type==='zubrokryptyda'?4:2,dead:false,
    radius:CATACOMBS.enemyRadius,seed:i+this.boss.summonIndex*11,
    facing:'s',activationAt:this.time.now+650,hitUntil:0,lastContact:-Infinity};
   enemy.sprite=this.enemyRenderers[enemy.type].create(enemy.x,enemy.y);
   if(finalBossAddSummon(this.boss,enemy))this.summons.push(enemy);
   else enemy.sprite.destroy();
  }
  this.objective.setText('RÓG BOGDANA — POKONAJ PRZYZWANYCH!');
  return true;
 }
 clearSummons(){
  for(const e of this.summons)e.sprite?.destroy();
  this.summons.length=0;this.boss.summons.length=0;
 }
 clearShots(){
  for(const p of [...this.shots,...this.bossShots])p.sprite?.destroy();
  this.shots.length=0;this.bossShots.length=0;
 }
 damageBoss(amount){
  const hit=finalBossDamage(this.boss,amount,this.time.now);
  if(!hit)return false;
  this.bossArt.setTint(0xff6f79);
  this.time.delayedCall(110,()=>{if(!this.disposed&&this.boss.phase!=='summon')this.bossArt.clearTint();});
  if(this.boss.defeated)this.defeatBoss();
  else this.summonWave();
  return true;
 }
 damageEnemy(enemy,amount){
  if(!enemy||enemy.dead)return false;
  enemy.hp=Math.max(0,enemy.hp-amount);
  if(enemy.hp>0){enemy.sprite.setAlpha(.6);return true;}
  enemy.dead=true;retroAudio.enemyDeath();
  this.deathBursts.push(createPixelBurst(this,enemy.type,enemy.x,enemy.y,enemy.seed));
  enemy.sprite.destroy();this.killCount++;
  finalBossClearSummon(this.boss,enemy.id);
  this.summons=this.summons.filter(e=>!e.dead);
  if(this.boss.phase==='gun'){this.bossArt.clearTint();this.objective.setText('POKONAJ KŁUSOCZŁEKA!');}
  return true;
 }
 defeatBoss(debug=false){
  if(this.finalized)return false;
  if(!debug&&!this.boss.defeated)return false;
  this.finalized=true;this.boss.hp=0;this.boss.phase='defeated';this.boss.defeated=true;
  if(debug)this.boss.defeatEvents=1;
  this.clearShots();this.clearSummons();this.resetMovement();this.stopFlame(true);
  this.bossBarks?.suspend();
  this.phase='boss-death';this.objective.setText('RUDOLF POKONANY');
  this.cameras.main.stopFollow();
  this.cameras.main.setBounds(0,0,CATACOMBS.width,CATACOMBS.height)
   .setZoom(1).centerOn(CATACOMBS.width/2,350);
  this.bossHp.clear();this.bossHpLabel.setVisible(false);this.bossActor.setAlpha(1);
  retroAudio.death();
  const x=this.bossActor.x,y=this.bossActor.y;
  for(const [i,offset] of [[0,0,-30],[1,-38,-78],[2,35,-108],[3,-18,-148],[4,20,-55]]){
   this.time.delayedCall(i*110,()=>{
    if(this.disposed||this.phase!=='boss-death')return;
    this.deathBursts.push(createPixelBurst(this,'marcin',x+offset,y+(-30-i*17),i*37));
   });
  }
  const arrive=()=>{
   if(this.disposed||this.phase!=='boss-death'||this.fairyQueued)return;
   this.fairyQueued=true;this.bossActor.setVisible(false);
   this.time.delayedCall(FAIRY_ARRIVAL.pauseMs,()=>{
    if(!this.disposed&&this.phase==='boss-death')this.materializeFairy();
   });
  };
  this.tweens.add({targets:this.bossActor,alpha:0,duration:FAIRY_ARRIVAL.bossExplosionMs,onComplete:arrive});
  // Tween callbacks can be lost on pause/resize; never strand the finale.
  this.time.delayedCall(FAIRY_ARRIVAL.bossExplosionMs+350,arrive);
  // Independent of Phaser's scene clock; postpone until gameplay is visible.
  this.scheduleFinalRecovery(FAIRY_ARRIVAL.bossExplosionMs+FAIRY_ARRIVAL.pauseMs+450,()=>{
   if(this.phase!=='boss-death')return;
   this.bossActor.setVisible(false);
   this.materializeFairy();
  });
  this.syncControls();return true;
 }
 scheduleFinalRecovery(delay,action){
  let closed=false,elapsed=false,timer=null;
  const dispose=()=>{
   if(closed)return;
   closed=true;
   if(timer!==null)window.clearTimeout(timer);
   window.removeEventListener('focus',flush);
   window.removeEventListener('resize',flush);
   window.removeEventListener('orientationchange',flush);
   document.removeEventListener('visibilitychange',flush);
   this.events.off(Phaser.Scenes.Events.RESUME,flush);
   this.finalRecoveryCleanups.delete(dispose);
  };
  const flush=()=>{
   if(closed||!elapsed||this.disposed||!this.sys.isActive()||
    this.scene.isPaused()||document.hidden||!document.hasFocus()||
    window.innerHeight>window.innerWidth)return;
   dispose();action();
  };
  window.addEventListener('focus',flush);
  window.addEventListener('resize',flush);
  window.addEventListener('orientationchange',flush);
  document.addEventListener('visibilitychange',flush);
  this.events.on(Phaser.Scenes.Events.RESUME,flush);
  timer=window.setTimeout(()=>{elapsed=true;flush();},delay);
  this.finalRecoveryCleanups.add(dispose);
  return dispose;
 }
 fairyVisibleBounds(){
  const camera=this.cameras.main,zoom=camera.zoom||1;
  // Reserve the actual dialogue region, not merely the canvas's bottom edge.
  const reserved=Math.min(165,Math.max(112,this.scale.height*.42));
  return {left:camera.scrollX,right:camera.scrollX+this.scale.width/zoom,
   top:camera.scrollY,bottom:camera.scrollY+(this.scale.height-reserved)/zoom};
 }
 materializeFairy(){
  if(this.disposed||this.phase!=='boss-death'||this.fairyActor)return false;
  const point=catacombsFairyArrival(this.bossActor,this.player,CATACOMBS.fairyStart,this.fairyVisibleBounds());
  this.bossActor.setVisible(false);
  if(!point){
   // No unhandled error or inert boss-death state even if arena geometry changes.
   this.phase='fairy';this.objective.setText('ŚWINIA-WRÓŻKA');
   this.fairyDialogueQueued=true;this.showDialogue('act5-fairy');
   return true;
  }
  const key='act5-fairy';
  if(this.textures.exists(key)){
   this.fairyActor=this.add.image(point.x,point.y,key).setDepth(13);
  }else{
   this.fairyActor=this.add.container(point.x,point.y).setDepth(13);
   this.fairyActor.add(this.add.ellipse(0,0,76,64,0xd8a8ac).setStrokeStyle(3,0x59373c));
   this.fairyActor.add(this.add.circle(-14,-7,5,0x202024));
   this.fairyActor.add(this.add.circle(14,-7,5,0x202024));
  }
  this.phase='fairy';this.objective.setText('ŚWINIA-WRÓŻKA');
  // PNG is 256px natively; container fallback already has a 76px silhouette.
  const finalScale=this.textures.exists(key)?78/256:1;
  this.fairyActor.setAlpha(0).setScale(finalScale*.85);
  for(let i=0;i<10;i++){
   const a=i*Math.PI/5,spark=this.add.circle(point.x,point.y,2+(i%3),0xdcc5ff,.9).setDepth(100);
   this.tweens.add({targets:spark,x:point.x+Math.cos(a)*50,y:point.y-25+Math.sin(a)*52,
    alpha:0,duration:FAIRY_ARRIVAL.fadeMs,onComplete:()=>spark.destroy()});
  }
  const startFairyDialogue=()=>{
   if(this.disposed||this.phase!=='fairy'||this.fairyDialogueQueued)return;
   this.fairyDialogueQueued=true;this.fairyActor?.setAlpha(1).setScale(finalScale);
   this.showDialogue('act5-fairy');
  };
  this.tweens.add({targets:this.fairyActor,alpha:1,scale:finalScale,duration:FAIRY_ARRIVAL.fadeMs,
   ease:'Sine.Out',onComplete:startFairyDialogue});
  this.time.delayedCall(FAIRY_ARRIVAL.fadeMs+350,startFairyDialogue);
  this.scheduleFinalRecovery(FAIRY_ARRIVAL.fadeMs+650,startFairyDialogue);
  return true;
 }
 showFairyEnding(){
  if(this.phase!=='fairy'||this.completed)return false;
  this.phase='magic';this.bossHp.clear();this.bossHpLabel.setVisible(false);
  this.resetMovement();this.stopFlame(true);this.syncControls();
  // Even a suspended Phaser tween/clock cannot permanently strand MYK.
  this.scheduleFinalRecovery(1550,()=>{
   if(this.phase!=='magic'||this.endingFadeQueued)return;
   this.endingFadeQueued=true;this.transitionVeil.setFillStyle(0x08050d,1).setAlpha(1);
   this.completeEnding();
  });
  // Approved MYK moment: short Phaser-only sparkle, then an opaque fade.
  const x=this.fairyActor?.x??CATACOMBS.fairyStart.x;
  const y=this.fairyActor?.y??CATACOMBS.fairyStart.y;
  for(let i=0;i<12;i++){
   const angle=i*Math.PI/6;
   const spark=this.add.circle(x,y,3+(i%3),i%2?0xf7e6ac:0xba95ff,.95).setDepth(100);
   this.tweens.add({targets:spark,x:x+Math.cos(angle)*92,y:y+Math.sin(angle)*79,
    alpha:0,scale:.3,duration:440,ease:'Sine.Out',onComplete:()=>spark.destroy()});
  }
  this.time.delayedCall(440,()=>{
   if(this.disposed||this.phase!=='magic')return;
   const finish=()=>{
    if(this.disposed||this.phase!=='magic'||this.endingFadeQueued)return;
    this.endingFadeQueued=true;this.completeEnding();
   };
   this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,finish);
   this.cameras.main.fadeOut(450,0,0,0);
   this.time.delayedCall(850,finish);
  });
  return true;
 }
 completeEnding(){
  if(this.phase!=='magic'||this.completed)return false;
  this.phase='ending';this.resetMovement();this.stopFlame(true);
  const result=completeCampaignAct(this.run,'act5',{
   hp:this.run.hp,maxHp:this.run.maxHp,
   unlockedWeapons:this.run.unlockedWeapons,selectedWeapon:this.weapon,
   kills:this.killCount,activeCombatMs:this.combatMs
  });
  if(!result&&!this.run.completedActs.has('act5')){
   this.phase='magic';this.endingFadeQueued=false;return false;
  }
  this.completed=true;
  if(result)recordActCompletion(this.run,'act5');
  if(!this.run.isDebugRun&&!this.run.isReplayRun)clearCampaignCheckpoint();
  this.dialoguePanel.hide();
  // The camera is already black after MYK. Credits owns the final
  // presentation and its music, avoiding a short KONIEC screen/menu flash.
  this.scene.start('Credits');
  return true;
 }
 controlsAllowed(){return !this.disposed&&this.entryGateReady&&!document.hidden&&
  document.hasFocus()&&window.innerWidth>=window.innerHeight&&!this.scene.isPaused();}
 canPlay(){return this.controlsAllowed()&&this.phase==='boss'&&this.run.hp>0&&
  !this.dialogueState.id&&!this.defeated;}
 syncControls(){
  if(!this.joystick)return;
  const allow=this.canPlay();
  if(this.joystick.enabled!==allow)this.joystick.setEnabled(allow);
  if(this.aimJoystick.enabled!==allow)this.aimJoystick.setEnabled(allow);
 }
 resetMovement(){
  this.joystick?.setEnabled(false);this.aimJoystick?.setEnabled(false);
  this.input.keyboard?.resetKeys();
  resetFiring(this.firing,this.weapon);
 }
 openMenu(){
  if(!this.controlsAllowed()||this.scene.isActive('Menu'))return false;
  this.resetMovement();this.stopFlame();this.scene.pause();
  this.scene.launch('Menu');this.scene.bringToTop('Menu');return true;
 }
 hurtPlayer(now){
  if(now<this.hitUntil||this.run.hp<=0||!this.canPlay())return false;
  this.hitUntil=now+1200;this.run.hp=Math.max(0,this.run.hp-1);retroAudio.hurt();if(this.run.hp===0)retroAudio.death();
  this.hpFace.setHp(this.run.hp);
  this.hpText.setText('HP '+this.run.hp+'/'+this.run.maxHp);
  this.playerVisual.hit(this.bossActor);
  if(this.run.hp<=0){
   this.defeated=true;this.phase='defeat';this.clearShots();this.clearSummons();this.stopFlame(true);
   this.openMenuAfterDefeat();
  }
  return true;
 }
 openMenuAfterDefeat(){
  this.resetMovement();this.scene.pause();this.scene.launch('Menu');this.scene.bringToTop('Menu');
 }
 spawnShot(array,x,y,angle,speed,owner){
  if(array.length>=FINAL_BOSS.maxProjectiles)return;
  const vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
  const sprite=this.add.circle(x,y,owner==='marian'?5:3,owner==='marian'?0xedc18c:0x9ed9e7)
   .setDepth(18);
  array.push({x,y,vx,vy,sprite,owner,life:owner==='marian'?2400:1250});
 }
 stopFlame(cleanup=false){
  retroAudio.stopStream();
  this.fire.stop();this.flameStream.clear();
  if(!this.aimJoystick?.held)this.fire.step(false,0);
  if(cleanup){
   for(const particle of this.fire.particles)particle.object?.destroy();
   this.fire.particles.length=0;this.fire.emissionAt=null;
  }
 }
 firePlayer(delta){
  const aim=resolveAim(this.aimJoystick.direction.x,this.aimJoystick.direction.y);
  const held=Boolean(this.aimJoystick.held&&(aim.x||aim.y));
  const now=this.time.now;
  if(this.weapon==='flamethrower'){
   const active=this.fire.step(held,delta);
   retroAudio.stream('flamethrower',active);
   this.flameStream.clear();
   if(active){
    const origin=muzzlePoint(this.player.x,this.player.y,aim);
    const tune=COMBAT_TUNING.flamethrower;
    drawContinuousStream(this.flameStream,origin,aim,now,'flamethrower',this.flameBlocked);
    emitContinuousParticle(this,this.fire,origin,aim,now,'flamethrower',this.flameBlocked);
    if(!this.boss.defeated&&rudolfFlameVisible(origin,aim,this.bossActor,CATACOMBS_OBSTACLES,tune)&&
       cooldownReady(this.fire.cooldowns,this.bossActor,now,tune.damageInterval)){
     this.damageBoss(tune.damage);
    }
    for(const enemy of [...this.summons]){
     if(enemy.dead||!inFlameCone(origin,aim,enemy,tune.range,tune.halfAngle,enemy.radius)||
       this.flameBlocked(origin,enemy)||!cooldownReady(this.fire.cooldowns,enemy,now,tune.damageInterval))continue;
     this.damageEnemy(enemy,tune.damage);
    }
   }
   updateContinuousParticles(this.fire,delta,this.flameBlocked);
   return;
  }
  retroAudio.stopStream();this.flameStream.clear();
  // Keep a locked flame trigger locked until the physical right stick is released.
  if(!this.aimJoystick.held)this.fire.step(false,delta);
  updateContinuousParticles(this.fire,delta,this.flameBlocked);
  for(let n=firingStep(this.firing,this.weapon,held,now);n>0;n--){
   retroAudio.shot(this.weapon);
   this.spawnShot(this.shots,this.player.x,this.player.y,
    Math.atan2(aim.y,aim.x),COMBAT_TUNING[this.weapon]?.speed??550,'player');
   this.playerVisual.recoil();
  }
 }
  updateProjectiles(array,delta){
  const dt=Math.min(50,delta)/1000;
  for(let i=array.length-1;i>=0;i--){
   const p=array[i],next={x:p.x+p.vx*dt,y:p.y+p.vy*dt};
   p.life-=delta;
   let remove=p.life<=0||!catacombsWalkable(next,3)||
    Boolean(segmentObstacleHit(p,next,CATACOMBS_OBSTACLES,3));
   if(!remove&&p.owner==='marian'){
    if(Math.hypot(next.x-this.player.x,next.y-this.player.y)<PLAYER_RADIUS+5){
     this.hurtPlayer(this.time.now);remove=true;
    }
   }else if(!remove){
    if(!this.boss.defeated&&segmentRudolfHit(p,next,this.bossActor,3)){
     this.damageBoss(1);remove=true;
    }else for(const e of [...this.summons])if(!e.dead&&
     Math.hypot(next.x-e.x,next.y-e.y)<e.radius+3){
      this.damageEnemy(e,1);remove=true;break;
     }
   }
   if(remove){p.sprite.destroy();array.splice(i,1);}
   else {p.x=next.x;p.y=next.y;p.sprite.setPosition(next.x,next.y);}
  }
 }
 update(_time,delta){
  if(this.disposed||!this.entryGateReady)return;
  updateBursts(this.deathBursts,delta);
  this.syncControls();
  if(this.phase!=='boss'){this.bossHp.clear();this.bossHpLabel.setVisible(false);}
  this.bossBarks?.tick(delta);
  if(!this.canPlay()){resetFiring(this.firing,this.weapon);
   this.flameStream.clear();retroAudio.stopStream();
   if(!this.aimJoystick.held)this.fire.step(false,0);
   updateContinuousParticles(this.fire,Math.min(50,delta),this.flameBlocked);return;}
  delta=Math.min(50,Math.max(0,delta));
  this.combatMs+=delta;
  const k=this.keys;
  const input=normalizeInput(this.joystick.direction.x+
    Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),
   this.joystick.direction.y+Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown));
  const moved=catacombsStep(this.player,input,delta);
  this.player.setPosition(moved.x,moved.y);this.player.body.reset(moved.x,moved.y);
  const pose=resolvePose({movement:input,aim:this.aimJoystick.direction,
   aimActive:this.aimJoystick.held,lastFacing:this.facing});
  this.facing=pose.facing;
  if(pose.shooting)this.lastShotAim=pose.aim;
  else this.lastShotAim={x:0,y:0};
  this.playerVisual.update(this.facing,Math.hypot(input.x,input.y)>.05,delta);
  this.hpFace.update(delta);
  this.firePlayer(delta);
  if(this.boss.phase==='gun'){
   const from=this.bossActor;
   const dir=normalizeInput(this.player.x-from.x,this.player.y-from.y);
   const d=Math.hypot(this.player.x-from.x,this.player.y-from.y);
   if(d>190){
    const target=catacombsResolve(from,{x:from.x+dir.x*FINAL_BOSS.speed*delta/1000,
     y:from.y+dir.y*FINAL_BOSS.speed*delta/1000},FINAL_BOSS.contactRadius);
    from.setPosition(target.x,target.y);
    this.bossFacing=facingOf(dir.x,dir.y,this.bossFacing);
    this.bossArt.setFrame(playerFrame(this.bossFacing));
   }
   if(d<FINAL_BOSS.contactRadius+PLAYER_RADIUS)this.hurtPlayer(this.time.now);
  }
  const tick=finalBossStep(this.boss,delta);
  if(tick.summonTimeout){this.clearSummons();this.bossArt.clearTint();this.objective.setText('POKONAJ KŁUSOCZŁEKA!');}
  for(const offset of tick.shots){
   const a=Math.atan2(this.player.y-this.bossActor.y,this.player.x-this.bossActor.x)+offset;
   this.bossFacing=facingOf(Math.cos(a),Math.sin(a),this.bossFacing);
   this.bossArt.setFrame(playerFrame(this.bossFacing));
   this.spawnShot(this.bossShots,this.bossActor.x,this.bossActor.y-24,a,FINAL_BOSS.projectileSpeed,'marian');
  }
  if(this.boss.phase==='gun'&&this.boss.telegraph>0)
   this.bossActor.setAlpha(.65+.35*Math.sin(this.time.now/65));
  else this.bossActor.setAlpha(1);
  for(const enemy of [...this.summons]){
   if(enemy.dead)continue;
   const old={x:enemy.x,y:enemy.y},dir=normalizeInput(this.player.x-enemy.x,this.player.y-enemy.y);
   const point=catacombsResolve(enemy,{x:enemy.x+dir.x*56*delta/1000,
    y:enemy.y+dir.y*56*delta/1000},enemy.radius);
   enemy.x=point.x;enemy.y=point.y;
   this.enemyRenderers[enemy.type].update(enemy,this.player,Math.hypot(point.x-old.x,point.y-old.y),delta/1000);
   if(this.time.now>=enemy.activationAt&&
     Math.hypot(enemy.x-this.player.x,enemy.y-this.player.y)<enemy.radius+PLAYER_RADIUS+2)this.hurtPlayer(this.time.now);
  }
  this.updateProjectiles(this.shots,delta);
  this.updateProjectiles(this.bossShots,delta);
  this.bossHp.clear();
  if(this.phase==='boss'&&(this.boss.phase==='gun'||this.boss.phase==='summon')){
   // Exact established Marcin/Bogdan meter geometry. Purple summon
   // feedback stays on Rudolf and does not alter his damage immunity.
   const width=Math.min(210,this.scale.width*.38);
   const x=(this.scale.width-width)/2,y=Math.min(80,this.scale.height*.23);
   const hpRatio=Math.max(0,Math.min(1,this.boss.hp/this.boss.maxHp));
   this.bossHp.fillStyle(0x241d20,.9).fillRect(x,y,width,7);
   this.bossHp.fillStyle(this.boss.phase==='summon'?0x9278db:0xd64b44)
    .fillRect(x,y,width*hpRatio,7);
   this.bossHpLabel.setPosition(this.scale.width/2,y-10).setVisible(true);
  }else this.bossHpLabel.setVisible(false);
 }
}
