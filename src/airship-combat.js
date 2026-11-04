import {clampToDeck,insideDeck,AIRSHIP_WORLD} from './airship-contract.js';
import {ENEMY_TYPES,moveEnemy} from './enemy-types.js';
import {applyEnemyHit,applyPlayerContact,ENCOUNTER} from './bobrozombi.js';
import {enemyProjectileHit,enemyFlameVisible} from './enemy-damage.js';
import {COMBAT_TUNING,createFiringState,resetFiring,firingStep,cooldownReady} from './weapon-combat.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,isBurning,fleeStep} from './enemy-panic.js';
import {createPixelBurst,updateBursts,destroyBursts} from './pixel-death-vfx.js';
import {recordHit,recordAttack} from './combat-feedback.js';
import {muzzlePoint} from './shooting.js';

// Airship-owned combat adapter: existing tuning, hit detection, enemy renderers
// and death feedback; no Act I director, wave or boss state is copied.
export function createAirshipCombat(scene,delivery){
 const bullets=[],flameCooldowns=new Map(),flameParticles=[],bursts=[];
 const firing=createFiringState(),pressure=createPressure(),weaponCooldownUntil=new Map();
 const stream=scene.add.graphics().setDepth(12);
 let flameEmissionAt=null,stopped=false;
 function stopFire(){resetFiring(firing,scene.weapon);cancelPressureTrigger(pressure);stream.clear();}
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
 function flame(aim,now,dt){
  const tune=COMBAT_TUNING.flamethrower,origin=muzzlePoint(scene.player.x,scene.player.y,aim);
  stream.clear();
  stream.fillStyle(0xe7441b,0.65).fillTriangle(origin.x,origin.y,
   origin.x+Math.cos(Math.atan2(aim.y,aim.x)-tune.halfAngle)*tune.range,
   origin.y+Math.sin(Math.atan2(aim.y,aim.x)-tune.halfAngle)*tune.range,
   origin.x+Math.cos(Math.atan2(aim.y,aim.x)+tune.halfAngle)*tune.range,
   origin.y+Math.sin(Math.atan2(aim.y,aim.x)+tune.halfAngle)*tune.range);
  stream.fillStyle(0xffb35c,0.66).fillCircle(origin.x+aim.x*24,origin.y+aim.y*24,8);
  if(flameEmissionAt===null||now-flameEmissionAt>=tune.particleInterval){
   flameEmissionAt=now;
   if(flameParticles.length<tune.maxParticles){
    const object=scene.add.circle(origin.x+aim.x*7,origin.y+aim.y*7,4,0xffa544,0.72).setDepth(13);
    flameParticles.push({object,vx:aim.x*225,vy:aim.y*225,age:0,life:260});
   }
  }
  for(const enemy of delivery.groundEnemies){
   if(enemy.dead||now<enemy.activationAt||!enemyFlameVisible(origin,aim,enemy,[],delivery.renderers[enemy.type].damagePoseOf(enemy)))continue;
   if(!cooldownReady(flameCooldowns,enemy,now,tune.damageInterval))continue;
   if(damage(enemy,tune.damage,origin,now)&&!enemy.dead){
    enemy.ignition??=createIgnitionState();
    igniteEnemy(enemy.ignition,enemy.type,now);
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
  if(activeFlame)flame(aim,now,dt);
  else stream.clear();
  for(const particle of flameParticles){
   particle.age+=dt;particle.object.x+=particle.vx*seconds;particle.object.y+=particle.vy*seconds;
   if(particle.age>=particle.life)particle.object.destroy();
   else particle.object.setAlpha(.7*(1-particle.age/particle.life));
  }
  for(let i=flameParticles.length-1;i>=0;i--)if(!flameParticles[i].object.active)flameParticles.splice(i,1);
  for(const shot of bullets){
   const old={x:shot.object.x,y:shot.object.y};
   const next={x:old.x+shot.vx*seconds,y:old.y+shot.vy*seconds};
   let hit=null;
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
    if(enemy.ignition)advanceIgnition(enemy.ignition,now);
    const burning=enemy.ignition&&isBurning(enemy.ignition,now);
    const next=burning?fleeStep(enemy,scene.player,seconds):moveEnemy(enemy,scene.player,seconds,now/1000);
    const position=clampToDeck(next,ENEMY_TYPES[enemy.type].radius+8);
    enemy.x=position.x;enemy.y=position.y;
    if(burning)enemy.fleeFacingVector={x:enemy.x-previous.x,y:enemy.y-previous.y};
    else enemy.fleeFacingVector=null;
   }
   const traveled=Math.hypot(enemy.x-previous.x,enemy.y-previous.y);
   delivery.renderers[enemy.type].update(enemy,scene.player,traveled,seconds);
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
   enemy.dead=true;enemy.sprite?.destroy();
  }
 }
 function cleanup(){stop();destroyBursts(bursts);stream.destroy();}
 return {update,stop,cleanup,damage,stopFire,pressure,bursts,get bulletCount(){return bullets.length;}};
}
