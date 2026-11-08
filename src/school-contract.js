import {ARENA,PLAYER_RADIUS,PLAYER_SPEED,normalizeInput} from './movement.js';
import {footprintOverlap} from './obstacle-geometry.js';
import {resolveObstaclePosition} from './obstacles.js';

// Act IV reuses Act I's world dimensions, swept collisions and player radius.
// All geometry is authoritative without a school PNG; artwork is decorative.
export const SCHOOL_WORLD=ARENA;
export const SCHOOL_WAVE_COUNT=4;
export const SCHOOL_PLACES=Object.freeze({
  chapel:Object.freeze({x:330,y:300,width:300,height:250,label:'KAPLICA'}),
  chapelDoor:Object.freeze({x:330,y:447}),
  playerStart:Object.freeze({x:465,y:555}),
  school:Object.freeze({x:1360,y:415,width:590,height:360,label:'SZKOŁA ZAWODOWA'}),
  schoolEntrance:Object.freeze({x:1340,y:630}),
  pitch:Object.freeze({x:790,y:930,width:560,height:345,label:'BOISKO'}),
  bicycleRack:Object.freeze({x:1510,y:830,width:220,height:54,label:'ROWERY'}),
  debugSchool:Object.freeze({x:1190,y:720}),
});
export const SCHOOL_OBSTACLES=Object.freeze([
  ...['chapel','school','bicycleRack'].map(id=>{
    const p=SCHOOL_PLACES[id];
    return Object.freeze({id,x:p.x,y:p.y,alive:true,gameplayClass:'solid',
      footprint:Object.freeze({shape:'box',x:p.x,y:p.y,width:p.width,height:p.height,angle:0})});
  })
]);
export function schoolWalkable(point,radius=PLAYER_RADIUS){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
  if(point.x<radius||point.y<radius||point.x>SCHOOL_WORLD.width-radius||point.y>SCHOOL_WORLD.height-radius)return false;
  return SCHOOL_OBSTACLES.every(o=>!footprintOverlap(o.footprint,point,radius));
}
export function schoolStep(from,input,deltaMs,speed=PLAYER_SPEED){
  const dt=Math.max(0,Math.min(50,Number.isFinite(deltaMs)?deltaMs:0))/1000;
  const d=normalizeInput(Number.isFinite(input?.x)?input.x:0,Number.isFinite(input?.y)?input.y:0);
  const end={x:from.x+d.x*speed*dt,y:from.y+d.y*speed*dt};
  return resolveObstaclePosition(from,end,PLAYER_RADIUS,SCHOOL_OBSTACLES);
}
export function schoolDebugPoint(id){
  if(id==='act4-school')return SCHOOL_PLACES.debugSchool;
  if(id==='act4-wave4')return {x:900,y:930};
  return SCHOOL_PLACES.playerStart;
}
