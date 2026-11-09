// Act IV story constants and collision-safe boss positioning.
// Deliberately reuses School solid footprints and the approved Żubrokryptyda radius.
import {ENEMY_TYPES} from './enemy-types.js';
import {SCHOOL_OBSTACLES,SCHOOL_PLACES,SCHOOL_VISIBLE_FOOTPRINTS,schoolWalkable} from './school-contract.js';
import {resolveObstaclePosition,segmentObstacleHit} from './obstacles.js';
import {PLAYER_RADIUS} from './movement.js';
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
export const CHAPEL_RETURN=Object.freeze({x:525,y:1000});
// Approach the approved rack from below, outside its measured solid contact
// band. Reuse School collision/LOS instead of requiring an overlap with its PNG.
const rack=SCHOOL_VISIBLE_FOOTPRINTS.bicycleRack;
export const BICYCLE_COLLECTION_POINT=Object.freeze({
 x:SCHOOL_PLACES.bicycleRack.x,
 y:rack.y+rack.height/2+PLAYER_RADIUS+35
});
export const BICYCLE_COLLECTION_RADIUS=46;
export function blazejBicycleCollectible(phase,player,obstacles=SCHOOL_OBSTACLES){
 if(phase!=='BLAZEJ_PICKUP_PENDING'||!player||
   !schoolWalkable(player,PLAYER_RADIUS)||
   !schoolWalkable(BICYCLE_COLLECTION_POINT,PLAYER_RADIUS))return false;
 if(Math.hypot(player.x-BICYCLE_COLLECTION_POINT.x,player.y-BICYCLE_COLLECTION_POINT.y)>
    BICYCLE_COLLECTION_RADIUS)return false;
 return !segmentObstacleHit(player,BICYCLE_COLLECTION_POINT,obstacles,0);
}
export function blazejConfrontationReady(phase,player,boss=BLAZEJ_START){
 return phase==='BLAZEJ_PENDING'&&!!player&&
  Math.hypot(player.x-boss.x,player.y-boss.y)<=BLAZEJ_CONFRONT_RADIUS;
}
export const BLAZEJ_JUMP_MAX_TRAVEL=240;
// Sample valid landing positions close to the captured player position.
// Prefer a near miss (~44px) to a guaranteed direct collision with Aloes;
// the unchanged shockwave can still be dodged during the visible flight.
// Every segment is swept against the existing School solid footprints.
export function blazejJumpLanding(origin,player,obstacles=SCHOOL_OBSTACLES){
 if(!origin||!player||![origin.x,origin.y,player.x,player.y].every(Number.isFinite))
  return null;
 const dx=origin.x-player.x,dy=origin.y-player.y,d=Math.hypot(dx,dy);
 const toward=d>0?Math.atan2(dy,dx):0;
 const candidates=[];
 for(const radius of [44,32,60,80,100,120,0]){
  for(let i=0;i<(radius===0?1:16);i++){
   const angle=toward+(i%2===0?1:-1)*Math.ceil(i/2)*Math.PI/8;
   const point={x:player.x+radius*Math.cos(angle),y:player.y+radius*Math.sin(angle)};
   const travel=Math.hypot(point.x-origin.x,point.y-origin.y);
   if(travel>BLAZEJ_JUMP_MAX_TRAVEL||travel<.001)continue;
   if(!schoolWalkable(point,BLAZEJ_RADIUS)||
      firstFootprintHit(origin,point,obstacles,BLAZEJ_RADIUS))continue;
   candidates.push({point,travel,proximity:Math.hypot(point.x-player.x,point.y-player.y)});
  }
 }
 // If the player is farther away, make the longest possible safe forward leap
 // instead of bouncing on the spot. Still never cross a solid or map boundary.
 if(d>BLAZEJ_JUMP_MAX_TRAVEL){
  for(const distance of [240,220,200,180,160,140,120,100,80,60,40]){
   const point={x:origin.x+(player.x-origin.x)/d*distance,
    y:origin.y+(player.y-origin.y)/d*distance};
   if(schoolWalkable(point,BLAZEJ_RADIUS)&&
      !firstFootprintHit(origin,point,obstacles,BLAZEJ_RADIUS))
    candidates.push({point,travel:distance,proximity:Math.hypot(point.x-player.x,point.y-player.y)});
  }
 }
 candidates.sort((a,b)=>a.proximity-b.proximity||
  Math.abs(a.travel-150)-Math.abs(b.travel-150));
 return candidates[0]?.point??(schoolWalkable(origin,BLAZEJ_RADIUS)?{x:origin.x,y:origin.y}:null);
}
export function chapelReturnValid(){return schoolWalkable(CHAPEL_RETURN)&&
 Math.hypot(CHAPEL_RETURN.x-SCHOOL_PLACES.chapelDoor.x,CHAPEL_RETURN.y-SCHOOL_PLACES.chapelDoor.y)<180;}
