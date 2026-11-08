// Act IV story constants and collision-safe boss positioning.
// Deliberately reuses School solid footprints and the approved Żubrokryptyda radius.
import {ENEMY_TYPES} from './enemy-types.js';
import {SCHOOL_OBSTACLES,SCHOOL_PLACES,schoolWalkable} from './school-contract.js';
import {resolveObstaclePosition} from './obstacles.js';
import {firstFootprintHit} from './obstacle-geometry.js';

export const BLAZEJ_OBSERVER_BARKS=Object.freeze([
 'Szybciej!','Na niego!','Co z wami?','Do ataku!'
]);
export const BLAZEJ_BOSS_BARKS=Object.freeze([
 'Nie oddam roweru!','Zniszczę Cię!','To je moje!'
]);
export const BLAZEJ_BICYCLE_ID='blazej-bicycle';
export const BLAZEJ_START=Object.freeze({x:1335,y:785});
export const BLAZEJ_CONFRONT_RADIUS=225;
export const BLAZEJ_RADIUS=ENEMY_TYPES.zubrokryptyda.radius;
export const CHAPEL_RETURN=Object.freeze({x:465,y:535});
export function blazejConfrontationReady(phase,player,boss=BLAZEJ_START){
 return phase==='BLAZEJ_PENDING'&&!!player&&
  Math.hypot(player.x-boss.x,player.y-boss.y)<=BLAZEJ_CONFRONT_RADIUS;
}
export function blazejJumpLanding(origin,player,obstacles=SCHOOL_OBSTACLES){
 if(!origin||!player)return null;
 const dx=player.x-origin.x,dy=player.y-origin.y,d=Math.hypot(dx,dy);
 if(d<1)return {...origin};
 // The short jump stops before Aloes; sweep forbids crossing a solid building,
 // chapel or rack even if the target is on its far side.
 const distance=Math.min(165,Math.max(0,d-72));
 const goal={x:origin.x+dx/d*distance,y:origin.y+dy/d*distance};
 const next=resolveObstaclePosition(origin,goal,BLAZEJ_RADIUS,obstacles);
 if(!schoolWalkable(next,BLAZEJ_RADIUS)||firstFootprintHit(origin,next,obstacles,BLAZEJ_RADIUS))return {...origin};
 return next;
}
export function chapelReturnValid(){return schoolWalkable(CHAPEL_RETURN)&&
 Math.hypot(CHAPEL_RETURN.x-SCHOOL_PLACES.chapelDoor.x,CHAPEL_RETURN.y-SCHOOL_PLACES.chapelDoor.y)<180;}
