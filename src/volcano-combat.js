import {createBarkState,makeMonsterBark,showMonsterBark,syncMonsterBark,WATER_BARKS,clearBark} from './monster-bark.js';
import {createPixelBurst} from './pixel-death-vfx.js';
import {bogdanCombatHit,bogdanConeTarget} from './volcano-bogdan.js';
import {applyEnemyHit,applyPlayerContact} from './bobrozombi.js';
import {inFlameCone,cooldownReady,COMBAT_TUNING,createFiringState,firingStep,resetFiring} from './weapon-combat.js';
import {facingOf,playerFrame} from './combat-contract.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';
import {volcanoStep,volcanoFootprintAllowed} from './volcano-contract.js';
import {VOLCANO_ZONES,findZoneSpawn,createPlatformProgression,zoneForPosition,approachEngagementDue} from './volcano-platforms.js';
import {BOBROZOMBI_ASSET,BOBROZOMBI_VISUAL_SCALE} from './enemy-visual.js';
import {muzzlePoint} from './shooting.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,isBurning} from './enemy-panic.js';
import {createContinuousWeaponState,continuousDamageAllowed,drawContinuousStream,emitContinuousParticle,updateContinuousParticles} from './continuous-weapon.js';

export const LAVA_TYPES=Object.freeze({
 'lawostworek-1':Object.freeze({hp:3,speed:115,radius:21,frame:96,width:768,height:96,color:0xffa51f}),
 'lawostworek-2':Object.freeze({hp:6,speed:48,radius:25,frame:128,width:1024,height:128,color:0xe0441b})
});
export const lawosContactProtected=(now,safeUntil)=>now<safeUntil;
export const LAVA_BARKS=Object.freeze(['I co mi zrobisz?!','Ale groźny!','HA! HA! HA!']);
export const LAVA_INEFFECTIVE_BARKS=Object.freeze(['Łaskocze!','Spróbuj wodą, geniuszu!']);
export function ordinaryLavaBarkDue(enemy,now,dialogueActive,visibleBarks=0){
 return !enemy.dead&&!dialogueActive&&visibleBarks===0&&now>=(enemy.ordinaryBarkAt??Infinity);
}
export function lavaDamage(weapon,amount){return continuousDamageAllowed(weapon,'lawostworek-1')?amount:0;}
export function createLavaEnemy(type,x,y,index=0){
 const def=LAVA_TYPES[type];return {type,x,y,hp:def.hp,dead:false,radius:def.radius,index,hitAt:-Infinity,barkAt:-Infinity,barkState:createBarkState(),contactAt:-Infinity,ordinaryBarkAt:4000+index*1350,ignition:createIgnitionState(),lungeAt:0,headingAt:0,headingOffset:0};
}
export function lavaEnemyStep(enemy,player,dt,now=0,mask=null){
 const def=LAVA_TYPES[enemy.type],fleeing=isBurning(enemy.ignition,now);
 const dx=(player.x-enemy.x)*(fleeing?-1:1),dy=(player.y-enemy.y)*(fleeing?-1:1),d=Math.hypot(dx,dy);
 if(!fleeing&&d<enemy.radius+18)return {x:enemy.x,y:enemy.y};
 if(d<.001)return {x:enemy.x,y:enemy.y};
 const elapsed=Math.max(0,Math.min(50,dt));
 let vx=dx/d,vy=dy/d,speed=def.speed*(fleeing?1.45:1);
 if(enemy.type==='lawostworek-1'&&!fleeing){
  // Change heading at discrete intervals, never every animation frame.
  if(now>=enemy.headingAt){
   enemy.headingAt=now+650+(enemy.index%3)*130;
   enemy.headingOffset=Math.sin(now*.003+enemy.index*7)*.19;
  }
  const turn=enemy.headingOffset??0;
  [vx,vy]=[vx*Math.cos(turn)-vy*Math.sin(turn),vx*Math.sin(turn)+vy*Math.cos(turn)];
  if(now>=enemy.lungeAt){
   enemy.lungeAt=now+2800+(enemy.index%4)*330;
   enemy.lungeUntil=now+180;
  }
  if(now<(enemy.lungeUntil??0))speed*=1.38;
 }
 return volcanoStep(enemy,{x:vx,y:vy},elapsed,speed,enemy.radius,mask);
}
export function createVolcanoCombat(scene){
 const enemies=[],shots=[],deathBursts=[],waterState=createContinuousWeaponState(),fireState=createContinuousWeaponState(),stream=scene.add.graphics().setDepth(13);
 const pressure=waterState.pressure,waterCooldowns=waterState.cooldowns;
 let active=false;
 const progression=createPlatformProgression();
 const firing=createFiringState(),firePressure=fireState.pressure,flameCooldowns=fireState.cooldowns;
 const sprites={};
 const preparedZones=new Set();
 // Match Act I Bobrozombi's 96px frame at its approved 0.75 visual scale.
 const visualSizes={'lawostworek-1':72,'lawostworek-2':84};
 const enemyDisplaySize=type=>visualSizes[type];
 // Measure occupied alpha pixels in each approved sheet, not transparent margins.
 const visibleHeight=(image,frame)=>{
  const canvas=document.createElement('canvas');canvas.width=frame;canvas.height=frame;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return frame;
  ctx.drawImage(image,2*frame,0,frame,frame,0,0,frame,frame);
  const rgba=ctx.getImageData(0,0,frame,frame).data;let top=frame,bottom=-1;
  for(let y=0;y<frame;y++)for(let x=0;x<frame;x++)if(rgba[(y*frame+x)*4+3]>=32){top=Math.min(top,y);bottom=Math.max(bottom,y);}
  return bottom<top?frame:bottom-top+1;
 };
 for(const type of Object.keys(LAVA_TYPES)){
  const def=LAVA_TYPES[type],key='volcano-'+type;
  const g=scene.make.graphics({x:0,y:0});
  g.fillStyle(def.color).fillEllipse(def.frame/2,def.frame*.62,def.radius*2.2,def.radius*2);
  g.fillStyle(0xfff1a0).fillCircle(def.frame/2,def.frame*.42,def.radius*.7);
  g.generateTexture(key,def.frame,def.frame);g.destroy();
  sprites[type]=key;
  // Missing assets never block the encounter. A valid sheet replaces the fallback.
  void (async()=>{
   try{
    const response=await fetch(import.meta.env.BASE_URL+'assets/enemies/'+type+'.png');
    if(!response.ok)throw Error('HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const n=i=>((bytes[i]*16777216)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
    if(bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
      n(16)!==def.width||n(20)!==def.height||bytes[24]!==8||bytes[25]!==6)throw Error('invalid sheet contract');
    const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{
     const img=new Image();await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail;img.src=url;});
     if(!scene.sys.isActive())return;
     if(!scene.textures.exists(type))scene.textures.addSpriteSheet(type,img,{frameWidth:def.frame,frameHeight:def.frame});
     sprites[type]=type;
     visualSizes[type]=Math.min(def.frame*1.7,Math.max(def.frame*.65,(type==='lawostworek-1'?70:81)*def.frame/visibleHeight(img,def.frame)));
     for(const e of enemies)if(e.type===type&&!e.dead){e.sprite.setTexture(type,playerFrame(e.facing??'s'));e.sprite.setDisplaySize(enemyDisplaySize(type),enemyDisplaySize(type));}
    }finally{URL.revokeObjectURL(url);}
   }catch(error){console.warn('[Volcano] enemy placeholder '+type+': '+error.message);}
  })();
 }
 function prepareZones(){
  if(!scene.walkability)return false;
  for(const zone of VOLCANO_ZONES){
   if(preparedZones.has(zone.id))continue;
   preparedZones.add(zone.id);
   for(const [i,type] of zone.enemies.entries()){
    const def=LAVA_TYPES[type],preferred=zone.spawns[i];
    const avoid=[{x:scene.player.x,y:scene.player.y,radius:110},
     ...enemies.filter(e=>!e.dead).map(e=>({x:e.x,y:e.y,radius:e.radius}))];
    // Keep the entrance pre-stage on the higher platform, never near the start.
     const point=findZoneSpawn(scene.walkability,zone,preferred,def.radius,avoid,
      zone.id==='entrance'?65:zone.id==='apartment-approach'?80:zone.id==='fairy'?260:125);
    if(!point){console.warn('[Volcano] pre-stage invalid '+zone.id+' '+i);continue;}
    const enemy=createLavaEnemy(type,point.x,point.y,VOLCANO_ZONES.indexOf(zone)*10+i);
    enemy.zoneId=zone.id;enemy.engaged=false;
    enemy.sprite=scene.add.sprite(point.x,point.y,sprites[type],sprites[type]===type?2:0).setDepth(12);
    enemy.sprite.setDisplaySize(enemyDisplaySize(type),enemyDisplaySize(type));
    enemy.facing='s';enemy.bark=makeMonsterBark(scene,point.x,point.y-65);
    enemies.push(enemy);
   }
  }
  return true;
 }
 function activateZone(id){
  if(!scene.walkability)return false;
  prepareZones();
  return progression.activate(id,(zone,type,i)=>{
   const enemy=enemies.find(e=>e.zoneId===id&&e.index===VOLCANO_ZONES.indexOf(zone)*10+i&&!e.dead);
   if(!enemy)return false;
   enemy.engaged=true;
   enemy.ordinaryBarkAt=scene.time.now+3500+(i*1300);
   return true;
  });
 }
 function spawnEscapeEnemy(point,type='lawostworek-1'){
  if(!active||!scene.walkability||!point)return false;
  const def=LAVA_TYPES[type],living=enemies.filter(e=>!e.dead).length;
  if(living>=6||!volcanoFootprintAllowed(scene.walkability,point.x,point.y,def.radius))return false;
  if(Math.hypot(point.x-scene.player.x,point.y-scene.player.y)<105)return false;
  const enemy=createLavaEnemy(type,point.x,point.y,100+enemies.length);
  enemy.zoneId=null;enemy.engaged=true;
  enemy.sprite=scene.add.sprite(point.x,point.y,sprites[type],sprites[type]===type?2:0).setDepth(12);
  enemy.sprite.setDisplaySize(enemyDisplaySize(type),enemyDisplaySize(type));
  enemy.facing='s';
  enemy.bark=makeMonsterBark(scene,point.x,point.y-65);
  enemies.push(enemy);return true;
 }
 function clearTransientShots(){stopFire();}
 function clearEscapeEnemies(){
  for(const enemy of enemies)if(enemy.zoneId===null&&!enemy.dead){enemy.dead=true;enemy.sprite.destroy();enemy.bark.destroy();}
 }
 function hit(enemy,weapon,amount,now){
  if(enemy.dead)return;
  const damage=lavaDamage(weapon,amount);
  if(!damage){
   if(!scene.dialogueState.id)showMonsterBark(enemy.bark,enemy.barkState,LAVA_INEFFECTIVE_BARKS,now);
   return;
  }
  if(weapon==='water-flamethrower'&&!scene.dialogueState.id)showMonsterBark(enemy.bark,enemy.barkState,WATER_BARKS,now);
  if(weapon==='water-flamethrower')igniteEnemy(enemy.ignition,enemy.type,now);
  enemy.hp=applyEnemyHit(enemy.hp,damage);
  if(enemy.hp<=0){
   enemy.dead=true;enemy.bark.destroy();
   if(enemy.zoneId)progression.defeated(enemy.zoneId);
   enemy.sprite.setTint(0x26272b);
   deathBursts.push(createPixelBurst(scene,enemy.type==='lawostworek-2'?'lawostworek-2':'lawostworek-1',enemy.x,enemy.y,enemy.index+137,{extinguish:true}));
   scene.tweens.add({targets:enemy.sprite,alpha:0,duration:170,onComplete:()=>enemy.sprite.destroy()});
  }else{
   enemy.sprite.setTint(0x26272b);
   scene.time.delayedCall(145,()=>{if(enemy.sprite.active&&!enemy.dead)enemy.sprite.clearTint();});
  }
 }
 function stopFire(){waterState.stop();fireState.stop();resetFiring(firing);stream.clear();for(const state of [waterState,fireState]){for(const p of state.particles)p.object.destroy();state.particles.length=0;state.emissionAt=null;}for(const shot of shots)shot.sprite.destroy();shots.length=0;}
 function start(){if(active)return;active=true;activateZone('entrance');}
 function update(dt,now,aim,held,weapon){
  if(!active||scene.defeated||scene.run.hp<=0||scene.dialogueState.id){stopFire();return;}
  const zoneId=zoneForPosition(scene.player);
  if(scene.finale?.state!=='ESCAPE_ACTIVE'&&zoneId&&zoneId!=='entrance'&&zoneId!=='apartment-approach')activateZone(zoneId);
   // The overlapping middle/approach bounds are not activation gates: real
   // pre-staged actors wake ahead of Aloes before the apartment cinematic.
   if(scene.finale?.state==='BOGDAN_ACTIVE'&&scene.lawosComplete&&!scene.apartmentPending&&
      !scene.boss?.argumentStarted&&approachEngagementDue(scene.player,enemies.filter(e=>e.zoneId==='apartment-approach')))
    activateZone('apartment-approach');
  const sec=Math.min(50,dt)/1000;
  const openingSafe=lawosContactProtected(now,scene.openingSafeUntil??0);
  const water=weapon==='water-flamethrower',fire=weapon==='flamethrower';
  const flowing=water&&waterState.step(held,dt);
  const flaming=fire&&fireState.step(held,dt);
  if(!water)waterState.step(false,dt);
  if(!fire)fireState.step(false,dt);
  stream.clear();
  if((flowing||flaming)&&Math.hypot(aim.x,aim.y)>.5){
   const origin=muzzlePoint(scene.player.x,scene.player.y,aim);
   const tune=COMBAT_TUNING.flamethrower;
   const state=water?waterState:fireState;
   drawContinuousStream(stream,origin,aim,now,weapon);
   emitContinuousParticle(scene,state,origin,aim,now,weapon);
   for(const enemy of enemies)if(!enemy.dead&&enemy.engaged!==false&&inFlameCone(origin,aim,enemy,tune.range,tune.halfAngle,enemy.radius)&&cooldownReady(water?waterCooldowns:flameCooldowns,enemy,now,tune.damageInterval))hit(enemy,weapon,tune.damage,now);
   const boss=scene.boss;
   if(boss?.active&&boss.bogdan&&inFlameCone(origin,aim,bogdanConeTarget(boss.bogdan),tune.range,tune.halfAngle,boss.bogdan.displayWidth*.38)&&cooldownReady(water?waterCooldowns:flameCooldowns,boss.bogdan,now,tune.damageInterval))boss.damage(tune.damage,now);
  }
  for(const burst of deathBursts)burst.update(dt);
  for(let i=deathBursts.length-1;i>=0;i--)if(deathBursts[i].done)deathBursts.splice(i,1);
  updateContinuousParticles(waterState,dt);
  updateContinuousParticles(fireState,dt);
  const count=firingStep(firing,weapon,held&&Math.hypot(aim.x,aim.y)>.5,now);
  if(count){
   const tune=COMBAT_TUNING[weapon],origin=muzzlePoint(scene.player.x,scene.player.y,aim);
   const sprite=scene.add.circle(origin.x,origin.y,tune.radius,tune.color).setDepth(14);
   shots.push({sprite,x:origin.x,y:origin.y,vx:aim.x*tune.speed,vy:aim.y*tune.speed,weapon,age:0});
   if(weapon==='rifle')scene.playerVisual.recoil();
  }
  for(let i=shots.length-1;i>=0;i--){
   const shot=shots[i];shot.age+=dt;shot.x+=shot.vx*sec;shot.y+=shot.vy*sec;shot.sprite.setPosition(shot.x,shot.y);
   const enemy=enemies.find(e=>!e.dead&&e.engaged!==false&&Math.hypot(e.x-shot.x,e.y-shot.y)<e.radius+5);
   if(enemy)hit(enemy,shot.weapon,1,now);
   const bossHit=!enemy&&scene.boss?.active&&scene.boss.bogdan&&bogdanCombatHit(scene.boss.bogdan,shot.x,shot.y,5);
   if(bossHit)scene.boss.damage(1,now);
   if(enemy||bossHit||shot.age>550){shot.sprite.destroy();shots.splice(i,1);}
  }
  for(const enemy of enemies){
   if(enemy.dead||enemy.engaged===false)continue;
   if(openingSafe)clearBark(enemy.barkState,enemy.bark); // no damage; movement still runs
   advanceIgnition(enemy.ignition,now);
   const p=lavaEnemyStep(enemy,scene.player,dt,now,scene.walkability);
   const dx=p.x-enemy.x,dy=p.y-enemy.y;
   enemy.x=p.x;enemy.y=p.y;enemy.sprite.setPosition(p.x,p.y);
   if(Math.hypot(dx,dy)>.01){enemy.facing=facingOf(dx,dy,enemy.facing);if(sprites[enemy.type]===enemy.type)enemy.sprite.setFrame(playerFrame(enemy.facing));}
   const speechAllowed=!openingSafe&&!scene.dialogueState.id&&['BOGDAN_ACTIVE','ESCAPE_ACTIVE'].includes(scene.finale?.state);
   const speaking=enemies.some(e=>e!==enemy&&!e.dead&&e.bark?.visible);
   if(ordinaryLavaBarkDue(enemy,now,!speechAllowed,Number(speaking))){
     showMonsterBark(enemy.bark,enemy.barkState,LAVA_BARKS,now,{cooldown:6000,duration:1700});
     enemy.ordinaryBarkAt=now+8500+(enemy.index%4)*1300;
   }
   syncMonsterBark(enemy.bark,enemy.barkState,now,p.x,p.y-65,speechAllowed);
   if(!openingSafe&&Math.hypot(p.x-scene.player.x,p.y-scene.player.y)<enemy.radius+18&&now-enemy.contactAt>1100){
    enemy.contactAt=now;
    const contact=applyPlayerContact({hp:scene.run.hp,invulnerableUntil:scene.playerInvulnerableUntil??0},now);
    scene.run.hp=contact.hp;scene.playerInvulnerableUntil=contact.invulnerableUntil;
    if(scene.run.hp<=0){if(scene.finale?.state==='ESCAPE_ACTIVE')scene.escapeFailed();else scene.lockDeath();break;}
   }
  }

 }
 scene.events.once('shutdown',()=>{stopFire();for(const burst of deathBursts)burst.destroy();stream.destroy();for(const e of enemies){e.sprite?.destroy();e.bark?.destroy();}});
 return {start,prepareZones,update,stopFire,activateZone,spawnEscapeEnemy,clearEscapeEnemies,clearTransientShots,get fairyZoneCleared(){return progression.fairyReveal;},get zoneProgress(){return progression;},get enemies(){return enemies;},get pressure(){return scene.weapon==='flamethrower'?firePressure:pressure;}};
}
