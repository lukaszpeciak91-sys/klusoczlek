import {ARENA} from './movement.js';
import {ENEMY_TYPES} from './enemy-types.js';

// Simulation-time state: no timers and no damage-over-time.
export const PANIC_IMMUNITY_MS=2000;
export const PANIC_PROFILES=Object.freeze({
 bobrozombi:Object.freeze({duration:2500,speed:75}),
 bocianolak:Object.freeze({duration:1800,speed:110}),
 zubrokryptyda:Object.freeze({duration:1200,speed:35})
});
export function createIgnitionState(){return {burningUntil:0,panicImmuneUntil:0,ignitedAt:null};}
export function isBurning(state,now){return state.ignitedAt!==null&&now<state.burningUntil;}
export function igniteEnemy(state,type,now){
 if(!PANIC_PROFILES[type]||isBurning(state,now)||now<state.panicImmuneUntil)return false;
 state.ignitedAt=now;
 state.burningUntil=now+PANIC_PROFILES[type].duration;
 return true;
}
export function advanceIgnition(state,now){
 if(state.ignitedAt===null||now<state.burningUntil)return false;
 state.panicImmuneUntil=state.burningUntil+PANIC_IMMUNITY_MS;
 state.ignitedAt=null;
 return true;
}
export function clearIgnition(state){
 state.ignitedAt=null;state.burningUntil=0;state.panicImmuneUntil=0;
}
export function fleeStep(enemy,player,seconds){
 if(seconds<=0||enemy.hp<=0)return {...enemy};
 let dx=enemy.x-player.x,dy=enemy.y-player.y,d=Math.hypot(dx,dy);
 if(d<0.00001){
  // Stable seed-specific fallback, no random frame-to-frame jitter.
  const angle=((enemy.seed||0)%8)*Math.PI/4;
  dx=Math.cos(angle);dy=Math.sin(angle);d=1;
 }
 const radius=ENEMY_TYPES[enemy.type].radius;
 const step=PANIC_PROFILES[enemy.type].speed*seconds;
 return {...enemy,
  x:Math.max(radius,Math.min(ARENA.width-radius,enemy.x+dx/d*step)),
  y:Math.max(radius,Math.min(ARENA.height-radius,enemy.y+dy/d*step))};
}
