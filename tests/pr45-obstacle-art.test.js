import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as renderer from '../src/obstacle-renderer.js';
import {createObstacle,OBSTACLE_CATALOG} from '../src/obstacle-catalog.js';
import {generateArenaLayout,layoutSafe} from '../src/arena-layout.js';
import {firstFootprintHit,reachableCells,footprintDistance} from '../src/obstacle-geometry.js';
import {flameTargetVisible} from '../src/weapon-combat.js';

test('PR45 twelve immutable mappings exactly match supplied source metadata',()=>{
 const json=JSON.parse(readFileSync(new URL('../public/assets/obstacles/forest-obstacles.json',import.meta.url)));
 assert.equal(renderer.FOREST_ATLAS.path,'obstacles/forest-obstacles.png');
 assert.equal(renderer.OBSTACLE_ART.length,12);
 renderer.OBSTACLE_ART.forEach((art,i)=>{
  assert.equal(art.frame,i);assert.equal(art.id,json.frames[i].id);
  assert.deepEqual(art.anchor,json.frames[i].anchor_px);assert.deepEqual(art.bounds,json.frames[i].paint_bounds_px);
  assert.ok(Object.isFrozen(art));assert.ok(art.scale>0&&art.scale<1);
 });
});
test('PR45 semantic mapping preserves original geometry and adds two solids',()=>{
 const expected={rock:[['small',{shape:'circle',radius:23}],['medium',{shape:'circle',radius:31}],['large',{shape:'circle',radius:43}]],stump:[['default',{shape:'circle',radius:24}]],fallen_log:[['short',{shape:'capsule',length:84,radius:19}],['medium',{shape:'capsule',length:126,radius:21}]],bush:[['default',{shape:'circle',radius:30}],['wide',{shape:'capsule',length:78,radius:24}]],toxic_barrel:[['default',{shape:'circle',radius:23}]],toi_toi:[['default',{shape:'box',width:52,height:46}]]};
 let frame=0;for(const [type,variants] of Object.entries(expected))for(const [variant,shape] of variants){assert.deepEqual(OBSTACLE_CATALOG[type].variants[variant],shape);assert.equal(renderer.obstacleArt(createObstacle(type,{id:'test',x:500,y:500,variant})).frame,frame++);}
 for(const [type,length,radius,index] of [['tire_pile',78,24,10],['broken_wheelbarrow',90,20,11]]){
  const o=createObstacle(type,{id:type,x:500,y:500,angle:Math.PI/4});assert.equal(o.gameplayClass,'solid');assert.equal(o.hp,Infinity);assert.deepEqual(OBSTACLE_CATALOG[type].variants.default,{shape:'capsule',length,radius});assert.equal(renderer.obstacleArt(o).frame,index);
  assert.ok(firstFootprintHit({x:350,y:500},{x:650,y:500},[o],3));
  assert.equal(flameTargetVisible({x:430,y:500},{x:1,y:0},{x:560,y:500},17,[]),true);
  assert.equal(flameTargetVisible({x:430,y:500},{x:1,y:0},{x:560,y:500},17,[o]),false);
 }
});
test('PR45 new families are rare, deterministic, clear of start and navigable including boss',()=>{
 let seen=new Set();
 for(const seed of [1,2,3,41,104729,0xdeadbeef]){
  const a=generateArenaLayout(seed),b=generateArenaLayout(seed);assert.deepEqual(a.obstacles,b.obstacles);assert.ok(layoutSafe(a.obstacles));
  for(const type of ['tire_pile','broken_wheelbarrow']){const count=a.obstacles.filter(o=>o.type===type).length;assert.ok(count<=1);if(count)seen.add(type);}
  for(const actorRadius of [17,18,21,30,40]){const n=reachableCells({width:1800,height:1200,cellSize:20,actorRadius,origin:{x:900,y:600},obstacles:a.obstacles});assert.equal(n.visited,n.free);}
 }
 assert.equal(seen.size,2);
});

import {createHash} from 'node:crypto';
import {validPngHeader} from '../src/character-visual.js';
test('PR45 unchanged approved PNG integrity when manually installed',t=>{
 let png;try{png=readFileSync(new URL('../public/assets/obstacles/forest-obstacles.png',import.meta.url));}catch(error){if(error.code==='ENOENT'){t.skip('User-managed PNG not installed; metadata/fallback contracts still run');return;}throw error;}
 assert.equal(createHash('sha256').update(png).digest('hex'),'937912656422d9f549f707396228f34d595f88365c53faf896a320d5b0bc49b0');
 assert.ok(validPngHeader(png,renderer.FOREST_ATLAS));
 const invalid=Buffer.from(png);invalid[25]=2;assert.equal(validPngHeader(invalid,renderer.FOREST_ATLAS),false);
});

import {moveEnemy,ENEMY_TYPES} from '../src/enemy-types.js';
import {resolveObstaclePosition,steerObstacleStep} from '../src/obstacles.js';
test('PR45 new solids stop players and allow real local pursuit around rotated bodies',()=>{
 for(const family of ['tire_pile','broken_wheelbarrow'])for(const angle of [0,Math.PI/4]){
  const o=createObstacle(family,{id:'body',x:700,y:600,angle});
  const blocked=resolveObstaclePosition({x:500,y:600},{x:900,y:600},17,[o]);if(angle===0)assert.ok(blocked.x<700);
  assert.ok(Math.hypot(blocked.x-900,blocked.y-600)>1);assert.ok(footprintDistance(o.footprint,blocked)>=17-1e-5);
  for(const type of ['bobrozombi','zubrokryptyda','marcin']){
   let e={type,x:500,y:600,hp:36,seed:2};const goal={x:950,y:600};
   for(let i=0;i<1800&&Math.hypot(e.x-goal.x,e.y-goal.y)>40;i++){const next=moveEnemy(e,goal,.05,i*.05);Object.assign(e,steerObstacleStep(e,next,goal,ENEMY_TYPES[type].radius,[o]));}
   assert.ok(Math.hypot(e.x-goal.x,e.y-goal.y)<=40,`${type} trapped by ${family}`);
  }
 }
});
