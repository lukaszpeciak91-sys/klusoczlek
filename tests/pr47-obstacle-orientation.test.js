import test from 'node:test';
import assert from 'node:assert/strict';
import {generateArenaLayout,layoutSafe} from '../src/arena-layout.js';
import {createObstacle} from '../src/obstacle-catalog.js';
import {obstacleAtlasRenderer,obstacleArt} from '../src/obstacle-renderer.js';
import {reachableCells,firstFootprintHit} from '../src/obstacle-geometry.js';
import {segmentObstacleHit} from '../src/obstacles.js';
import {flameTargetVisible} from '../src/weapon-combat.js';
import {safeEnemySpawn,fallbackRewardPoint,clearPoint} from '../src/weapon-progression.js';
const seeds=[1,41,104729],center={x:900,y:600};

test('PR47 all twelve generated variants share authored angle zero and reproduce',()=>{
 const frames=new Set();
 for(const seed of [...Array(16).keys(),41,104729]){
  const a=generateArenaLayout(seed),b=generateArenaLayout(seed);
  assert.deepEqual(a.obstacles,b.obstacles);assert.deepEqual(a.diagnostics,b.diagnostics);
  for(const o of a.obstacles){assert.equal(o.angle,0,`${seed} ${o.id}`);assert.equal(o.footprint.angle,0);frames.add(obstacleArt(o).frame);}
 }
 assert.deepEqual([...frames].sort((a,b)=>a-b),[...Array(12).keys()]);
});

test('PR47 canonical layouts retain validation, all actor clearances, spawn and pickup reachability',()=>{
 for(const seed of seeds){
  const {obstacles}=generateArenaLayout(seed);assert.ok(layoutSafe(obstacles));
  for(const actorRadius of [17,18,21,30,40]){
   const nav=reachableCells({width:1800,height:1200,cellSize:20,actorRadius,origin:center,obstacles});
   assert.ok(nav.free>0);assert.equal(nav.free,nav.visited,`${seed} radius${actorRadius}`);
   for(let sector=0;sector<8;sector++){
    const spawn=safeEnemySpawn(center,obstacles,sector,actorRadius,nav);
    assert.ok(spawn&&clearPoint(spawn,obstacles,actorRadius+4,nav));
   }
   const reward=fallbackRewardPoint(center,obstacles,nav);assert.ok(reward&&clearPoint(reward,obstacles,29,nav));
  }
 }
});

test('PR47 projectile and flame surfaces match canonical footprints; generic rotation survives',()=>{
 for(const seed of seeds)for(const o of generateArenaLayout(seed).obstacles){
  const from={x:o.x,y:o.y-60},to={x:o.x,y:o.y+60};
  const hit=firstFootprintHit(from,to,[o],3);
  assert.equal(hit.obstacle,o);assert.equal(segmentObstacleHit(from,to,[o],3),o);
  const extent=o.footprint.shape==='box'?o.footprint.height/2:o.footprint.radius;
  assert.ok(Math.abs(hit.point.y-(o.y-extent-3))<1e-4,`${o.id} noncanonical surface`);
  assert.equal(flameTargetVisible(from,{x:0,y:1},to,0,[]),true);
  assert.equal(flameTargetVisible(from,{x:0,y:1},to,0,[o]),false);
 }
 const rotated=createObstacle('fallen_log',{id:'explicit-generic',x:700,y:600,angle:Math.PI/2,variant:'medium'});
 assert.equal(rotated.angle,Math.PI/2);assert.equal(rotated.footprint.angle,Math.PI/2);
 const hit=firstFootprintHit({x:700,y:500},{x:700,y:700},[rotated]);
 assert.ok(Math.abs(hit.point.y-(600-126/2))<1e-4);
});

test('PR47 existing renderer consumes the same zero angle for every generated variant',async()=>{
 const node=()=>{
  const data=new Map(),o={active:true,rotation:0,list:[]};
  const methods={setPosition(x,y){o.x=x;o.y=y;return proxy;},setRotation(a){o.rotation=a;return proxy;},setData(k,v){data.set(k,v);return proxy;},getData(k){return data.get(k);},add(v){o.list.push(v);return proxy;}};
  const proxy=new Proxy(o,{get:(t,k)=>k in methods?methods[k]:k in t?t[k]:(()=>proxy)});return proxy;
 };
 const scene={add:{container:node,graphics:node,image:node},events:{once(){}},textures:{exists:()=>true,get:()=>({setFilter(){}})}};
 const renderer=obstacleAtlasRenderer(scene);await renderer.loading;assert.ok(renderer.loaded);
 const seen=new Set();
 for(const seed of [...Array(16).keys(),41,104729])for(const o of generateArenaLayout(seed).obstacles){
  const view=renderer.create(o),image=view.getData('atlasSprite');
  assert.equal(view.rotation,o.footprint.angle);assert.ok(image.rotation===0);assert.equal(view.getData('fallback').rotation,0);seen.add(obstacleArt(o).frame);
 }
 assert.equal(seen.size,12);
});
