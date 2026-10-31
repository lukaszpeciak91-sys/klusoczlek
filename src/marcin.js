import {ARENA} from './movement.js';
import {footprintDistance,segmentFootprintHit,firstFootprintHit} from './obstacle-geometry.js';
export const MARCIN=Object.freeze({radius:40,hp:36,speed:38,contactDamage:1,cooldown:6000,lowCooldown:4000,warning:900,recovery:450,projectileSpeed:180,projectileRadius:6,projectileLife:9000,maxProjectiles:24});
export function createBossAttack(){return {phase:'chase',elapsed:0};}
export function bossAttackStep(state,hp,delta){
 if(hp<=0)return false;
 state.elapsed+=Math.max(0,Math.min(delta,50));
 const duration=state.phase==='warning'?MARCIN.warning:state.phase==='recovery'?MARCIN.recovery:hp<=MARCIN.hp/3?MARCIN.lowCooldown:MARCIN.cooldown;
 if(state.elapsed<duration)return false;
 state.elapsed=0;
 if(state.phase==='chase'){state.phase='warning';return false;}
 if(state.phase==='warning'){state.phase='recovery';return true;}
 state.phase='chase';return false;
}
export function radialVolley(origin){
 // Centered at logical feet: continuous swept collision, no point-blank
 // annulus that could jump over Aloes. Warning supplies the reaction window.
 return Array.from({length:8},(_,i)=>({x:origin.x,y:origin.y,vx:Math.cos(i*Math.PI/4)*MARCIN.projectileSpeed,vy:Math.sin(i*Math.PI/4)*MARCIN.projectileSpeed,age:0}));
}
export function bossProjectileStep(p,delta,player,obstacles){
 const ms=Math.max(0,Math.min(delta,50)),from={x:p.x,y:p.y};
 p.x+=p.vx*ms/1000;p.y+=p.vy*ms/1000;p.age+=ms;
 const obstacle=firstFootprintHit(from,p,obstacles,MARCIN.projectileRadius);
 const hit=segmentFootprintHit(from,p,{shape:'circle',x:player.x,y:player.y,angle:0,radius:17},MARCIN.projectileRadius);
 if(obstacle&&(!hit||obstacle.t<=hit.t))return 'blocked';
 if(hit)return 'player';
 if(p.age>=MARCIN.projectileLife||p.x<0||p.y<0||p.x>ARENA.width||p.y>ARENA.height)return 'expired';
 return null;
}
export function landingPoint(player,view,obstacles){
 // Finite viewport-local scan. Bounds include the entire 136x126 visual body.
 // If crowded, retain the pending entrance and let normal combat open space.
 const candidates=[];
 for(let y=Math.max(125,view.y+125);y<=Math.min(ARENA.height-44,view.y+view.height-44);y+=16)
  for(let x=Math.max(72,view.x+72);x<=Math.min(ARENA.width-72,view.x+view.width-72);x+=16){
   const p={x,y};
   if(Math.hypot(x-player.x,y-player.y)<105)continue;
   if(obstacles.some(o=>o.alive!==false&&o.gameplayClass!=='decorative'&&footprintDistance(o.footprint,p)<MARCIN.radius+8))continue;
   candidates.push(p);
  }
 candidates.sort((a,b)=>Math.abs(Math.hypot(a.x-player.x,a.y-player.y)-155)-Math.abs(Math.hypot(b.x-player.x,b.y-player.y)-155)||a.y-b.y||a.x-b.x);
 return candidates[0]??null;
}
