import test from 'node:test';
import assert from 'node:assert/strict';
import * as episode from '../src/episode.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {damageFootprints,enemyProjectileHit,enemyFlameVisible} from '../src/enemy-damage.js';

test('PR44 exact two-line caller and separate massive boss contract',()=>{
 assert.deepEqual(DIALOGUES['before-marcin'],[
  ['bobrozombi','BOBROZOMBI','Taki jesteś?! Czekaj aż zawołam Marcina'],
  ['bobrozombi','BOBROZOMBI','Marcin! Maaaarciiin!']
 ]);
 assert.equal(ENEMY_TYPES.marcin.hp,36);assert.equal(ENEMY_TYPES.marcin.speed,38);
 assert.equal(ENEMY_TYPES.marcin.contactDamage,1);
 assert.equal(ENEMY_TYPES.zubrokryptyda.radius,30);
 const e={type:'marcin',x:900,y:600};
 assert.ok(damageFootprints(e).length<=4);
 assert.ok(enemyProjectileHit({x:780,y:520},{x:1020,y:520},e));
 assert.equal(enemyProjectileHit({x:780,y:420},{x:1020,y:420},e),null);
 assert.ok(enemyFlameVisible({x:800,y:520},{x:1,y:0},e,[]));
});
test('PR44 six remaining includes living and queued, once per session',()=>{
 const e=episode.createEpisode();
 assert.equal(episode.claimBossIntroduction(e),false);
 e.wave=5;e.spawned=29;e.defeated=28;
 assert.equal(episode.claimBossIntroduction(e),false);
 e.defeated=29;
 assert.equal(episode.remainingNormalEnemies(e),6);
 assert.equal(episode.claimBossIntroduction(e),true);
 assert.equal(episode.claimBossIntroduction(e),false);
 assert.equal(episode.createEpisode().bossIntroduced,false);
});
test('PR48 extends original 138 while Marcin alone decides terminal outcome',()=>{
 assert.equal(episode.NORMAL_ENEMIES,138);assert.equal(episode.TOTAL_ENEMIES,153);
 assert.deepEqual(episode.FINAL_ENCOUNTER.map(e=>e.type),['marcin','zubrokryptyda','zubrokryptyda']);
 const e=episode.createEpisode();e.wave=5;e.spawned=35;e.defeated=34;
 assert.equal(episode.recordDeath(e,0,0),null);assert.equal(e.state,'active');
 for(const spec of episode.FINAL_ENCOUNTER)assert.ok(episode.recordSpecialSpawn(e,spec.id));
 for(const id of ['escort-1','escort-2'])assert.equal(episode.recordDeath(e,0,0,id),null);
 assert.equal(e.state,'active');
 assert.equal(episode.beginBossResolution(e),true);
 assert.equal(episode.beginBossResolution(e),false);
 assert.equal(episode.finishBossResolution(e),true);
 assert.equal(e.state,'final-pending');
});

import {MARCIN,createBossAttack,bossAttackStep,radialVolley,bossProjectileStep,landingPoint} from '../src/marcin.js';
import {generateArenaLayout} from '../src/arena-layout.js';
import {reachableCells,footprintDistance} from '../src/obstacle-geometry.js';
import {createObstacle} from '../src/obstacle-catalog.js';
import {moveEnemy} from '../src/enemy-types.js';
import {steerObstacleStep} from '../src/obstacles.js';

test('PR44 warning precedes exactly eight simultaneous directions; low HP only shortens cooldown',()=>{
 for(const [hp,cooldown] of [[36,6000],[12,4000]]){
  const a=createBossAttack();
  for(let t=0;t<cooldown;t+=50)assert.equal(bossAttackStep(a,hp,50),false);
  assert.equal(a.phase,'warning');
  for(let t=0;t<850;t+=50)assert.equal(bossAttackStep(a,hp,50),false);
  assert.equal(bossAttackStep(a,hp,50),true);assert.equal(a.phase,'recovery');
  const shots=radialVolley({x:400,y:300});assert.equal(shots.length,8);
  shots.forEach((p,i)=>{assert.equal(p.x,400);assert.equal(p.y,300);assert.ok(Math.abs(Math.hypot(p.vx,p.vy)-180)<1e-9);assert.ok(Math.abs(p.vx-Math.cos(i*Math.PI/4)*180)<1e-9);});
  assert.equal(bossAttackStep(a,0,50),false);
 }
});
test('PR44 boss shots sweep obstacles before player, expire and never jump an annulus',()=>{
 const wall=createObstacle('rock',{id:'wall',x:500,y:500});
 const shot=()=>({...radialVolley({x:430,y:500})[0]});
 let p=shot(),result;for(let i=0;i<50&&!result;i++)result=bossProjectileStep(p,50,{x:550,y:500},[wall]);
 assert.equal(result,'blocked');
 p=shot();result=null;for(let i=0;i<50&&!result;i++)result=bossProjectileStep(p,50,{x:480,y:500},[]);
 assert.equal(result,'player');
 p={...shot(),age:MARCIN.projectileLife};assert.equal(bossProjectileStep(p,50,{x:900,y:600},[]),'expired');
 p={...shot(),x:1799};assert.equal(bossProjectileStep(p,50,{x:900,y:600},[]),'expired');
});
test('PR44 boss navigation and visible safe landing on three unchanged seeded layouts',()=>{
 for(const seed of [1,41,104729]){
  const layout=generateArenaLayout(seed);
  const grid=reachableCells({width:1800,height:1200,cellSize:20,actorRadius:40,origin:{x:900,y:600},obstacles:layout.obstacles});
  assert.equal(grid.free,grid.visited,'boss pockets, seed '+seed);
  for(const [w,h] of [[320,240],[568,320],[800,360]]){
   const view={x:900-w/2,y:600-h/2,width:w,height:h};
   const p=landingPoint({x:900,y:600},view,layout.obstacles);
   assert.ok(p,'landing seed '+seed);assert.ok(Math.hypot(p.x-900,p.y-600)>=105);
   assert.ok(p.y-118>=view.y&&p.y+25<=view.y+h);assert.ok(grid.isReachable(p));
   assert.ok(layout.obstacles.every(o=>footprintDistance(o.footprint,p)>=48));
  }
  // Actual repeated movement, same local steering used by Phaser. Every
  // representative generated blocker must be passed with the larger radius.
  for(const obstacle of layout.obstacles){
   let e={type:'marcin',hp:36,seed,x:Math.max(60,obstacle.x-160),y:obstacle.y};
   const target={x:Math.min(1740,obstacle.x+160),y:obstacle.y};
   // Isolated obstacle fixture avoids spawning into a neighbouring obstacle.
   for(let i=0;i<1500&&Math.hypot(e.x-target.x,e.y-target.y)>8;i++){
    const next=moveEnemy(e,target,0.05);Object.assign(e,steerObstacleStep(e,next,target,40,[obstacle]));
    assert.ok(footprintDistance(obstacle.footprint,e)>=39.99);
   }
   assert.ok(Math.hypot(e.x-target.x,e.y-target.y)<8,`trapped at ${seed}/${obstacle.id}`);
  }
 }
});

import {PANIC_PROFILES,igniteEnemy,createIgnitionState} from '../src/enemy-panic.js';
test('PR44 flame retains accepted hits, existing heavy panic and no new damage modifiers',()=>{
 assert.equal(PANIC_PROFILES.marcin,PANIC_PROFILES.zubrokryptyda);
 assert.equal(igniteEnemy(createIgnitionState(),'marcin',100),true);
});
