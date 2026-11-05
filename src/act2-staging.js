import {insideDeck,WHEELHOUSE_FOOTPRINT} from './airship-contract.js';
import {facingOf} from './combat-contract.js';
import {BARK_PHRASES,EXTRA_BARKS} from './ambient-barks.js';

// The Captain is decorative, not a collision participant. All route segments
// remain in the open aft corridor, below the wheelhouse footprint.
export const AIRSHIP_CAPTAIN_START=Object.freeze({x:540,y:326});
export const AIRSHIP_ALOES_START=Object.freeze({x:432,y:326});
export const CAPTAIN_PATROL_POINTS=Object.freeze([
  Object.freeze({x:610,y:326}),Object.freeze({x:684,y:342}),
  Object.freeze({x:684,y:388}),Object.freeze({x:574,y:368}),
  Object.freeze({x:560,y:326}),
]);
export function captainPointSafe(point){
  const f=WHEELHOUSE_FOOTPRINT;
  return insideDeck(point,40)&&
    Math.hypot((point.x-f.x)/(f.rx+35),(point.y-f.y)/(f.ry+35))>=1;
}
export function createCaptainPatrol(){
  return {target:0,holdMs:600,travel:0,facing:'w'};
}
export function advanceCaptainPatrol(state,position,deltaMs){
  const delta=Math.max(0,Math.min(50,deltaMs));
  if(state.holdMs>0){
    state.holdMs=Math.max(0,state.holdMs-delta);
    return {x:position.x,y:position.y,facing:state.facing,moving:false};
  }
  const target=CAPTAIN_PATROL_POINTS[state.target];
  const dx=target.x-position.x,dy=target.y-position.y,length=Math.hypot(dx,dy);
  if(length<=1.5){
    state.target=(state.target+1)%CAPTAIN_PATROL_POINTS.length;
    state.holdMs=state.target%2===0?650:1200;
    state.facing=facingOf(-dx||-1,-dy,'w');
    return {x:target.x,y:target.y,facing:state.facing,moving:false};
  }
  const fraction=Math.min(1,delta*52/1000/length);
  const point={x:position.x+dx*fraction,y:position.y+dy*fraction};
  if(!captainPointSafe(point))throw Error('Captain route escaped safe deck corridor');
  state.travel+=length*fraction;
  state.facing=facingOf(dx,dy,state.facing);
  return {...point,facing:state.facing,moving:true};
}
export const ACT2_BATTLE_CRIES=Object.freeze(['BANZAI!!!','Do abordażu!']);
export const ACT2_GROUND_CRIES=Object.freeze([...BARK_PHRASES,...EXTRA_BARKS]);
export function eligibleAirborneBark(flight,view){
  return !!flight&&flight.phase==='approaching'&&!flight.released&&!flight.blocked&&
    !!flight.passenger?.active&&!!flight.visual?.active&&
    flight.x>=view.x+65&&flight.x<=view.right-65&&
    flight.y>=view.y+90&&flight.y<=view.bottom-50;
}
export function eligibleAct2Bark(enemy,view){
  return !!enemy&&!enemy.dead&&enemy.hp>0&&enemy.sprite?.active&&
    enemy.x>=view.x+70&&enemy.x<=view.right-70&&
    enemy.y>=view.y+70&&enemy.y<=view.bottom-45;
}
