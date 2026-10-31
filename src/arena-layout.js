import {ARENA} from './movement.js';
import {OBSTACLE_CATALOG,createObstacle} from './obstacle-catalog.js';
import {inflatedBounds,footprintDistance,reachableCells} from './obstacle-geometry.js';
export const LAYOUT_LIMITS=Object.freeze({rock:Object.freeze([4,7]),stump:Object.freeze([2,4]),fallen_log:Object.freeze([1,2]),bush:Object.freeze([3,6]),toxic_barrel:Object.freeze([1,3]),toi_toi:Object.freeze([0,1])});
export const START_CLEARANCE=250;
export const OBSTACLE_SPACING=140;
const center={x:ARENA.width/2,y:ARENA.height/2};
const DEFAULT_ZONES=Object.freeze([
 {x:150,y:150,width:1500,height:220},{x:150,y:830,width:1500,height:220},
 {x:150,y:370,width:440,height:460},{x:1210,y:370,width:440,height:460}
]);
export function seededRandom(seed){
 let state=seed>>>0;
 return ()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function placementRadius(o){
 const s=o.footprint;
 return s.shape==='circle'?s.radius:s.shape==='capsule'?s.length/2:Math.hypot(s.width,s.height)/2;
}
function placementSafe(o,others){
 const b=inflatedBounds(o.footprint),edge=96;
 return b.minX>=edge&&b.minY>=edge&&b.maxX<=ARENA.width-edge&&b.maxY<=ARENA.height-edge
  &&footprintDistance(o.footprint,center)>START_CLEARANCE
  &&others.every(p=>Math.hypot(o.x-p.x,o.y-p.y)>=placementRadius(o)+placementRadius(p)+OBSTACLE_SPACING);
}
export function layoutSafe(obstacles){return obstacles.every((o,i)=>placementSafe(o,obstacles.slice(0,i)));}
function navigationFor(obstacles,actorRadius){return reachableCells({...ARENA,cellSize:20,actorRadius,origin:center,obstacles});}
export function generateArenaLayout(seed,config={}){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Arena seed must be uint32');
 const zones=config.zones??DEFAULT_ZONES,limits=config.limits??LAYOUT_LIMITS,attempts=config.attempts??100;
 if(!Array.isArray(zones)||!zones.length||!Number.isInteger(attempts)||attempts<1||attempts>200)throw new RangeError('Invalid layout bounds');
 for(const z of zones)if(![z.x,z.y,z.width,z.height].every(Number.isFinite)||z.width<=0||z.height<=0)throw new RangeError('Invalid placement zone');
 for(const [type,range] of Object.entries(limits))if(!OBSTACLE_CATALOG[type]||!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger)||range[0]<0||range[1]<range[0]||range[1]>30)throw new RangeError('Invalid object limits');
 const random=seededRandom(seed),obstacles=[];
 const diagnostics={seed,attempted:0,rejected:0,omitted:[],fallback:false,removedForConnectivity:0};
 for(const [type,[min,max]] of Object.entries(limits)){
  const count=min+Math.floor(random()*(max-min+1)),variants=Object.keys(OBSTACLE_CATALOG[type].variants);
  for(let i=0;i<count;i++){
   let accepted=false;
   for(let retry=0;retry<attempts;retry++){
    diagnostics.attempted++;
    const zone=zones[Math.floor(random()*zones.length)];
    const o=createObstacle(type,{id:type+'-'+i,x:zone.x+random()*zone.width,y:zone.y+random()*zone.height,angle:random()*Math.PI*2,variant:variants[Math.floor(random()*variants.length)]});
    if(placementSafe(o,obstacles)){obstacles.push(o);accepted=true;break;}
    diagnostics.rejected++;
   }
   if(!accepted)diagnostics.omitted.push(type+'-'+i);
  }
 }
 // Scene-init only. Failed connectivity removes clutter deterministically.
 let navigation;
 for(let remaining=obstacles.length;remaining>=0;remaining--){
  const grids=[17,18,21,30].map(r=>navigationFor(obstacles,r));
  if(grids.every(g=>g.free===g.visited&&g.visited>0)){navigation=grids[3];break;}
  obstacles.pop();diagnostics.removedForConnectivity++;
 }
 diagnostics.fallback=diagnostics.omitted.length>0||diagnostics.removedForConnectivity>0;
 diagnostics.counts=Object.fromEntries(Object.keys(limits).map(t=>[t,obstacles.filter(o=>o.type===t).length]));
 return {seed,obstacles,navigation,diagnostics};
}
