import {MARCIN} from './marcin.js';
import {ARENA} from './movement.js';
import {advanceEnemy} from './bobrozombi.js';
export const ENEMY_TYPES=Object.freeze({
 bobrozombi:Object.freeze({hp:3,speed:65,radius:21,contactDamage:1,movement:'direct'}),
 bocianolak:Object.freeze({hp:2,speed:85,radius:18,contactDamage:1,movement:'weave'}),
 marcin:Object.freeze({hp:MARCIN.hp,speed:MARCIN.speed,radius:MARCIN.radius,contactDamage:MARCIN.contactDamage,movement:'heavy-direct'}),
 zubrokryptyda:Object.freeze({hp:8,speed:42,radius:30,contactDamage:1,movement:'heavy-direct'})
});
const BASE_SCHEDULE=[
 ...Array.from({length:3},()=> 'bobrozombi'),
 ...Array.from({length:25},(_,i)=>[3,5,8,10,13,15,18,20,22,24].includes(i)?'bocianolak':'bobrozombi')
 ];
// Spawn ordinals 13, 20, 27 and 32, preserving old relative order.
export const HEAVY_ORDINALS=Object.freeze([13,20,27,32]);
export const ENEMY_SCHEDULE=Object.freeze(Array.from({length:32},(_,i)=>HEAVY_ORDINALS.includes(i+1)?'zubrokryptyda':BASE_SCHEDULE[i-HEAVY_ORDINALS.filter(n=>n<=i+1).length]));
export const TOTAL_ENEMIES=ENEMY_SCHEDULE.length;
export function typeAt(index){return ENEMY_SCHEDULE[index]??null;}
export function moveEnemy(enemy,player,seconds,elapsed=0){
 const def=ENEMY_TYPES[enemy.type||'bobrozombi'];
 if(def.movement==='direct')return advanceEnemy(enemy,player,seconds);
 if(def.movement==='heavy-direct'){
  if(seconds<=0||enemy.hp<=0)return {...enemy};
  const dx=player.x-enemy.x,dy=player.y-enemy.y,d=Math.hypot(dx,dy);
  if(!d)return {...enemy};
  const travel=Math.min(d,def.speed*seconds),r=def.radius;
  return {...enemy,x:Math.max(r,Math.min(ARENA.width-r,enemy.x+dx/d*travel)),y:Math.max(r,Math.min(ARENA.height-r,enemy.y+dy/d*travel))};
 }
 if(seconds<=0||enemy.hp<=0)return {...enemy};
 const dx=player.x-enemy.x,dy=player.y-enemy.y,d=Math.hypot(dx,dy);
 if(d===0)return {...enemy};
 const ux=dx/d,uy=dy/d;
 const phase=elapsed*2.8+(enemy.seed||0)*0.81;
 const weave=Math.sin(phase)*0.23;
 const norm=Math.hypot(1,weave);
 const travel=Math.min(d,def.speed*seconds);
 return {...enemy,x:Math.max(def.radius,Math.min(ARENA.width-def.radius,enemy.x+(ux-uy*weave)/norm*travel)),
 y:Math.max(def.radius,Math.min(ARENA.height-def.radius,enemy.y+(uy+ux*weave)/norm*travel))};
}
