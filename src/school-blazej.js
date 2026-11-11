// Błażej uses the approved dedicated PNG with the existing Żubrokryptyda
// gait, hit feedback and mechanical type; combat and Marcin attacks stay shared.
import {ENEMY_TYPES} from './enemy-types.js';
import {createBlazejRenderer} from './enemy-visual.js';
import {PLAYER_RADIUS} from './movement.js';
import {applyEnemyHit} from './bobrozombi.js';
import {recordHit} from './combat-feedback.js';
import {steerObstacleStep} from './obstacles.js';
import {firstFootprintHit} from './obstacle-geometry.js';
import {createBossPresentationState,bossHpRatio} from './boss-presentation.js';
import {MARCIN,createBossAttack,bossAttackStep,radialVolley,bossProjectileStep} from './marcin.js';
import {createPixelBurst,updateBursts,destroyBursts} from './pixel-death-vfx.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,isBurning,clearIgnition} from './enemy-panic.js';
import {createBurningFx} from './enemy-fire-vfx.js';
import {BLAZEJ_START,BLAZEJ_RADIUS,blazejJumpLanding} from './school-finale.js';
import {BLAZEJ_JUMP_DURATION_MS,blazejJumpFrame} from './school-blazej-jump.js';
import {schoolWalkable} from './school-contract.js';

export const BLAZEJ_HP=54;
export const BLAZEJ_SPEED=ENEMY_TYPES.zubrokryptyda.speed*1.3;
export const BLAZEJ_ATTACK=Object.freeze({...MARCIN,hp:BLAZEJ_HP,cooldown:4500,lowCooldown:3000});
export const BLAZEJ_SHOCKWAVE_RADIUS=95;
export const BLAZEJ_MAX_PROJECTILES=MARCIN.maxProjectiles;

function schoolJumpSafe(start,end,obstacles){
 return schoolWalkable(end,BLAZEJ_RADIUS)&&
  !firstFootprintHit(start,end,obstacles,BLAZEJ_RADIUS);
}

export function createSchoolBlazej(scene,Phaser){
 const renderer=createBlazejRenderer(scene,Phaser);
 const actor={type:'zubrokryptyda',seed:106,x:BLAZEJ_START.x,y:BLAZEJ_START.y,
  hp:BLAZEJ_HP,dead:false,facing:'s',hitUntil:0,sprite:renderer.create(BLAZEJ_START.x,BLAZEJ_START.y)};
 const presentation=createBossPresentationState(),attack=createBossAttack();
 const ignition=createIgnitionState();
 let burningFx=null;
 const projectiles=[],bursts=[];
 const graphics=scene.add.graphics().setDepth(16);
 const jumpShadow=scene.add.graphics().setDepth(8);
 const health=scene.add.graphics().setDepth(100).setScrollFactor(0).setVisible(false);
 const label=scene.add.text(0,0,'BŁAŻEJ',{fontFamily:'monospace',fontSize:'13px',color:'#ffb4a1'})
  .setOrigin(.5).setScrollFactor(0).setDepth(101).setVisible(false);
 let active=false,defeated=false,disposed=false,kind='radial',volleyCount=0,jumpCount=0;
 let landing=null,shockwaveMs=0,impactPoint=null,jump=null,landings=0;
 function clearAttacks(){
  projectiles.length=0;graphics.clear();jumpShadow.clear();jump=null;landing=null;shockwaveMs=0;impactPoint=null;
  actor.sprite?.getData('zubrokryptyda-art')?.clearTint();
 }
 function activate(){
  if(active||defeated||disposed||scene.schoolPhase!=='BLAZEJ_BOSS')return false;
  active=true;presentation.activate();health.setVisible(true);label.setVisible(true);
  return true;
 }
 function damage(amount,source,now){
  if(!active||defeated||disposed||!Number.isFinite(amount)||amount<=0)return false;
  const before=actor.hp;actor.hp=applyEnemyHit(before,amount);
  if(actor.hp===before)return false;
  if(actor.hp>0){
   scene.combat?.spawnBossReinforcements(bossHpRatio(actor.hp,BLAZEJ_HP));
   recordHit(renderer.feedbackOf(actor),now,source,actor);actor.hitUntil=now+120;
  }
  else{
   defeated=true;active=false;actor.dead=true;presentation.defeat();clearAttacks();
   burningFx?.destroy();burningFx=null;clearIgnition(ignition);
   health.setVisible(false);label.setVisible(false);
   const at={x:actor.x,y:actor.y};
   if(actor.sprite.active)actor.sprite.destroy();
   bursts.push(createPixelBurst(scene,'zubrokryptyda',at.x,at.y,actor.seed));
   scene.combat?.clearBossReinforcements();
   scene.onBlazejDefeated();
  }
  return true;
 }
 function ignite(now){
  if(!active||defeated)return false;
  if(!igniteEnemy(ignition,'zubrokryptyda',now))return false;
  burningFx?.destroy();burningFx=createBurningFx(scene,'zubrokryptyda');
  return true;
 }
 function hurtPlayer(now){
  if(scene.defeated||scene.dialogueState?.id||scene.storyBusy||scene.run.hp<=0)return;
  scene.combat.hurtPlayer(actor,now);
 }
 function drawHealth(){
  if(!presentation.visible)return;
  const width=Math.min(210,scene.scale.width*.38),x=(scene.scale.width-width)/2;
  const y=Math.min(80,scene.scale.height*.23);
  label.setPosition(scene.scale.width/2,y-13);
  health.clear().fillStyle(0x241d20,.9).fillRect(x,y,width,7)
    .fillStyle(0xd64b44).fillRect(x,y,width*bossHpRatio(actor.hp,BLAZEJ_HP),7);
 }
 function updateVfx(delta){updateBursts(bursts,delta);}
 function update(delta,now){
  if(disposed||defeated||!active||scene.defeated||scene.dialogueState?.id||scene.storyBusy)return;
  const dt=Math.max(0,Math.min(50,delta)),seconds=dt/1000;
  if(advanceIgnition(ignition,now)){burningFx?.destroy();burningFx=null;}
  graphics.clear();jumpShadow.clear();
  for(let i=projectiles.length-1;i>=0;i--){
   // Lethal player damage clears this array via scene.blazej.clearAttacks().
   // Never read another index or issue another boss attack after that death.
   if(scene.defeated)return;
   const p=projectiles[i];
   if(!p)continue;
   const status=bossProjectileStep(p,dt,scene.player,scene.obstacles);
   if(status){
    projectiles.splice(i,1);
    if(status==='player'){
     hurtPlayer(now);
     if(scene.defeated)return;
    }
    continue;
   }
   graphics.fillStyle(0xff9d42,.95).fillCircle(p.x,p.y,MARCIN.projectileRadius);
  }
  if(shockwaveMs>0&&impactPoint){
   shockwaveMs=Math.max(0,shockwaveMs-dt);
   graphics.lineStyle(4,0xffaa47,shockwaveMs/210).strokeCircle(impactPoint.x,impactPoint.y,BLAZEJ_SHOCKWAVE_RADIUS);
  }
  const previous=attack.phase,fire=bossAttackStep(attack,actor.hp,dt,BLAZEJ_ATTACK);
  if(previous!=='warning'&&attack.phase==='warning'){
   kind=(volleyCount+jumpCount)%2===0?'radial':'jump';
   landing=null; // Capture Aloes at commitment, not at the beginning of the 900ms warning.
  }
  if(attack.phase==='chase'){
   const from={x:actor.x,y:actor.y};
   // Błażej-only chase movement: no changes to ordinary Żubrokryptyda.
   const dx=scene.player.x-actor.x,dy=scene.player.y-actor.y;
   const distance=Math.hypot(dx,dy),step=Math.min(distance,BLAZEJ_SPEED*seconds);
   const desired=distance?{...actor,x:actor.x+dx/distance*step,y:actor.y+dy/distance*step}:{...actor};
   const next=steerObstacleStep(actor,desired,scene.player,BLAZEJ_RADIUS,scene.obstacles);
   actor.x=next.x;actor.y=next.y;
   renderer.update(actor,scene.player,Math.hypot(next.x-from.x,next.y-from.y),seconds);
   if(Math.hypot(actor.x-scene.player.x,actor.y-scene.player.y)<=BLAZEJ_RADIUS+PLAYER_RADIUS)
    hurtPlayer(now);
  }else renderer.update(actor,scene.player,0,seconds);
  // No Phaser pre-attack circles. Flash the approved world sprite only
  // during the original 900ms radial warning; keep jump telegraph clean.
  const bossArt=actor.sprite.getData('zubrokryptyda-art');
  if(bossArt?.active&&attack.phase==='warning'&&kind==='radial')
   bossArt.setTint(Math.floor(attack.elapsed/100)%2===0?0xffe1a3:0xffffff);
  else if(bossArt?.active&&attack.phase!=='warning'&&now>=actor.hitUntil)
   bossArt.clearTint();
  if(fire){
   if(kind==='radial'){
    const shots=radialVolley(actor);
    projectiles.push(...shots.slice(0,Math.max(0,BLAZEJ_MAX_PROJECTILES-projectiles.length)));
    volleyCount++;
   }else{
    const start={x:actor.x,y:actor.y};
    const capturedPlayer={x:scene.player.x,y:scene.player.y};
    const candidate=blazejJumpLanding(start,capturedPlayer,scene.obstacles)??start;
    const target=schoolJumpSafe(start,candidate,scene.obstacles)?candidate:start;
    landing={...target};jump={start,target,elapsed:0};
   }
   if(kind==='radial')landing=null;
  }
  if(jump){
   jump.elapsed=Math.min(BLAZEJ_JUMP_DURATION_MS,jump.elapsed+dt);
   const frame=blazejJumpFrame(jump.start,jump.target,jump.elapsed);
   actor.x=frame.x;actor.y=frame.y;
   // Only the art rises: the physical body and shadow stay at ground coordinates.
   renderer.update(actor,scene.player,0,seconds);
   actor.sprite.setPosition(actor.x,actor.y-frame.lift);
   jumpShadow.fillStyle(0x17100d,.45).fillEllipse(actor.x,actor.y+2,
    2*BLAZEJ_RADIUS*frame.shadowScale,16*frame.shadowScale);
   if(frame.complete){
    actor.sprite.setPosition(actor.x,actor.y);
    jump=null;landing=null;impactPoint={x:actor.x,y:actor.y};shockwaveMs=210;
    jumpCount++;landings++;
    // One event only, at landing; the ring never inflicts repeated damage.
    if(Math.hypot(scene.player.x-actor.x,scene.player.y-actor.y)<=
        BLAZEJ_SHOCKWAVE_RADIUS+PLAYER_RADIUS&&
       !firstFootprintHit(actor,scene.player,scene.obstacles,0))hurtPlayer(now);
   }
  }
  if(isBurning(ignition,now))burningFx?.update(actor,now);
  drawHealth();
 }
 function destroy(){
  if(disposed)return;disposed=true;active=false;presentation.dispose();
  clearAttacks();clearIgnition(ignition);burningFx?.destroy();burningFx=null;
  destroyBursts(bursts);graphics.destroy();jumpShadow.destroy();health.destroy();label.destroy();
  if(actor.sprite?.active)actor.sprite.destroy();
 }
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,destroy);
 return {actor,renderer,activate,damage,ignite,update,updateVfx,clearAttacks,destroy,
  get target(){return active&&!defeated?actor:null;},get active(){return active;},
  get defeated(){return defeated;},get projectiles(){return projectiles;},
  get attack(){return attack;},get kind(){return kind;},get warningTarget(){return landing;},
  get volleys(){return volleyCount;},get jumps(){return jumpCount;},
  get jumping(){return !!jump;},get jumpElapsed(){return jump?.elapsed??null;},
  get landings(){return landings;},get bursts(){return bursts;}};
}
