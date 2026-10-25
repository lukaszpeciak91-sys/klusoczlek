import Phaser from 'phaser';
import { ARENA, PLAYER_SPEED, normalizeInput } from './movement.js';
import { createPlayer } from './player.js';
import { createPlayerVisual } from './character-visual.js';
import { createJoystick } from './joystick.js';
import { resolvePose } from './combat-contract.js';
import { resolveAim, shouldFire, muzzlePoint, PROJECTILE_SPEED } from './shooting.js';
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
    this.ground=this.add.rectangle(ARENA.width / 2, ARENA.height / 2,
      ARENA.width, ARENA.height, 0x283c32).setStrokeStyle(6, COLORS.border).setDepth(-20);
    this.groundGrid=this.add.grid(ARENA.width / 2, ARENA.height / 2,
      ARENA.width - 8, ARENA.height - 8, 50, 50,
      0x283c32, 1, 0x415746, 0.36).setDepth(-19);
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
    this.projectiles=[];
    this.playerHp=ENCOUNTER.playerMaxHp;
    this.invulnerableUntil=0;
    this.defeated=false;
    this.enemies=enemySpawns(this.player).map(({x,y})=>{
      const sprite=this.add.container(x,y).setDepth(9);
      sprite.add(this.add.ellipse(0,0,42,37,0x745a44).setStrokeStyle(3,0x211b18));
      sprite.add(this.add.rectangle(-11,-2,13,7,0xf1ddac));
      sprite.add(this.add.rectangle(11,-2,13,7,0xf1ddac));
      sprite.add(this.add.circle(-8,-9,4,0xe64b48));
      sprite.add(this.add.circle(8,-9,4,0xe64b48));
      return {x,y,hp:ENCOUNTER.enemyHp,sprite,hitUntil:0};
    });
    this.hpText=this.add.text(this.scale.width/2,13,'HP: '+this.playerHp+'/'+ENCOUNTER.playerMaxHp,
      {fontFamily:'monospace',fontSize:'23px',color:'#f3e8d1'})
      .setOrigin(0.5,0).setScrollFactor(0).setDepth(64);
    this.targets=[[260,0],[-240,-140],[80,-260]].map(([dx,dy])=>
      this.add.circle(ARENA.width/2+dx,ARENA.height/2+dy,22,0xbe6a64).setStrokeStyle(3,0xf3e8d1));
    this.facingMarker=this.add.graphics().setDepth(12);
    this.playerVisual=createPlayerVisual(this,this.player,this.facingMarker);
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
    const hud = arenaHudLayout(this.scale.height, this.scale.width);
    const menuButton = this.add.rectangle(hud.menuX, hud.menuY, 185, 58, COLORS.panel)
      .setStrokeStyle(3, COLORS.border).setScrollFactor(0).setDepth(60)
      .setInteractive({ useHandCursor: true });
    const menuLabel = this.add.text(hud.menuX, hud.menuY, 'MENU', {
      fontFamily: 'monospace', fontSize: '25px', color: COLORS.white,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    menuButton.on('pointerdown', () => this.openMenu());
    const resizeHud = () => {
      const pos = arenaHudLayout(this.scale.height, this.scale.width);
      menuButton.setPosition(pos.menuX, pos.menuY);
      menuLabel.setPosition(pos.menuX, pos.menuY);
      this.joystick.reposition(pos.joystickX, pos.joystickY);
      this.aimJoystick.reposition(pos.aimX,pos.aimY);
      this.mouseHeld=false;
      this.lastShotAt=null;
      this.hpText.setX(this.scale.width/2);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resizeHud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, resizeHud));

    this.resetMovement = () => {
      this.player.body.setVelocity(0, 0);
      this.joystick.reset();
      this.aimJoystick.reset();
      this.mouseHeld=false;
      this.lastShotAt=null;
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
      this.enemies.length=0;
      this.projectiles.length=0;
      this.obstacles.length=0;
      this.explosionEffects.length=0;
      this.playerVisual.destroy();
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
    const firing=Boolean((this.aimJoystick.held||this.mouseHeld)&&(aiming.x||aiming.y));
    const pose=resolvePose({movement:direction,aim:aiming,aimActive:firing,lastFacing:this.lastFacing});
    this.lastFacing=pose.facing;
    this.playerVisual.update(pose.facing,pose.movement.x!==0||pose.movement.y!==0,this.game.loop.delta);
    const angle=({e:0,se:1,s:2,sw:3,w:4,nw:5,n:6,ne:7})[pose.facing]*Math.PI/4;
    this.facingMarker.clear().lineStyle(5,0x162a31).lineBetween(this.player.x,this.player.y,this.player.x+Math.cos(angle)*27,this.player.y+Math.sin(angle)*27).fillStyle(0x92d7e8).fillCircle(this.player.x+Math.cos(angle)*27,this.player.y+Math.sin(angle)*27,5);
    if(!firing)this.lastShotAt=null;
    if(shouldFire(this.time.now,this.lastShotAt,firing)){
      this.lastShotAt=this.time.now;
      const origin=muzzlePoint(this.player.x,this.player.y,aiming);
      const bullet=this.add.circle(origin.x,origin.y,5,0xffe8a2).setDepth(8);
      this.projectiles.push({object:bullet,vx:aiming.x*PROJECTILE_SPEED,vy:aiming.y*PROJECTILE_SPEED});
    }
    const seconds=Math.min(this.game.loop.delta,50)/1000;
    for(const item of this.projectiles){
      const old={x:item.object.x,y:item.object.y};
      item.object.x+=item.vx*seconds;item.object.y+=item.vy*seconds;
      const blocked=segmentObstacleHit(old,item.object,this.obstacles);
      if(blocked){
        const outcome=damageObstacle(blocked);
        if(blocked.type==='barrel'&&blocked.alive)blocked.sprite.setAlpha(0.5);
        blocked.hitUntil=this.time.now+120;
        item.hit=true;
        if(outcome.exploded){
          blocked.sprite.destroy(); // Underlay remains untouched.
          const blast=this.add.circle(blocked.x,blocked.y,OBSTACLE_RULES.explosionRadius,0xf1a33a,0.32).setDepth(14);
          this.explosionEffects.push({sprite:blast,until:this.time.now+180});
          for(const enemy of this.enemies){
            if(enemy.hp>0&&inExplosion(enemy,blocked)){
              enemy.hp=applyEnemyHit(enemy.hp,OBSTACLE_RULES.enemyExplosionDamage);
              enemy.hitUntil=this.time.now+120;
              if(enemy.hp===0)enemy.sprite.destroy();
              else enemy.sprite.setAlpha(0.45);
            }
          }
          if(inExplosion(this.player,blocked)){
            const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},this.time.now);
            this.playerHp=hp.hp;this.invulnerableUntil=hp.invulnerableUntil;
            this.hpText.setText('HP: '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
            if(this.playerHp===0){this.defeated=true;this.resetMovement();this.openMenu();return;}
          }
        }
      }
      if(item.hit){item.object.destroy();continue;}
      for(const enemy of this.enemies){
        if(enemy.hp<=0)continue;
        if(segmentHitsCircle(old,item.object,enemy,ENCOUNTER.enemyRadius+5)){
          enemy.hp=applyEnemyHit(enemy.hp);
          enemy.hitUntil=this.time.now+120;
          enemy.sprite.setAlpha(0.45);
          item.hit=true;
          if(enemy.hp===0)enemy.sprite.destroy();
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
      const next=advanceEnemy(enemy,this.player,seconds);
      const blockedPosition=resolveObstaclePosition(enemy,next,ENCOUNTER.enemyRadius,this.obstacles);
      enemy.x=blockedPosition.x;enemy.y=blockedPosition.y;
      enemy.sprite.setPosition(enemy.x,enemy.y);
      if(this.time.now>=enemy.hitUntil)enemy.sprite.setAlpha(1);
      if(Phaser.Math.Distance.Between(enemy.x,enemy.y,this.player.x,this.player.y)<=ENCOUNTER.enemyRadius+17){
        const hp=applyPlayerContact({hp:this.playerHp,invulnerableUntil:this.invulnerableUntil},this.time.now);
        this.playerHp=hp.hp;
        this.invulnerableUntil=hp.invulnerableUntil;
        this.hpText.setText('HP: '+this.playerHp+'/'+ENCOUNTER.playerMaxHp);
        if(this.playerHp===0){
          this.defeated=true;
          this.resetMovement();
          this.openMenu();
          return;
        }
      }
    }
    this.enemies=this.enemies.filter(enemy=>enemy.hp>0);
  }
}

