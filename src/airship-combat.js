import {clampToDeck,insideDeck,AIRSHIP_WORLD,avoidWheelhouse,WHEELHOUSE_FOOTPRINT,wheelhouseSegmentHit} from './airship-contract.js';
import {ENEMY_TYPES,moveEnemy} from './enemy-types.js';
import {retroAudio} from './retro-audio.js';
import {applyEnemyHit,applyPlayerContact,ENCOUNTER} from './bobrozombi.js';
import {enemyProjectileHit,enemyFlameVisible} from './enemy-damage.js';
import {COMBAT_TUNING,createFiringState,resetFiring,firingStep,cooldownReady} from './weapon-combat.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,isBurning,fleeStep} from './enemy-panic.js';
import {createPixelBurst,updateBursts,destroyBursts} from './pixel-death-vfx.js';
import {createBurningFx} from './enemy-fire-vfx.js';
import {recordHit,recordAttack} from './combat-feedback.js';
import {muzzlePoint} from './shooting.js';
import {drawContinuousStream,emitContinuousParticle} from './continuous-weapon.js';

// Airship-owned combat adapter: existing tuning, hit detection, enemy renderers
// and death feedback; no Act I director, wave or boss state is copied.
export function createAirshipCombat(scene,delivery){
 const bullets=[],flameCooldowns=new Map(),flameParticles=[],bursts=[];
 const firing=createFiringState(),pressure=createPressure(),weaponCooldownUntil=new Map();
 const stream=scene.add.graphics().setDepth(12);
 let flameEmissionAt=null,stopped=false;
 function stopFire(){
  resetFiring(firing,scene.weapon);
  if(scene.weapon==='flamethrower')cancelPressureTrigger(pressure);
  else {pressure.wasHeld=false;pressure.active=false;pressure.locked=false;}
  stream.clear();
 }
 function damage(enemy,amount,source,now){
  if(stopped||enemy.dead||enemy.hp<=0)return false;
  const before=enemy.hp;
  enemy.hp=applyEnemyHit(enemy.hp,amount);
  if(enemy.hp===before)return false;
  if(enemy.hp>0){
   recordHit(delivery.renderers[enemy.type].feedbackOf(enemy),now,source,enemy);
   enemy.hitUntil=now+140;
  }else{
   enemy.dead=true;enemy.hp=0;
   enemy.burningFx?.destroy();enemy.burningFx=null;
   enemy.sprite?.destroy();
   bursts.push(createPixelBurst(scene,enemy.type,enemy.x,enemy.y,enemy.seed));
   flameCooldowns.delete(enemy);
   scene.defense.kills++;
  }
  return true;
 }
 function spawnShot(aim,weapon,now){
  const tune=COMBAT_TUNING[weapon],origin=muzzlePoint(scene.player.x,scene.player.y,aim);
  const object=scene.add.circle(origin.x,origin.y,tune.radius,tune.color).setDepth(13);
  bullets.push({object,vx:aim.x*tune.speed,vy:aim.y*tune.speed,radius:tune.radius,damage:tune.damage});
  if(weapon==='rifle')scene.playerVisual.recoil();
 }
 function flame(aim,now){
   const tune=COMBAT_TUNING.flamethrower,origin=muzzlePoint(scene.player.x,scene.player.y,aim);
   const blocked=(a,b)=>Boolean(scene.wheelhouse?.visible&&wheelhouseSegmentHit(a,b));
   drawContinuousStream(stream,origin,aim,now,'flamethrower',blocked);
   const emission={particles:flameParticles,emissionAt:flameEmissionAt};
   emitContinuousParticle(scene,emission,origin,aim,now,'flamethrower',blocked);
   flameEmissionAt=emission.emissionAt;
  for(const enemy of delivery.groundEnemies){
   if(enemy.dead||now<enemy.activationAt||
      (scene.wheelhouse?.visible&&wheelhouseSegmentHit(origin,enemy))||
      !enemyFlameVisible(origin,aim,enemy,[],delivery.renderers[enemy.type].damagePoseOf(enemy)))continue;
   if(!cooldownReady(flameCooldowns,enemy,now,tune.damageInterval))continue;
   if(damage(enemy,tune.damage,origin,now)&&!enemy.dead){
    enemy.ignition??=createIgnitionState();
    if(igniteEnemy(enemy.ignition,enemy.type,now))enemy.burningFx=createBurningFx(scene,enemy.type);
   }
  }
 }
 function update(aim,held,dt,now){
  if(stopped)return;
  updateBursts(bursts,dt);
  const seconds=Math.min(50,dt)/1000;
  const cooling=now<(weaponCooldownUntil.get(scene.weapon)??0);
  const count=cooling?0:firingStep(firing,scene.weapon,Boolean(held&&scene.weapon),now);
  if(count&&!cooling&&scene.weapon!=='flamethrower'){
   spawnShot(aim,scene.weapon,now);
   const tune=COMBAT_TUNING[scene.weapon];
   weaponCooldownUntil.set(scene.weapon,now+(scene.weapon==='rifle'
     ?firing.burstShots===0?tune.burstPause:tune.shotInterval:tune.interval));
  }
  const activeFlame=scene.weapon==='flamethrower'&&stepPressure(pressure,held,dt);
  if(activeFlame)flame(aim,now);
  else stream.clear();
  for(const particle of flameParticles){
   particle.age+=dt;particle.object.x+=particle.vx*seconds;particle.object.y+=particle.vy*seconds;
   if(particle.age>=particle.life)particle.object.destroy();
   else particle.object.setAlpha(.82*(1-particle.age/particle.life));
  }
  for(let i=flameParticles.length-1;i>=0;i--)if(!flameParticles[i].object.active)flameParticles.splice(i,1);
  for(const shot of bullets){
   const old={x:shot.object.x,y:shot.object.y};
   const next={x:old.x+shot.vx*seconds,y:old.y+shot.vy*seconds};
   let hit=null;
   if(scene.wheelhouse?.visible&&wheelhouseSegmentHit(old,next,shot.radius)){
    shot.object.destroy();continue;
   }
   for(const enemy of delivery.groundEnemies){
    if(enemy.dead||enemy.hp<=0||now<enemy.activationAt)continue;
    const collision=enemyProjectileHit(old,next,enemy,shot.radius,delivery.renderers[enemy.type].damagePoseOf(enemy));
    if(collision&&(!hit||collision.t<hit.t))hit={enemy,t:collision.t};
   }
   shot.object.setPosition(next.x,next.y);
   if(hit){damage(hit.enemy,shot.damage,old,now);shot.object.destroy();}
   else if(!insideDeck(next,0))shot.object.destroy();
  }
  for(let i=bullets.length-1;i>=0;i--)if(!bullets[i].object.active)bullets.splice(i,1);
  for(const enemy of delivery.groundEnemies){
   if(enemy.dead||!enemy.sprite.active)continue;
   const previous={x:enemy.x,y:enemy.y};
   if(now>=enemy.activationAt){
    if(enemy.ignition&&advanceIgnition(enemy.ignition,now)){enemy.burningFx?.destroy();enemy.burningFx=null;}
    const burning=enemy.ignition&&isBurning(enemy.ignition,now);
    const next=burning?fleeStep(enemy,scene.player,seconds):moveEnemy(enemy,scene.player,seconds,now/1000);
    let position=clampToDeck(next,ENEMY_TYPES[enemy.type].radius+8);
    if(scene.wheelhouse?.visible){
     const radius=ENEMY_TYPES[enemy.type].radius+8;
     const clear=avoidWheelhouse(position,radius);
     if(Math.hypot(clear.x-position.x,clear.y-position.y)>0.01){
      const side=enemy.x<WHEELHOUSE_FOOTPRINT.x?-1:
        enemy.x>WHEELHOUSE_FOOTPRINT.x?1:(enemy.seed%2?-1:1);
      const step=Math.max(1,Math.hypot(next.x-enemy.x,next.y-enemy.y));
      position=clampToDeck(avoidWheelhouse({
        x:enemy.x+side*step,y:enemy.y+(next.y-enemy.y)*.2
      },radius),radius);
     }
    }
    enemy.x=position.x;enemy.y=position.y;
    if(burning)enemy.fleeFacingVector={x:enemy.x-previous.x,y:enemy.y-previous.y};
    else enemy.fleeFacingVector=null;
   }
   const traveled=Math.hypot(enemy.x-previous.x,enemy.y-previous.y);
   delivery.renderers[enemy.type].update(enemy,scene.player,traveled,seconds);
   enemy.burningFx?.update(enemy,now);
   if(enemy.hitUntil<now)enemy.sprite.setAlpha(1);
   if(now<enemy.activationAt)continue;
   if(Math.hypot(enemy.x-scene.player.x,enemy.y-scene.player.y)<=ENEMY_TYPES[enemy.type].radius+17){
    const result=applyPlayerContact({hp:scene.playerHp,invulnerableUntil:scene.invulnerableUntil},now);
    if(result.hp<scene.playerHp){
     recordAttack(delivery.renderers[enemy.type].feedbackOf(enemy),enemy.type,now,enemy,scene.player);
     scene.applyDamage(result.hp,enemy);
    }
    scene.invulnerableUntil=result.invulnerableUntil;
    if(scene.defense.ended)return;
   }
  }
 }
 function stop({neutralize=false}={}){
  if(stopped)return;stopped=true;stopFire();
  for(const shot of bullets)shot.object.destroy();bullets.length=0;
  for(const particle of flameParticles)particle.object.destroy();flameParticles.length=0;
  if(neutralize)for(const enemy of delivery.groundEnemies)if(!enemy.dead){
   bursts.push(createPixelBurst(scene,enemy.type,enemy.x,enemy.y,enemy.seed));
   enemy.dead=true;enemy.burningFx?.destroy();enemy.burningFx=null;enemy.sprite?.destroy();
  }
 }
 function cleanup(){stop();for(const enemy of delivery.groundEnemies){enemy.burningFx?.destroy();enemy.burningFx=null;}destroyBursts(bursts);stream.destroy();}
 return {update,stop,cleanup,damage,stopFire,pressure,bursts,get bulletCount(){return bullets.length;}};
}
