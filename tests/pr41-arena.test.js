import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateArenaLayout,LAYOUT_LIMITS,placementRadius,layoutSafe} from '../src/arena-layout.js';
import {createObstacle} from '../src/obstacle-catalog.js';
import {footprintDistance,reachableCells,firstFootprintHit} from '../src/obstacle-geometry.js';
import {resolveObstaclePosition,steerObstacleStep,damageObstacle,segmentObstacleHit} from '../src/obstacles.js';
import {moveEnemy,ENEMY_TYPES} from '../src/enemy-types.js';
import {safeEnemySpawn,fallbackRewardPoint,clearPoint} from '../src/weapon-progression.js';
import {flameTargetVisible} from '../src/weapon-combat.js';
const seeds=[1,2,3,41,104729,0xdeadbeef];
const center={x:900,y:600};
test('PR41 seeded reproducibility, variation and approved counts',()=>{
 const signatures=new Set();
 for(const seed of seeds){
  const a=generateArenaLayout(seed),b=generateArenaLayout(seed);
  assert.deepEqual(a.obstacles,b.obstacles);assert.deepEqual(a.diagnostics,b.diagnostics);
  signatures.add(JSON.stringify(a.obstacles));
  assert.ok(a.diagnostics.attempted<=2300);
  for(const [type,[min,max]] of Object.entries(LAYOUT_LIMITS)){
   const count=a.obstacles.filter(o=>o.type===type).length;
   assert.ok(count>=min&&count<=max,`${seed} ${type} ${count}`);
  }
 }
 assert.equal(signatures.size,seeds.length);
});
test('PR41 finite rejection and deterministic safe fallback under impossible zones',()=>{
 const config={zones:[{x:880,y:580,width:40,height:40}],attempts:2};
 const a=generateArenaLayout(41,config),b=generateArenaLayout(41,config);
 assert.deepEqual(a.obstacles,b.obstacles);assert.ok(a.diagnostics.rejected>0);
 assert.ok(a.diagnostics.fallback);assert.ok(a.diagnostics.attempted<=50);
 assert.ok(layoutSafe(a.obstacles));
});
test('PR41 bounds, start clearing, spacing and all actor connectivity',()=>{
 for(const seed of seeds){
  const {obstacles}=generateArenaLayout(seed);assert.ok(layoutSafe(obstacles));
  for(const o of obstacles){
   assert.ok(footprintDistance(o.footprint,center)>250);
   for(const p of obstacles)if(p!==o)assert.ok(Math.hypot(p.x-o.x,p.y-o.y)>=placementRadius(p)+placementRadius(o)+140);
  }
  for(const actorRadius of [17,18,21,30]){
   const nav=reachableCells({width:1800,height:1200,actorRadius,cellSize:20,origin:center,obstacles});
   assert.equal(nav.visited,nav.free,`isolated cells seed ${seed}, radius ${actorRadius}`);
   for(let i=0;i<8;i++)assert.ok(safeEnemySpawn(center,obstacles,i,actorRadius,nav));
   const reward=fallbackRewardPoint(center,obstacles,nav);assert.ok(reward&&nav.isReachable(reward));
  }
 }
});
test('PR41 swept rotated capsule/box collision, sliding and destroyed removal',()=>{
 for(const type of ['fallen_log','toi_toi']){
  const o=createObstacle(type,{id:type,x:400,y:400,angle:Math.PI/4});
  for(const radius of [17,18,21,30]){
   const p=resolveObstaclePosition({x:200,y:400},{x:600,y:400},radius,[o]);
   assert.ok(Math.hypot(p.x-600,p.y-400)>1);assert.ok(footprintDistance(o.footprint,p)>=radius-1e-5);
  }
 }
 const barrel=createObstacle('toxic_barrel',{id:'b',x:400,y:400});
 assert.equal(damageObstacle(barrel).exploded,false);assert.equal(damageObstacle(barrel).exploded,false);
 assert.equal(damageObstacle(barrel).exploded,true);assert.equal(damageObstacle(barrel).exploded,false);
 assert.deepEqual(resolveObstaclePosition({x:200,y:400},{x:600,y:400},30,[barrel]),{x:600,y:400});
});
test('PR41 actual species pursuit needs local steering and routes around convex blockers',()=>{
 for(const type of Object.keys(ENEMY_TYPES))for(const family of ['rock','fallen_log','bush','toi_toi']){
  const obstacle=createObstacle(family,{id:'block',x:700,y:600,angle:Math.PI/3});
  const player={x:1000,y:600};let enemy={type,x:450,y:600,hp:8,seed:2};
  for(let frame=0;frame<1800&&Math.hypot(enemy.x-player.x,enemy.y-player.y)>40;frame++){
   const next=moveEnemy(enemy,player,1/30,frame/30);
   const resolved=steerObstacleStep(enemy,next,player,ENEMY_TYPES[type].radius,[obstacle]);
   assert.ok(footprintDistance(obstacle.footprint,resolved)>=ENEMY_TYPES[type].radius-1e-5);
   enemy.x=resolved.x;enemy.y=resolved.y;
  }
  assert.ok(Math.hypot(enemy.x-player.x,enemy.y-player.y)<=40,`${type} stuck at ${family}`);
 }
});
test('PR41 generated layouts support actual heavy pursuit from all spawn sectors',()=>{
 for(const seed of seeds){
  const {obstacles,navigation}=generateArenaLayout(seed);
  for(let sector=0;sector<8;sector++){
   let e={type:'zubrokryptyda',...safeEnemySpawn(center,obstacles,sector,30,navigation),hp:8,seed:sector};
   for(let f=0;f<2400&&Math.hypot(e.x-900,e.y-600)>48;f++){
    const next=moveEnemy(e,center,1/20,f/20),p=steerObstacleStep(e,next,center,30,obstacles);
    e.x=p.x;e.y=p.y;
   }
   assert.ok(Math.hypot(e.x-900,e.y-600)<=48,`seed ${seed} sector ${sector}`);
  }
 }
});
test('PR41 varied species and off-center destinations do not trap on generated blockers',()=>{
 for(const seed of [1,41,104729]){
  const {obstacles,navigation}=generateArenaLayout(seed);
  for(const type of Object.keys(ENEMY_TYPES))for(const goal of [{x:450,y:600},{x:1350,y:600},{x:900,y:250},{x:900,y:950}]){
   if(!clearPoint(goal,obstacles,32,navigation))continue;
   let e={type,...safeEnemySpawn(goal,obstacles,2,ENEMY_TYPES[type].radius,navigation),hp:8,seed:17};
   for(let f=0;f<3200&&Math.hypot(e.x-goal.x,e.y-goal.y)>48;f++){
    const next=moveEnemy(e,goal,1/20,f/20),p=steerObstacleStep(e,next,goal,ENEMY_TYPES[type].radius,obstacles);
    e.x=p.x;e.y=p.y;
   }
   assert.ok(Math.hypot(e.x-goal.x,e.y-goal.y)<=48,`species ${type} seed ${seed} goal ${JSON.stringify(goal)}`);
  }
 }
});
test('PR41 footprints agree for rotated projectile/flame blockers and repeated bushes',()=>{
 const log=createObstacle('fallen_log',{id:'log',x:400,y:400,angle:Math.PI/2});
 const from={x:300,y:430},target={x:440,y:430};
 assert.equal(segmentObstacleHit(from,target,[log],3),log);
 assert.equal(flameTargetVisible(from,{x:1,y:0},target,5,[log]),false);
 const bushes=[0,1,2].map(i=>createObstacle('bush',{id:'b'+i,x:300+i*140,y:200}));
 assert.ok(!clearPoint({x:440,y:200},bushes));
 assert.equal(firstFootprintHit({x:100,y:200},{x:700,y:200},bushes).obstacle,bushes[0]);
 const scene=readFileSync(new URL('../src/scenes.js',import.meta.url),'utf8');
 assert.ok(!scene.includes('this.targets'));assert.ok(!scene.includes('getObstacleLayout'));
 assert.ok(!scene.includes('this.physics.add.collider(this.player'));
});
