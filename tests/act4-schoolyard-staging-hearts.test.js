import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {SCHOOL_PLACES,SCHOOL_OBSTACLES,schoolWalkable} from '../src/school-contract.js';
import {SCHOOL_WAVES,SCHOOL_COMBAT_MS} from '../src/school-combat.js';
import {BLAZEJ_START,BLAZEJ_RADIUS,CHAPEL_RETURN,chapelReturnValid} from '../src/school-finale.js';
import {MACIEK_SEBA_RADIUS,PITCH_ENCOUNTER_RADIUS,SCHOOL_WAVE2_END_MS,
 SCHOOL_HEART_POINTS,SCHOOL_ENTOURAGE,maciekSebaNearby,pitchNearby,
 schoolEntouragePoint,canSpawnSchoolHeart,collectSchoolHeart} from '../src/school-staging.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {reachableCells} from '../src/obstacle-geometry.js';
import {FOREST_ATLAS,obstacleArt} from '../src/forest-obstacle-art.js';
import {healOneHp} from '../src/volcano-heart.js';

const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Act IV schoolyard layout places chapel lower-left and keeps all staging grounds accessible',()=>{
 assert.ok(SCHOOL_PLACES.chapel.x<550&&SCHOOL_PLACES.chapel.y>700);
 assert.ok(SCHOOL_PLACES.school.x>1100&&SCHOOL_PLACES.school.y<600);
 assert.ok(SCHOOL_PLACES.pitch.y>700);
 for(const p of [SCHOOL_PLACES.playerStart,SCHOOL_PLACES.maciek,SCHOOL_PLACES.seba,
  SCHOOL_PLACES.pitchApproach,CHAPEL_RETURN,BLAZEJ_START])
  assert.ok(schoolWalkable(p,17),'staging point walkable '+JSON.stringify(p));
 assert.ok(chapelReturnValid());
 assert.ok(Math.hypot(CHAPEL_RETURN.x-SCHOOL_PLACES.chapelDoor.x,
  CHAPEL_RETURN.y-SCHOOL_PLACES.chapelDoor.y)<180);
 const nav=reachableCells({width:1800,height:1200,cellSize:20,
  actorRadius:ENEMY_TYPES.zubrokryptyda.radius,
  origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});
 assert.ok(nav.visited>0);
 for(const p of [SCHOOL_PLACES.maciek,SCHOOL_PLACES.seba,
  SCHOOL_PLACES.pitchApproach,CHAPEL_RETURN,BLAZEJ_START,...Object.values(SCHOOL_HEART_POINTS)])
  assert.ok(nav.isReachable(p),'same reachable ground '+JSON.stringify(p));
 for(let i=0;i<=100;i++){
  const t=i/100,p={x:BLAZEJ_START.x+(CHAPEL_RETURN.x-BLAZEJ_START.x)*t,
   y:BLAZEJ_START.y+(CHAPEL_RETURN.y-BLAZEJ_START.y)*t};
  assert.ok(schoolWalkable(p),'short bicycle route crosses no solids');
 }
});
test('optional Maciek and Seba trigger can be bypassed without delaying pitch or combat',()=>{
 assert.ok(MACIEK_SEBA_RADIUS>100&&MACIEK_SEBA_RADIUS<200);
 assert.ok(PITCH_ENCOUNTER_RADIUS>190&&PITCH_ENCOUNTER_RADIUS<300);
 assert.equal(Boolean(maciekSebaNearby(SCHOOL_PLACES.playerStart)),false);
 assert.equal(Boolean(maciekSebaNearby(SCHOOL_PLACES.maciek)),true);
 assert.equal(Boolean(pitchNearby(SCHOOL_PLACES.pitchApproach)),true);
 assert.equal(Boolean(maciekSebaNearby(SCHOOL_PLACES.pitchApproach)),false);
 const code=source('../src/school-scene.js');
 assert.ok(code.includes('this.maciekSeen=this.beginSchoolDialogue(\'act4-maciek-seba\')'));
 assert.ok(code.includes('this.pitchStarted=this.beginSchoolDialogue(\'act4-blazej-observer\')'));
 assert.ok(code.includes('this.createMaciekSebaActors()'));
 assert.ok(code.includes('this.clearMaciekSebaActors()'));
 assert.ok(code.includes('this.combat.start(); // The first ordinary wave begins only after DALEJ.'));
 assert.ok(code.includes("this.maciekSeen=false;this.pitchStarted=false"));
 assert.ok(code.includes("this.schoolPhase==='INTRO'&&!this.pitchStarted"));
 assert.ok(code.includes("this.combat.suspend();this.ambientBarks.suspend();"));
 assert.equal(code.includes('this.openingPending=true'),false);
 assert.equal(code.includes("this.beginSchoolDialogue('act4-maciek-seba');\n      this.beginSchoolDialogue('act4-blazej-observer')"),false);
});
test('entourage uses existing approved sprite identities and one cap-accounted director',()=>{
 assert.deepEqual(SCHOOL_ENTOURAGE.map(e=>e.type),
  ['bobrozombi','bocianolak','zubrokryptyda']);
 assert.equal(SCHOOL_OBSTACLES.length,5);
 assert.deepEqual(SCHOOL_OBSTACLES.map(o=>o.id),
  ['chapel','school','bicycleRack','school-tire-pile','school-toi-toi']);
 for(const entry of SCHOOL_ENTOURAGE){
  assert.ok(schoolWalkable(entry,ENEMY_TYPES[entry.type].radius+4));
  assert.ok(schoolEntouragePoint(entry,SCHOOL_PLACES.pitchApproach,[]));
 }
 const occupied=[SCHOOL_ENTOURAGE[0]];
 assert.equal(schoolEntouragePoint(SCHOOL_ENTOURAGE[0],SCHOOL_PLACES.pitchApproach,occupied),false);
 const combat=source('../src/school-combat.js');
 assert.ok(combat.includes('if(!wave4)for(const p of SCHOOL_ENTOURAGE)spawnEnemy({type:p.type,preferred:p});'));
 assert.ok(combat.includes('population.length>=SCHOOL_WAVES[wave].maxAlive'));
 assert.ok(combat.includes('recordDirectorSpawn(director,wave,type)'));
 assert.ok(combat.includes('clearPoint(preferred,scene.obstacles,radius+4,navigation)'));
 assert.ok(combat.includes('schoolEntouragePoint(preferred,scene.player,population)'));
 assert.ok(combat.includes('createPixelBurst(scene,enemy.type,enemy.x,enemy.y,enemy.seed)'));
 assert.ok(SCHOOL_WAVES[0].maxAlive>=SCHOOL_ENTOURAGE.length);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.durationMs),[35000,40000,45000,50000]);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.maxAlive),[6,7,8,9]);
 assert.equal(SCHOOL_COMBAT_MS,170000);
});
test('only the already approved tire and toi-toi atlas art is used',()=>{
 assert.equal(FOREST_ATLAS.path,'obstacles/forest-obstacles.png');
 assert.ok(existsSync(new URL('../public/assets/obstacles/forest-obstacles.png',import.meta.url)));
 for(const o of SCHOOL_OBSTACLES.slice(3)){
  assert.ok(['tire_pile','toi_toi'].includes(o.type));
  assert.ok([9,10].includes(obstacleArt(o).frame));
 }
 const scene=source('../src/school-scene.js');
 assert.ok(scene.includes('createObstacleVisual(this,o)'));
 assert.ok(scene.includes("c.getData('fallback')?.setVisible(false)"));
 assert.equal(source('../src/school-staging.js').includes('createObstacleFallback'),false);
});
test('existing Act III heart visuals, gated collection and clamping reused twice',()=>{
 assert.equal(SCHOOL_WAVE2_END_MS,75000);
 assert.equal(Object.keys(SCHOOL_HEART_POINTS).length,2);
 for(const [id,p] of Object.entries(SCHOOL_HEART_POINTS)){
  assert.ok(canSpawnSchoolHeart(id,false));
  assert.equal(canSpawnSchoolHeart(id,true),false);
  assert.ok(schoolWalkable(p,25));
  assert.equal(collectSchoolHeart(p,p,5,5),null,'at max HP do not waste heart');
  assert.equal(collectSchoolHeart(p,p,3,5,false),5);
  assert.equal(collectSchoolHeart(p,p,4,5,false),5);
  assert.equal(collectSchoolHeart(p,p,1,5,true),null,'already collected');
  assert.equal(collectSchoolHeart({x:p.x+100,y:p.y+100},p,2,5),null);
 }
 assert.equal(healOneHp(5,5),5);
 const scene=source('../src/school-scene.js');
 assert.ok(scene.includes("state.token=createHealthToken(this,point.x,point.y)"));
 assert.ok(scene.includes("this.combat.elapsedMs>=SCHOOL_WAVE2_END_MS"));
 assert.ok(scene.includes("if(phase==='BLAZEJ_PENDING')this.spawnSchoolHeart('wave4')"));
 assert.ok(scene.includes("if(this.run.hp>=this.run.maxHp)return;"));
 assert.ok(scene.includes("state.collected=true;this.run.hp=restored"));
 assert.ok(scene.includes("state.token.destroy();state.token=null"));
 assert.ok(scene.includes("this.pendingApproachArmed=this.run.isDebugRun"));
 assert.ok(scene.includes("if(!near)this.pendingApproachArmed=true"));
 assert.ok(scene.includes("if(near&&this.pendingApproachArmed)"));
});
