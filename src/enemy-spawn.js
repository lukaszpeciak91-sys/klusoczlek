import {ENCOUNTER} from './bobrozombi.js';
import {clearPoint,safeEnemySpawn} from './weapon-progression.js';

// Ordinary opportunities only. Marcin's separate380ms scheduler is unchanged.
export const ORDINARY_SPAWN_INTERVAL_MS=275;

export function selectOrdinarySpawn({player,obstacles,index,radius,view,seed=0,navigation=null,occupied=[]}){
 const margin=radius+4;
 const acceptable=p=>Math.hypot(p.x-player.x,p.y-player.y)>=ENCOUNTER.minSpawnDistance
  &&clearPoint(p,obstacles,margin,navigation)
  &&occupied.every(e=>Math.hypot(p.x-e.x,p.y-e.y)>=radius+(e.radius??ENCOUNTER.enemyRadius)+12);
 // Stateless selection owns no RNG stream and varies edges with the spawn ordinal.
 const hash=Math.imul(seed^0x50a9,0x85ebca6b)>>>0;
 const fractions=[.5+(((hash>>>12)+index)%5-2)*.025,.25,.75,0,1];
 const firstEdge=(hash+index)%4,phase=((hash>>>8)+index*2)%5;
 if(view&&[view.x,view.y,view.width,view.height].every(Number.isFinite)&&view.width>0&&view.height>0){
  // Prefer just inside the perimeter, then the edge, then a shallow exterior
  // band. Small screens cannot contain a220px safety circle; allow safe entry.
  for(const padding of [-margin,0,margin]){
   const left=view.x-padding,right=view.x+view.width+padding,top=view.y-padding,bottom=view.y+view.height+padding;
   if(right<left||bottom<top)continue;
   let closest=null,bestDistance=Infinity;
   for(let edge=0;edge<4;edge++)for(let sample=0;sample<5;sample++){
    const t=fractions[(phase+sample)%5],side=(firstEdge+edge)%4;
    const p=side===0?{x:right,y:top+(bottom-top)*t}:side===1?{x:left+(right-left)*t,y:bottom}:side===2?{x:left,y:top+(bottom-top)*t}:{x:left+(right-left)*t,y:top};
    const distance=Math.hypot(p.x-player.x,p.y-player.y);
    if(distance<bestDistance-1e-6&&acceptable(p)){closest=p;bestDistance=distance;}
   }
   if(closest)return {point:closest,mode:'camera'};
  }
 }
 // Keep the existing finite world policy as fallback, including navigation and
 // world bounds. An occupied fallback does not justify an overlapping actor.
 for(let offset=0;offset<8;offset++){
  const p=safeEnemySpawn(player,obstacles,index+offset,radius,navigation);
  if(p&&acceptable(p))return {point:p,mode:'fallback'};
 }
 return {point:null,mode:'deferred'};
}
