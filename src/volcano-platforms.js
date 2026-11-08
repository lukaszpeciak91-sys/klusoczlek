import {volcanoFootprintAllowed} from './volcano-contract.js';
import {FAIRY_MARK} from './volcano-npcs.js';

// Explicit encounter regions in the approved 1800x1200 terrain coordinates.
// Narrow walkable passages do not merge these gameplay zones.
export const VOLCANO_ZONES=Object.freeze([
 Object.freeze({id:'entrance',bounds:Object.freeze({minX:55,maxX:625,minY:720,maxY:1180}),
  enemies:Object.freeze(['lawostworek-1','lawostworek-2']),
  spawns:Object.freeze([{x:355,y:815},{x:480,y:820},{x:250,y:920},{x:405,y:815}])}),
 Object.freeze({id:'middle',bounds:Object.freeze({minX:625,maxX:1420,minY:560,maxY:1170}),
  enemies:Object.freeze(['lawostworek-1','lawostworek-1','lawostworek-2']),
  spawns:Object.freeze([{x:900,y:920},{x:1030,y:850},{x:760,y:760},{x:1110,y:940}])}),
 Object.freeze({id:'apartment-approach',bounds:Object.freeze({minX:920,maxX:1400,minY:565,maxY:935}),
  enemies:Object.freeze(['lawostworek-1','lawostworek-2','lawostworek-1']),
  spawns:Object.freeze([{x:1010,y:790},{x:1120,y:705},{x:1195,y:620}])}),
 Object.freeze({id:'fairy',bounds:Object.freeze({minX:65,maxX:680,minY:105,maxY:470}),
  enemies:Object.freeze(['lawostworek-1','lawostworek-1','lawostworek-2','lawostworek-2']),
  spawns:Object.freeze([{x:315,y:300},{x:455,y:280},{x:220,y:225},{x:530,y:315},{x:360,y:185}])})
]);
// Trigger tracks actual, terrain-validated pre-staged enemies (including small fallback offsets).
export const LAWOS_OPENING_TRIGGER_RADIUS=135;
export function lawosDialogueTrigger(enemies){
 if(enemies.length!==2)return null;
 return Object.freeze({x:Math.round((enemies[0].x+enemies[1].x)/2),
  y:Math.round((enemies[0].y+enemies[1].y)/2),radius:LAWOS_OPENING_TRIGGER_RADIUS});
}
export function lawosTriggerReached(player,trigger){
 return Boolean(trigger&&Math.hypot(player.x-trigger.x,player.y-trigger.y)<=trigger.radius);
}
export function inVolcanoZone(zone,point){
 const b=zone.bounds;
 return point.x>=b.minX&&point.x<=b.maxX&&point.y>=b.minY&&point.y<=b.maxY;
}
export function zoneForPosition(point){
 return VOLCANO_ZONES.find(zone=>inVolcanoZone(zone,point))?.id??null;
}
// Stage at terrain load; activate when Aloes nears the lower connecting route.
export const APPROACH_WAKE_DISTANCE=245;
export function approachEngagementDue(player,staged,range=APPROACH_WAKE_DISTANCE){
 return Boolean(player&&staged?.some(enemy=>!enemy.dead&&enemy.engaged===false&&
  Math.hypot(player.x-enemy.x,player.y-enemy.y)<=range));
}
export function findZoneSpawn(mask,zone,preferred,radius,avoid=[],maxDistance=105){
 const allowed=(x,y)=>inVolcanoZone(zone,{x,y})&&volcanoFootprintAllowed(mask,x,y,radius)&&
  avoid.every(p=>Math.hypot(x-p.x,y-p.y)>=radius+(p.radius??18)+12);
 if(allowed(preferred.x,preferred.y))return {...preferred};
 let best=null,dist=Infinity;
 for(let r=6;r<=maxDistance;r+=6){
  const count=Math.max(16,Math.ceil(2*Math.PI*r/6));
  for(let i=0;i<count;i++){
   const a=2*Math.PI*i/count,x=Math.round(preferred.x+Math.cos(a)*r),y=Math.round(preferred.y+Math.sin(a)*r);
   if(!allowed(x,y))continue;
   const d=Math.hypot(x-preferred.x,y-preferred.y);
   if(d<dist){best={x,y};dist=d;}
  }
  if(best)return best;
 }
 return null;
}
export function createPlatformProgression(){
 const state=new Map(VOLCANO_ZONES.map(z=>[z.id,{activated:false,spawned:0,failed:0,alive:0,cleared:false}]));
 return {
  activate(id,spawn){
   const zone=VOLCANO_ZONES.find(z=>z.id===id),entry=state.get(id);
   if(!zone||entry.activated)return false;
   entry.activated=true;
   zone.enemies.forEach((type,index)=>{
    if(spawn(zone,type,index)){entry.spawned++;entry.alive++;}
    else entry.failed++;
   });
   // Missing spawns are diagnostics, never a fabricated combat victory.
   if(entry.failed)console.warn('[Volcano] zone '+id+': '+entry.failed+' invalid spawns');
   return true;
  },
  defeated(id){
   const entry=state.get(id);
   if(!entry||!entry.activated||entry.alive<=0)return false;
   entry.alive--;
   if(entry.alive===0&&entry.spawned>0)entry.cleared=true;
   return entry.cleared;
  },
  get(id){return state.get(id);},
  get fairyReveal(){return state.get('fairy').cleared;}
 };
}
export const FAIRY_ZONE=VOLCANO_ZONES.find(z=>z.id==='fairy');
if(!inVolcanoZone(FAIRY_ZONE,FAIRY_MARK))throw Error('Fairy mark outside approved encounter zone');
