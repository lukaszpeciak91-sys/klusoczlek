import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCHOOL_WORLD,SCHOOL_OBSTACLES,SCHOOL_PLACES,schoolWalkable} from '../src/school-contract.js';
import {SCHOOL_ENTOURAGE,SCHOOL_SPAWN_PITCH,SCHOOL_SPAWN_REMOTE,
 schoolDirectorSpawnSites,schoolEntouragePoint} from '../src/school-staging.js';
import {BICYCLE_COLLECTION_POINT,BICYCLE_COLLECTION_RADIUS,blazejBicycleCollectible,
 BLAZEJ_BICYCLE_ID} from '../src/school-finale.js';
import {SCHOOL_WAVES,SCHOOL_COMBAT_MS} from '../src/school-combat.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {PLAYER_RADIUS} from '../src/movement.js';
import {reachableCells} from '../src/obstacle-geometry.js';
import {segmentObstacleHit} from '../src/obstacles.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('R1: exact three approved pre-wave actors are safe, passive, and adopted once by the existing cap director',()=>{
 assert.deepEqual(SCHOOL_ENTOURAGE.map(e=>e.type),['bobrozombi','bocianolak','zubrokryptyda']);
 for(const entry of SCHOOL_ENTOURAGE)assert.ok(schoolEntouragePoint(entry,SCHOOL_PLACES.playerStart,[]));
 const combat=source('../src/school-combat.js'),scene=source('../src/school-scene.js');
 assert.ok(combat.includes('const enemies=[],stagedEntourage=[]'));
 assert.ok(combat.includes('function stageEntourage(){'));
 assert.ok(combat.includes('if(started||defeated||scene.disposed||stagedEntourage.length)return false;'));
 assert.ok(combat.includes('renderer')||combat.includes('renderers[point.type].create'));
 assert.ok(combat.includes('enemies.push(enemy);recordDirectorSpawn(director,0,enemy.type)'));
 assert.ok(combat.includes('if(!wave4)activateEntourage();'));
 assert.ok(combat.includes('if(!wave4&&!stagedEntourage.length)stageEntourage();'));
 assert.ok(combat.includes('population.length>=SCHOOL_WAVES[wave].maxAlive'));
 assert.ok(scene.includes("if(this.introActive||this.debugCheckpoint==='act4-school')this.combat.stageEntourage()"));
 assert.ok(scene.includes("this.combat.start(); // The first ordinary wave begins only after DALEJ."));
 assert.ok(scene.includes("this.storyBusy||this.dialogueState.id"));
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.durationMs),[35000,40000,45000,50000]);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.maxAlive),[6,7,8,9]);
 assert.equal(SCHOOL_COMBAT_MS,170000);
});

test('R1: one unchanged director alternates pitch-facing and modest remote opportunities, with solid clearance',()=>{
 assert.ok(SCHOOL_SPAWN_PITCH.length>=5);
 assert.ok(SCHOOL_SPAWN_REMOTE.length>=3);
 for(const [index,remote] of [[0,false],[7,false],[8,true],[9,true],[10,false],[19,true],[20,true]]){
  const candidates=schoolDirectorSpawnSites(index);
  assert.equal(candidates.length,(remote?SCHOOL_SPAWN_REMOTE:SCHOOL_SPAWN_PITCH).length);
  assert.ok(candidates.every(p=>(remote?SCHOOL_SPAWN_REMOTE:SCHOOL_SPAWN_PITCH).includes(p)));
 }
 const nav=reachableCells({width:SCHOOL_WORLD.width,height:SCHOOL_WORLD.height,
  cellSize:20,actorRadius:ENEMY_TYPES.zubrokryptyda.radius,
  origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});
 for(const [kind,sites] of [['pitch',SCHOOL_SPAWN_PITCH],['remote',SCHOOL_SPAWN_REMOTE]]){
  const valid=sites.filter(p=>schoolWalkable(p,ENEMY_TYPES.zubrokryptyda.radius+4)&&nav.isReachable(p));
  assert.ok(valid.length>=2,kind+' retains safe navigation and obstacle clearance');
 }
 const combat=source('../src/school-combat.js');
 assert.equal((combat.match(/directorOpportunity\(/g)||[]).length,1);
 assert.equal((combat.match(/recordDirectorSpawn\(/g)||[]).length,2); // staged adoption + normal spawn
 assert.ok(combat.includes('const due=directorOpportunity(director,'));
 assert.ok(combat.includes('if(due.spawn)spawnEnemy();'));
 assert.ok(combat.includes('selectOrdinarySpawn({player:scene.player'));
});

test('R1: bicycle pickup is outside the approved rack, physically reachable and requires post-boss phase',()=>{
 assert.equal(BLAZEJ_BICYCLE_ID,'blazej-bicycle');
 assert.deepEqual(BICYCLE_COLLECTION_POINT,{x:1510,y:883});
 assert.ok(BICYCLE_COLLECTION_RADIUS<55);
 assert.ok(schoolWalkable(BICYCLE_COLLECTION_POINT,PLAYER_RADIUS));
 const from={x:1510,y:970};
 assert.ok(schoolWalkable(from,PLAYER_RADIUS));
 assert.equal(segmentObstacleHit(from,BICYCLE_COLLECTION_POINT,SCHOOL_OBSTACLES,0),null);
 for(const phase of ['INTRO','COMBAT','CLEANUP','BLAZEJ_PENDING','BLAZEJ_BOSS','BLAZEJ_REWARD'])
  assert.equal(blazejBicycleCollectible(phase,BICYCLE_COLLECTION_POINT),false,phase);
 assert.equal(blazejBicycleCollectible('BLAZEJ_PICKUP_PENDING',from),false,'far, reachable approach does not auto-award');
 assert.equal(blazejBicycleCollectible('BLAZEJ_PICKUP_PENDING',BICYCLE_COLLECTION_POINT),true);
 assert.equal(blazejBicycleCollectible('BLAZEJ_PICKUP_PENDING',{x:1510,y:800}),false,'cannot collect through rack collider');
 assert.equal(blazejBicycleCollectible('BLAZEJ_PICKUP_PENDING',{x:700,y:900}),false,'no remote award');
 const nav=reachableCells({width:1800,height:1200,cellSize:12,
  actorRadius:PLAYER_RADIUS,origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});
 assert.ok(nav.isReachable(BICYCLE_COLLECTION_POINT));
});

test('R1: boss pixel death gates a single pickup-pending transition, MENU-safe movement and existing artifact reward',()=>{
 const combat=source('../src/school-combat.js'),scene=source('../src/school-scene.js');
 const boss=source('../src/school-blazej.js');
 assert.ok(combat.includes("BLAZEJ_BOSS:'BLAZEJ_PICKUP_PENDING'"));
 assert.ok(combat.includes("BLAZEJ_PICKUP_PENDING:'BLAZEJ_REWARD'"));
 assert.ok(scene.includes("this.combat.advanceFinale('BLAZEJ_PICKUP_PENDING')"));
 assert.ok(scene.includes("this.objectiveText.setText('PODEJDŹ PO ROWER').setVisible(true)"));
 assert.ok(scene.includes("this.schoolPhase==='BLAZEJ_PICKUP_PENDING'"));
 assert.ok(scene.includes('blazejBicycleCollectible(this.schoolPhase,this.player,this.obstacles)'));
 assert.ok(scene.includes("if(!this.combat.advanceFinale('BLAZEJ_REWARD'))return false;"));
 assert.ok(scene.includes("this.bicycleCollected=true;this.storyBusy=true;"));
 assert.ok(scene.includes('this.showBicycleReward(); // one existing awardRunArtifact() and UI panel'));
 assert.ok(scene.includes('awardRunArtifact(this.run,BLAZEJ_BICYCLE_ID)'));
 assert.ok(scene.includes('if(this.schoolPhase!==\'BLAZEJ_REWARD\''));
 assert.ok(scene.includes('this.combat?.suspend();'));
 assert.ok(scene.includes("this.scene.start('Menu')"));
 assert.ok(boss.includes('bursts.push(createPixelBurst('));
 assert.equal(source('../src/school-combat.js').includes('awardRunArtifact('),false);
});
