import {performance} from 'node:perf_hooks';
import {generateArenaLayout} from '../src/arena-layout.js';
const seeds=[1,2,3,41,104729,0xdeadbeef,...Array.from({length:14},(_,i)=>100+i)];
for(const seed of seeds){
 const before=process.memoryUsage().heapUsed,start=performance.now();
 const layout=generateArenaLayout(seed);
 console.log(JSON.stringify({seed,ms:+(performance.now()-start).toFixed(2),heapBefore:before,heapAfter:process.memoryUsage().heapUsed,objects:layout.obstacles.length,...layout.diagnostics}));
}
