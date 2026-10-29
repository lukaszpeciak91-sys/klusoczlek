// Pure visual profiles and time curves. No collision, physics or combat changes.
export const ATTACK_PROFILES=Object.freeze({
 bobrozombi:Object.freeze({duration:210,distance:8,tilt:0.12}),
 bocianolak:Object.freeze({duration:170,distance:11,tilt:0.07}),
 zubrokryptyda:Object.freeze({duration:260,distance:7,tilt:0.09})
});
export const DEATH_PROFILES=Object.freeze({
 bobrozombi:Object.freeze({count:30,width:30,height:32,offsetY:-9,duration:350}),
 bocianolak:Object.freeze({count:36,width:20,height:57,offsetY:-25,duration:375}),
 zubrokryptyda:Object.freeze({count:58,width:65,height:67,offsetY:-38,duration:430}),
 aloes:Object.freeze({count:36,width:29,height:53,offsetY:-12,duration:390})
});
export const HIT_MS=190;
export function makeFeedback(){return {attackAt:-Infinity,hitAt:-Infinity,attackDir:{x:0,y:1},hitDir:{x:0,y:1}};}
export function recordAttack(state,type,now,from,to){
 if(!ATTACK_PROFILES[type])return false;
 state.attackAt=now;state.attackDir=unit(to.x-from.x,to.y-from.y);return true;
}
export function recordHit(state,now,from,to){
 if(now-state.hitAt<65)return false;
 state.hitAt=now;state.hitDir=unit(to.x-from.x,to.y-from.y);return true;
}
export function unit(x,y){const d=Math.hypot(x,y);return d>0.000001?{x:x/d,y:y/d}:{x:0,y:1};}
export function pose(state,type,now){
 const profile=ATTACK_PROFILES[type],age=now-state.attackAt;
 if(profile&&age>=0&&age<profile.duration){
  const t=age/profile.duration;
  const magnitude=Math.sin(Math.PI*t)*profile.distance;
  return {x:state.attackDir.x*magnitude,y:state.attackDir.y*magnitude,angle:Math.sin(Math.PI*t)*profile.tilt};
 }
 const hitAge=now-state.hitAt;
 if(hitAge>=0&&hitAge<HIT_MS){
  const strength=1-hitAge/HIT_MS;
  return {x:-state.hitDir.x*4*strength,y:-state.hitDir.y*4*strength,angle:0.06*Math.sin(hitAge/25)*strength};
 }
 return {x:0,y:0,angle:0};
}
export function hitActive(state,now){return now-state.hitAt>=0&&now-state.hitAt<110;}
export function fragmentSpec(type,seed,i){
 const p=DEATH_PROFILES[type],a=(i*2.399963+seed*0.31),r=Math.sqrt((i+0.5)/p.count);
 return {x:Math.cos(a)*p.width*r*0.5,y:p.offsetY+Math.sin(a)*p.height*r*0.5,
 vx:Math.cos(a)*(65+(i%7)*12),vy:Math.sin(a)*(65+(i%5)*11)-34,
 size:2+(i%4),color:[0xd51822,0x9a0a20,0xff3033,0x63101e,0xef4838][i%5]};
}
