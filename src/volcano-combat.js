import {applyEnemyHit,applyPlayerContact} from './bobrozombi.js';
import {inFlameCone,cooldownReady,COMBAT_TUNING,createFiringState,firingStep,resetFiring} from './weapon-combat.js';
import {facingOf,playerFrame} from './combat-contract.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';
import {volcanoStep,volcanoFootprintAllowed} from './volcano-contract.js';
import {VOLCANO_ZONES,findZoneSpawn,createPlatformProgression,zoneForPosition} from './volcano-platforms.js';
import {BOBROZOMBI_ASSET,BOBROZOMBI_VISUAL_SCALE} from './enemy-visual.js';
import {muzzlePoint} from './shooting.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,isBurning} from './enemy-panic.js';
import {createContinuousWeaponState,continuousDamageAllowed,drawContinuousStream,emitContinuousParticle,updateContinuousParticles} from './continuous-weapon.js';

export const LAVA_TYPES=Object.freeze({
 'lawostworek-1':Object.freeze({hp:3,speed:115,radius:21,frame:96,width:768,height:96,color:0xffa51f}),
 'lawostworek-2':Object.freeze({hp:9,speed:48,radius:25,frame:128,width:1024,height:128,color:0xe0441b})
});
export const LAVA_BARKS=Object.freeze(['Łaskocze!','I co mi zrobisz?!','Ale groźny!','HA! HA! HA!','Spróbuj wodą, geniuszu!']);
export function lavaDamage(weapon,amount){return continuousDamageAllowed(weapon,'lawostworek-1')?amount:0;}
export function createLavaEnemy(type,x,y,index=0){
 const def=LAVA_TYPES[type];return {type,x,y,hp:def.hp,dead:false,radius:def.radius,index,hitAt:-Infinity,barkAt:-Infinity,contactAt:-Infinity,ignition:createIgnitionState(),lungeAt:0,headingAt:0,headingOffset:0};
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
 const enemies=[],shots=[],waterState=createContinuousWeaponState(),fireState=createContinuousWeaponState(),stream=scene.add.graphics().setDepth(13);
 const pressure=waterState.pressure,waterCooldowns=waterState.cooldowns;
 let active=false;
 const progression=createPlatformProgression();
 const firing=createFiringState(),firePressure=fireState.pressure,flameCooldowns=fireState.cooldowns;
 const sprites={};
 // Match Act I Bobrozombi's 96px frame at its approved 0.75 visual scale.
 const enemyDisplaySize=type=>type==='lawostworek-1'
  ?BOBROZOMBI_ASSET.frameWidth*BOBROZOMBI_VISUAL_SCALE
  :BOBROZOMBI_ASSET.frameWidth*BOBROZOMBI_VISUAL_SCALE*1.16;
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
     for(const e of enemies)if(e.type===type&&!e.dead){e.sprite.setTexture(type,playerFrame(e.facing??'s'));e.sprite.setDisplaySize(enemyDisplaySize(type),enemyDisplaySize(type));}
    }finally{URL.revokeObjectURL(url);}
   }catch(error){console.warn('[Volcano] enemy placeholder '+type+': '+error.message);}
  })();
 }
 function activateZone(id){
  if(!scene.walkability)return false;
  return progression.activate(id,(zone,type,i)=>{
   const def=LAVA_TYPES[type],preferred=zone.spawns[i];
   const avoid=[{x:scene.player.x,y:scene.player.y,radius:17},
    ...enemies.filter(e=>!e.dead).map(e=>({x:e.x,y:e.y,radius:e.radius}))];
   const point=findZoneSpawn(scene.walkability,zone,preferred,def.radius,avoid);
   if(!point){console.error('[Volcano] '+id+': no valid same-zone spawn for '+type+' #'+i);return false;}
   const enemy=createLavaEnemy(type,point.x,point.y,VOLCANO_ZONES.indexOf(zone)*10+i);
   enemy.zoneId=id;
   enemy.sprite=scene.add.sprite(point.x,point.y,sprites[type],sprites[type]===type?2:0).setDepth(12);
   enemy.sprite.setDisplaySize(enemyDisplaySize(type),enemyDisplaySize(type));
   enemy.facing='s';
   enemy.bark=scene.add.text(point.x,point.y-55,'',{fontFamily:'monospace',fontSize:'14px',color:'#fff4cf',stroke:'#241018',strokeThickness:4}).setOrigin(.5).setDepth(21).setVisible(false);
   enemies.push(enemy);
   return true;
  });
 }
 function spawnEscapeEnemy(point,type='lawostworek-1'){
  if(!active||!scene.walkability||!point)return false;
  const def=LAVA_TYPES[type],living=enemies.filter(e=>!e.dead).length;
  if(living>=6||!volcanoFootprintAllowed(scene.walkability,point.x,point.y,def.radius))return false;
  if(Math.hypot(point.x-scene.player.x,point.y-scene.player.y)<105)return false;
  const enemy=createLavaEnemy(type,point.x,point.y,100+enemies.length);
  enemy.zoneId=null;
  enemy.sprite=scene.add.sprite(point.x,point.y,sprites[type],sprites[type]===type?2:0).setDepth(12);
  enemy.sprite.setDisplaySize(enemyDisplaySize(type),enemyDisplaySize(type));
  enemy.facing='s';
  enemy.bark=scene.add.text(point.x,point.y-55,'',{fontFamily:'monospace',fontSize:'14px',color:'#fff4cf',stroke:'#241018',strokeThickness:4}).setOrigin(.5).setDepth(21).setVisible(false);
  enemies.push(enemy);return true;
 }
 function clearEscapeEnemies(){
  for(const enemy of enemies)if(enemy.zoneId===null&&!enemy.dead){enemy.dead=true;enemy.sprite.destroy();enemy.bark.destroy();}
 }
 function hit(enemy,weapon,amount,now){
  if(enemy.dead)return;
  const damage=lavaDamage(weapon,amount);
  if(!damage){
   if(now-enemy.barkAt>=4500){
    enemy.barkAt=now;
    enemy.bark.setText(LAVA_BARKS[Math.floor(Math.random()*LAVA_BARKS.length)]).setVisible(true);
   }
   return;
  }
  if(weapon==='water-flamethrower')igniteEnemy(enemy.ignition,enemy.type,now);
  enemy.hp=applyEnemyHit(enemy.hp,damage);
  if(enemy.hp<=0){enemy.dead=true;enemy.sprite.destroy();enemy.bark.destroy();if(enemy.zoneId)progression.defeated(enemy.zoneId);}
 }
 function stopFire(){waterState.stop();fireState.stop();resetFiring(firing);stream.clear();for(const state of [waterState,fireState]){for(const p of state.particles)p.object.destroy();state.particles.length=0;state.emissionAt=null;}for(const shot of shots)shot.sprite.destroy();shots.length=0;}
 function start(){if(active)return;active=true;activateZone('entrance');}
 function update(dt,now,aim,held,weapon){
  if(!active||scene.defeated||scene.run.hp<=0){stopFire();return;}
  const zoneId=zoneForPosition(scene.player);
  if(zoneId&&zoneId!=='entrance')activateZone(zoneId);
  const sec=Math.min(50,dt)/1000;
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
   for(const enemy of enemies)if(!enemy.dead&&inFlameCone(origin,aim,enemy,tune.range,tune.halfAngle,enemy.radius)&&cooldownReady(water?waterCooldowns:flameCooldowns,enemy,now,tune.damageInterval))hit(enemy,weapon,tune.damage,now);
   const boss=scene.boss;
   if(boss?.active&&boss.bogdan&&inFlameCone(origin,aim,boss.bogdan,tune.range,tune.halfAngle,24)&&cooldownReady(water?waterCooldowns:flameCooldowns,boss.bogdan,now,tune.damageInterval))boss.damage(tune.damage,now);
  }
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
   const enemy=enemies.find(e=>!e.dead&&Math.hypot(e.x-shot.x,e.y-shot.y)<e.radius+5);
   if(enemy)hit(enemy,shot.weapon,1,now);
   const bossHit=!enemy&&scene.boss?.active&&scene.boss.bogdan&&Math.hypot(scene.boss.bogdan.x-shot.x,scene.boss.bogdan.y-shot.y)<30;
   if(bossHit)scene.boss.damage(1,now);
   if(enemy||bossHit||shot.age>550){shot.sprite.destroy();shots.splice(i,1);}
  }
  for(const enemy of enemies){
   if(enemy.dead)continue;
   advanceIgnition(enemy.ignition,now);
   const p=lavaEnemyStep(enemy,scene.player,dt,now,scene.walkability);
   const dx=p.x-enemy.x,dy=p.y-enemy.y;
   enemy.x=p.x;enemy.y=p.y;enemy.sprite.setPosition(p.x,p.y);
   if(Math.hypot(dx,dy)>.01){enemy.facing=facingOf(dx,dy,enemy.facing);if(sprites[enemy.type]===enemy.type)enemy.sprite.setFrame(playerFrame(enemy.facing));}
   enemy.bark.setPosition(p.x,p.y-55).setVisible(now-enemy.barkAt<1100&&enemy.bark.visible);
   if(Math.hypot(p.x-scene.player.x,p.y-scene.player.y)<enemy.radius+18&&now-enemy.contactAt>1100){
    enemy.contactAt=now;
    const contact=applyPlayerContact({hp:scene.run.hp,invulnerableUntil:scene.playerInvulnerableUntil??0},now);
    scene.run.hp=contact.hp;scene.playerInvulnerableUntil=contact.invulnerableUntil;
    if(scene.run.hp<=0){scene.lockDeath();break;}
   }
  }

 }
 scene.events.once('shutdown',()=>{stopFire();stream.destroy();for(const e of enemies){e.sprite?.destroy();e.bark?.destroy();}});
 return {start,update,stopFire,activateZone,spawnEscapeEnemy,clearEscapeEnemies,get fairyZoneCleared(){return progression.fairyReveal;},get zoneProgress(){return progression;},get enemies(){return enemies;},get pressure(){return scene.weapon==='flamethrower'?firePressure:pressure;}};
}
