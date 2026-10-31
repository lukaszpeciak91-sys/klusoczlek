import test from 'node:test';
import assert from 'node:assert/strict';
import { footprintOverlap, segmentFootprintHit, reachableCells } from '../src/obstacle-geometry.js';

test('capsule footprint blocks entire long log, not only center',()=>{
 const log={shape:'capsule',x:300,y:300,length:140,radius:15,angle:0};
 assert.equal(footprintOverlap(log,{x:360,y:300},17),true);
 assert.equal(footprintOverlap(log,{x:360,y:345},17),false);
});

test('segment entry ordering uses first intersection rather than closest center',()=>{
 const a={shape:'circle',x:200,y:100,radius:30};
 const b={shape:'box',x:280,y:100,width:120,height:40,angle:0};
 const first=segmentFootprintHit({x:0,y:100},{x:400,y:100},a,0);
 const second=segmentFootprintHit({x:0,y:100},{x:400,y:100},b,0);
 assert.ok(first && second);
 assert.ok(first.t<second.t);
});

test('wall spanning world height disconnects both regions',()=>{
 const obstacles=[{shape:'box',x:100,y:100,width:30,height:200,angle:0}];
 const reach=reachableCells({width:200,height:200,cellSize:10,actorRadius:17,obstacles,origin:{x:40,y:40}});
 assert.equal(reach.isReachable({x:160,y:160}),false);
});
