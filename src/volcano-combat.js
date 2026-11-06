import {applyEnemyHit,applyPlayerContact} from './bobrozombi.js';
import {inFlameCone,cooldownReady,COMBAT_TUNING,createFiringState,firingStep,resetFiring} from './weapon-combat.js';
import {facingOf,playerFrame} from './combat-contract.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';
import {volcanoStep} from './volcano-contract.js';

export const LAVA_TYPES=Object.freeze({
 'lawostworek-1':Object.freeze({hp:3,speed:115,radius:17,frame:96,width:768,height:96,color:0xffa51f}),
 'lawostworek-2':Object.freeze({hp:9,speed:48,radius:27,frame:128,width:1024,height:128,color:0xe0441b})
});
export const LAVA_BARKS=Object.freeze(['Łaskocze!','I co mi zrobisz?!','Ale groźny!','HA! HA! HA!','Spróbuj wodą, geniuszu!']);
export function lavaDamage(weapon,amount){return weapon==='water-flamethrower'?amount:0;}
export function createLavaEnemy(type,x,y,index=0){
 const def=LAVA_TYPES[type];return {type,x,y,hp:def.hp,dead:false,radius:def.radius,index,hitAt:-Infinity,barkAt:-Infinity,contactAt:-Infinity,lungeAt:0,headingAt:0,headingOffset:0};
}
export function lavaEnemyStep(enemy,player,dt,now=0){
 const def=LAVA_TYPES[enemy.type],dx=player.x-enemy.x,dy=player.y-enemy.y,d=Math.hypot(dx,dy);
 if(d<enemy.radius+18)return {x:enemy.x,y:enemy.y};
 const elapsed=Math.max(0,Math.min(50,dt));
 let vx=dx/d,vy=dy/d,speed=def.speed;
 if(enemy.type==='lawostworek-1'){
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
 return volcanoStep(enemy,{x:vx,y:vy},elapsed,speed,enemy.radius);
}
export function createVolcanoCombat(scene){
 const enemies=[],shots=[],pressure=createPressure(),waterCooldowns=new Map(),stream=scene.add.graphics().setDepth(13);
 let stage=0,stageAt=0,active=false;
 const firing=createFiringState(),firePressure=createPressure(),flameCooldowns=new Map();
 const groups=[['lawostworek-1','lawostworek-1'],['lawostworek-1','lawostworek-1','lawostworek-2'],['lawostworek-1','lawostworek-1','lawostworek-2','lawostworek-2']];
 const sprites={};
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
     for(const e of enemies)if(e.type===type&&!e.dead){e.sprite.setTexture(type,playerFrame(e.facing??'s'));e.sprite.setDisplaySize(def.frame*.7,def.frame*.7);}
    }finally{URL.revokeObjectURL(url);}
   }catch(error){console.warn('[Volcano] enemy placeholder '+type+': '+error.message);}
  })();
 }
 function spawnGroup(){
  const group=groups[stage];if(!group)return;
  // Conservative first-platform candidates near the approved entrance.
  const positions=[{x:340,y:845},{x:415,y:900},{x:260,y:820},{x:445,y:830}];
  group.forEach((type,i)=>{
   const point=positions[i%positions.length],enemy=createLavaEnemy(type,point.x,point.y,stage*10+i);
   const def=LAVA_TYPES[type];
   enemy.sprite=scene.add.sprite(point.x,point.y,sprites[type],sprites[type]===type?2:0).setDepth(12);
   enemy.sprite.setDisplaySize(def.frame*.7,def.frame*.7);
   enemy.facing='s';
   enemy.bark=scene.add.text(point.x,point.y-55,'',{fontFamily:'monospace',fontSize:'14px',color:'#fff4cf',stroke:'#241018',strokeThickness:4}).setOrigin(.5).setDepth(21).setVisible(false);
   enemies.push(enemy);
  });
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
  enemy.hp=applyEnemyHit(enemy.hp,damage);
  if(enemy.hp<=0){enemy.dead=true;enemy.sprite.destroy();enemy.bark.destroy();}
 }
 function stopFire(){cancelPressureTrigger(pressure);cancelPressureTrigger(firePressure);resetFiring(firing);stream.clear();for(const shot of shots)shot.sprite.destroy();shots.length=0;}
 function start(){if(active)return;active=true;stage=0;spawnGroup();}
 function update(dt,now,aim,held,weapon){
  if(!active)return;
  const sec=Math.min(50,dt)/1000;
  const water=weapon==='water-flamethrower',fire=weapon==='flamethrower';
  const flowing=water&&stepPressure(pressure,held,dt);
  const flaming=fire&&stepPressure(firePressure,held,dt);
  if(!water)stepPressure(pressure,false,dt);
  if(!fire)stepPressure(firePressure,false,dt);
  stream.clear();
  if((flowing||flaming)&&Math.hypot(aim.x,aim.y)>.5){
   const origin={x:scene.player.x+aim.x*24,y:scene.player.y+aim.y*24};
   const tune=COMBAT_TUNING.flamethrower;
   stream.lineStyle(15,water?0x18aeea:0xe7441b,.72).lineBetween(origin.x,origin.y,origin.x+aim.x*tune.range,origin.y+aim.y*tune.range);
   stream.lineStyle(6,water?0xa7f6ff:0xffed96,.9).lineBetween(origin.x,origin.y,origin.x+aim.x*tune.range,origin.y+aim.y*tune.range);
   for(const enemy of enemies)if(!enemy.dead&&inFlameCone(origin,aim,enemy,tune.range,tune.halfAngle,enemy.radius)&&cooldownReady(water?waterCooldowns:flameCooldowns,enemy,now,tune.damageInterval))hit(enemy,weapon,tune.damage,now);
  }
  const count=firingStep(firing,weapon,held&&Math.hypot(aim.x,aim.y)>.5,now);
  if(count){
   const tune=COMBAT_TUNING[weapon],origin={x:scene.player.x+aim.x*24,y:scene.player.y+aim.y*24};
   const sprite=scene.add.circle(origin.x,origin.y,tune.radius,tune.color).setDepth(14);
   shots.push({sprite,x:origin.x,y:origin.y,vx:aim.x*tune.speed,vy:aim.y*tune.speed,weapon,age:0});
   if(weapon==='rifle')scene.playerVisual.recoil();
  }
  for(let i=shots.length-1;i>=0;i--){
   const shot=shots[i];shot.age+=dt;shot.x+=shot.vx*sec;shot.y+=shot.vy*sec;shot.sprite.setPosition(shot.x,shot.y);
   const enemy=enemies.find(e=>!e.dead&&Math.hypot(e.x-shot.x,e.y-shot.y)<e.radius+5);
   if(enemy)hit(enemy,shot.weapon,1,now);
   if(enemy||shot.age>550){shot.sprite.destroy();shots.splice(i,1);}
  }
  for(const enemy of enemies){
   if(enemy.dead)continue;
   const p=lavaEnemyStep(enemy,scene.player,dt,now);
   const dx=p.x-enemy.x,dy=p.y-enemy.y;
   enemy.x=p.x;enemy.y=p.y;enemy.sprite.setPosition(p.x,p.y);
   if(Math.hypot(dx,dy)>.01){enemy.facing=facingOf(dx,dy,enemy.facing);if(sprites[enemy.type]===enemy.type)enemy.sprite.setFrame(playerFrame(enemy.facing));}
   enemy.bark.setPosition(p.x,p.y-55).setVisible(now-enemy.barkAt<1100&&enemy.bark.visible);
   if(Math.hypot(p.x-scene.player.x,p.y-scene.player.y)<enemy.radius+18&&now-enemy.contactAt>1100){
    enemy.contactAt=now;
    const contact=applyPlayerContact({hp:scene.run.hp,invulnerableUntil:scene.playerInvulnerableUntil??0},now);
    scene.run.hp=contact.hp;scene.playerInvulnerableUntil=contact.invulnerableUntil;
   }
  }
  if(enemies.every(e=>e.dead)&&stage<groups.length-1){
   if(!stageAt)stageAt=now+600;
   if(now>=stageAt){stage++;stageAt=0;spawnGroup();}
  }
 }
 scene.events.once('shutdown',()=>{stopFire();stream.destroy();for(const e of enemies){e.sprite?.destroy();e.bark?.destroy();}});
 return {start,update,stopFire,get enemies(){return enemies;},get pressure(){return pressure;}};
}
