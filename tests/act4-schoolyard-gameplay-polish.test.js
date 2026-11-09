import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCHOOL_PLACES,SCHOOL_VISIBLE_FOOTPRINTS,schoolWalkable} from '../src/school-contract.js';
import {SCHOOL_ART} from '../src/schoolyard-art.js';
import {SCHOOL_ENTOURAGE} from '../src/school-staging.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {BLAZEJ_START,BICYCLE_COLLECTION_POINT,blazejBicycleCollectible} from '../src/school-finale.js';
import {BLAZEJ_SPEED,BLAZEJ_ATTACK} from '../src/school-blazej.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {MARCIN,createBossAttack,bossAttackStep} from '../src/marcin.js';

const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('approved school artwork is east of the pitch and entrance stays walkable',()=>{
 const school=SCHOOL_ART.school,pitch=SCHOOL_PLACES.pitch;
 assert.ok(school.x-school.width/2>pitch.x+pitch.width/2);
 assert.equal(school.x,SCHOOL_VISIBLE_FOOTPRINTS.school.x);
 assert.ok(schoolWalkable(SCHOOL_PLACES.schoolEntrance));
 assert.ok(schoolWalkable(SCHOOL_PLACES.playerStart));
});
test('rack visual scales 13% and accessible ground-footprint pickup remains valid',()=>{
 const rack=SCHOOL_ART.bicycleRack;
 assert.equal(rack.width,287);assert.equal(rack.height,222);
 assert.deepEqual([rack.sourceWidth,rack.sourceHeight],[330,255]);
 const loader=source('../src/schoolyard-art.js');
 assert.ok(loader.includes('def.sourceWidth??def.width'));
 assert.ok(loader.includes('def.sourceHeight??def.height'));
 assert.ok(SCHOOL_VISIBLE_FOOTPRINTS.bicycleRack.width<rack.width);
 assert.ok(schoolWalkable(BICYCLE_COLLECTION_POINT));
 assert.ok(blazejBicycleCollectible('BLAZEJ_PICKUP_PENDING',BICYCLE_COLLECTION_POINT));
});
test('three entourage bodies are adjacent to boss, separated and walkable',()=>{
 assert.equal(SCHOOL_ENTOURAGE.length,3);
 for(const enemy of SCHOOL_ENTOURAGE){
  const r=ENEMY_TYPES[enemy.type].radius;
  assert.ok(schoolWalkable(enemy,r+4));
  assert.ok(Math.hypot(enemy.x-BLAZEJ_START.x,enemy.y-BLAZEJ_START.y)<155);
 }
 for(let i=0;i<3;i++)for(let j=0;j<i;j++){
  const a=SCHOOL_ENTOURAGE[i],b=SCHOOL_ENTOURAGE[j];
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>
   ENEMY_TYPES[a.type].radius+ENEMY_TYPES[b.type].radius+12);
 }
});
test('confrontation skips reserved boss line but late introduction preserves it',()=>{
 assert.equal(DIALOGUES['act4-blazej-confrontation'][0][2],
  'Nie wiem kim jesteś ale mam ochotę Cię rozgnieść');
 assert.deepEqual(DIALOGUES['act4-blazej-final'].map(p=>p[2]),
  ['Ech, kazał pan, musiał sam!']);
});
test('optional NPCs adopt existing enemy objects and retain independent proximity',()=>{
 const scene=source('../src/school-scene.js'),combat=source('../src/school-combat.js');
 assert.ok(scene.includes('this.combat.activateOptionalActors()'));
 assert.ok(scene.includes("['INTRO','COMBAT','CLEANUP'].includes(this.schoolPhase)"));
 assert.ok(!scene.includes('this.clearMaciekSebaActors();\n      this.combat.start()'));
 assert.ok(combat.includes('if(!enemies.includes(enemy))enemies.push(enemy)'));
 assert.ok(combat.includes('optionalHostile'));
});
test('Błażej-only speed and cooldown preserve Marcin defaults and warning',()=>{
 assert.equal(BLAZEJ_SPEED,ENEMY_TYPES.zubrokryptyda.speed*1.3);
 assert.equal(BLAZEJ_ATTACK.cooldown,4500);
 assert.equal(BLAZEJ_ATTACK.lowCooldown,3000);
 assert.equal(BLAZEJ_ATTACK.warning,900);
 assert.equal(MARCIN.cooldown,6000);
 const state=createBossAttack();
 for(let i=0;i<89;i++)bossAttackStep(state,MARCIN.hp,50,BLAZEJ_ATTACK);
 assert.equal(state.phase,'chase');
 bossAttackStep(state,MARCIN.hp,50,BLAZEJ_ATTACK);
 assert.equal(state.phase,'warning');
});
test('boss reinforcements use bounded one-shot thresholds and cleanup before reward',()=>{
 const combat=source('../src/school-combat.js'),boss=source('../src/school-blazej.js');
 assert.ok(combat.includes('reinforcementTriggers.has(group)'));
 assert.ok(combat.includes('reinforcementTriggers.add(group)'));
 assert.ok(combat.includes("population.filter(e=>e.bossHelper).length>=4"));
 assert.ok(combat.includes("phase!=='BLAZEJ_BOSS'"));
 assert.ok(boss.includes('scene.combat?.clearBossReinforcements()'));
});
