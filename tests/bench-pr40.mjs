// Informational benchmark (not a flaky CI assertion).
import {performance} from 'node:perf_hooks';
import {reachableCells,firstFootprintHit} from '../src/obstacle-geometry.js';
import {createAuthoredObstacles} from '../src/obstacle-catalog.js';
const cases=[15,50,150];
function sample(n){
 return createAuthoredObstacles(Array.from({length:n},(_,i)=>({
  id:'bush-'+i,type:'bush',variant:i%3===0?'wide':'default',
  x:100+(i%15)*107,y:100+Math.floor(i/15)*88,angle:(i%4)*Math.PI/4
 })));
}
function measure(fn,iterations){
 const t0=performance.now();
 for(let i=0;i<iterations;i++)fn(i);
 return +(performance.now()-t0).toFixed(2);
}
for(const n of cases){
 const obstacles=sample(n);
 const navRuns=4,hitRuns=500;
 const navMs=measure(()=>reachableCells({width:1800,height:1200,cellSize:12,actorRadius:30,origin:{x:900,y:600},obstacles}),navRuns);
 const hitMs=measure(i=>firstFootprintHit({x:50,y:50+i%200},{x:1750,y:1100-i%200},obstacles,5),hitRuns);
 const cells=Math.ceil(1800/12)*Math.ceil(1200/12);
 console.log(JSON.stringify({obstacles:n,navRuns,navMs,hitRuns,hitMs,gridCells:cells,typedArrayBytes:cells*2,heapUsed:process.memoryUsage().heapUsed}));
}
