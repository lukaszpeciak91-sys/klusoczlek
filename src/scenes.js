import {createAmbientBarks} from './ambient-bark-view.js';
import Phaser from 'phaser';
import { ARENA, PLAYER_SPEED, normalizeInput } from './movement.js';
import { createPlayer } from './player.js';
import { createPlayerVisual } from './character-visual.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {recordAttack,recordHit} from './combat-feedback.js';
import {createPixelBurst,updateBursts,destroyBursts} from './pixel-death-vfx.js';
import {createDialogueState,beginDialogue,queueBocianolakHitDialogue,BOCIANOLAK_HIT_DIALOGUE} from './dialogue-data.js';
import {createDialoguePanel} from './dialogue-ui.js';
import {introductionVisible,introductionSpawnPoint,eligibleIntroductionEnemy} from './intro-visibility.js';
import { createBobrozombiRenderer,createBocianolakRenderer,createZubrokryptydaRenderer } from './enemy-visual.js';
import {ENEMY_TYPES,moveEnemy} from './enemy-types.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,clearIgnition,isBurning,fleeStep} from './enemy-panic.js';
import {createBurningFx} from './enemy-fire-vfx.js';
import {WAVES,TOTAL_WAVES,TOTAL_ENEMIES,HEALTH_AFTER_WAVES,createEpisode,nextType,waveCapacity,recordSpawn,recordDeath,advanceTimedWaves,terminateEpisode,healedHp,FINAL_ENCOUNTER,claimBossIntroduction,recordSpecialSpawn,REINFORCEMENTS,BOSS_NON_MARCIN_CAP,recordReinforcementSpawn,beginBossResolution,finishBossResolution} from './episode.js';
import { WEAPONS, initialPickupPoint, dropPoint, safeEnemySpawn, pickupCollected, fallbackRewardPoint } from './weapon-progression.js';
import { createArenaGround } from './arena-ground.js';
import { createJoystick } from './joystick.js';
import { resolvePose } from './combat-contract.js';
import { resolveAim, muzzlePoint } from './shooting.js';
import {COMBAT_TUNING,createFiringState,resetFiring,firingStep,flameTargetVisible,cooldownReady} from './weapon-combat.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';
import {createGameplayClock,advanceGameplayClock,formatGameplayClock} from './gameplay-clock.js';
import { ENCOUNTER, applyEnemyHit, applyPlayerContact } from './bobrozombi.js';
import { menuLayout, arenaHudLayout } from './ui-layout.js';
import { enforceOrientationOnSceneStart } from './viewport.js';
import {OBSTACLE_RULES,resolveObstaclePosition,steerObstacleStep,segmentObstacleHit,damageObstacle,inExplosion} from './obstacles.js';
import {generateArenaLayout,seededRandom} from './arena-layout.js';
import {createObstacleVisual} from './obstacle-renderer.js';
import {firstFootprintHit,reachableCells} from './obstacle-geometry.js';
import {MARCIN,createBossAttack,bossAttackStep,radialVolley,bossProjectileStep,landingPoint} from './marcin.js';
import {MARCIN_VISUAL_BOUNDS} from './marcin-visual.js';
import {createMarcinRenderer} from './marcin-renderer.js';
import {enemyProjectileHit,enemyFlameVisible} from './enemy-damage.js';

const COLORS = {
  background: 0x0e101a,
  panel: 0x1b2330,
  border: 0xd4aa5a,
  accent: '#f3ca76',
  white: '#f3e8d1',
};

function label(scene, x, y, value, size = 28) {
  return scene.add.text(x, y, value, {
    fontFamily: 'monospace',
    fontSize: size + 'px',
    color: COLORS.white,
    align: 'center',
  }).setOrigin(0.5);
}

function button(scene, x, y, width, height, value, onClick) {
  const background = scene.add.rectangle(x, y, width, height, COLORS.panel)
    .setStrokeStyle(3, COLORS.border).setInteractive({ useHandCursor: true });
  const caption = label(scene, x, y, value);
  background.on('pointerover', () => background.setFillStyle(0x344255));
  background.on('pointerout', () => background.setFillStyle(COLORS.panel));
  background.on('pointerdown', onClick);
  return { background, caption };
}

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this.navigating = false;
    this.cameras.main.setBackgroundColor(COLORS.background);
    const initial = menuLayout(this.scale.width, this.scale.height);
    const title = label(this, initial.centerX, initial.titleY, 'KŁUSOCZŁEK', initial.titleSize).setColor(COLORS.accent);
    const hasSession = this.scene.isPaused('Arena');
    const terminal = hasSession && this.scene.get('Arena').episode?.ended;
    const defeated = terminal && this.scene.get('Arena').episode.state==='defeat';
    const victorious=terminal&&!defeated;
    const subtitle = label(this, initial.centerX, initial.subtitleY, defeated?'KONIEC GRY':victorious?'ZWYCIĘSTWO!':'RETRO SURVIVAL // PROTOTYP', initial.subtitleSize);
    const startY = hasSession ? initial.startY - Math.min(44, this.scale.height * 0.12) : initial.startY;
    const resumeY = initial.startY + Math.min(44, this.scale.height * 0.12);
    const allowed = () => !this.navigating && !document.hidden && window.innerWidth >= window.innerHeight;
    const newGame = button(this, initial.centerX, startY, initial.startWidth, initial.startHeight, 'NOWA GRA', () => {
      if (!allowed()) return;
      this.navigating = true;
      if (hasSession) this.scene.stop('Arena');
      this.scene.start('Arena');
    });
    const resume = hasSession && !terminal ? button(this, initial.centerX, resumeY, initial.startWidth, initial.startHeight, 'WZNÓW', () => {
      if (!allowed()) return;
      this.navigating = true;
      const arena = this.scene.get('Arena');
      arena.resetMovement();
      this.scene.resume('Arena');
      this.scene.stop();
    }) : null;
    const resize = () => {
      const layout = menuLayout(this.scale.width, this.scale.height);
      const offset = Math.min(44, this.scale.height * 0.12);
      title.setPosition(layout.centerX, layout.titleY).setFontSize(layout.titleSize);
      subtitle.setPosition(layout.centerX, layout.subtitleY).setFontSize(layout.subtitleSize);
      for (const [control, y] of [[newGame, hasSession ? layout.startY - offset : layout.startY], [resume, layout.startY + offset]]) {
        if (!control) continue;
        control.background.setPosition(layout.centerX, y).setSize(layout.startWidth, layout.startHeight);
        control.caption.setPosition(layout.centerX, y);
      }
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, resize));
    const fullscreenButton = document.getElementById('fullscreen-button');
    fullscreenButton.hidden = false;
    this.events.once('shutdown', () => { fullscreenButton.hidden = true; });
    if(defeated){
      const arena=this.scene.get('Arena');
      const at=arena.defeatVisualAt||{x:this.scale.width/2,y:this.scale.height/2};
      this.terminalBurst=createPixelBurst(this,'aloes',at.x,at.y,7);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.terminalBurst?.destroy());
    }
    enforceOrientationOnSceneStart(this);
  }
  update(){
    if(this.terminalBurst&&!this.terminalBurst.done)this.terminalBurst.update(this.game.loop.delta);
  }
}

export class ArenaScene extends Phaser.Scene {
  constructor() { super('Arena'); }

  create(data={}) {
    document.getElementById('fullscreen-button').hidden = true;
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    createArenaGround(this,ARENA.width,ARENA.height,Phaser,COLORS);
    this.player = createPlayer(this, ARENA.width / 2, ARENA.height / 2);
    const requested=data.seed??new URLSearchParams(window.location.search).get('arenaSeed');
    const parsed=Number(requested);
    const seed=requested!==null&&requested!==undefined&&Number.isInteger(parsed)&&parsed>=0&&parsed<=0xffffffff?parsed:crypto.getRandomValues(new Uint32Array(1))[0];
    const layoutStarted=performance.now();
    const layout=generateArenaLayout(seed);
    this.layoutGenerationMs=performance.now()-layoutStarted;
    this.arenaSeed=seed;
    this.layoutDiagnostics=layout.diagnostics;
    this.bossNavigation=reachableCells({...ARENA,cellSize:20,actorRadius:MARCIN.radius,origin:this.player,obstacles:layout.obstacles});
    this.navigation=layout.navigation; // conservative immutable snapshot; never rebuilt per frame
    this.obstacles=layout.obstacles.map(o=>({...o,sprite:createObstacleVisual(this,o),hitUntil:0}));
    // Arcade integrates the original player circle; this sole adapter resolves
    // its actual world-space displacement against the same footprints as combat.
    this.onObstacleWorldStep=()=>{
      const body=this.player.body;
      const start={x:body.prev.x+body.halfWidth,y:body.prev.y+body.halfHeight};
      const end={x:body.position.x+body.halfWidth,y:body.position.y+body.halfHeight};
      const resolved=resolveObstaclePosition(start,end,body.radius,this.obstacles);
      body.position.x=resolved.x-body.halfWidth;body.position.y=resolved.y-body.halfHeight;
      body.updateCenter();
    };
    const obstacleWorld=this.physics.world;
    obstacleWorld.on('worldstep',this.onObstacleWorldStep);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>obstacleWorld.off('worldstep',this.onObstacleWorldStep));
    this.explosionEffects=[];
    this.deathBursts=[];
    // VFX runs on the game clock, independent of frozen/paused combat Scene updates.
    this.onDeathVfxStep=()=>updateBursts(this.deathBursts,this.game.loop.delta);
    this.game.events.on('step',this.onDeathVfxStep);
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick = createJoystick(this,'left');
    this.aimJoystick = createJoystick(this,'right');
    this.lastFacing='s';
    this.lastShotAt=null;
    this.firingState=createFiringState();
    this.flamePressure=createPressure();
    this.flameParticles=[];
    this.flameStream=this.add.graphics().setDepth(12);
    this.flameCooldowns=new Map();
    this.flameEmissionAt=null;
    this.projectiles=[];
    this.playerHp=ENCOUNTER.playerMaxHp;
    this.invulnerableUntil=0;
    this.episode=createEpisode(seed);
    this.boss=null;this.bossEntrance=null;this.bossEntrancePending=false;this.bossLandingRetryAt=0;
    this.bossProjectiles=[];this.escortDue=[];this.reinforcementDue=[];this.bossSchedulerTurn=0;this.finalResolution=false;
    this.defeated=false;
    this.completed=false;
    this.weapon=null;
    this.kills=0;
    this.gameplayClock=createGameplayClock();
    this.elapsedGameplayMs=0;
    this.totalSpawned=0;
    this.spawnDueAt=null;
    this.pickups=[];
    this.triggeredMilestones=new Set();
    this.pendingRewards=new Map();
    this.enemyRenderers={bobrozombi:createBobrozombiRenderer(this,Phaser),bocianolak:createBocianolakRenderer(this,Phaser),zubrokryptyda:createZubrokryptydaRenderer(this,Phaser),marcin:createMarcinRenderer(this,Phaser)};
    this.enemyRenderer=this.enemyRenderers.bobrozombi;
    this.enemies=[0,1,2].flatMap(index=>{
      const point=safeEnemySpawn(this.player,this.obstacles,index,21,this.navigation);
      if(!point)return [];
      const {x,y}=point;
      const type=nextType(this.episode);recordSpawn(this.episode);
      return this.createEnemy(type,{x,y},index);
    });
    this.totalSpawned=this.enemies.length;
    this.narrativeEvents=new Set(['before-wave-1']);
    this.firstBocianolakHit=false;
    this.finalOutcomeHeld=false;
    this.dialogueState=createDialogueState();
    this.pendingIntroductions=new Map();
    this.introducedEnemyTypes=new Set();
    this.hudLayout=arenaHudLayout(this.scale.height,this.scale.width);
    this.hpText=this.add.text(0,0,'HP 5/5',{fontFamily:'monospace',fontSize:'14px',color:'#f3e8d1'})
      .setOrigin(0.5,0).setScrollFactor(0).setDepth(81);
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponTokenBody=this.add.circle(0,0,17,0x6b6153).setStrokeStyle(2,COLORS.border);
    this.weaponText=this.add.text(0,0,'—',{fontFamily:'monospace',fontSize:'21px',fontStyle:'bold',color:'#ffffff'})
      .setOrigin(0.5);
    this.weaponToken.add([this.weaponTokenBody,this.weaponText]);
    this.pressureBar=this.add.graphics().setScrollFactor(0).setDepth(67);
    this.skullIcon=this.add.text(0,0,'☠',{fontFamily:'sans-serif',fontSize:'23px',color:'#d7b978'})
      .setOrigin(0.5).setScrollFactor(0).setDepth(66);
    this.killsText=this.add.text(0,0,'0/'+TOTAL_ENEMIES,{fontFamily:'monospace',fontSize:'20px',color:'#f3e8d1'})
      .setOrigin(0,0.5).setScrollFactor(0).setDepth(66);
    this.hpFace=createHpFaceHud(this,Phaser);
    this.waveText=this.add.text(0,0,'⚑ 1/'+TOTAL_WAVES,{fontFamily:'monospace',fontSize:'15px',color:'#f3ca76'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(66);
    this.timerText=this.add.text(0,0,'◷ 00:00',{fontFamily:'monospace',fontSize:'13px',color:'#d7b978'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(66);
    this.completeText=this.add.text(this.scale.width/2,55,'ZWYCIĘSTWO!',{fontFamily:'monospace',fontSize:'19px',color:'#f3ca76'}).setOrigin(0.5,0).setScrollFactor(0).setDepth(65).setVisible(false);
    this.bossHpBar=this.add.graphics().setScrollFactor(0).setDepth(68);
    this.bossHpLabel=this.add.text(0,0,'MARCIN',{fontFamily:'monospace',fontSize:'12px',color:'#ffb4a1'}).setOrigin(0.5).setScrollFactor(0).setDepth(69).setVisible(false);
    this.facingMarker=this.add.graphics().setDepth(12);
    this.playerVisual=createPlayerVisual(this,this.player,this.facingMarker,Phaser);
    void this.playerVisual.setVariant('unarmed');
    this.addPickup('blunderbuss',initialPickupPoint(this.player,this.cameras.main,this.scale,this.obstacles,this.navigation));
    this.refreshWeaponHud();
    this.mouseHeld=false;
    this.mouseAim={x:0,y:0};
    const mouseDown=p=>{if(p.wasTouch===false&&p.leftButtonDown())this.mouseHeld=true;};
    const mouseUp=p=>{if(p.wasTouch===false)this.mouseHeld=false;};
    this.input.on('pointerdown',mouseDown);
    for(const event of ['pointerup','pointerupoutside','pointercancel'])this.input.on(event,mouseUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.input.off('pointerdown',mouseDown);
      for(const event of ['pointerup','pointerupoutside','pointercancel'])this.input.off(event,mouseUp);
    });
    const hud = this.hudLayout;
    const menuButton = this.add.rectangle(hud.menuX, hud.menuY, hud.menuWidth, hud.menuHeight, COLORS.panel)
      .setStrokeStyle(3, COLORS.border).setScrollFactor(0).setDepth(60)
      .setInteractive({ useHandCursor: true });
    const menuLabel = this.add.text(hud.menuX, hud.menuY, 'MENU', {
      fontFamily: 'monospace', fontSize: hud.menuFont+'px', color: COLORS.white,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    menuButton.on('pointerdown', () => this.openMenu());
    const resizeHud = () => {
      const pos = arenaHudLayout(this.scale.height, this.scale.width);
      this.hudLayout=pos;
      menuButton.setPosition(pos.menuX, pos.menuY).setSize(pos.menuWidth,pos.menuHeight);
      menuLabel.setFontSize(pos.menuFont);
      menuLabel.setPosition(pos.menuX, pos.menuY);
      this.joystick.reposition(pos.joystickX, pos.joystickY);
      this.aimJoystick.reposition(pos.aimX,pos.aimY);
      this.mouseHeld=false;
      this.stopWeaponFire();
      this.weaponToken.setPosition(pos.weaponX,pos.weaponY);
      this.renderPressureBar();
      this.weaponToken.setScale(pos.tokenSize/42);
      this.skullIcon.setPosition(pos.skullX,pos.skullY).setFontSize(pos.skullSize);
      this.killsText.setPosition(pos.killsX,pos.killsY).setFontSize(pos.countFont);
      this.hpText.setPosition(pos.hpX,pos.hpY).setFontSize(pos.hpFont);
      this.hpFace.resize(pos);
      this.completeText.setX(this.scale.width/2);
      this.waveText.setPosition(pos.waveX,pos.waveY).setFontSize(pos.waveFont);
      this.timerText.setPosition(pos.timerX,pos.timerY).setFontSize(pos.timerFont);
    };
    // Apply positions during initial Arena creation, even if Phaser emits no RESIZE.
    resizeHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, resizeHud);
    this.ambientBarks=createAmbientBarks(this,seededRandom((this.arenaSeed^0x46babc)>>>0));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, resizeHud));

    this.resetMovement = () => {
      this.player.body.setVelocity(0, 0);
      this.joystick.reset();
      this.aimJoystick.reset();
      this.mouseHeld=false;
      this.stopWeaponFire();
      this.input.keyboard.resetKeys();
    };
    this.syncJoysticks=()=>{
      const allowed=!this.finalResolution&&!this.bossEntrance&&!this.dialogueLoading&&!this.dialogueState?.id&&this.canResume()&&!this.scene.isPaused('Arena')&&!this.episode.ended;
      this.joystick.setEnabled(allowed);this.aimJoystick.setEnabled(allowed);
    };
    this.onBlur = () => { this.ambientBarks?.suspend();advanceGameplayClock(this.gameplayClock,0,false);this.resetMovement(); this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);this.physics.world.pause(); };
    this.canResume = () => !document.hidden && document.hasFocus() && window.innerWidth >= window.innerHeight;
    this.onFocus = () => {
      advanceGameplayClock(this.gameplayClock,0,false);
      this.syncJoysticks();
      if (this.canResume() && !this.finalResolution && !this.dialogueLoading && !this.dialogueState?.id && !this.bossEntrance && !this.scene.isPaused('Arena')) {
        this.physics.world.resume();
      }
    };
    // Resume is delivered by Phaser after the Arena scene state switches.
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      advanceGameplayClock(this.gameplayClock,0,false);
      document.getElementById('fullscreen-button').hidden = true;
      this.syncJoysticks();
      if (this.canResume() && !this.finalResolution && !this.dialogueLoading && !this.dialogueState?.id && !this.bossEntrance) this.physics.world.resume();
      else this.physics.world.pause();
    });
    this.onVisibility = () => {
      if (document.hidden) this.onBlur();
      else this.onFocus();
    };
    this.onResize = () => {
      if (window.innerHeight > window.innerWidth) this.onBlur();
      else this.onFocus();
    };
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for(const pickup of this.pickups)pickup.object.destroy();
      this.pickups.length=0;
      for(const renderer of Object.values(this.enemyRenderers))renderer.shutdown();
      for(const enemy of this.enemies){enemy.burningFx?.destroy();clearIgnition(enemy.ignition);if(enemy.sprite.active)enemy.sprite.destroy();}
      this.enemies.length=0;
      this.projectiles.length=0;
      this.clearBossProjectiles();this.bossEntrance?.marker.destroy();this.bossEntrance=null;this.bossEntrancePending=false;this.escortDue=[];this.boss=null;
      for(const p of this.flameParticles)p.object.destroy();
      this.flameParticles.length=0;
      this.flameStream.destroy();
      this.flameCooldowns.clear();
      this.obstacles.length=0;
      this.explosionEffects.length=0;
      this.game.events.off('step',this.onDeathVfxStep);
      destroyBursts(this.deathBursts);
      this.playerVisual.destroy();
      this.hpFace.destroy();
      // Phaser may have removed the player body before SHUTDOWN; do not access it here.
      // Phaser has already torn down Arcade Physics by SHUTDOWN; no physics calls here.
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVisibility);
    });
    this.dialoguePanel=createDialoguePanel(this,Phaser,id=>{
      advanceGameplayClock(this.gameplayClock,0,false);
      this.time.paused=false;
      if(this.canResume()&&!this.finalResolution)this.physics.world.resume();
      if(id==='after-final-enemy')this.releaseFinalOutcome();
      if(id==='before-marcin'){this.bossEntrancePending=true;this.tryBeginBossEntrance();}
      this.resetMovement();
      this.syncJoysticks();
    });
    // Opening boundary was already queued in create, before UI existed.
    // No combat update runs while assets load or an opening line is visible.
    this.dialogueLoading=true;
    this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
    this.cameras.main.fadeOut(1,0,0,0);
    this.time.paused=true;
    this.physics.world.pause();
    this.dialoguePanel.loading.finally(()=>{
      if(!this.sys.isActive())return;
      this.dialogueLoading=false;
      this.cameras.main.fadeIn(280,0,0,0);
      this.tryStartDialogue();
    });
    enforceOrientationOnSceneStart(this);
    this.onResize();
  }

  createEnemy(type,point,index){
    const def=ENEMY_TYPES[type];
    return {...point,type,seed:index,waveIndex:this.episode.wave,hp:def.hp,
      sprite:this.enemyRenderers[type].create(point.x,point.y),hitUntil:0,dead:false,facing:'s',ignition:createIgnitionState(),burningFx:null,fleeFacingVector:null};
  }

  refreshWeaponHud(){
    const selected=this.weapon?WEAPONS[this.weapon]:null;
    this.weaponText.setText(selected?.symbol||'—');
    this.weaponTokenBody.setFillStyle(selected?.color??0x6b6153);
    this.killsText.setText(this.kills+'/'+TOTAL_ENEMIES);
  }

  syncTimedWaves(){
    const crossed=advanceTimedWaves(this.episode,this.elapsedGameplayMs);
    for(const cleared of crossed){
      if(HEALTH_AFTER_WAVES.includes(cleared))this.dropHealthReward();
      this.rewardForClearedWave(cleared);
    }
    if(crossed.length){this.waveText.setText('⚑ '+(this.episode.wave+1)+'/'+TOTAL_WAVES);this.spawnDueAt=this.time.now+380;}
    // Owed introductions survive discarded wave queues; only a visible living specimen may consume them.
    if(this.episode.wave>=1&&!this.introducedEnemyTypes.has('before-first-bocianolak'))this.narrativeEvents.add('before-first-bocianolak');
    if(this.episode.wave>=2&&!this.introducedEnemyTypes.has('before-first-zubrokryptyda'))this.narrativeEvents.add('before-first-zubrokryptyda');
    if(claimBossIntroduction(this.episode,this.elapsedGameplayMs)){this.narrativeEvents.add('before-marcin');this.ambientBarks?.suspend();}
    return crossed;
  }

  nextOrdinaryType(){
    const ordinaryHeavy=this.enemies.some(e=>!e.dead&&e.hp>0&&e.type==='zubrokryptyda'&&!e.encounterId);
    const priorities=[['bocianolak',1],['zubrokryptyda',2]].filter(([type,wave])=>this.episode.wave>=wave&&!this.introducedEnemyTypes.has('before-first-'+type)&&!this.enemies.some(e=>!e.dead&&e.hp>0&&e.type===type)).map(([type])=>type);
    return nextType(this.episode,{blockedTypes:ordinaryHeavy?['zubrokryptyda']:[],priorityTypes:priorities});
  }

  setPlayerHp(next){
    const before=this.playerHp;
    this.playerHp=Math.max(0,Math.min(ENCOUNTER.playerMaxHp,Math.floor(next)));
    if(this.playerHp!==before)this.hpFace.setHp(this.playerHp);
    if(this.playerHp<before)this.playerVisual?.hit(this.lastDamageSource||{x:this.player.x,y:this.player.y-1});
    this.hpText.setText('HP '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
    if(this.playerHp===0&&!this.episode.ended&&!this.finalResolution)this.endEpisode('defeat');
  }

  tryStartDialogue(){
    if(this.dialogueLoading||this.dialogueState.id||this.episode.ended)return false;
    for(const id of ['before-wave-1','before-first-bocianolak','before-first-zubrokryptyda',BOCIANOLAK_HIT_DIALOGUE,'before-marcin','after-final-enemy']){
      if((id==='before-first-bocianolak'||id==='before-first-zubrokryptyda')&&!this.introductionReady(id))continue;
      if(!this.consumeNarrativeBoundary(id))continue;
      if(this.pendingIntroductions.has(id)){this.introducedEnemyTypes.add(id);this.pendingIntroductions.delete(id);}
      if(id===BOCIANOLAK_HIT_DIALOGUE)this.enemies=this.enemies.filter(enemy=>!enemy.dead);
      if(!beginDialogue(this.dialogueState,id))return false;
      this.ambientBarks?.suspend();
      if(id===BOCIANOLAK_HIT_DIALOGUE||id==='before-marcin')this.events.emit('episode-boundary',id,this);
      if(id==='after-final-enemy')this.holdFinalOutcome();
      advanceGameplayClock(this.gameplayClock,0,false);
      this.resetMovement();this.physics.world.pause();this.time.paused=true;
      this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
      this.renderBossHp();
      this.dialoguePanel.show(this.dialogueState);
      return true;
    }
    return false;
  }

  introductionReady(id){
    if(id==='before-first-zubrokryptyda'&&!this.introducedEnemyTypes.has('before-first-bocianolak'))return false;
    const type=id==='before-first-bocianolak'?'bocianolak':'zubrokryptyda';
    const enemy=eligibleIntroductionEnemy(type,this.enemies,this.cameras.main.worldView);
    if(enemy)this.pendingIntroductions.set(id,enemy);
    return !!enemy;
  }
  consumeNarrativeBoundary(id){
    if(!this.narrativeEvents.has(id))return false;
    this.narrativeEvents.delete(id);return true;
  }
  markNarrativeBoundary(id){
    if(this.narrativeEvents.has(id))return false;
    this.narrativeEvents.add(id);
    this.events.emit('episode-boundary',id,this);
    // A hit may also clear a wave/finale inside a damage batch. Defer any UI
    // until the queued hit has reached a safe update checkpoint.
    if(this.dialoguePanel&&!this.narrativeEvents.has(BOCIANOLAK_HIT_DIALOGUE)&&!this.narrativeEvents.has('before-marcin'))this.tryStartDialogue();
    return true;
  }
  holdFinalOutcome(){
    if(this.episode.state!=='final-pending'||this.episode.ended)return false;
    this.finalOutcomeHeld=true;return true;
  }
  releaseFinalOutcome(){this.finalOutcomeHeld=false;}

  tryBeginBossEntrance(){
    if(!this.bossEntrancePending||this.bossEntrance||this.episode.specialSpawned.has('marcin'))return false;
    // Retain all timed-wave survivors. A crowded arena drains naturally before landing.
    if(this.livingNonBoss()>BOSS_NON_MARCIN_CAP)return false;
    const point=landingPoint(this.player,this.cameras.main.worldView,this.obstacles,this.bossNavigation);
    if(!point||!this.bossNavigation.isReachable(point))return false;
    this.bossEntrancePending=false;
    const marker=this.add.graphics().setDepth(8);
    this.bossEntrance={point,marker,elapsed:0,impact:false,entity:null};
    this.resetMovement();this.syncJoysticks();this.physics.world.pause();
    return true;
  }

  updateBossEntrance(delta){
    const e=this.bossEntrance,view=this.cameras.main.worldView;
    // A smaller landscape viewport may exclude a preselected landing point.
    // Reposition only the unlanded visual, never a live combat entity or camera.
    if(!e.impact&&(e.point.x-MARCIN_VISUAL_BOUNDS.side<view.x||e.point.x+MARCIN_VISUAL_BOUNDS.side>view.right||e.point.y-MARCIN_VISUAL_BOUNDS.top<view.y||e.point.y+MARCIN_VISUAL_BOUNDS.bottom>view.bottom)){
      const point=landingPoint(this.player,view,this.obstacles,this.bossNavigation);
      if(!point)return;
      e.point=point;if(e.entity){e.entity.x=point.x;e.entity.y=point.y;}
    }
    e.elapsed+=delta;
    const g=e.marker,p=e.point;
    g.clear();
    if(e.elapsed<1150){
      g.fillStyle(0x17120f,0.45).fillEllipse(p.x,p.y,110,36);
      g.lineStyle(3,0xffcd79,0.8).strokeEllipse(p.x,p.y,120,43);
    }
    if(e.elapsed>=500&&!e.entity){
      // Not a target or counted entity until impact. Single visual allocation.
      e.entity=this.createEnemy('marcin',p,this.totalSpawned);
    }
    if(e.entity&&e.elapsed<1150){
      const t=Math.min(1,(e.elapsed-500)/650);
      e.entity.sprite.setPosition(p.x,p.y-(1-t*t)*(this.scale.height+180));
    }
    if(e.elapsed>=1150&&!e.impact){
      e.impact=true;recordSpecialSpawn(this.episode,'marcin');
      const boss=e.entity;boss.encounterId='marcin';boss.attack=createBossAttack();boss.sprite.setPosition(p.x,p.y);
      this.boss=boss;this.enemies.push(boss);this.totalSpawned++;
      this.cameras.main.shake(300,0.006);
    }
    if(e.impact){
      const t=Math.min(1,(e.elapsed-1150)/300);
      g.lineStyle(8*(1-t)+1,0xc9ac78,(1-t)*0.7).strokeEllipse(p.x,p.y,100+t*140,35+t*65);
    }
    if(e.elapsed>=1450){
      e.marker.destroy();this.bossEntrance=null;
      this.escortDue=FINAL_ENCOUNTER.filter(s=>s.id!=='marcin').map((spec,i)=>({spec,at:this.time.now+250+i*700}));
      const first=[...REINFORCEMENTS.filter(x=>x.type==='bobrozombi').slice(0,3),REINFORCEMENTS.find(x=>x.type==='bocianolak')];
      this.reinforcementDue=[...first,...REINFORCEMENTS.filter(x=>!first.includes(x))].map((spec,i)=>({spec,at:this.time.now+(i<4?250+i*350:1800+(i-4)*650)}));
      this.syncJoysticks();if(this.canResume())this.physics.world.resume();
    }
  }

  renderBossHp(){
    if(!this.bossHpBar)return;
    const b=this.boss,visible=!!b&&!b.dead&&!this.bossEntrance&&!this.dialogueState?.id&&!this.dialogueLoading&&!this.episode.ended;
    this.bossHpBar.clear();this.bossHpLabel.setVisible(visible);
    if(!visible)return;
    const width=Math.min(210,this.scale.width*0.38),x=(this.scale.width-width)/2,y=80;
    this.bossHpLabel.setPosition(this.scale.width/2,y-10);
    this.bossHpBar.fillStyle(0x241d20,0.9).fillRect(x,y,width,7);
    this.bossHpBar.fillStyle(0xd64b44).fillRect(x,y,width*b.hp/MARCIN.hp,7);
  }

  clearBossProjectiles(){
    for(const p of this.bossProjectiles)p.object.destroy();
    this.bossProjectiles.length=0;
  }

  livingNonBoss(){return this.enemies.filter(e=>!e.dead&&e.type!=='marcin').length;}
  spawnBossSlot(now){
    if(this.episode.state!=='active'||!this.boss||this.boss.dead||this.livingNonBoss()>=BOSS_NON_MARCIN_CAP)return false;
    const sources=['regular','escort','reinforcement'];
    for(let i=0;i<3;i++){
      const source=sources[(this.bossSchedulerTurn+i)%3];
      if(source==='regular'&&nextType(this.episode)){
        const prior=this.totalSpawned;
        this.spawnReplacement(true);
        if(this.totalSpawned>prior){this.bossSchedulerTurn=(this.bossSchedulerTurn+i+1)%3;return true;}
      }else if(source!=='regular'){
        const queue=source==='escort'?this.escortDue:this.reinforcementDue;
        const pending=queue.find(x=>now>=x.at);
        if(!pending)continue;
        const at=safeEnemySpawn(this.player,this.obstacles,this.totalSpawned,ENEMY_TYPES[pending.spec.type].radius,this.navigation);
        if(!at)continue;
        const ok=source==='escort'?recordSpecialSpawn(this.episode,pending.spec.id):recordReinforcementSpawn(this.episode,pending.spec.id);
        if(ok){
          const enemy=this.createEnemy(pending.spec.type,at,this.totalSpawned++);
          enemy.encounterId=pending.spec.id;this.enemies.push(enemy);
        }
        queue.splice(queue.indexOf(pending),1);
        this.bossSchedulerTurn=(this.bossSchedulerTurn+i+1)%3;
        return ok;
      }
    }
    return false;
  }
  updateBossCombat(delta,now){
    if(this.finalResolution||this.episode.state!=='active')return;
    if(this.boss&&!this.boss.dead&&!this.bossEntrance&&now>=(this.bossSpawnDueAt??0)){
      this.spawnBossSlot(now);this.bossSpawnDueAt=now+380;
    }
    if(this.boss&&!this.boss.dead&&bossAttackStep(this.boss.attack,this.boss.hp,delta)&&this.bossProjectiles.length+8<=MARCIN.maxProjectiles){
      for(const p of radialVolley(this.boss))this.bossProjectiles.push({...p,object:this.add.circle(p.x,p.y,MARCIN.projectileRadius,0xff9450).setStrokeStyle(2,0xffe5a0).setDepth(13)});
    }
    for(const p of this.bossProjectiles){
      const result=bossProjectileStep(p,delta,this.player,this.obstacles);
      p.object.setPosition(p.x,p.y);
      if(result==='player'){
        const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},now);
        this.lastDamageSource=p;this.setPlayerHp(hp.hp);this.invulnerableUntil=hp.invulnerableUntil;
      }
      if(result){p.done=true;p.object.destroy();}
      if(this.defeated)break;
    }
    this.bossProjectiles=this.bossProjectiles.filter(p=>!p.done);
  }

  addPickup(id,point){
    if(!point)return false;
    const def=id==='health'?{color:0xb93542,symbol:'♥'}:WEAPONS[id];
    const token=this.add.container(point.x,point.y).setDepth(7);
    token.add(this.add.ellipse(0,13,42,13,0x17120f,0.35));
    token.add(this.add.circle(0,0,18,def.color).setStrokeStyle(3,0x282027));
    token.add(this.add.text(0,-1,def.symbol,{fontFamily:'monospace',fontSize:'21px',color:'#ffffff',fontStyle:'bold'}).setOrigin(0.5));
    this.pickups.push({id,x:point.x,y:point.y,object:token});
    return true;
  }

  collectPickups(){
    for(const pickup of this.pickups){
      if(!pickupCollected(this.player,pickup))continue;
      if(pickup.id==='health'){
        if(this.playerHp<=0||this.playerHp>=ENCOUNTER.playerMaxHp)continue;
        this.setPlayerHp(healedHp(this.playerHp,ENCOUNTER.playerMaxHp));
        pickup.object.destroy();pickup.collected=true;continue;
      }
      this.weapon=pickup.id;
      this.renderPressureBar();
      this.stopWeaponFire();
      void this.playerVisual.setVariant(pickup.id);
      pickup.object.destroy();
      pickup.collected=true;
      this.refreshWeaponHud();
    }
    this.pickups=this.pickups.filter(p=>!p.collected);
  }

  renderPressureBar(){
    const g=this.pressureBar;if(!g)return;
    g.clear();
    if(this.weapon!=='flamethrower')return;
    const p=this.hudLayout,w=p.tokenSize,h=4,x=p.weaponX-w/2,y=p.weaponY+p.tokenSize/2+5;
    g.fillStyle(0x382721,0.95).fillRect(x,y,w,h);
    g.fillStyle(this.flamePressure.value<20?0x9b3932:0xee903a,1).fillRect(x,y,w*this.flamePressure.value/100,h);
  }
  stopWeaponFire(){
    resetFiring(this.firingState,this.weapon);
    this.lastShotAt=null;
    this.flameEmissionAt=null;
  }

  spawnShot(aim,weapon,now){
    const tune=COMBAT_TUNING[weapon];
    const origin=muzzlePoint(this.player.x,this.player.y,aim);
    const bullet=this.add.circle(origin.x,origin.y,tune.radius,tune.color).setDepth(8);
    this.projectiles.push({object:bullet,vx:aim.x*tune.speed,vy:aim.y*tune.speed,radius:tune.radius,damage:tune.damage});
    this.lastShotAt=now;
    if(weapon==='rifle')this.playerVisual.recoil();
  }

  drawFlameStream(origin,aim,now){
    const g=this.flameStream,tune=COMBAT_TUNING.flamethrower;
    g.clear();
    const normal={x:-aim.y,y:aim.x};
    // Fan layers share the authoritative cone and stop before blocking obstacles.
    for(const [color,factor,alpha] of [[0xe7441b,1,0.72],[0xff8c24,0.66,0.84],[0xffed96,0.28,0.95]]){
      g.fillStyle(color,alpha);
      let last=origin;
      for(let i=1;i<=11;i++){
        const distance=i*tune.range/11;
        const center={x:origin.x+aim.x*distance,y:origin.y+aim.y*distance};
        if(segmentObstacleHit(last,center,this.obstacles,0))break;
        const wave=Math.sin(now*0.022+i*1.7)*2.4;
        const spread=Math.min(19,distance*Math.tan(tune.halfAngle)*0.45)*factor*(0.95+0.09*Math.sin(now*0.035+i));
        const tip=Math.max(1,spread*(1-distance/tune.range*0.55));
        const left={x:center.x+normal.x*(tip+wave*factor),y:center.y+normal.y*(tip+wave*factor)};
        const right={x:center.x-normal.x*(tip-wave*factor),y:center.y-normal.y*(tip-wave*factor)};
        // Check both edges, not just the centerline, to avoid fire through walls.
        if(segmentObstacleHit(last,left,this.obstacles,0)||segmentObstacleHit(last,right,this.obstacles,0))break;
        g.fillTriangle(last.x,last.y,left.x,left.y,right.x,right.y);
        last=center;
      }
    }
    g.fillStyle(0xfff4b3,0.96).fillCircle(origin.x,origin.y,5);
  }

  updateFlameParticles(now,delta){
    for(const p of this.flameParticles){
      p.age+=delta;
      const next={x:p.object.x+p.vx*delta/1000,y:p.object.y+p.vy*delta/1000};
      if(segmentObstacleHit(p.object,next,this.obstacles,0)){p.object.destroy();continue;}
      p.object.setPosition(next.x,next.y);
      p.object.setAlpha(Math.max(0,1-p.age/p.life)*0.82);
      if(p.age>=p.life)p.object.destroy();
    }
    this.flameParticles=this.flameParticles.filter(p=>p.object.active);
  }

  emitFlame(origin,aim,now){
    const tune=COMBAT_TUNING.flamethrower;
    if(this.flameEmissionAt!==null&&now-this.flameEmissionAt<tune.particleInterval)return;
    this.flameEmissionAt=now;
    if(this.flameParticles.length>=tune.maxParticles)return;
    const wobble=Math.sin(now*0.021)*0.21;
    const angle=Math.atan2(aim.y,aim.x)+wobble;
    const speed=160+(Math.sin(now*0.017)+1)*52;
    const dir={x:Math.cos(angle),y:Math.sin(angle)};
    const start={x:origin.x+aim.x*6,y:origin.y+aim.y*6};
    const end={x:start.x+dir.x*speed*0.24,y:start.y+dir.y*speed*0.24};
    if(segmentObstacleHit(start,end,this.obstacles,0))return;
    const life=180+(Math.sin(now*0.031)+1)*85;
    const color=[0xffd65d,0xff903b,0xf14b27][Math.floor(now/67)%3];
    const object=this.add.circle(start.x,start.y,3.4+(Math.sin(now*0.034)+1)*1.6,color,0.8).setDepth(13);
    this.flameParticles.push({object,vx:dir.x*speed,vy:dir.y*speed,age:0,life});
  }

  applyFlame(aim,now){
    const origin=muzzlePoint(this.player.x,this.player.y,aim);
    const tune=COMBAT_TUNING.flamethrower;
    this.drawFlameStream(origin,aim,now);
    this.emitFlame(origin,aim,now);
    for(const enemy of this.enemies){
      if(enemy.dead||enemy.hp<=0||!enemyFlameVisible(origin,aim,enemy,this.obstacles,this.enemyRenderers[enemy.type].damagePoseOf?.(enemy)??null))continue;
      if(!cooldownReady(this.flameCooldowns,enemy,now,tune.damageInterval))continue;
      this.damageEnemy(enemy,tune.damage,origin,now);
      enemy.hitUntil=now+120;
      if(enemy.hp===0)this.finalizeEnemyDeath(enemy);
      if(this.finalResolution)return;
      else {
        enemy.sprite.setAlpha(0.45);
        if(igniteEnemy(enemy.ignition,enemy.type,now))enemy.burningFx=createBurningFx(this,enemy.type);
      }
    }
    for(const obstacle of this.obstacles){
      if(!obstacle.alive||obstacle.type!=='toxic_barrel')continue;
      if(!flameTargetVisible(origin,aim,obstacle,obstacle.footprint.radius,this.obstacles))continue;
      if(!cooldownReady(this.flameCooldowns,obstacle,now,tune.barrelInterval))continue;
      this.hitObstacle(obstacle,now);
    }
  }

  hitObstacle(blocked,now){
    const outcome=damageObstacle(blocked);
    if(blocked.type==='toxic_barrel'&&blocked.alive)blocked.sprite.setAlpha(0.5);
    blocked.hitUntil=now+120;
    if(!outcome.exploded)return;
    blocked.sprite.destroy();
    const blast=this.add.circle(blocked.x,blocked.y,OBSTACLE_RULES.explosionRadius,0xf1a33a,0.32).setDepth(14);
    this.explosionEffects.push({sprite:blast,until:now+180});
    for(const enemy of this.enemies){
      if(enemy.hp>0&&inExplosion(enemy,blocked)){
        this.damageEnemy(enemy,OBSTACLE_RULES.enemyExplosionDamage,blocked,now);
        enemy.hitUntil=now+120;
        if(enemy.hp===0)this.finalizeEnemyDeath(enemy);
        if(this.finalResolution)return;
        else enemy.sprite.setAlpha(0.45);
      }
    }
    if(this.finalResolution)return;
    if(inExplosion(this.player,blocked)){
      const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},now);
      this.lastDamageSource=blocked;
      this.setPlayerHp(hp.hp);this.invulnerableUntil=hp.invulnerableUntil;
      this.hpText.setText('HP '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
      if(this.playerHp===0)this.endEpisode('defeat');
    }
  }

  rewardForClearedWave(wave){
    const id=wave===2?'rifle':wave===4?'flamethrower':null;
    if(!id||this.triggeredMilestones.has(wave)||this.pendingRewards.has(wave))return;
    this.pendingRewards.set(wave,{id,origin:{x:this.player.x,y:this.player.y},attempts:0});
    this.retryPendingRewards();
  }

  retryPendingRewards(){
    for(const [milestone,reward] of this.pendingRewards){
      // Retain the reward until it exists as an actual world pickup.
      reward.attempts=(reward.attempts||0)+1;
      const point=fallbackRewardPoint(this.player,this.obstacles,this.navigation)||dropPoint(reward.origin,this.obstacles,this.navigation);
      if(point&&this.addPickup(reward.id,point)){
        this.pendingRewards.delete(milestone);
        this.triggeredMilestones.add(milestone);
      }
    }
  }

  enemyHit(enemy,source,now){
    if(!enemy.dead&&enemy.hp>0)recordHit(this.enemyRenderers[enemy.type].feedbackOf(enemy),now,source,enemy);
  }

  damageEnemy(enemy,amount,source,now){
    if(this.finalResolution||this.bossEntrance||enemy.dead||enemy.hp<=0)return false;
    const before=enemy.hp;
    enemy.hp=applyEnemyHit(before,amount);
    if(enemy.hp>=before)return false;
    queueBocianolakHitDialogue(this,enemy,before,enemy.hp);
    if(enemy.hp>0)this.enemyHit(enemy,source,now);
    return true;
  }

  beginMarcinVictory(){
    if(!beginBossResolution(this.episode))return false;
    this.finalResolution=true;this.spawnDueAt=null;this.escortDue=[];this.reinforcementDue=[];
    this.bossSpawnDueAt=null;this.bossEntrancePending=false;
    this.ambientBarks?.suspend();this.narrativeEvents.clear();
    this.clearBossProjectiles();this.boss=null;this.renderBossHp();
    for(const bullet of this.projectiles)bullet.object.destroy();
    this.projectiles=[];this.resetMovement();this.flameStream.clear();
    this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);this.physics.world.pause();
    for(const enemy of this.enemies){
      if(enemy.dead||enemy.type==='marcin')continue;
      enemy.dead=true;enemy.hp=0;
      this.deathBursts.push(createPixelBurst(this,enemy.type,enemy.x,enemy.y,enemy.seed));
      enemy.burningFx?.destroy();enemy.burningFx=null;clearIgnition(enemy.ignition);
      this.flameCooldowns.delete(enemy);enemy.sprite.destroy();
    }
    this.enemies=this.enemies.filter(e=>!e.dead);
    return true;
  }
  finalizeEnemyDeath(enemy){
    if(enemy.dead||enemy.hp>0||this.finalResolution)return false;
    enemy.dead=true;
    this.ambientBarks?.speakerDied(enemy);
    this.deathBursts.push(createPixelBurst(this,enemy.type,enemy.x,enemy.y,enemy.seed));
    enemy.burningFx?.destroy();enemy.burningFx=null;
    clearIgnition(enemy.ignition);
    this.flameCooldowns.delete(enemy);
    enemy.sprite.destroy();
    if(enemy.type==='marcin'){this.kills++;this.refreshWeaponHud();this.beginMarcinVictory();return true;}
    if(!this.finalResolution){this.kills++;this.refreshWeaponHud();}
    const living=this.enemies.filter(e=>!e.dead).length;
    recordDeath(this.episode,living,this.time.now,enemy.encounterId??null,enemy.waveIndex??this.episode.wave);
    if(enemy.type==='marcin'){this.clearBossProjectiles();this.boss=null;this.renderBossHp();}
    if(nextType(this.episode)!==null&&this.spawnDueAt===null){
      this.spawnDueAt=this.time.now+380;
    }
    return true;
  }

  spawnReplacement(fromBossScheduler=false){
    const nextTypeValue=this.nextOrdinaryType(),bossPhase=!!this.boss||this.episode.bossIntroduced;
    if(this.episode.state!=='active'||this.defeated||this.completed||!nextTypeValue||this.livingNonBoss()>=(bossPhase?BOSS_NON_MARCIN_CAP:waveCapacity(this.episode))||this.finalResolution||(this.boss&&!fromBossScheduler))return;
    const nextEnemyType=nextTypeValue;
    if(nextEnemyType==='zubrokryptyda'&&this.enemies.some(e=>!e.dead&&e.type==='zubrokryptyda'&&!e.encounterId)){
      this.spawnDueAt=this.time.now+380;return;
    }
    const introductionId=nextEnemyType==='bocianolak'?'before-first-bocianolak':nextEnemyType==='zubrokryptyda'?'before-first-zubrokryptyda':null;
    const pending=introductionId&&this.pendingIntroductions.get(introductionId);
    const firstIntroduction=introductionId&&!this.introducedEnemyTypes.has(introductionId)&&(!pending||pending.dead||pending.hp<=0);
    const radius=ENEMY_TYPES[nextEnemyType].radius;
    const at=(firstIntroduction?introductionSpawnPoint(nextEnemyType,this.player,this.obstacles,this.cameras.main.worldView,radius,this.navigation):null)
      ||safeEnemySpawn(this.player,this.obstacles,this.totalSpawned,radius,this.navigation);
    if(!at){this.spawnDueAt=this.time.now+380;return;}
    const created=this.createEnemy(nextEnemyType,at,this.totalSpawned);
    this.enemies.push(created);
    this.totalSpawned++;
    recordSpawn(this.episode,nextEnemyType);
    if(firstIntroduction){
      this.pendingIntroductions.set(introductionId,created);
      this.markNarrativeBoundary(introductionId);
      this.tryStartDialogue();
    }
  }

  dropHealthReward(){
    const point=fallbackRewardPoint(this.player,this.obstacles,this.navigation);
    if(point)this.addPickup('health',point);
    else this.pendingHealth=(this.pendingHealth||0)+1;
  }
  endEpisode(outcome){
    if(outcome==='victory'&&this.playerHp<=0)return this.endEpisode('defeat');
    if(!terminateEpisode(this.episode,outcome))return;
    this.defeated=outcome==='defeat';this.completed=outcome==='victory';
    this.clearBossProjectiles();this.bossHpBar.clear();this.bossHpLabel.setVisible(false);
    this.spawnDueAt=null;this.resetMovement();this.flameStream.clear();this.physics.world.pause();
    if(outcome==='defeat'){
      const screen=this.cameras.main.getWorldPoint(0,0);
      const zoom=this.cameras.main.zoom;
      this.defeatVisualAt={x:(this.player.x-screen.x)*zoom,y:(this.player.y-screen.y)*zoom};
      this.playerVisual.sprite?.setVisible(false);
      this.player.setVisible(false);
      this.facingMarker.setVisible(false);
    }
    this.completeText.setText(outcome==='victory'?'ZWYCIĘSTWO!':'KONIEC GRY').setVisible(true);
    this.openMenu();
  }

  openMenu() {
    if (this.scene.isPaused('Arena') || this.scene.isActive('Menu')) return;
    this.ambientBarks?.suspend();
    advanceGameplayClock(this.gameplayClock,0,false);
    this.resetMovement();
    this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
    this.flameStream.clear();
    this.physics.world.pause();
    this.scene.pause();
    this.scene.launch('Menu');
    // A paused Phaser scene still renders; Menu must be above Arena.
    this.scene.bringToTop('Menu');
  }

  update() {
    this.ambientBarks?.guard();
    this.renderBossHp();
    if(this.bossEntrance){
      this.resetMovement();advanceGameplayClock(this.gameplayClock,0,false);
      if(!this.scene.isPaused('Arena')&&this.canResume()&&!this.dialogueState.id)this.updateBossEntrance(Math.min(this.game.loop.delta,50));
      return;
    }
    if(this.episode.state==='boss-resolving'){
      if(this.deathBursts.length===0&&finishBossResolution(this.episode))this.markNarrativeBoundary('after-final-enemy');
      return;
    }
    // Terminal combat stays physically frozen; final DALEJ can still commit victory.
    if(this.episode.state==='final-pending'&&!this.dialogueLoading&&!this.dialogueState?.id&&!this.finalOutcomeHeld){
      this.endEpisode(this.playerHp<=0?'defeat':'victory');return;
    }
    if (this.episode.ended || this.dialogueLoading || this.dialogueState?.id || this.scene.isPaused('Arena') || this.physics.world.isPaused || document.hidden || window.innerHeight > window.innerWidth) {
      this.player.body.setVelocity(0, 0);
      cancelPressureTrigger(this.flamePressure);
      advanceGameplayClock(this.gameplayClock,0,false);
      return;
    }
    if(this.tryStartDialogue())return;
    if(this.bossEntrancePending&&this.time.now>=this.bossLandingRetryAt){this.bossLandingRetryAt=this.time.now+500;if(this.tryBeginBossEntrance())return;}
    // Gameplay time advances only while Arena combat input is permitted.
    this.elapsedGameplayMs=advanceGameplayClock(this.gameplayClock,performance.now(),true);
    this.timerText.setText('◷ '+formatGameplayClock(this.elapsedGameplayMs));
    this.syncTimedWaves();
    if(this.tryStartDialogue())return;
    this.hpFace.update(this.game.loop.delta);
    this.retryPendingRewards();
    if(this.pendingHealth){const p=fallbackRewardPoint(this.player,this.obstacles,this.navigation);if(p&&this.addPickup('health',p))this.pendingHealth--;}
    this.collectPickups();
    if(this.episode.state==='final-pending'){
      if(this.playerHp<=0)this.endEpisode('defeat');
      else if(!this.finalOutcomeHeld)this.endEpisode('victory');
      return;
    }
    if(this.spawnDueAt!==null&&this.time.now>=this.spawnDueAt){
      this.spawnDueAt=null;this.spawnReplacement();
      if(this.dialogueState?.id)return;
      if(this.episode.state==='active'&&!this.boss&&nextType(this.episode)!==null&&this.spawnDueAt===null)this.spawnDueAt=this.time.now+380;
    }
    const keys = this.keys;
    const x = Number(keys.D.isDown || keys.RIGHT.isDown) -
      Number(keys.A.isDown || keys.LEFT.isDown);
    const y = Number(keys.S.isDown || keys.DOWN.isDown) -
      Number(keys.W.isDown || keys.UP.isDown);
    const direction = normalizeInput(
      x || this.joystick.direction.x,
      y || this.joystick.direction.y,
    );
    this.player.body.setVelocity(direction.x * PLAYER_SPEED, direction.y * PLAYER_SPEED);
    const pointer=this.input.activePointer;
    if(pointer.wasTouch===false){
      const world=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
      this.mouseAim=resolveAim(world.x-this.player.x,world.y-this.player.y,12);
    }
    const stickAim=this.aimJoystick.held?resolveAim(this.aimJoystick.direction.x,this.aimJoystick.direction.y):{x:0,y:0};
    const aiming=this.aimJoystick.held?stickAim:(this.mouseHeld?this.mouseAim:{x:0,y:0});
    const aimingHeld=Boolean((this.aimJoystick.held||this.mouseHeld)&&(aiming.x||aiming.y));
    const firing=Boolean(this.weapon&&!this.completed&&aimingHeld);
    const pose=resolvePose({movement:direction,aim:aiming,aimActive:firing,lastFacing:this.lastFacing});
    this.lastFacing=pose.facing;
    this.playerVisual.update(pose.facing,pose.movement.x!==0||pose.movement.y!==0,this.game.loop.delta);
    const angle=({e:0,se:1,s:2,sw:3,w:4,nw:5,n:6,ne:7})[pose.facing]*Math.PI/4;
    this.facingMarker.clear().lineStyle(5,0x162a31).lineBetween(this.player.x,this.player.y,this.player.x+Math.cos(angle)*27,this.player.y+Math.sin(angle)*27).fillStyle(0x92d7e8).fillCircle(this.player.x+Math.cos(angle)*27,this.player.y+Math.sin(angle)*27,5);
    const now=this.time.now;
    this.updateBossCombat(Math.min(this.game.loop.delta,50),now);
    if(this.defeated||this.finalResolution)return;
    if(!firing)this.lastShotAt=null;
    const count=firingStep(this.firingState,this.weapon,firing,now);
    for(let i=0;i<count;i++)this.spawnShot(aiming,this.weapon,now);
    const flameActive=this.weapon==='flamethrower'&&stepPressure(this.flamePressure,aimingHeld,this.game.loop.delta);
    if(flameActive)this.applyFlame(aiming,now);
    else this.flameStream.clear();
    this.renderPressureBar();
    if(this.finalResolution)return;
    const delta=Math.min(this.game.loop.delta,50);
    this.updateFlameParticles(this.time.now,delta);
    if(this.defeated)return;
    const seconds=delta/1000;
    for(const item of this.projectiles){
      const old={x:item.object.x,y:item.object.y};
      item.object.x+=item.vx*seconds;item.object.y+=item.vy*seconds;
      const blocked=firstFootprintHit(old,item.object,this.obstacles,item.radius);
      let enemyHit=null;
      for(const enemy of this.enemies){
        if(enemy.hp<=0)continue;
        const hit=enemyProjectileHit(old,item.object,enemy,item.radius,this.enemyRenderers[enemy.type].damagePoseOf?.(enemy)??null);
        if(hit&&(!enemyHit||hit.t<enemyHit.t))enemyHit={enemy,t:hit.t};
      }
      if(blocked&&(!enemyHit||blocked.t<=enemyHit.t)){
        this.hitObstacle(blocked.obstacle,this.time.now);item.hit=true;if(this.defeated)return;
      }else if(enemyHit){
        const enemy=enemyHit.enemy;
        this.damageEnemy(enemy,item.damage,old,this.time.now);
        enemy.hitUntil=this.time.now+120;enemy.sprite.setAlpha(0.45);item.hit=true;
        if(enemy.hp===0)this.finalizeEnemyDeath(enemy);
        if(this.finalResolution)return;
      }
      if(item.hit){item.object.destroy();continue;}
      if(item.hit||item.object.x<0||item.object.y<0||item.object.x>ARENA.width||item.object.y>ARENA.height){
        item.object.destroy();item.hit=true;
      }
    }
    this.projectiles=this.projectiles.filter(item=>!item.hit);
    for(const o of this.obstacles){if(o.alive&&this.time.now>=o.hitUntil)o.sprite.setAlpha(1);}
    for(const effect of this.explosionEffects){if(this.time.now>=effect.until)effect.sprite.destroy();}
    this.explosionEffects=this.explosionEffects.filter(e=>e.sprite.active);
    // All projectile/flame/barrel damage and exactly-once deaths are complete.
    if((this.narrativeEvents.has(BOCIANOLAK_HIT_DIALOGUE)||this.narrativeEvents.has('before-marcin'))&&this.tryStartDialogue())return;
    for(const enemy of this.enemies){
      if(enemy.hp<=0)continue;
      const previousX=enemy.x,previousY=enemy.y;
      if(advanceIgnition(enemy.ignition,this.time.now)){
        enemy.burningFx?.destroy();enemy.burningFx=null;
      }
      const burning=isBurning(enemy.ignition,this.time.now);
      const bossStopped=enemy.type==='marcin'&&enemy.attack.phase!=='chase';
      const next=bossStopped?{x:enemy.x,y:enemy.y}:burning?fleeStep(enemy,this.player,seconds):moveEnemy(enemy,this.player,seconds,this.time.now/1000);
      const blockedPosition=burning
        ?resolveObstaclePosition(enemy,next,ENEMY_TYPES[enemy.type].radius,this.obstacles)
        :steerObstacleStep(enemy,next,this.player,ENEMY_TYPES[enemy.type].radius,this.obstacles);
      enemy.x=blockedPosition.x;enemy.y=blockedPosition.y;
      const traveled=Math.hypot(enemy.x-previousX,enemy.y-previousY);
      enemy.fleeFacingVector=burning&&traveled>0.4?{x:enemy.x-previousX,y:enemy.y-previousY}:burning?{x:0,y:0}:null;
      this.enemyRenderers[enemy.type].update(enemy,this.player,traveled,seconds);
      if(this.tryStartDialogue())return;
      if(burning)enemy.burningFx?.update(enemy,this.time.now);
      if(this.time.now>=enemy.hitUntil)enemy.sprite.setAlpha(1);
      if(Phaser.Math.Distance.Between(enemy.x,enemy.y,this.player.x,this.player.y)<=ENEMY_TYPES[enemy.type].radius+17){
        const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},this.time.now);
        if(hp.hp<this.playerHp){
          recordAttack(this.enemyRenderers[enemy.type].feedbackOf(enemy),enemy.type,this.time.now,enemy,this.player);
          this.lastDamageSource=enemy;
        }
        this.setPlayerHp(hp.hp);
        this.invulnerableUntil=hp.invulnerableUntil;
        this.hpText.setText('HP '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
        if(this.playerHp===0){
          this.endEpisode('defeat');
          return;
        }
      }
    }
    this.enemies=this.enemies.filter(enemy=>!enemy.dead);
    this.collectPickups();
    this.ambientBarks.tick(this.elapsedGameplayMs);
  }
}

