import test from 'node:test';
import assert from 'node:assert/strict';
import {DEBUG_CHECKPOINTS,DEBUG_IDS,createDebugFixture} from '../src/debug-checkpoints.js';
import {createCampaignRun,createCampaignRun as fresh,prepareActStart,MARCIN_MOHAWK_ID} from '../src/campaign-run.js';

test('debug destinations cover implemented Acts I–V',()=>{
 assert.deepEqual(DEBUG_CHECKPOINTS.map(x=>x.id),[
  'act1-opening','act1-marcin','act1-ending','act1-results',
  'act2-opening','act2-defense','act2-last15','act2-results',
  'act3-opening','act3-lawos','act3-fairy','act3-apartment','act3-boss','act3-escape',
  'act4-opening','act4-school','act4-combat','act4-wave4',
  'act4-blazej','act4-boss','act4-finale',
   'act5-opening','act5-boss','act5-ending']);
 assert.equal(DEBUG_IDS.size,DEBUG_CHECKPOINTS.length);
 assert.ok(DEBUG_CHECKPOINTS.every(x=>['Arena','Airship','Volcano','School','Catacombs'].includes(x.scene)));
 assert.equal(createDebugFixture('act3-opening')?.handoff.scene,'Volcano');
 assert.equal(createDebugFixture('act4-opening')?.handoff.scene,'School');
 assert.equal(createDebugFixture('act5-opening')?.handoff.scene,'Catacombs');
});
test('each debug selection creates an independent valid in-memory campaign',()=>{
 const a=createDebugFixture('act1-opening'),b=createDebugFixture('act1-opening');
 assert.notEqual(a.run,b.run);
 assert.equal(a.run.hp,5);assert.equal(a.run.selectedWeapon,null);
 assert.equal(a.run.artifacts.size,0);assert.equal(a.run.completedActs.size,0);
 assert.equal(a.handoff,null);
 assert.deepEqual([...a.run.unlockedWeapons],['blunderbuss']);
 a.run.artifacts.add('debug-modification');
 assert.equal(b.run.artifacts.size,0);
});
test('finale results fixture contains mohawk but leaves Act I completion to real results',()=>{
 for(const id of ['act1-marcin','act1-ending','act1-results']){
  const fixture=createDebugFixture(id);
  assert.equal(fixture.run.selectedWeapon,'rifle');
  assert.ok(fixture.run.unlockedWeapons.has('flamethrower'));
  assert.equal(fixture.run.completedActs.size,0);
  assert.equal(fixture.run.artifacts.has(MARCIN_MOHAWK_ID),id!=='act1-marcin');
 }
});
test('Airship debug fixtures satisfy actual PR61 handoff and do not complete Act II',()=>{
 for(const id of ['act2-opening','act2-defense','act2-last15','act2-results']){
  const {run,handoff}=createDebugFixture(id);
  assert.equal(run.actId,'act1');
  assert.ok(run.completedActs.has('act1'));
  assert.ok(run.artifacts.has(MARCIN_MOHAWK_ID));
  assert.equal(run.completedActs.has('act2'),false);
  assert.equal(run.hp,5);assert.equal(run.selectedWeapon,'rifle');
  assert.equal(handoff.actId,'act2');assert.equal(handoff.scene,'Airship');
  assert.equal(prepareActStart(run,handoff,new Set(['Airship','Arena'])),true);
  assert.equal(run.actId,'act2');
  assert.equal(prepareActStart(run,handoff,new Set(['Airship','Arena'])),false);
 }
 const regular=fresh();
 assert.equal(regular.actId,'act1');assert.equal(regular.completedActs.size,0);
 assert.equal(regular.artifacts.size,0);
});

test('Act IV DEBUG uses a real Act III -> IV handoff without importing water as current weapon',()=>{
 for(const id of ['act4-opening','act4-school','act4-combat','act4-wave4','act4-blazej','act4-boss','act4-finale']){
  const fixture=createDebugFixture(id);
  assert.ok(fixture);
  const {run,handoff}=fixture;
  assert.equal(run.actId,'act3');
  assert.deepEqual([...run.completedActs],['act1','act2','act3']);
  assert.equal(run.artifacts.has('bogdan-hunting-horn'),true);
  assert.equal(run.unlockedWeapons.has('water-flamethrower'),true);
  assert.equal(run.selectedWeapon,'rifle');
  assert.equal(handoff.scene,'School');
  assert.equal(prepareActStart(run,handoff,new Set(['Arena','Airship','Volcano','School'])),true);
  assert.equal(run.actId,'act4');
  assert.equal(prepareActStart(run,handoff,new Set(['Arena','Airship','Volcano','School'])),false);
 }
});
