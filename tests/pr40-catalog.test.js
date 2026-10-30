import test from 'node:test';
import assert from 'node:assert/strict';
import {OBSTACLE_CATALOG,createAuthoredObstacles,createObstacle} from '../src/obstacle-catalog.js';
import {footprintOverlap,firstFootprintHit} from '../src/obstacle-geometry.js';

test('catalog is immutable and separates gameplay from render metadata',()=>{
 assert.ok(Object.isFrozen(OBSTACLE_CATALOG));
 for(const [type,def] of Object.entries(OBSTACLE_CATALOG)){
  assert.equal(def.id,type);
  assert.ok(['solid','destructible','decorative'].includes(def.gameplayClass));
  assert.ok(Object.isFrozen(def.variants));
  assert.ok(def.render.asset && def.render.fallback);
 }
});

test('authored bushes can repeat, preserving independent state',()=>{
 const bushes=createAuthoredObstacles([
  {id:'corridor-left',type:'bush',x:100,y:200},
  {id:'corridor-right',type:'bush',x:250,y:200}
 ]);
 assert.equal(bushes.length,2);
 assert.notStrictEqual(bushes[0].footprint,bushes[1].footprint);
 assert.equal(bushes[0].gameplayClass,'solid');
 assert.throws(()=>createAuthoredObstacles([{id:'dup',type:'bush',x:0,y:0},{id:'dup',type:'bush',x:90,y:0}]),/Duplicate/);
});

test('long logs block at their ends; first hit includes exact distance',()=>{
 const log=createObstacle('fallen_log',{id:'log-1',x:250,y:100,variant:'medium',angle:0});
 assert.ok(footprintOverlap(log.footprint,{x:300,y:100},17));
 const hit=firstFootprintHit({x:100,y:100},{x:400,y:100},[log],5);
 assert.equal(hit.obstacle.id,'log-1');
 assert.ok(hit.t>0&&hit.t<0.5);
});

test('destroyed barrel is excluded from geometry queries',()=>{
 const barrel=createObstacle('toxic_barrel',{id:'barrel-1',x:200,y:100});
 assert.ok(firstFootprintHit({x:100,y:100},{x:300,y:100},[barrel]));
 barrel.alive=false;
 assert.equal(firstFootprintHit({x:100,y:100},{x:300,y:100},[barrel]),null);
});
