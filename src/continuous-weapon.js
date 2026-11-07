import {COMBAT_TUNING} from './weapon-combat.js';
import {createPressure,stepPressure,cancelPressureTrigger} from './flame-pressure.js';

// Shared continuous-weapon behavior; variant changes palette and eligible targets only.
export const CONTINUOUS_PALETTES=Object.freeze({
 flamethrower:Object.freeze({layers:[[0xe7441b,1,.72],[0xff8c24,.66,.84],[0xffed96,.28,.95]],tip:0xfff4b3,particles:[0xffd65d,0xff903b,0xf14b27]}),
 'water-flamethrower':Object.freeze({layers:[[0x1376b5,1,.72],[0x26b7e8,.66,.84],[0xb6f5ff,.28,.95]],tip:0xd9fbff,particles:[0x39a9df,0x5bd9ff,0xc5f8ff]})
});
export const continuousWeapon=id=>Boolean(CONTINUOUS_PALETTES[id]);
export const continuousDamageAllowed=(weapon,enemyType)=>
 continuousWeapon(weapon)&&(weapon==='water-flamethrower'?
  (enemyType==='lawostworek-1'||enemyType==='lawostworek-2'):
  (enemyType!=='lawostworek-1'&&enemyType!=='lawostworek-2'));
export function createContinuousWeaponState(){
 const pressure=createPressure(),cooldowns=new Map(),particles=[];
 return {pressure,cooldowns,particles,emissionAt:null,stop(){cancelPressureTrigger(pressure);},step(held,dt){return stepPressure(pressure,held,dt);}};
}
export function drawContinuousStream(graphics,origin,aim,now,weapon,blocked=()=>false){
 const tune=COMBAT_TUNING.flamethrower,palette=CONTINUOUS_PALETTES[weapon];
 graphics.clear();
 if(!palette)return;
 const normal={x:-aim.y,y:aim.x};
 for(const [color,factor,alpha] of palette.layers){
  graphics.fillStyle(color,alpha);
  let last=origin;
  for(let i=1;i<=11;i++){
   const distance=i*tune.range/11;
   const center={x:origin.x+aim.x*distance,y:origin.y+aim.y*distance};
   if(blocked(last,center))break;
   const wave=Math.sin(now*.022+i*1.7)*2.4;
   const spread=Math.min(19,distance*Math.tan(tune.halfAngle)*.45)*factor*(.95+.09*Math.sin(now*.035+i));
   const tip=Math.max(1,spread*(1-distance/tune.range*.55));
   const left={x:center.x+normal.x*(tip+wave*factor),y:center.y+normal.y*(tip+wave*factor)};
   const right={x:center.x-normal.x*(tip-wave*factor),y:center.y-normal.y*(tip-wave*factor)};
   if(blocked(last,left)||blocked(last,right))break;
   graphics.fillTriangle(last.x,last.y,left.x,left.y,right.x,right.y);
   last=center;
  }
 }
 graphics.fillStyle(palette.tip,.96).fillCircle(origin.x,origin.y,5);
}
export function emitContinuousParticle(scene,state,origin,aim,now,weapon,blocked=()=>false){
 const tune=COMBAT_TUNING.flamethrower,palette=CONTINUOUS_PALETTES[weapon];
 if(!palette||state.emissionAt!==null&&now-state.emissionAt<tune.particleInterval)return;
 state.emissionAt=now;
 if(state.particles.length>=tune.maxParticles)return;
 const wobble=Math.sin(now*.021)*.21,angle=Math.atan2(aim.y,aim.x)+wobble;
 const speed=160+(Math.sin(now*.017)+1)*52,dir={x:Math.cos(angle),y:Math.sin(angle)};
 const start={x:origin.x+aim.x*6,y:origin.y+aim.y*6};
 const end={x:start.x+dir.x*speed*.24,y:start.y+dir.y*speed*.24};
 if(blocked(start,end))return;
 const life=180+(Math.sin(now*.031)+1)*85;
 const color=palette.particles[Math.floor(now/67)%3];
 const object=scene.add.circle(start.x,start.y,3.4+(Math.sin(now*.034)+1)*1.6,color,.8).setDepth(13);
 state.particles.push({object,vx:dir.x*speed,vy:dir.y*speed,age:0,life});
}
export function updateContinuousParticles(state,dt,blocked=()=>false){
 for(const p of state.particles){
  p.age+=dt;
  const next={x:p.object.x+p.vx*dt/1000,y:p.object.y+p.vy*dt/1000};
  if(blocked(p.object,next)){p.object.destroy();continue;}
  p.object.setPosition(next.x,next.y).setAlpha(Math.max(0,1-p.age/p.life)*.82);
  if(p.age>=p.life)p.object.destroy();
 }
 for(let i=state.particles.length-1;i>=0;i--)if(!state.particles[i].object.active)state.particles.splice(i,1);
}
