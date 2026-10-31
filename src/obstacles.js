import {ARENA} from './movement.js';
import {footprintDistance,firstFootprintHit} from './obstacle-geometry.js';
export const OBSTACLE_RULES=Object.freeze({barrelHp:3,explosionRadius:110,enemyExplosionDamage:2,playerExplosionDamage:1});
const active=o=>o.alive!==false&&o.gameplayClass!=='decorative';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// SDF is authoritative; its gradient supplies a normal, not a second collider.
export function footprintNormal(shape,p,fallback={x:1,y:0}){
 const h=.001;
 let x=footprintDistance(shape,{x:p.x+h,y:p.y})-footprintDistance(shape,{x:p.x-h,y:p.y});
 let y=footprintDistance(shape,{x:p.x,y:p.y+h})-footprintDistance(shape,{x:p.x,y:p.y-h});
 let d=Math.hypot(x,y);
 if(d<1e-10){x=fallback.x;y=fallback.y;d=Math.hypot(x,y)||1;}
 return {x:x/d,y:y/d};
}
// Single swept sliding adapter for Arcade player and manually moved enemies.
// No static Arcade proxies or second obstacle collider are installed.
export function resolveObstaclePosition(start,end,radius,obstacles){
 let p={x:start.x,y:start.y},goal={x:end.x,y:end.y};
 for(let pass=0;pass<4;pass++)for(const o of obstacles){
  if(!active(o))continue;
  const d=footprintDistance(o.footprint,p);
  if(d<radius+.001){
   const n=footprintNormal(o.footprint,p,{x:p.x-o.x||1,y:p.y-o.y});
   const correction=radius+.002-d;p.x+=n.x*correction;p.y+=n.y*correction;
  }
 }
 for(let pass=0;pass<4;pass++){
  const hit=firstFootprintHit(p,goal,obstacles,radius);
  if(!hit){p=goal;break;}
  const n=footprintNormal(hit.obstacle.footprint,hit.point,{x:p.x-goal.x,y:p.y-goal.y});
  const dx=goal.x-hit.point.x,dy=goal.y-hit.point.y,inward=Math.min(0,dx*n.x+dy*n.y);
  p={x:hit.point.x+n.x*.002,y:hit.point.y+n.y*.002};
  goal={x:p.x+dx-n.x*inward,y:p.y+dy-n.y*inward};
 }
 return {x:clamp(p.x,radius,ARENA.width-radius),y:clamp(p.y,radius,ARENA.height-radius)};
}
// Stable boundary-following around isolated convex blockers; no graph or A*.
export function steerObstacleStep(enemy,desired,target,radius,obstacles){
 const travel=Math.hypot(desired.x-enemy.x,desired.y-enemy.y);
 if(!travel)return {x:enemy.x,y:enemy.y};
 let state=enemy.obstacleSteering;
 let obstacle=state&&obstacles.find(o=>o.id===state.id&&active(o));
 if(obstacle&&!firstFootprintHit(enemy,target,[obstacle],radius+4)){
  enemy.obstacleSteering=null;obstacle=null;
 }
 if(!obstacle){
  const hit=firstFootprintHit(enemy,desired,obstacles,radius+4);
  if(!hit)return resolveObstaclePosition(enemy,desired,radius,obstacles);
  obstacle=hit.obstacle;
  const n=footprintNormal(obstacle.footprint,enemy);
  const cross=n.x*(target.y-enemy.y)-n.y*(target.x-enemy.x);
  state={id:obstacle.id,side:Math.abs(cross)>.01?Math.sign(cross):((enemy.seed||0)%2?1:-1)};
  enemy.obstacleSteering=state;
 }
 const n=footprintNormal(obstacle.footprint,enemy);
 const outward=clamp((radius+5-footprintDistance(obstacle.footprint,enemy))/8,-.7,.7);
 const dx=-n.y*state.side+n.x*outward,dy=n.x*state.side+n.y*outward,d=Math.hypot(dx,dy);
 return resolveObstaclePosition(enemy,{x:enemy.x+dx/d*travel,y:enemy.y+dy/d*travel},radius,obstacles);
}
export function segmentObstacleHit(from,to,obstacles,projectileRadius=5){return firstFootprintHit(from,to,obstacles,projectileRadius)?.obstacle??null;}
export function damageObstacle(o,amount=1){
 if(!o.alive||o.type!=='toxic_barrel')return {exploded:false,hp:o.hp};
 o.hp=Math.max(0,o.hp-Math.max(0,amount));
 if(o.hp>0)return {exploded:false,hp:o.hp};
 o.alive=false;return {exploded:true,hp:0};
}
export function inExplosion(point,barrel,radius=OBSTACLE_RULES.explosionRadius){return Math.hypot(point.x-barrel.x,point.y-barrel.y)<=radius;}
