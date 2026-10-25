import { ARENA } from './movement.js';
export const ENCOUNTER=Object.freeze({
 enemyHp:3,enemySpeed:65,enemyRadius:21,projectileDamage:1,
 contactDamage:1,playerMaxHp:5,invulnerabilityMs:800,minSpawnDistance:220,
});
export function enemySpawns(player){
 const r=ENCOUNTER.enemyRadius+24;
 const points=[
  {x:r,y:r},{x:ARENA.width-r,y:r},
  {x:ARENA.width-r,y:ARENA.height-r},{x:r,y:ARENA.height-r},
 ];
 return points.map((pos,index)=>({...pos,index}))
  .sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y)||a.index-b.index)
  .slice(0,3).map(({x,y})=>({x,y}));
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
