import Phaser from 'phaser';
import {retroAudio} from './retro-audio.js';
import {createPlayer} from './player.js';
import {createPlayerVisual} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {arenaHudLayout} from './ui-layout.js';
import {normalizeInput,PLAYER_RADIUS} from './movement.js';
import {playerFrame,facingOf} from './combat-contract.js';
import {currentCampaignRun,prepareActStart,completeCampaignAct,updateRunHealth} from './campaign-run.js';
import {clearCampaignCheckpoint} from './campaign-save.js';
import {availableWeapons,selectUnlockedWeapon,cycleUnlockedWeapon,WEAPONS} from './weapon-progression.js';
import {COMBAT_TUNING,createFiringState,firingStep,resetFiring,inFlameCone} from './weapon-combat.js';
import {createDialogueState,beginDialogue} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {beginSceneReveal} from './scene-reveal-gate.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {CATACOMBS,CATACOMBS_OBSTACLES,CATACOMBS_SUMMON_SITES,
 catacombsWalkable,catacombsStep,catacombsResolve,MARIAN_FINAL_ASSETS} from './catacombs-contract.js';
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
  this.killCount=0;this.combatMs=0;this.facing='n';this.hitUntil=0;
  this.boss=createFinalBossState();
  this.run=currentCampaignRun(this.game);
  const registered=new Set(Object.keys(this.scene.manager.keys));
  if(this.run.actId!=='act5'&&!prepareActStart(this.run,this.handoff,registered)){
   this.scene.start('Menu');return;
  }
  updateRunHealth(this.run,this.run.maxHp);
  this.physics.world.setBounds(0,0,CATACOMBS.width,CATACOMBS.height);
  this.cameras.main.setBounds(0,0,CATACOMBS.width,CATACOMBS.height);
  // The existing joystick/HUD dialogue controls use unzoomed screen pixels.
  // Preserve zoom=1 as in Acts I–IV; crop the compact chamber naturally.
  this.resizeCamera=()=>{
   this.cameras.main.setZoom(1);
   if(this.phase==='opening'||this.phase==='transform'||this.phase==='fairy'||this.phase==='home')
    this.cameras.main.centerOn(CATACOMBS.width/2,350);
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
  void this.playerVisual.setVariant(this.weapon);
  this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
  this.joystick=createJoystick(this,'left');
  this.aimJoystick=createJoystick(this,'right');
  this.firing=createFiringState();
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
  this.bossHp=this.add.graphics().setDepth(75);
  this.bossTintClock=0;
  this.fairyActor=null;
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
  const reset=()=>{retroAudio.stopStream();this.resetMovement();resetFiring(this.firing,this.weapon);};
  const sync=()=>this.syncControls();
  this.scale.on(Phaser.Scale.Events.RESIZE,resize);
  this.events.on(Phaser.Scenes.Events.PAUSE,reset);
  this.events.on(Phaser.Scenes.Events.RESUME,sync);
  window.addEventListener('blur',reset);
  window.addEventListener('focus',sync);
  document.addEventListener('visibilitychange',sync);
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
   this.disposed=true;this.scale.off(Phaser.Scale.Events.RESIZE,resize);
   this.events.off(Phaser.Scenes.Events.PAUSE,reset);
   this.events.off(Phaser.Scenes.Events.RESUME,sync);
   window.removeEventListener('blur',reset);window.removeEventListener('focus',sync);
   document.removeEventListener('visibilitychange',sync);
   this.input.off('pointerdown',pointer);this.input.keyboard.off('keydown',keyboard);
   this.playerVisual.destroy();this.hpFace.destroy();
   for(const renderer of Object.values(this.enemyRenderers))renderer.shutdown();
   this.clearShots();this.clearSummons();
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
  const g=this.add.graphics().setDepth(-10);
  g.fillStyle(0x14131a).fillRect(0,0,CATACOMBS.width,CATACOMBS.height);
  g.fillStyle(0x39343b).fillRect(38,38,CATACOMBS.width-76,CATACOMBS.height-76);
  for(let y=40;y<600;y+=54){
   for(let x=40;x<925;x+=96){
    g.fillStyle((x+y)%3?0x484048:0x403942,.62)
     .fillRect(x+(Math.floor(y/54)%2)*23,y,93,51);
   }
  }
  g.lineStyle(5,0x1b1821);
  for(let x=40;x<925;x+=96)g.lineBetween(x,39,x,600);
  for(let y=39;y<602;y+=54)g.lineBetween(39,y,922,y);
  g.fillStyle(0x201b25).fillRect(0,0,960,38).fillRect(0,602,960,38)
   .fillRect(0,0,38,640).fillRect(922,0,38,640);
  g.lineStyle(9,0x776c70).strokeRect(34,34,892,572);
  for(const o of CATACOMBS_OBSTACLES){
   const w=o.footprint.width,h=o.footprint.height;
   const altar=o.id==='altar';
   g.fillStyle(0x18171a,.6).fillRoundedRect(o.x-w/2+8,o.y-h/2+9,w,h,9);
   g.fillStyle(altar?0x847578:0x696570).fillRoundedRect(o.x-w/2,o.y-h/2,w,h,altar?5:9);
   g.lineStyle(4,0xc0afa8,.85).strokeRoundedRect(o.x-w/2,o.y-h/2,w,h,altar?5:9);
   if(altar){
    g.fillStyle(0x4b3541).fillRect(o.x-35,o.y-24,70,40);
    g.fillStyle(0xd6b879).fillCircle(o.x,o.y-2,9);
   }else{
    g.fillStyle(0x38343c).fillRect(o.x-13,o.y-13,26,26);
   }
  }
  this.add.text(480,71,'KATAKUMBY KAPLICY',{fontFamily:'monospace',fontSize:'19px',
   color:'#bfae9a'}).setOrigin(.5).setDepth(-2);
 }
 selectMarianAppearance(transformed){
  const key=transformed?MARIAN_FINAL_ASSETS.transformed.key:MARIAN_FINAL_ASSETS.normal.key;
  const effective=this.textures.exists(key)?key:this.textures.exists(MARIAN_FINAL_ASSETS.normal.key)?
   MARIAN_FINAL_ASSETS.normal.key:null;
  if(effective){
   this.bossArt.setTexture(effective,playerFrame('s')).setScale(effective===MARIAN_FINAL_ASSETS.transformed.key?.62:.72).setVisible(true);
   this.bossFallback.setVisible(false);this.bossFallbackHat.setVisible(false);
  }else{
   this.bossArt.setVisible(false);this.bossFallback.setVisible(true);this.bossFallbackHat.setVisible(true);
  }
  this.transformedVisual=transformed;
 }
 showDialogue(id){
  if(this.disposed||this.dialogueState.id||!beginDialogue(this.dialogueState,id))return false;
  this.resetMovement();this.dialoguePanel.show(this.dialogueState);return true;
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
  this.phase='transform';this.resetMovement();this.syncControls();
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
  });
  return true;
 }
 startBoss(){
  if(this.disposed||this.phase==='boss'||this.boss.defeated)return false;
  this.phase='boss';this.selectMarianAppearance(true);
  this.cameras.main.startFollow(this.player,true,.12,.12);
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
  enemy.dead=true;retroAudio.enemyDeath();enemy.sprite.destroy();this.killCount++;
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
  this.clearShots();this.clearSummons();this.resetMovement();
  this.phase='fairy';this.objective.setText('ŚWINIA-WRÓŻKA');
  this.cameras.main.stopFollow();this.cameras.main.centerOn(CATACOMBS.width/2,350);
  this.bossActor.setVisible(false);this.bossHp.clear();
  const key='act5-fairy';
  if(this.textures.exists(key)){
   this.fairyActor=this.add.image(CATACOMBS.fairyStart.x,CATACOMBS.fairyStart.y,key)
    .setDisplaySize(78,78).setDepth(13);
  }else{
   this.fairyActor=this.add.container(CATACOMBS.fairyStart.x,CATACOMBS.fairyStart.y).setDepth(13);
   this.fairyActor.add(this.add.ellipse(0,0,76,64,0xd8a8ac).setStrokeStyle(3,0x59373c));
   this.fairyActor.add(this.add.circle(-14,-7,5,0x202024));
   this.fairyActor.add(this.add.circle(14,-7,5,0x202024));
  }
  this.time.delayedCall(debug?120:600,()=>{
   if(!this.disposed&&this.phase==='fairy')this.showDialogue('act5-fairy');
  });
  return true;
 }
 showFairyEnding(){
  if(this.phase!=='fairy'||this.completed)return false;
  this.phase='magic';this.resetMovement();this.syncControls();
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
   this.cameras.main.fadeOut(450,0,0,0);
   this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,()=>{
    if(this.disposed||this.phase!=='magic')return;
    this.completeEnding();
   });
  });
  return true;
 }
 completeEnding(){
  if(this.phase!=='magic'||this.completed)return false;
  this.completed=true;this.phase='ending';this.resetMovement();retroAudio.credits();
  const result=completeCampaignAct(this.run,'act5',{
   hp:this.run.hp,maxHp:this.run.maxHp,
   unlockedWeapons:this.run.unlockedWeapons,selectedWeapon:this.weapon,
   kills:this.killCount,activeCombatMs:this.combatMs
  });
  if(!result&&!this.run.completedActs.has('act5'))return false;
  if(!this.run.isDebugRun)clearCampaignCheckpoint();
  this.dialoguePanel.hide();
  this.transitionVeil.setFillStyle(0x080609,1).setAlpha(1).setDepth(180);
  this.finaleText?.destroy();
  // Camera is fully black after MYK fadeOut; reveal KONIEC over the opaque veil.
  this.cameras.main.fadeIn(320,0,0,0);
  this.finaleText=this.add.text(this.scale.width/2,this.scale.height/2,'KONIEC',{
   fontFamily:'monospace',fontSize:'46px',color:'#f3d69d'
  }).setOrigin(.5).setScrollFactor(0).setDepth(181);
  this.time.delayedCall(2200,()=>{
   if(this.disposed||this.phase!=='ending')return;
   this.scene.start('Menu');
  });
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
  this.resetMovement();this.scene.pause();
  this.scene.launch('Menu');this.scene.bringToTop('Menu');return true;
 }
 hurtPlayer(now){
  if(now<this.hitUntil||this.run.hp<=0||!this.canPlay())return false;
  this.hitUntil=now+1200;this.run.hp=Math.max(0,this.run.hp-1);retroAudio.hurt();if(this.run.hp===0)retroAudio.death();
  this.hpFace.setHp(this.run.hp);
  this.hpText.setText('HP '+this.run.hp+'/'+this.run.maxHp);
  this.playerVisual.hit(this.bossActor);
  if(this.run.hp<=0){
   this.defeated=true;this.phase='defeat';this.clearShots();this.clearSummons();
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
 firePlayer(){
  const d=normalizeInput(this.aimJoystick.direction.x,this.aimJoystick.direction.y);
  const aim=Math.hypot(d.x,d.y)>.1?d:{
   x:this.keys.D.isDown||this.keys.RIGHT.isDown?1:this.keys.A.isDown||this.keys.LEFT.isDown?-1:0,
   y:this.keys.S.isDown||this.keys.DOWN.isDown?1:this.keys.W.isDown||this.keys.UP.isDown?-1:0
  };
  const len=Math.hypot(aim.x,aim.y);
  const vector=len>.1?normalizeInput(aim.x,aim.y):{x:0,y:0};
  const held=this.aimJoystick.held||len>.1;
  if(this.weapon==='flamethrower'){
   retroAudio.stream('flamethrower',held);if(!held)return;const target=this.bossActor;
   const visible=!segmentObstacleHit(this.player,target,CATACOMBS_OBSTACLES,0);
   if(visible&&inFlameCone(this.player,vector,target,145,.45,FINAL_BOSS.contactRadius)
      &&this.time.now-(this.shotCooldowns.get(target)??-Infinity)>250){
    this.shotCooldowns.set(target,this.time.now);this.damageBoss(1);
   }
   for(const e of this.summons)if(!e.dead&&!segmentObstacleHit(this.player,e,CATACOMBS_OBSTACLES,0)&&
    inFlameCone(this.player,vector,e,145,.45,e.radius)&&
    this.time.now-(this.shotCooldowns.get(e)??-Infinity)>250){
    this.shotCooldowns.set(e,this.time.now);this.damageEnemy(e,1);
   }
   return;
  }
  retroAudio.stopStream();for(let n=firingStep(this.firing,this.weapon,held,this.time.now);n>0;n--){retroAudio.shot(this.weapon);
   this.spawnShot(this.shots,this.player.x,this.player.y,
    Math.atan2(vector.y,vector.x),COMBAT_TUNING[this.weapon]?.speed??550,'player');
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
    if(!this.boss.defeated&&Math.hypot(next.x-this.bossActor.x,next.y-this.bossActor.y)<FINAL_BOSS.contactRadius){
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
  this.syncControls();
  if(!this.canPlay()){resetFiring(this.firing,this.weapon);return;}
  delta=Math.min(50,Math.max(0,delta));
  this.combatMs+=delta;
  const k=this.keys;
  const input=normalizeInput(this.joystick.direction.x+
    Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),
   this.joystick.direction.y+Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown));
  const moved=catacombsStep(this.player,input,delta);
  this.player.setPosition(moved.x,moved.y);this.player.body.reset(moved.x,moved.y);
  if(Math.hypot(input.x,input.y)>.05)this.facing=facingOf(input.x,input.y,this.facing);
  this.playerVisual.update(this.facing,Math.hypot(input.x,input.y)>.05,delta);
  this.hpFace.update(delta);
  this.firePlayer();
  if(this.boss.phase==='gun'){
   const from=this.bossActor;
   const dir=normalizeInput(this.player.x-from.x,this.player.y-from.y);
   const d=Math.hypot(this.player.x-from.x,this.player.y-from.y);
   if(d>190){
    const target=catacombsResolve(from,{x:from.x+dir.x*FINAL_BOSS.speed*delta/1000,
     y:from.y+dir.y*FINAL_BOSS.speed*delta/1000},FINAL_BOSS.contactRadius);
    from.setPosition(target.x,target.y);
   }
   if(d<FINAL_BOSS.contactRadius+PLAYER_RADIUS)this.hurtPlayer(this.time.now);
  }
  const tick=finalBossStep(this.boss,delta);
  if(tick.summonTimeout){this.clearSummons();this.bossArt.clearTint();this.objective.setText('POKONAJ KŁUSOCZŁEKA!');}
  for(const offset of tick.shots){
   const a=Math.atan2(this.player.y-this.bossActor.y,this.player.x-this.bossActor.x)+offset;
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
  if(this.boss.phase!=='defeated'){
   this.bossHp.fillStyle(0x1b151c,.9).fillRect(300,36,360,15);
   this.bossHp.fillStyle(this.boss.phase==='summon'?0x9278db:0xd86556)
    .fillRect(304,40,352*this.boss.hp/this.boss.maxHp,7);
   this.bossHp.lineStyle(2,0xe1c59e).strokeRect(300,36,360,15);
  }
 }
}
