import {firstFootprintHit} from './obstacle-geometry.js';
export const COMBAT_TUNING=Object.freeze({
 blunderbuss:Object.freeze({interval:180,speed:510,radius:5,damage:1,color:0xffe8a2}),
 rifle:Object.freeze({shots:3,shotInterval:70,burstPause:300,speed:750,radius:3,damage:1,color:0xb6edff,recoilMs:105}),
 flamethrower:Object.freeze({range:145,halfAngle:25*Math.PI/180,damage:1,damageInterval:250,particleInterval:22,particleMinLife:180,particleMaxLife:350,maxParticles:60,barrelInterval:250})
});
export function createFiringState(){return {weapon:null,lastShot:null,burstShots:0,nextShot:null,active:false};}
export function resetFiring(state,weapon=null){
 state.weapon=weapon;state.lastShot=null;state.burstShots=0;state.nextShot=null;state.active=false;
}
export function firingStep(state,weapon,held,now){
 if(state.weapon!==weapon)resetFiring(state,weapon);
 if(!held||!weapon){resetFiring(state,weapon);return 0;}
 if(weapon==='flamethrower'){state.active=true;return 0;}
 if(weapon==='blunderbuss'){
  if(state.lastShot===null||now-state.lastShot>=COMBAT_TUNING.blunderbuss.interval){state.lastShot=now;state.active=true;return 1;}
  return 0;
 }
 if(weapon==='rifle'){
  if(state.nextShot===null)state.nextShot=now;
  if(now<state.nextShot)return 0;
  state.active=true;state.burstShots++;
  if(state.burstShots===COMBAT_TUNING.rifle.shots){
   state.burstShots=0;state.nextShot=now+COMBAT_TUNING.rifle.burstPause;
  }else state.nextShot=now+COMBAT_TUNING.rifle.shotInterval;
  return 1;
 }
 return 0;
}
export function inFlameCone(origin,aim,target,range=COMBAT_TUNING.flamethrower.range,halfAngle=COMBAT_TUNING.flamethrower.halfAngle,targetRadius=0){
 const dx=target.x-origin.x,dy=target.y-origin.y,dist=Math.hypot(dx,dy),length=Math.hypot(aim.x,aim.y);
 if(!length||dist>range+targetRadius)return false;
 if(dist<=targetRadius)return true;
 const cosine=(dx*aim.x+dy*aim.y)/(dist*length);
 return cosine>=Math.cos(halfAngle+Math.asin(Math.min(1,targetRadius/dist)));
}
export function flameTargetVisible(origin,aim,target,radius,obstacles){
 if(!inFlameCone(origin,aim,target,COMBAT_TUNING.flamethrower.range,COMBAT_TUNING.flamethrower.halfAngle,radius))return false;
 const hit=firstFootprintHit(origin,target,obstacles,0);
 if(!hit)return true;
 if(hit.obstacle===target)return true;
 const targetDistance=Math.hypot(target.x-origin.x,target.y-origin.y)-radius;
 return Math.hypot(hit.point.x-origin.x,hit.point.y-origin.y)>targetDistance;
}
export function cooldownReady(map,target,now,period){
 const previous=map.get(target);
 if(previous!==undefined&&now-previous<period)return false;
 map.set(target,now);return true;
}
