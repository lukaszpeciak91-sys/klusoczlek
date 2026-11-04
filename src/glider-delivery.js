import {AIRSHIP_LANDING_ZONES,insideDeck} from './airship-contract.js';
import {ENEMY_TYPES} from './enemy-types.js';

// Two deliberate demonstrations; no wave or autonomous encounter director.
export const GLIDER_DEMO=Object.freeze([
  Object.freeze({id:'delivery-bobro',type:'bobrozombi',atMs:1200,zoneId:'port-aft',from:{x:125,y:166},exit:{x:940,y:115}}),
  Object.freeze({id:'delivery-bocian',type:'bocianolak',atMs:6100,zoneId:'starboard-fore',from:{x:835,y:370},exit:{x:30,y:390}}),
]);
export const GLIDER_PHASES=Object.freeze(['approaching','dropping','departing','finished']);
export const GLIDER_APPROACH_MS=1800;
export const GLIDER_DROP_MS=500;
export const GLIDER_DEPART_MS=1900;
export const LANDING_MS=700;
export const GLIDER_ART_PATH='vehicles/hang-glider.png';
export const GLIDER_ART_KEY='airship-hang-glider-v1';

export function landingPosition(zoneId,player,occupied=[],radius=ENEMY_TYPES.bobrozombi.radius){
  const preferred=AIRSHIP_LANDING_ZONES.find(z=>z.id===zoneId);
  const zones=preferred?[preferred,...AIRSHIP_LANDING_ZONES.filter(z=>z!==preferred)]:AIRSHIP_LANDING_ZONES;
  for(const zone of zones){
    // Deterministic center and symmetric alternative offsets; no random overlaps.
    for(const [dx,dy] of [[0,0],[32,30],[-32,-30],[38,-30],[-38,30]]){
      const point={x:zone.x+dx,y:zone.y+dy};
      if(!insideDeck(point,radius+8)||Math.hypot(point.x-player.x,point.y-player.y)<radius+85)continue;
      if(occupied.some(other=>Math.hypot(point.x-other.x,point.y-other.y)<radius+other.radius+26))continue;
      return point;
    }
  }
  return null;
}
export function makeFlight(spec){
  if(!['bobrozombi','bocianolak'].includes(spec.type))throw Error('Unsupported glider passenger');
  const target=AIRSHIP_LANDING_ZONES.find(zone=>zone.id===spec.zoneId);
  if(!target)throw Error('Unknown landing zone');
  return {id:spec.id,type:spec.type,zoneId:spec.zoneId,from:{...spec.from},exit:{...spec.exit},
    target:{x:target.x,y:target.y},x:spec.from.x,y:spec.from.y,
    phase:'approaching',elapsed:0,released:false,landed:false,finished:false,landingPoint:null};
}
const mix=(a,b,t)=>a+(b-a)*t;
export function stepFlight(flight,deltaMs,point=null){
  if(flight.finished)return {drop:false,finished:false};
  const delta=Math.max(0,Math.min(50,deltaMs));
  flight.elapsed+=delta;
  let drop=false,finished=false;
  if(flight.phase==='approaching'){
    const t=Math.min(1,flight.elapsed/GLIDER_APPROACH_MS);
    flight.x=mix(flight.from.x,flight.target.x,t);
    flight.y=mix(flight.from.y,flight.target.y,t);
    if(t===1){flight.phase='dropping';flight.elapsed=0;}
  }else if(flight.phase==='dropping'){
    if(!flight.released&&point){
      flight.released=true;flight.landingPoint={...point};drop=true;
    }
    // Defers a blocked drop, then departs without creating an invalid passenger.
    if(flight.elapsed>=GLIDER_DROP_MS||flight.released){
      flight.phase='departing';flight.elapsed=0;
    }
  }else if(flight.phase==='departing'){
    const t=Math.min(1,flight.elapsed/GLIDER_DEPART_MS);
    flight.x=mix(flight.target.x,flight.exit.x,t);
    flight.y=mix(flight.target.y,flight.exit.y,t);
    if(t===1){flight.phase='finished';flight.finished=true;finished=true;}
  }
  return {drop,finished};
}
export function stepLanding(landing,deltaMs){
  if(landing.finished)return false;
  landing.elapsed=Math.min(LANDING_MS,landing.elapsed+Math.max(0,Math.min(50,deltaMs)));
  if(landing.elapsed===LANDING_MS){landing.finished=true;return true;}
  return false;
}
