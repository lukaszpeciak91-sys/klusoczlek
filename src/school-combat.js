// Act IV adapter around the approved Act I encounter, movement, rendering and
// weapon contracts. No new enemy rules, damage tuning or combat director.
import {WAVES,WAVE_TIMING} from './episode.js';
import {SCHOOL_WAVE_COUNT,SCHOOL_WORLD} from './school-contract.js';
import {ENCOUNTER,applyEnemyHit,applyPlayerContact} from './bobrozombi.js';
import {PLAYER_RADIUS} from './movement.js';
import {ENEMY_TYPES,moveEnemy} from './enemy-types.js';
import {createDirector,directorPopulation,directorOpportunity,nextDirectorType,recordDirectorSpawn} from './encounter-director.js';
import {selectOrdinarySpawn} from './enemy-spawn.js';
import {createBobrozombiRenderer,createBocianolakRenderer,createZubrokryptydaRenderer} from './enemy-visual.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,clearIgnition,isBurning,fleeStep} from './enemy-panic.js';
import {createBurningFx} from './enemy-fire-vfx.js';
import {recordAttack,recordHit} from './combat-feedback.js';
import {createPixelBurst,updateBursts,destroyBursts} from './pixel-death-vfx.js';
import {createGameplayClock,advanceGameplayClock} from './gameplay-clock.js';
import {createFiringState,resetFiring,firingStep,COMBAT_TUNING,cooldownReady} from './weapon-combat.js';
import {createContinuousWeaponState,drawContinuousStream,emitContinuousParticle,updateContinuousParticles} from './continuous-weapon.js';
import {resolveAim,muzzlePoint} from './shooting.js';
import {availableWeapons} from './weapon-progression.js';
import {resolveObstaclePosition,steerObstacleStep,segmentObstacleHit} from './obstacles.js';
import {firstFootprintHit,reachableCells} from './obstacle-geometry.js';
import {enemyProjectileHit,enemyFlameVisible} from './enemy-damage.js';

export const SCHOOL_WAVES=Object.freeze(WAVES.slice(0,SCHOOL_WAVE_COUNT)
 .map((wave,i)=>Object.freeze({...wave,durationMs:WAVE_TIMING[i].durationMs})));
export const SCHOOL_COMBAT_MS=WAVE_TIMING[SCHOOL_WAVE_COUNT].startMs;
export function schoolWaveIndex(elapsedMs){
 let wave=0;
 for(let i=1;i<SCHOOL_WAVE_COUNT;i++)if(elapsedMs>=WAVE_TIMING[i].startMs)wave=i;
 return wave;
}
export function schoolCombatPhase(elapsedMs,ordinaryAlive){
 if(elapsedMs<SCHOOL_COMBAT_MS)return 'COMBAT';
 return ordinaryAlive>0?'CLEANUP':'BLAZEJ_PENDING';
}
export const schoolWeaponAllowed=(weapon,unlocked)=>availableWeapons(unlocked,'act4').includes(weapon);

export function createSchoolCombat(scene,Phaser){
 const enemies=[],projectiles=[],bursts=[],director=createDirector(104);
 const renderers={
  bobrozombi:createBobrozombiRenderer(scene,Phaser),
  bocianolak:createBocianolakRenderer(scene,Phaser),
  zubrokryptyda:createZubrokryptydaRenderer(scene,Phaser),
 };
 const navigation=reachableCells({width:SCHOOL_WORLD.width,height:SCHOOL_WORLD.height,
  cellSize:20,actorRadius:ENEMY_TYPES.zubrokryptyda.radius,
  origin:scene.player,obstacles:scene.obstacles});
 const clock=createGameplayClock(),firing=createFiringState(),fire=createContinuousWeaponState();
 const stream=scene.add.graphics().setDepth(12);
 const weaponCooldownUntil=new Map();
 let started=false,defeated=false,finished=false,phase='INTRO',phaseChanges=0,wave=0,totalSpawned=0,kills=0,invulnerableUntil=0;
 const PHASE_ORDER=Object.freeze({INTRO:0,COMBAT:1,CLEANUP:2,BLAZEJ_PENDING:3,DEFEAT:4});
 function transition(next){
  if(phase===next||phase==='DEFEAT'||PHASE_ORDER[next]<=PHASE_ORDER[phase])return false;
  phase=next;phaseChanges++;scene.schoolPhase=next;
  return true;
 }
 const obstacleBlocked=(from,to)=>Boolean(segmentObstacleHit(from,to,scene.obstacles,0));
 const living=()=>enemies.filter(e=>!e.dead&&e.hp>0);
 function start({wave4=false}={}){
  if(started||defeated||scene.introActive||scene.disposed)return false;
  started=true;transition('COMBAT');
  if(wave4)clock.elapsedMs=WAVE_TIMING[3].startMs;
  wave=schoolWaveIndex(clock.elapsedMs);
  director.nextMs=clock.elapsedMs;
  scene.waveText.setText('⚑ '+(wave+1)+'/'+SCHOOL_WAVE_COUNT);
  return true;
 }
 function suspend(){
  advanceGameplayClock(clock,0,false);
  stopFire();
 }
 function stopFire(){
  resetFiring(firing);
  fire.stop();
  stream.clear();
 }
 function clearCombat(){
  stopFire();
  for(const shot of projectiles)shot.object?.destroy();
  projectiles.length=0;
  for(const particle of fire.particles)particle.object?.destroy();
  fire.particles.length=0;fire.cooldowns.clear();
  for(const enemy of enemies){
   enemy.burningFx?.destroy();clearIgnition(enemy.ignition);
   if(enemy.sprite?.active)enemy.sprite.destroy();
  }
  enemies.length=0;
  destroyBursts(bursts);
  stream.clear();
 }
 function destroy(){
  clearCombat();stream.destroy();
  for(const renderer of Object.values(renderers))renderer.shutdown();
 }
 function spawnEnemy(){
  const population=living();
  if(population.length>=SCHOOL_WAVES[wave].maxAlive)return false;
  const heavy=population.some(e=>e.type==='zubrokryptyda');
  const type=nextDirectorType(director,wave,heavy?['zubrokryptyda']:[]);
  if(!type)return false;
  const radius=ENEMY_TYPES[type].radius,camera=scene.cameras.main;
  const scroll=camera.getScroll(scene.player.x,scene.player.y);
  const view={x:scroll.x,y:scroll.y,width:camera.width,height:camera.height};
  const occupied=population.map(e=>({x:e.x,y:e.y,radius:ENEMY_TYPES[e.type].radius}));
  const result=selectOrdinarySpawn({player:scene.player,obstacles:scene.obstacles,index:totalSpawned,
   radius,view,seed:104,navigation,occupied});
  if(!result.point)return false; // defer rather than overlap a solid footprint
  const point=result.point,index=totalSpawned++;
  const enemy={...point,type,seed:index,hp:ENEMY_TYPES[type].hp,waveIndex:wave,
   sprite:renderers[type].create(point.x,point.y),dead:false,hitUntil:0,facing:'s',
   ignition:createIgnitionState(),burningFx:null,fleeFacingVector:null};
  enemies.push(enemy);
  recordDirectorSpawn(director,wave,type);
  return true;
 }
 function kill(enemy){
  if(enemy.dead||enemy.hp>0)return false;
  enemy.dead=true;kills++;
  bursts.push(createPixelBurst(scene,enemy.type,enemy.x,enemy.y,enemy.seed));
  enemy.burningFx?.destroy();enemy.burningFx=null;
  clearIgnition(enemy.ignition);fire.cooldowns.delete(enemy);
  enemy.sprite.destroy();
  scene.killsText?.setText(String(kills));
  return true;
 }
 function hitEnemy(enemy,damage,source,now){
  if(enemy.dead||enemy.hp<=0)return false;
  const old=enemy.hp;enemy.hp=applyEnemyHit(enemy.hp,damage);
  if(old===enemy.hp)return false;
  if(enemy.hp===0)kill(enemy);
  else{
   recordHit(renderers[enemy.type].feedbackOf(enemy),now,source,enemy);
   enemy.hitUntil=now+120;enemy.sprite.setAlpha(.45);
  }
  return true;
 }
 function hurtPlayer(enemy,now){
  const result=applyPlayerContact({hp:scene.run.hp,invulnerableUntil},now);
  invulnerableUntil=result.invulnerableUntil;
  if(result.hp===scene.run.hp)return;
  recordAttack(renderers[enemy.type].feedbackOf(enemy),enemy.type,now,enemy,scene.player);
  scene.run.hp=result.hp;
  scene.hpFace.setHp(result.hp);
  scene.hpText.setText('HP '+result.hp+'/'+scene.run.maxHp);
  scene.playerVisual.hit(enemy);
  if(result.hp===0){
   defeated=true;transition('DEFEAT');
   // Reuse Arena's actual camera-space death coordinate and Menu burst.
   scene.captureSchoolDefeat();
   clearCombat();scene.syncControls();
   scene.openMenu();
  }
 }
 function spawnShot(aim,weapon,now){
  const tune=COMBAT_TUNING[weapon],origin=muzzlePoint(scene.player.x,scene.player.y,aim);
  const object=scene.add.circle(origin.x,origin.y,tune.radius,tune.color).setDepth(13);
  projectiles.push({object,vx:aim.x*tune.speed,vy:aim.y*tune.speed,
   radius:tune.radius,damage:tune.damage});
  if(weapon==='rifle')scene.playerVisual.recoil();
 }
 function updateShots(delta,now){
  const seconds=Math.min(50,delta)/1000;
  for(const shot of projectiles){
   const from={x:shot.object.x,y:shot.object.y};
   const to={x:from.x+shot.vx*seconds,y:from.y+shot.vy*seconds};
   const wall=firstFootprintHit(from,to,scene.obstacles,shot.radius);
   let victim=null;
   for(const enemy of enemies){
    if(enemy.dead||enemy.hp<=0)continue;
    const hit=enemyProjectileHit(from,to,enemy,shot.radius,renderers[enemy.type].damagePoseOf(enemy));
    if(hit&&(!victim||hit.t<victim.t))victim={enemy,t:hit.t};
   }
   if(victim&&(!wall||victim.t<wall.t))hitEnemy(victim.enemy,shot.damage,from,now);
   if(wall||victim||to.x<0||to.y<0||to.x>SCHOOL_WORLD.width||to.y>SCHOOL_WORLD.height){
    shot.done=true;shot.object.destroy();
   }else shot.object.setPosition(to.x,to.y);
  }
  for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].done)projectiles.splice(i,1);
 }
 function applyFlame(aim,now){
  const origin=muzzlePoint(scene.player.x,scene.player.y,aim),tune=COMBAT_TUNING.flamethrower;
  drawContinuousStream(stream,origin,aim,now,'flamethrower',obstacleBlocked);
  emitContinuousParticle(scene,fire,origin,aim,now,'flamethrower',obstacleBlocked);
  for(const enemy of enemies){
   if(enemy.dead||enemy.hp<=0||
     !enemyFlameVisible(origin,aim,enemy,scene.obstacles,renderers[enemy.type].damagePoseOf(enemy)))continue;
   if(!cooldownReady(fire.cooldowns,enemy,now,tune.damageInterval))continue;
   if(hitEnemy(enemy,tune.damage,origin,now)&&!enemy.dead){
    if(igniteEnemy(enemy.ignition,enemy.type,now)){
     enemy.burningFx?.destroy();enemy.burningFx=createBurningFx(scene,enemy.type);
    }
   }
  }
 }
 function updateEnemies(delta,now){
  const seconds=Math.min(50,delta)/1000;
  for(const enemy of enemies){
   if(enemy.dead||enemy.hp<=0)continue;
   const from={x:enemy.x,y:enemy.y};
   if(advanceIgnition(enemy.ignition,now)){enemy.burningFx?.destroy();enemy.burningFx=null;}
   const burning=isBurning(enemy.ignition,now);
   const desired=burning?fleeStep(enemy,scene.player,seconds):
    moveEnemy(enemy,scene.player,seconds,now/1000);
   const next=burning?resolveObstaclePosition(enemy,desired,ENEMY_TYPES[enemy.type].radius,scene.obstacles):
    steerObstacleStep(enemy,desired,scene.player,ENEMY_TYPES[enemy.type].radius,scene.obstacles);
   enemy.x=next.x;enemy.y=next.y;
   const distance=Math.hypot(enemy.x-from.x,enemy.y-from.y);
   enemy.fleeFacingVector=burning?{x:enemy.x-from.x,y:enemy.y-from.y}:null;
   renderers[enemy.type].update(enemy,scene.player,distance,seconds);
   if(burning)enemy.burningFx?.update(enemy,now);
   if(now>=enemy.hitUntil)enemy.sprite.setAlpha(1);
   if(Math.hypot(enemy.x-scene.player.x,enemy.y-scene.player.y)<=ENEMY_TYPES[enemy.type].radius+PLAYER_RADIUS){
    hurtPlayer(enemy,now);if(defeated)return;
   }
  }
  for(let i=enemies.length-1;i>=0;i--)if(enemies[i].dead)enemies.splice(i,1);
 }
 function update(delta,now=performance.now(),aimInput={x:0,y:0},held=false){
  if(!started||defeated||scene.introActive||scene.disposed)return;
  const elapsed=advanceGameplayClock(clock,now,true);
  wave=schoolWaveIndex(elapsed);
  if(phase==='COMBAT'&&elapsed>=SCHOOL_COMBAT_MS)transition('CLEANUP');
  if(phase==='COMBAT'){
   const view=scene.cameras.main.worldView;
   const population=directorPopulation(enemies,{x:view.x,y:view.y,width:view.width,height:view.height},scene.player);
   const due=directorOpportunity(director,{elapsedMs:elapsed,wave,population});
   if(due.spawn)spawnEnemy();
  }
  scene.waveText.setText('⚑ '+(wave+1)+'/'+SCHOOL_WAVE_COUNT);
  const weapon=schoolWeaponAllowed(scene.weapon,scene.run.unlockedWeapons)?scene.weapon:null;
  const aim=resolveAim(aimInput.x,aimInput.y);
  const firingHeld=Boolean(weapon&&held&&(aim.x||aim.y));
  const cooldown=now<(weaponCooldownUntil.get(weapon)??0);
  const count=cooldown?0:firingStep(firing,weapon,firingHeld,now);
  if(count&&weapon==='blunderbuss')weaponCooldownUntil.set(weapon,now+COMBAT_TUNING.blunderbuss.interval);
  if(count&&weapon==='rifle')weaponCooldownUntil.set(weapon,now+
   (firing.burstShots===0?COMBAT_TUNING.rifle.burstPause:COMBAT_TUNING.rifle.shotInterval));
  for(let i=0;i<count;i++)spawnShot(aim,weapon,now);
  const flame=weapon==='flamethrower'&&fire.step(firingHeld,delta);
  if(flame)applyFlame(aim,now);else{
   if(weapon!=='flamethrower')fire.step(false,delta);
   stream.clear();
  }
  updateContinuousParticles(fire,Math.min(50,delta),obstacleBlocked);
  updateShots(delta,now);
  updateEnemies(delta,now);
  updateBursts(bursts,delta);
  if(defeated)return;
  if(phase==='CLEANUP'&&living().length===0&&!finished){
   finished=true;transition('BLAZEJ_PENDING');
   scene.objectiveText?.setVisible(true);
   stopFire();
  }
  if(scene.pressureBar){
   const bar=scene.pressureBar,l=scene.hudLayout;
   bar.clear();
   if(weapon==='flamethrower'&&l){
    const x=l.switchX-l.switchSize/2,y=l.switchY+l.switchSize/2+5,w=l.switchSize;
    bar.fillStyle(0x382721,.95).fillRect(x,y,w,4);
    bar.fillStyle(fire.pressure.value<20?0x9b3932:0xee903a).fillRect(x,y,w*fire.pressure.value/100,4);
   }
  }
 }
 // Controlled QA fixture is unavailable in normal runs and has no UI actions.
 // It changes only elapsed active-play time; all transitions still run via update().
 const qa=scene.run.isDebugRun?Object.freeze({
  setElapsedMs(value){
   if(!started||defeated||!Number.isFinite(value)||value<clock.elapsedMs||value>SCHOOL_COMBAT_MS)return false;
   clock.elapsedMs=value;clock.lastNow=null;return true;
  },
  damage(enemy,amount=1){
   if(!started||defeated||!enemies.includes(enemy)||!Number.isFinite(amount)||amount<=0)return false;
   return hitEnemy(enemy,amount,scene.player,scene.time.now);
  }
 }):null;
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,destroy);
 return {start,update,suspend,stopFire,qa,get enemies(){return enemies;},
  get started(){return started;},get state(){return phase;},get wave(){return wave;},
  get elapsedMs(){return clock.elapsedMs;},get kills(){return kills;},get phaseChanges(){return phaseChanges;},get totalSpawned(){return totalSpawned;},
  get pressure(){return fire.pressure;},get projectiles(){return projectiles;}};
}
