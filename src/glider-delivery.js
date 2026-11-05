import {AIRSHIP_LANDING_ZONES,insideDeck,WHEELHOUSE_FOOTPRINT,AIRSHIP_WORLD} from './airship-contract.js';
import {ENEMY_TYPES} from './enemy-types.js';

// Two deliberate demonstrations; no wave or autonomous encounter director.
export const GLIDER_DEMO=Object.freeze([
  Object.freeze({id:'delivery-bobro',type:'bobrozombi',atMs:1200,zoneId:'port-aft',from:{x:125,y:166},exit:{x:940,y:115}}),
  Object.freeze({id:'delivery-bocian',type:'bocianolak',atMs:6100,zoneId:'starboard-fore',from:{x:835,y:370},exit:{x:30,y:390}}),
]);
export const GLIDER_PHASES=Object.freeze(['approaching','dropping','departing','finished']);
export const GLIDER_APPROACH_MS=1800;
export const GLIDER_DROP_MS=500;
export const GLIDER_HOLD_MS=9000;
export const GLIDER_SUSPENSION_HEIGHT=108;
export const GLIDER_APPROACH_SPEED=265;
export const GLIDER_EXPANDED_SEARCH_MS=1600;
export const GLIDER_DEPART_MS=1900;
export const LANDING_MS=700;
export const GLIDER_ART_PATH='vehicles/hang-glider.png';
export const GLIDER_ART_KEY='airship-hang-glider-v1';

export function landingPointSafe(point,player,occupied=[],radius=ENEMY_TYPES.bobrozombi.radius){
  if(!point||!player||!insideDeck(point,radius+8))return false;
  if(Math.hypot(point.x-player.x,point.y-player.y)<radius+85)return false;
  const f=WHEELHOUSE_FOOTPRINT;
  if(Math.hypot((point.x-f.x)/(f.rx+radius+8),(point.y-f.y)/(f.ry+radius+8))<1)return false;
  return !occupied.some(other=>Math.hypot(point.x-other.x,point.y-other.y)<radius+other.radius+26);
}
export function landingPosition(zoneId,player,occupied=[],radius=ENEMY_TYPES.bobrozombi.radius,expanded=false){
  const preferred=AIRSHIP_LANDING_ZONES.find(z=>z.id===zoneId);
  const zones=preferred?[preferred,...AIRSHIP_LANDING_ZONES.filter(z=>z!==preferred)]:AIRSHIP_LANDING_ZONES;
  const candidates=zones.flatMap(zone=>[[0,0],[32,30],[-32,-30],[38,-30],[-38,30]]
    .map(([dx,dy])=>({x:zone.x+dx,y:zone.y+dy})));
  // If regular landing slots are blocked, sweep the actual deck after a short hold.
  // Deterministic order prioritizes the intended landing zone, not a random teleport.
  if(expanded){
    const grid=[];
    for(let y=150;y<=390;y+=48)for(let x=155;x<=805;x+=55)grid.push({x,y});
    grid.sort((a,b)=>Math.hypot(a.x-(preferred?.x??480),a.y-(preferred?.y??270))-
       Math.hypot(b.x-(preferred?.x??480),b.y-(preferred?.y??270)));
    candidates.push(...grid);
  }
  for(const point of candidates){
    if(landingPointSafe(point,player,occupied,radius))return point;
  }
  return null;
}
export function makeFlight(spec,initialPoint=null){
  if(!['bobrozombi','bocianolak'].includes(spec.type))throw Error('Unsupported glider passenger');
  const zone=AIRSHIP_LANDING_ZONES.find(z=>z.id===spec.zoneId);
  if(!zone)throw Error('Unknown landing zone');
  return {id:spec.id,type:spec.type,zoneId:spec.zoneId,from:{...spec.from},
    exit:{...spec.exit,x:spec.exit.x>AIRSHIP_WORLD.width/2?AIRSHIP_WORLD.width+160:-160},
    target:initialPoint?{x:initialPoint.x,y:initialPoint.y-GLIDER_SUSPENSION_HEIGHT}:null,
    landingPoint:initialPoint?{...initialPoint}:null,
    x:spec.from.x,y:spec.from.y,heading:{x:zone.x-spec.from.x,y:zone.y-spec.from.y-GLIDER_SUSPENSION_HEIGHT},
    phase:'approaching',elapsed:0,age:0,released:false,landed:false,finished:false,blocked:false,
    departFrom:null};
}
const mix=(a,b,t)=>a+(b-a)*t;
// The target may change when deck occupancy changes. Always steer from the
// current airborne coordinates, never restart a lerp from the spawn point.
export function stepFlight(flight,deltaMs,point=null){
  if(flight.finished)return {drop:false,finished:false,blocked:false};
  const delta=Math.max(0,Math.min(50,deltaMs));
  flight.elapsed+=delta;
  flight.age+=delta;
  let drop=false,finished=false,blocked=false;
  if(flight.phase==='approaching'||flight.phase==='dropping'){
    if(point&&(flight.landingPoint?.x!==point.x||flight.landingPoint?.y!==point.y)){
      flight.landingPoint={...point};
      flight.target={x:point.x,y:point.y-GLIDER_SUSPENSION_HEIGHT};
    }
    if(flight.target){
      const dx=flight.target.x-flight.x,dy=flight.target.y-flight.y,distance=Math.hypot(dx,dy);
      if(distance>1e-6){
        const travel=Math.min(distance,GLIDER_APPROACH_SPEED*delta/1000);
        flight.x+=dx/distance*travel;flight.y+=dy/distance*travel;
        flight.heading={x:dx,y:dy};
      }
      if(Math.hypot(flight.target.x-flight.x,flight.target.y-flight.y)<1.5){
        flight.phase='dropping';
        // If the reserved point is no longer safe, wait or redirect toward
        // another candidate; do not release above an invalid location.
        if(point&&flight.landingPoint.x===point.x&&flight.landingPoint.y===point.y&&flight.elapsed>=300){
          flight.released=true;drop=true;flight.departFrom={x:flight.x,y:flight.y};
          flight.phase='departing';flight.elapsed=0;
        }
      }
    }
    if(!flight.released&&flight.age>=GLIDER_APPROACH_MS+GLIDER_HOLD_MS){
      flight.phase='departing';flight.elapsed=0;flight.blocked=true;blocked=true;
      flight.departFrom={x:flight.x,y:flight.y};
    }
  }else if(flight.phase==='departing'){
    const t=Math.min(1,flight.elapsed/GLIDER_DEPART_MS),from=flight.departFrom??flight.from;
    const dx=flight.exit.x-flight.x,dy=flight.exit.y-flight.y;
    if(Math.hypot(dx,dy)>1)flight.heading={x:dx,y:dy};
    flight.x=mix(from.x,flight.exit.x,t);
    flight.y=mix(from.y,flight.exit.y,t);
    if(t===1){flight.phase='finished';flight.finished=true;finished=true;}
  }
  return {drop,finished,blocked};
}
export function stepLanding(landing,deltaMs){
  if(landing.finished)return false;
  landing.elapsed=Math.min(LANDING_MS,landing.elapsed+Math.max(0,Math.min(50,deltaMs)));
  if(landing.elapsed===LANDING_MS){landing.finished=true;return true;}
  return false;
}
