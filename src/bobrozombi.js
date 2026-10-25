import { ARENA } from './movement.js';
export const ENCOUNTER=Object.freeze({
 enemyHp:3,enemySpeed:65,enemyRadius:21,projectileDamage:1,
 contactDamage:1,playerMaxHp:5,invulnerabilityMs:800,minSpawnDistance:220,
});
export function enemySpawns(player){
 const r=ENCOUNTER.enemyRadius;
 const clamp=(n,max)=>Math.max(r,Math.min(max-r,n));
 const candidates=[
  {x:clamp(player.x+320,ARENA.width),y:clamp(player.y,ARENA.height)},
  {x:clamp(player.x-320,ARENA.width),y:clamp(player.y-130,ARENA.height)},
  {x:clamp(player.x+75,ARENA.width),y:clamp(player.y-340,ARENA.height)},
 ];
 // Fixed edge fallback keeps every spawn valid even when future starts are near a wall.
 const corners=[{x:r+5,y:r+5},{x:ARENA.width-r-5,y:r+5},{x:r+5,y:ARENA.height-r-5},{x:ARENA.width-r-5,y:ARENA.height-r-5}];
 return candidates.map((pos,index)=>{
  if(Math.hypot(pos.x-player.x,pos.y-player.y)>=ENCOUNTER.minSpawnDistance)return pos;
  return [...corners].sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y))[index%4];
 });
}
export function advanceEnemy(enemy,player,seconds){
 if(enemy.hp<=0||seconds<=0)return {...enemy};
 const dx=player.x-enemy.x,dy=player.y-enemy.y,length=Math.hypot(dx,dy);
 if(!length)return {...enemy};
 const dist=Math.min(length,ENCOUNTER.enemySpeed*seconds),r=ENCOUNTER.enemyRadius;
 return {...enemy,x:Math.max(r,Math.min(ARENA.width-r,enemy.x+dx/length*dist)),
 y:Math.max(r,Math.min(ARENA.height-r,enemy.y+dy/length*dist))};
}
export function applyEnemyHit(hp,damage=ENCOUNTER.projectileDamage){return Math.max(0,hp-Math.max(0,damage));}
export function applyPlayerContact(player,now){
 if(player.hp<=0||now<player.invulnerableUntil)return {...player};
 return {hp:Math.max(0,player.hp-ENCOUNTER.contactDamage),invulnerableUntil:now+ENCOUNTER.invulnerabilityMs};
}
export function segmentHitsCircle(from,to,center,radius){
 const dx=to.x-from.x,dy=to.y-from.y,den=dx*dx+dy*dy;
 const t=den?Math.max(0,Math.min(1,((center.x-from.x)*dx+(center.y-from.y)*dy)/den)):0;
 return Math.hypot(from.x+dx*t-center.x,from.y+dy*t-center.y)<=radius;
}
