import {insideDeck,WHEELHOUSE_FOOTPRINT} from './airship-contract.js';
import {facingOf} from './combat-contract.js';
import {BARK_PHRASES,EXTRA_BARKS} from './ambient-barks.js';

// The Captain is decorative, not a collision participant. All route segments
// remain in the open aft corridor, below the wheelhouse footprint.
export const AIRSHIP_CAPTAIN_START=Object.freeze({x:540,y:326});
export const AIRSHIP_ALOES_START=Object.freeze({x:432,y:326});
// Seeded comic panic: bounded straight-line dashes inside PR75 deck.
export const CAPTAIN_PANIC_SPEED=116;
export const CAPTAIN_PANIC_PHRASES=Object.freeze([
  'AAAAAA!','Zrób coś!','Wszyscy tu zginiemy!','Pruj z karabinku!','Jezu, Jezu, Jezuuuuuuu!'
]);
export const CAPTAIN_PATROL_POINTS=Object.freeze([
  {x:270,y:330},{x:360,y:292},{x:460,y:352},{x:585,y:308},
  {x:690,y:350},{x:690,y:285},{x:590,y:367},{x:390,y:375},
  {x:250,y:290},{x:540,y:326},{x:720,y:375},{x:310,y:365}
].map(p=>Object.freeze(p)));
export function captainPointSafe(point){
  const f=WHEELHOUSE_FOOTPRINT;
  return insideDeck(point,40)&&
    Math.hypot((point.x-f.x)/(f.rx+35),(point.y-f.y)/(f.ry+35))>=1;
}
function captainRand(state){
  state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;
  return state.seed/4294967296;
}
export function createCaptainPatrol(seed=761026){
  return {seed:seed>>>0,target:null,holdMs:430,travel:0,facing:'w',dashes:0,
    destinations:[],elapsed:0,moving:false};
}
function chooseCaptainTarget(state,position,enemies){
  const safe=CAPTAIN_PATROL_POINTS.filter(p=>captainPointSafe(p)&&Math.hypot(p.x-position.x,p.y-position.y)>65);
  if(!safe.length)return null;
  const nearby=enemies.filter(e=>!e.dead&&e.hp>0&&Math.hypot(e.x-position.x,e.y-position.y)<185);
  let options=safe;
  if(nearby.length&&captainRand(state)<.79){
    const closest=nearby.reduce((a,e)=>Math.hypot(e.x-position.x,e.y-position.y)<Math.hypot(a.x-position.x,a.y-position.y)?e:a);
    options=[...safe].sort((a,b)=>Math.hypot(b.x-closest.x,b.y-closest.y)-Math.hypot(a.x-closest.x,a.y-closest.y)).slice(0,4);
  }else if(state.dashes>0&&captainRand(state)<.28){
    // Irrational about-turn: choose a point behind the most recent run.
    const v=state.lastVector??{x:1,y:0};
    const reverse=safe.filter(p=>(p.x-position.x)*v.x+(p.y-position.y)*v.y<0);
    if(reverse.length)options=reverse;
  }
  const next=options[Math.floor(captainRand(state)*options.length)];
  state.target={...next};state.destinations.push(next);state.dashes++;
  state.runBudget=750+Math.floor(captainRand(state)*1700);
  return state.target;
}
export function advanceCaptainPatrol(state,position,deltaMs,enemies=[]){
  const delta=Math.max(0,Math.min(50,deltaMs));
  state.elapsed+=delta;
  if(state.holdMs>0){
    state.holdMs=Math.max(0,state.holdMs-delta);state.moving=false;
    return {x:position.x,y:position.y,facing:state.facing,moving:false};
  }
  if(!state.target)chooseCaptainTarget(state,position,enemies);
  const target=state.target;
  if(!target)return {x:position.x,y:position.y,facing:state.facing,moving:false};
  const dx=target.x-position.x,dy=target.y-position.y,length=Math.hypot(dx,dy);
  if(length<=4||state.runBudget<=0){
    state.target=null;state.holdMs=120+Math.floor(captainRand(state)*550);
    state.moving=false;
    return {x:position.x,y:position.y,facing:state.facing,moving:false};
  }
  const step=Math.min(length,CAPTAIN_PANIC_SPEED*delta/1000);
  const point={x:position.x+dx/length*step,y:position.y+dy/length*step};
  if(!captainPointSafe(point)){
    state.target=null;state.holdMs=100;state.moving=false;
    return {x:position.x,y:position.y,facing:state.facing,moving:false};
  }
  state.runBudget-=delta;
  state.travel+=step;state.facing=facingOf(dx,dy,state.facing);
  state.lastVector={x:dx/length,y:dy/length};state.moving=true;
  return {...point,facing:state.facing,moving:true};
}
export function createCaptainSpeech(seed=76420){
  return {seed:seed>>>0,elapsed:0,nextAt:2200,lastPhrase:-1,spoken:[],visibleUntil:0,phrase:null};
}
export function stepCaptainSpeech(state,deltaMs,allow=true){
  if(!allow){state.phrase=null;state.visibleUntil=0;return null;}
  const delta=Math.max(0,Math.min(50,deltaMs));state.elapsed+=delta;
  if(state.phrase&&state.elapsed>=state.visibleUntil)state.phrase=null;
  if(state.elapsed<state.nextAt)return state.phrase;
  const rotation=1+Math.floor(captainRand(state)*(CAPTAIN_PANIC_PHRASES.length-1));
  const index=(state.lastPhrase+rotation+CAPTAIN_PANIC_PHRASES.length)%CAPTAIN_PANIC_PHRASES.length;
  state.lastPhrase=index;state.phrase=CAPTAIN_PANIC_PHRASES[index];
  state.spoken.push(state.phrase);state.visibleUntil=state.elapsed+1700;
  state.nextAt=state.elapsed+6000+Math.floor(captainRand(state)*6001);
  return state.phrase;
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
