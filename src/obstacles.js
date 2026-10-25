import { ARENA, PLAYER_RADIUS } from './movement.js';
export const OBSTACLE_RULES=Object.freeze({barrelHp:3,explosionRadius:110,enemyExplosionDamage:2,playerExplosionDamage:1,rockRadius:31,logRadius:30,barrelRadius:23});
const base=[
 [{type:'rock',x:440,y:300},{type:'log',x:1290,y:890},{type:'barrel',x:1110,y:470}],
 [{type:'rock',x:1250,y:270},{type:'log',x:420,y:790},{type:'barrel',x:680,y:380}],
 [{type:'rock',x:390,y:620},{type:'log',x:1340,y:480},{type:'barrel',x:1090,y:880}],
 [{type:'rock',x:1260,y:750},{type:'log',x:480,y:340},{type:'barrel',x:710,y:920}],
];
export const OBSTACLE_LAYOUTS=Object.freeze(base.map(layout=>Object.freeze(layout.map(o=>Object.freeze(o)))));
export function obstacleRadius(type){
 return type==='rock'?OBSTACLE_RULES.rockRadius:type==='log'?OBSTACLE_RULES.logRadius:OBSTACLE_RULES.barrelRadius;
}
export function getObstacleLayout(index=0){return OBSTACLE_LAYOUTS[((index%OBSTACLE_LAYOUTS.length)+OBSTACLE_LAYOUTS.length)%OBSTACLE_LAYOUTS.length].map(o=>({...o,hp:o.type==='barrel'?OBSTACLE_RULES.barrelHp:Infinity,alive:true}));}
export function layoutValid(layout,player={x:ARENA.width/2,y:ARENA.height/2}){
 return layout.length>0&&layout.every((o,i)=>{
  const r=obstacleRadius(o.type);
  return ['rock','log','barrel'].includes(o.type)&&o.x>=r&&o.y>=r&&o.x<=ARENA.width-r&&o.y<=ARENA.height-r&&Math.hypot(o.x-player.x,o.y-player.y)>r+PLAYER_RADIUS+90&&layout.every((b,j)=>i===j||Math.hypot(o.x-b.x,o.y-b.y)>r+obstacleRadius(b.type)+10);
 });
}
export function resolveObstaclePosition(start,end,radius,obstacles){
 let p={...end};
 // Slide on circular proxy shapes; two passes resolve corners without tunneling.
 for(let pass=0;pass<2;pass++)for(const o of obstacles){
  if(!o.alive)continue;
  const r=radius+obstacleRadius(o.type);
  const dx=p.x-o.x,dy=p.y-o.y,dist=Math.hypot(dx,dy);
  if(dist<r){
   const sx=start.x-o.x,sy=start.y-o.y;
   // Collision normal uses previous position if the endpoint is at obstacle centre.
   const nx=dist>0?dx/dist:(sx===0&&sy===0?1:sx/Math.hypot(sx,sy));
   const ny=dist>0?dy/dist:(sx===0&&sy===0?0:sy/Math.hypot(sx,sy));
   p={x:o.x+nx*r,y:o.y+ny*r};
  }
 }
 return {x:Math.max(radius,Math.min(ARENA.width-radius,p.x)),y:Math.max(radius,Math.min(ARENA.height-radius,p.y))};
}
export function segmentObstacleHit(from,to,obstacles,projectileRadius=5){
 let best=null;
 for(const o of obstacles){
  if(!o.alive)continue;
  const dx=to.x-from.x,dy=to.y-from.y,dd=dx*dx+dy*dy;
  const t=dd?Math.max(0,Math.min(1,((o.x-from.x)*dx+(o.y-from.y)*dy)/dd)):0;
  if(Math.hypot(from.x+dx*t-o.x,from.y+dy*t-o.y)<=obstacleRadius(o.type)+projectileRadius&&(!best||t<best.t))best={obstacle:o,t};
 }
 return best?.obstacle??null;
}
export function damageObstacle(o,amount=1){
 if(!o.alive||o.type!=='barrel')return {exploded:false,hp:o.hp};
 o.hp=Math.max(0,o.hp-Math.max(0,amount));
 if(o.hp>0)return {exploded:false,hp:o.hp};
 o.alive=false;
 return {exploded:true,hp:0};
}
export function inExplosion(point,barrel,radius=OBSTACLE_RULES.explosionRadius){return Math.hypot(point.x-barrel.x,point.y-barrel.y)<=radius;}
