import {ARENA,PLAYER_RADIUS,PLAYER_SPEED,normalizeInput} from './movement.js';
import {footprintOverlap} from './obstacle-geometry.js';
import {resolveObstaclePosition} from './obstacles.js';
import {createAuthoredObstacles} from './obstacle-catalog.js';

// Act IV reuses Act I's world dimensions, swept collisions and player radius.
// All geometry is authoritative without a school PNG; artwork is decorative.
export const SCHOOL_WORLD=ARENA;
export const SCHOOL_WAVE_COUNT=4;
export const SCHOOL_PLACES=Object.freeze({
  chapel:Object.freeze({x:330,y:840,width:300,height:250,label:'KAPLICA'}),
  chapelDoor:Object.freeze({x:360,y:978}),
  playerStart:Object.freeze({x:525,y:1030}),
  school:Object.freeze({x:1360,y:415,width:590,height:360,label:'SZKOŁA ZAWODOWA'}),
  schoolEntrance:Object.freeze({x:1340,y:630}),
  pitch:Object.freeze({x:790,y:930,width:560,height:345,label:'BOISKO'}),
  bicycleRack:Object.freeze({x:1510,y:830,width:220,height:54,label:'ROWERY'}),
  debugSchool:Object.freeze({x:900,y:600}),
  maciek:Object.freeze({x:695,y:620}),
  seba:Object.freeze({x:770,y:610}),
  pitchApproach:Object.freeze({x:1065,y:870}),
});
// Approved RGBA8 production art has transparent padding. These deliberately
// follow the lower *visible* body/contact band, not the source PNG canvas.
// Native art and world placement remain independent of these solid footprints:
// school 610x450 (alpha x56..564 / y80..379), chapel 235x235
// (alpha x74..160 / y47..182), rack 330x255 (alpha x33..300 / y44..214).
export const SCHOOL_VISIBLE_FOOTPRINTS=Object.freeze({
  school:Object.freeze({x:1360,y:450,width:500,height:160}),
  chapel:Object.freeze({x:330,y:880,width:96,height:94}),
  bicycleRack:Object.freeze({x:1510,y:802,width:252,height:58}),
});
export const SCHOOL_OBSTACLES=Object.freeze([
  ...['chapel','school','bicycleRack'].map(id=>{
    const p=SCHOOL_VISIBLE_FOOTPRINTS[id];
    return Object.freeze({id,x:p.x,y:p.y,alive:true,gameplayClass:'solid',
      footprint:Object.freeze({shape:'box',x:p.x,y:p.y,width:p.width,height:p.height,angle:0})});
  }),
  ...createAuthoredObstacles([
   {id:'school-tire-pile',type:'tire_pile',x:975,y:695},
   {id:'school-tire-pile-2',type:'tire_pile',x:680,y:1140},
   {id:'school-toi-toi',type:'toi_toi',x:1185,y:675},
   {id:'school-rock-small',type:'rock',variant:'small',x:505,y:760},
   {id:'school-rock-medium',type:'rock',variant:'medium',x:1165,y:1095}
  ])
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
  if(['act4-blazej','act4-boss','act4-finale'].includes(id))return {x:1190,y:740};
  return SCHOOL_PLACES.playerStart;
}
