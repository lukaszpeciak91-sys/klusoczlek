import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFootprint,validateRadius} from '../src/obstacle-validation.js';
import {createObstacle,createAuthoredObstacles} from '../src/obstacle-catalog.js';
import {footprintOverlap,segmentFootprintHit,firstFootprintHit,reachableCells} from '../src/obstacle-geometry.js';

const circle=(x,y,radius)=>({shape:'circle',x,y,angle:0,radius});
const box=(x,y,width,height,angle=0)=>({shape:'box',x,y,width,height,angle});
const capsule=(x,y,length,radius,angle=0)=>({shape:'capsule',x,y,length,radius,angle});

test('invalid authoring geometry is rejected rather than clamped',()=>{
 for(const s of [{...circle(0,0,1),x:NaN},{...circle(0,0,1),angle:Infinity},circle(0,0,0),box(0,0,0,12),box(0,0,12,NaN),capsule(0,0,15,10),capsule(0,0,Infinity,10),{shape:'triangle',x:0,y:0,angle:0}]){
  assert.throws(()=>validateFootprint(s));
 }
 for(const radius of [-1,NaN,Infinity])assert.throws(()=>validateRadius(radius));
 assert.equal(validateRadius(0),0);
 assert.throws(()=>createObstacle('bush',{id:'x',x:1,y:2,angle:Infinity}));
});

test('rotated capsule and box preserve geometric impact ordering',()=>{
 const cap=capsule(200,200,120,12,Math.PI/2);
 assert.ok(footprintOverlap(cap,{x:200,y:244},0));
 assert.ok(!footprintOverlap(cap,{x:245,y:200},0));
 const rotated=box(250,200,80,20,Math.PI/2);
 assert.ok(footprintOverlap(rotated,{x:250,y:230},0));
 assert.ok(!footprintOverlap(rotated,{x:285,y:200},0));
 const from={x:0,y:200},to={x:400,y:200};
 const a=firstFootprintHit(from,to,[{...rotated,id:'box',alive:true},{...circle(160,200,20),id:'circle',alive:true}]);
 assert.equal(a.obstacle.id,'circle');
 assert.ok(a.t>=0&&a.t<.5);
});

test('tangent, zero-length and origin-inside are handled',()=>{
 const c=circle(100,100,20);
 assert.ok(segmentFootprintHit({x:0,y:120},{x:200,y:120},c));
 assert.equal(segmentFootprintHit({x:0,y:0},{x:0,y:0},c),null);
 assert.equal(segmentFootprintHit({x:100,y:100},{x:100,y:100},c).t,0);
 assert.equal(segmentFootprintHit({x:0,y:100},{x:0.001,y:100},c),null);
 assert.ok(segmentFootprintHit({x:80,y:100},{x:81,y:100},c));
});

test('capsule endpoints, overlapping obstacles, destroyed exclusions and long travel',()=>{
 const cap=capsule(200,100,120,10);
 assert.ok(segmentFootprintHit({x:250,y:40},{x:250,y:160},cap));
 const candidates=[{id:'far',...circle(500,100,50)},{id:'near',...circle(200,100,5)}];
 assert.equal(firstFootprintHit({x:0,y:100},{x:1000,y:100},candidates).obstacle.id,'near');
 candidates[1].alive=false;
 assert.equal(firstFootprintHit({x:0,y:100},{x:1000,y:100},candidates).obstacle.id,'far');
 assert.ok(segmentFootprintHit({x:-100000,y:100},{x:100000,y:100},circle(0,100,10)));
});

test('conservative connectivity over relevant actor radii and cell sizes',()=>{
 for(const actorRadius of [17,18,21,30])for(const cellSize of [6,10,16]){
  const free=reachableCells({width:400,height:300,cellSize,actorRadius,origin:{x:70,y:70},obstacles:[]});
  assert.ok(free.isReachable({x:300,y:200}));
  const wall=reachableCells({width:400,height:300,cellSize,actorRadius,origin:{x:70,y:70},obstacles:[box(200,150,24,300)]});
  assert.equal(wall.isReachable({x:300,y:200}),false);
 }
});

test('navigation rejects malformed parameters and repeated bushes can form a barrier',()=>{
 const bushes=createAuthoredObstacles(Array.from({length:8},(_,i)=>({id:'b'+i,type:'bush',x:200,y:25+i*40})));
 const nav=reachableCells({width:400,height:320,cellSize:8,actorRadius:17,origin:{x:70,y:160},obstacles:bushes});
 assert.equal(nav.isReachable({x:330,y:160}),false);
 assert.throws(()=>reachableCells({width:400,height:320,cellSize:8,actorRadius:-2,origin:{x:70,y:160},obstacles:[]}));
 assert.throws(()=>reachableCells({width:400,height:320,cellSize:8,actorRadius:17,margin:NaN,origin:{x:70,y:160},obstacles:[]}));
});
