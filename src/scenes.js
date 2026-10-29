import Phaser from 'phaser';
import { ARENA, PLAYER_SPEED, normalizeInput } from './movement.js';
import { createPlayer } from './player.js';
import { createPlayerVisual } from './character-visual.js';
import {createHpFaceHud} from './hp-face-hud.js';
import { createBobrozombiRenderer,createBocianolakRenderer,createZubrokryptydaRenderer } from './enemy-visual.js';
import {ENEMY_TYPES,ENEMY_SCHEDULE,TOTAL_ENEMIES,typeAt,moveEnemy} from './enemy-types.js';
import { WEAPONS, initialPickupPoint, dropPoint, safeEnemySpawn, pickupCollected, fallbackRewardPoint } from './weapon-progression.js';
import { createArenaGround } from './arena-ground.js';
import { createJoystick } from './joystick.js';
import { resolvePose } from './combat-contract.js';
import { resolveAim, muzzlePoint } from './shooting.js';
import {COMBAT_TUNING,createFiringState,resetFiring,firingStep,flameTargetVisible,cooldownReady} from './weapon-combat.js';
import { ENCOUNTER, enemySpawns, advanceEnemy, applyEnemyHit, applyPlayerContact, segmentHitsCircle } from './bobrozombi.js';
import { menuLayout, arenaHudLayout } from './ui-layout.js';
import { enforceOrientationOnSceneStart } from './viewport.js';
import {OBSTACLE_RULES,getObstacleLayout,obstacleRadius,resolveObstaclePosition,segmentObstacleHit,damageObstacle,inExplosion} from './obstacles.js';
let nextLayoutIndex=0;

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
    const defeated = hasSession && this.scene.get('Arena').defeated;
    const subtitle = label(this, initial.centerX, initial.subtitleY, defeated?'PRZEGRANA — NOWA GRA':'RETRO SURVIVAL // PROTOTYP', initial.subtitleSize);
    const startY = hasSession ? initial.startY - Math.min(44, this.scale.height * 0.12) : initial.startY;
    const resumeY = initial.startY + Math.min(44, this.scale.height * 0.12);
    const allowed = () => !this.navigating && !document.hidden && window.innerWidth >= window.innerHeight;
    const newGame = button(this, initial.centerX, startY, initial.startWidth, initial.startHeight, 'NOWA GRA', () => {
      if (!allowed()) return;
      this.navigating = true;
      if (hasSession) this.scene.stop('Arena');
      this.scene.start('Arena');
    });
    const resume = hasSession && !defeated ? button(this, initial.centerX, resumeY, initial.startWidth, initial.startHeight, 'WZNÓW', () => {
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
    enforceOrientationOnSceneStart(this);
  }
}

export class ArenaScene extends Phaser.Scene {
  constructor() { super('Arena'); }

  create() {
    document.getElementById('fullscreen-button').hidden = true;
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    createArenaGround(this,ARENA.width,ARENA.height,Phaser,COLORS);
    this.player = createPlayer(this, ARENA.width / 2, ARENA.height / 2);
    this.layoutIndex=nextLayoutIndex++%4;
    this.obstacles=getObstacleLayout(this.layoutIndex).map(o=>{
      const sprite=o.type==='rock'
        ?this.add.circle(o.x,o.y,obstacleRadius(o.type),0x858b8e).setStrokeStyle(4,0x42464a)
        :o.type==='log'
        ?this.add.ellipse(o.x,o.y,60,40,0x926a3d).setStrokeStyle(5,0x48331e)
        :this.add.rectangle(o.x,o.y,43,48,0xba3c29).setStrokeStyle(4,0x4e1f19);
      sprite.setDepth(4); // Independent foreground above both ground layers.
      return {...o,sprite,hitUntil:0};
    });
    this.obstacleBodies=this.physics.add.staticGroup();
    for(const o of this.obstacles){
      this.physics.add.existing(o.sprite,true);
      o.sprite.body.setCircle(obstacleRadius(o.type),
        o.sprite.width/2-obstacleRadius(o.type),
        o.sprite.height/2-obstacleRadius(o.type));
      o.sprite.body.updateFromGameObject();
      this.obstacleBodies.add(o.sprite);
    }
    this.playerBlocker=this.physics.add.collider(this.player,this.obstacleBodies);
    this.explosionEffects=[];
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick = createJoystick(this,'left');
    this.aimJoystick = createJoystick(this,'right');
    this.lastFacing='s';
    this.lastShotAt=null;
    this.firingState=createFiringState();
    this.flameParticles=[];
    this.flameCooldowns=new Map();
    this.flameEmissionAt=null;
    this.projectiles=[];
    this.playerHp=ENCOUNTER.playerMaxHp;
    this.invulnerableUntil=0;
    this.defeated=false;
    this.completed=false;
    this.weapon=null;
    this.kills=0;
    this.totalSpawned=0;
    this.spawnDueAt=null;
    this.pickups=[];
    this.triggeredMilestones=new Set();
    this.pendingRewards=new Map();
    this.enemyRenderers={bobrozombi:createBobrozombiRenderer(this,Phaser),bocianolak:createBocianolakRenderer(this,Phaser),zubrokryptyda:createZubrokryptydaRenderer(this,Phaser)};
    this.enemyRenderer=this.enemyRenderers.bobrozombi;
    this.enemies=enemySpawns(this.player).map(({x,y},index)=>this.createEnemy(typeAt(index),{x,y},index));
    this.totalSpawned=this.enemies.length;
    this.hudLayout=arenaHudLayout(this.scale.height,this.scale.width);
    this.hpText=this.add.text(0,0,'HP 5/5',{fontFamily:'monospace',fontSize:'14px',color:'#f3e8d1'})
      .setOrigin(0.5,0).setScrollFactor(0).setDepth(81);
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponTokenBody=this.add.circle(0,0,17,0x6b6153).setStrokeStyle(2,COLORS.border);
    this.weaponText=this.add.text(0,0,'—',{fontFamily:'monospace',fontSize:'21px',fontStyle:'bold',color:'#ffffff'})
      .setOrigin(0.5);
    this.weaponToken.add([this.weaponTokenBody,this.weaponText]);
    this.skullIcon=this.add.text(0,0,'☠',{fontFamily:'sans-serif',fontSize:'23px',color:'#d7b978'})
      .setOrigin(0.5).setScrollFactor(0).setDepth(66);
    this.killsText=this.add.text(0,0,'0/'+TOTAL_ENEMIES,{fontFamily:'monospace',fontSize:'20px',color:'#f3e8d1'})
      .setOrigin(0,0.5).setScrollFactor(0).setDepth(66);
    this.hpFace=createHpFaceHud(this,Phaser);
    this.completeText=this.add.text(this.scale.width/2,55,TOTAL_ENEMIES+'/'+TOTAL_ENEMIES+' — OCZYSZCZONO ARENĘ',{fontFamily:'monospace',fontSize:'19px',color:'#f3ca76',backgroundColor:'#1b2330'}).setOrigin(0.5,0).setScrollFactor(0).setDepth(65).setVisible(false);
    this.targets=[[260,0],[-240,-140],[80,-260]].map(([dx,dy])=>
      this.add.circle(ARENA.width/2+dx,ARENA.height/2+dy,22,0xbe6a64).setStrokeStyle(3,0xf3e8d1));
    this.facingMarker=this.add.graphics().setDepth(12);
    this.playerVisual=createPlayerVisual(this,this.player,this.facingMarker,Phaser);
    void this.playerVisual.setVariant('unarmed');
    this.addPickup('blunderbuss',initialPickupPoint(this.player,this.cameras.main,this.scale,this.obstacles));
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
      this.weaponToken.setScale(pos.tokenSize/42);
      this.skullIcon.setPosition(pos.skullX,pos.skullY).setFontSize(pos.skullSize);
      this.killsText.setPosition(pos.killsX,pos.killsY).setFontSize(pos.countFont);
      this.hpText.setPosition(pos.hpX,pos.hpY).setFontSize(pos.hpFont);
      this.hpFace.resize(pos);
      this.completeText.setX(this.scale.width/2);
    };
    // Apply positions during initial Arena creation, even if Phaser emits no RESIZE.
    resizeHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, resizeHud);
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
    this.onBlur = () => { this.resetMovement(); this.physics.world.pause(); };
    this.canResume = () => !document.hidden && document.hasFocus() && window.innerWidth >= window.innerHeight;
    this.onFocus = () => {
      if (this.canResume() && !this.scene.isPaused('Arena') && !this.scene.isPaused('Arena')) {
        this.physics.world.resume();
      }
    };
    // Resume is delivered by Phaser after the Arena scene state switches.
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      document.getElementById('fullscreen-button').hidden = true;
      if (this.canResume()) this.physics.world.resume();
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
      for(const enemy of this.enemies)if(enemy.sprite.active)enemy.sprite.destroy();
      this.enemies.length=0;
      this.projectiles.length=0;
      for(const p of this.flameParticles)p.object.destroy();
      this.flameParticles.length=0;
      this.flameCooldowns.clear();
      this.obstacles.length=0;
      this.explosionEffects.length=0;
      this.playerVisual.destroy();
      this.hpFace.destroy();
      // Phaser may have removed the player body before SHUTDOWN; do not access it here.
      // Phaser has already torn down Arcade Physics by SHUTDOWN; no physics calls here.
      window.removeEventListener('blur', this.onBlur);
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVisibility);
    });
    enforceOrientationOnSceneStart(this);
    this.onResize();
  }

  createEnemy(type,point,index){
    const def=ENEMY_TYPES[type];
    return {...point,type,seed:index,hp:def.hp,
      sprite:this.enemyRenderers[type].create(point.x,point.y),hitUntil:0,dead:false,facing:'s'};
  }

  refreshWeaponHud(){
    const selected=this.weapon?WEAPONS[this.weapon]:null;
    this.weaponText.setText(selected?.symbol||'—');
    this.weaponTokenBody.setFillStyle(selected?.color??0x6b6153);
    this.killsText.setText(this.kills+'/'+TOTAL_ENEMIES);
  }

  setPlayerHp(next){
    const before=this.playerHp;
    this.playerHp=Math.max(0,Math.min(ENCOUNTER.playerMaxHp,Math.floor(next)));
    if(this.playerHp!==before)this.hpFace.setHp(this.playerHp);
    this.hpText.setText('HP '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
  }

  addPickup(id,point){
    if(!point)return false;
    const def=WEAPONS[id];
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
      this.weapon=pickup.id;
      this.stopWeaponFire();
      void this.playerVisual.setVariant(pickup.id);
      pickup.object.destroy();
      pickup.collected=true;
      this.refreshWeaponHud();
    }
    this.pickups=this.pickups.filter(p=>!p.collected);
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
    this.emitFlame(origin,aim,now);
    for(const enemy of this.enemies){
      if(enemy.dead||enemy.hp<=0||!flameTargetVisible(origin,aim,enemy,ENEMY_TYPES[enemy.type].radius,this.obstacles))continue;
      if(!cooldownReady(this.flameCooldowns,enemy,now,tune.damageInterval))continue;
      enemy.hp=applyEnemyHit(enemy.hp,tune.damage);
      enemy.hitUntil=now+120;
      if(enemy.hp===0)this.finalizeEnemyDeath(enemy);
      else enemy.sprite.setAlpha(0.45);
    }
    for(const obstacle of this.obstacles){
      if(!obstacle.alive||obstacle.type!=='barrel')continue;
      if(!flameTargetVisible(origin,aim,obstacle,obstacleRadius(obstacle.type),this.obstacles))continue;
      if(!cooldownReady(this.flameCooldowns,obstacle,now,tune.barrelInterval))continue;
      this.hitObstacle(obstacle,now);
    }
  }

  hitObstacle(blocked,now){
    const outcome=damageObstacle(blocked);
    if(blocked.type==='barrel'&&blocked.alive)blocked.sprite.setAlpha(0.5);
    blocked.hitUntil=now+120;
    if(!outcome.exploded)return;
    blocked.sprite.destroy();
    const blast=this.add.circle(blocked.x,blocked.y,OBSTACLE_RULES.explosionRadius,0xf1a33a,0.32).setDepth(14);
    this.explosionEffects.push({sprite:blast,until:now+180});
    for(const enemy of this.enemies){
      if(enemy.hp>0&&inExplosion(enemy,blocked)){
        enemy.hp=applyEnemyHit(enemy.hp,OBSTACLE_RULES.enemyExplosionDamage);
        enemy.hitUntil=now+120;
        if(enemy.hp===0)this.finalizeEnemyDeath(enemy);
        else enemy.sprite.setAlpha(0.45);
      }
    }
    if(inExplosion(this.player,blocked)){
      const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},now);
      this.setPlayerHp(hp.hp);this.invulnerableUntil=hp.invulnerableUntil;
      this.hpText.setText('HP '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
      if(this.playerHp===0){this.defeated=true;this.resetMovement();this.openMenu();}
    }
  }

  retryPendingRewards(){
    for(const [milestone,reward] of this.pendingRewards){
      // Retain the reward until it exists as an actual world pickup.
      reward.attempts=(reward.attempts||0)+1;
      const point=dropPoint(reward.origin,this.obstacles)||(reward.attempts>=3?fallbackRewardPoint(this.player,this.obstacles):null);
      if(point&&this.addPickup(reward.id,point)){
        this.pendingRewards.delete(milestone);
        this.triggeredMilestones.add(milestone);
      }
    }
  }

  finalizeEnemyDeath(enemy){
    if(enemy.dead||enemy.hp>0)return false;
    enemy.dead=true;
    this.flameCooldowns.delete(enemy);
    enemy.sprite.destroy();
    this.kills++;
    if(this.kills===5||this.kills===10){
      const id=this.kills===5?'rifle':'flamethrower';
      if(!this.triggeredMilestones.has(this.kills)){
        this.pendingRewards.set(this.kills,{id,origin:{x:enemy.x,y:enemy.y}});
        this.retryPendingRewards();
      }
    }
    this.refreshWeaponHud();
    if(this.kills===TOTAL_ENEMIES){
      this.completed=true;
      this.spawnDueAt=null;
      this.completeText.setVisible(true);
      this.resetMovement();
    }else if(this.totalSpawned<TOTAL_ENEMIES&&this.spawnDueAt===null){
      this.spawnDueAt=this.time.now+380;
    }
    return true;
  }

  spawnReplacement(){
    if(this.defeated||this.completed||this.totalSpawned>=TOTAL_ENEMIES||this.enemies.filter(e=>!e.dead).length>=3)return;
    const nextType=typeAt(this.totalSpawned);
    if(nextType==='zubrokryptyda'&&this.enemies.some(e=>!e.dead&&e.type==='zubrokryptyda')){
      this.spawnDueAt=this.time.now+380;return;
    }
    const at=safeEnemySpawn(this.player,this.obstacles,this.totalSpawned,ENEMY_TYPES[nextType].radius);
    if(!at){this.spawnDueAt=this.time.now+380;return;}
    this.enemies.push(this.createEnemy(nextType,at,this.totalSpawned));
    this.totalSpawned++;
  }

  openMenu() {
    if (this.scene.isPaused('Arena') || this.scene.isActive('Menu')) return;
    this.resetMovement();
    this.physics.world.pause();
    this.scene.pause();
    this.scene.launch('Menu');
    // A paused Phaser scene still renders; Menu must be above Arena.
    this.scene.bringToTop('Menu');
  }

  update() {
    if (this.defeated || this.scene.isPaused('Arena') || this.physics.world.isPaused || document.hidden || window.innerHeight > window.innerWidth) {
      this.player.body.setVelocity(0, 0);
      return;
    }
    this.hpFace.update(this.game.loop.delta);
    this.retryPendingRewards();
    this.collectPickups();
    if(this.spawnDueAt!==null&&this.time.now>=this.spawnDueAt){this.spawnDueAt=null;this.spawnReplacement();if(this.enemies.filter(e=>!e.dead).length<3&&this.totalSpawned<TOTAL_ENEMIES&&this.spawnDueAt===null)this.spawnDueAt=this.time.now+380;}
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
    if(!firing)this.lastShotAt=null;
    const count=firingStep(this.firingState,this.weapon,firing,now);
    for(let i=0;i<count;i++)this.spawnShot(aiming,this.weapon,now);
    if(firing&&this.weapon==='flamethrower')this.applyFlame(aiming,now);
    const delta=Math.min(this.game.loop.delta,50);
    this.updateFlameParticles(this.time.now,delta);
    if(this.defeated)return;
    const seconds=delta/1000;
    for(const item of this.projectiles){
      const old={x:item.object.x,y:item.object.y};
      item.object.x+=item.vx*seconds;item.object.y+=item.vy*seconds;
      const blocked=segmentObstacleHit(old,item.object,this.obstacles,item.radius);
      if(blocked){this.hitObstacle(blocked,this.time.now);item.hit=true;if(this.defeated)return;}
      if(item.hit){item.object.destroy();continue;}
      for(const enemy of this.enemies){
        if(enemy.hp<=0)continue;
        if(segmentHitsCircle(old,item.object,enemy,ENEMY_TYPES[enemy.type].radius+item.radius)){
          enemy.hp=applyEnemyHit(enemy.hp,item.damage);
          enemy.hitUntil=this.time.now+120;
          enemy.sprite.setAlpha(0.45);
          item.hit=true;
          if(enemy.hp===0)this.finalizeEnemyDeath(enemy);
          break;
        }
      }
      if(item.hit){item.object.destroy();continue;}
      for(const target of this.targets){
        if(target.active&&Phaser.Math.Distance.Between(item.object.x,item.object.y,target.x,target.y)<27){
          target.setFillStyle(0x80c69d);
          this.time.delayedCall(120,()=>{if(target.active)target.setFillStyle(0xbe6a64);});
          item.hit=true;break;
        }
      }
      if(item.hit||item.object.x<0||item.object.y<0||item.object.x>ARENA.width||item.object.y>ARENA.height){
        item.object.destroy();item.hit=true;
      }
    }
    this.projectiles=this.projectiles.filter(item=>!item.hit);
    for(const o of this.obstacles){if(o.alive&&this.time.now>=o.hitUntil)o.sprite.setAlpha(1);}
    for(const effect of this.explosionEffects){if(this.time.now>=effect.until)effect.sprite.destroy();}
    this.explosionEffects=this.explosionEffects.filter(e=>e.sprite.active);
    for(const enemy of this.enemies){
      if(enemy.hp<=0)continue;
      const next=moveEnemy(enemy,this.player,seconds,this.time.now/1000);
      const blockedPosition=resolveObstaclePosition(enemy,next,ENEMY_TYPES[enemy.type].radius,this.obstacles);
      enemy.x=blockedPosition.x;enemy.y=blockedPosition.y;
      this.enemyRenderers[enemy.type].update(enemy,this.player);
      if(this.time.now>=enemy.hitUntil)enemy.sprite.setAlpha(1);
      if(Phaser.Math.Distance.Between(enemy.x,enemy.y,this.player.x,this.player.y)<=ENEMY_TYPES[enemy.type].radius+17){
        const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},this.time.now);
        this.setPlayerHp(hp.hp);
        this.invulnerableUntil=hp.invulnerableUntil;
        this.hpText.setText('HP '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
        if(this.playerHp===0){
          this.defeated=true;
          this.resetMovement();
          this.openMenu();
          return;
        }
      }
    }
    this.enemies=this.enemies.filter(enemy=>!enemy.dead);
    this.collectPickups();
  }
}

