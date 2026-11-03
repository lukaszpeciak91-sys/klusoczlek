import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignRun,beginCampaignRun,currentCampaignRun,updateRunHealth,updateRunEquipment,
  awardRunArtifact,completeCampaignAct,snapshotCampaignRun,nextActHandoff,prepareActStart,MARCIN_MOHAWK_ID} from '../src/campaign-run.js';
import {ENCOUNTER} from '../src/bobrozombi.js';

function fixtureRegistry(){
  const storage=new Map();
  return {registry:{set:(key,value)=>storage.set(key,value),get:key=>storage.get(key)}};
}
test('new run is independent, starts with baseline equipment and no campaign progress',()=>{
  const a=createCampaignRun(),b=createCampaignRun();
  assert.equal(a.actId,'act1');
  assert.deepEqual([a.hp,a.maxHp],[ENCOUNTER.playerMaxHp,ENCOUNTER.playerMaxHp]);
  assert.deepEqual([...a.unlockedWeapons],['blunderbuss']);
  assert.equal(a.selectedWeapon,null,'Act I starts unequipped despite starter entitlement');
  assert.deepEqual([...a.artifacts],[]);
  assert.deepEqual([...a.completedActs],[]);
  assert.deepEqual([...a.upgrades],[]);
  assert.deepEqual(a.stats,{kills:0,activeCombatMs:0,byAct:{}});
  a.artifacts.add(MARCIN_MOHAWK_ID);
  assert.equal(b.artifacts.size,0);
});
test('fresh NEW GAME replaces run, while RESUME reads the identical in-memory instance',()=>{
  const game=fixtureRegistry(),first=beginCampaignRun(game);
  updateRunHealth(first,3,5);
  assert.equal(currentCampaignRun(game),first);
  assert.equal(currentCampaignRun(game).hp,3);
  const fresh=beginCampaignRun(game);
  assert.notEqual(fresh,first);
  assert.equal(fresh.hp,5);
  assert.equal(fresh.artifacts.size,0);
});
test('exactly-once artifact, completion, equipment and health survive handoff',()=>{
  const run=createCampaignRun();
  assert.equal(awardRunArtifact(run,MARCIN_MOHAWK_ID),true);
  assert.equal(awardRunArtifact(run,MARCIN_MOHAWK_ID),false);
  const unlocked=new Set(['blunderbuss','rifle','flamethrower','water-thrower']);
  assert.equal(updateRunEquipment(run,unlocked,'water-thrower'),true);
  assert.equal(updateRunHealth(run,3,6),true);
  const record={hp:3,maxHp:6,unlockedWeapons:unlocked,selectedWeapon:'water-thrower',kills:108,activeCombatMs:194321};
  assert.equal(completeCampaignAct(run,'act1',record),true);
  assert.equal(completeCampaignAct(run,'act1',record),false);
  assert.equal(run.stats.kills,108);
  assert.equal(run.stats.activeCombatMs,194321);
  assert.deepEqual(run.stats.byAct.act1,{kills:108,activeCombatMs:194321});
  assert.deepEqual([run.hp,run.maxHp],[3,6]);
  const handoff=snapshotCampaignRun(run);
  assert.equal(handoff.hp,3);
  assert.equal(handoff.selectedWeapon,'water-thrower');
  assert.deepEqual([...handoff.unlockedWeapons],[...unlocked]);
  assert.deepEqual(handoff.stats.byAct.act1,{kills:108,activeCombatMs:194321});
  handoff.unlockedWeapons.delete('rifle');
  handoff.artifacts.clear();
  handoff.stats.byAct.act1.kills=0;
  assert.equal(run.unlockedWeapons.has('rifle'),true,'snapshot must not alias inventory');
  assert.equal(run.artifacts.has(MARCIN_MOHAWK_ID),true);
  assert.equal(run.stats.byAct.act1.kills,108);
  const registered=new Set(['Arena']);
  assert.equal(nextActHandoff(run,registered),null,'Act II not registered or implemented');
  assert.equal(prepareActStart(run,{actId:'act2',scene:'Airship'},registered),false);
  assert.equal(run.actId,'act1');
  assert.equal(run.selectedWeapon,'water-thrower');
  assert.deepEqual([...run.unlockedWeapons],[...unlocked]);
  assert.equal(run.artifacts.size,1);
  assert.equal(run.completedActs.size,1);
});
test('skipping the optional blunderbuss pickup never revokes the campaign starter unlock',()=>{
  const run=createCampaignRun();
  assert.equal(updateRunEquipment(run,new Set(['rifle']),'rifle'),true);
  assert.deepEqual([...run.unlockedWeapons],['blunderbuss','rifle']);
  assert.equal(completeCampaignAct(run,'act1',{
    hp:2,maxHp:5,unlockedWeapons:new Set(),selectedWeapon:'rifle',kills:42,activeCombatMs:1000,
  }),true);
  assert.equal(run.unlockedWeapons.has('blunderbuss'),true);
  assert.equal(run.selectedWeapon,'rifle');
  assert.equal(run.stats.activeCombatMs,1000);
});
test('active gameplay milliseconds are preserved without truncation',()=>{
  const run=createCampaignRun();
  assert.equal(completeCampaignAct(run,'act1',{
    hp:5,maxHp:5,unlockedWeapons:new Set(),selectedWeapon:'blunderbuss',
    kills:1,activeCombatMs:261199.9,
  }),true);
  assert.equal(run.stats.activeCombatMs,261199.9);
  assert.equal(run.stats.byAct.act1.activeCombatMs,261199.9);
});
test('unequipped Act I snapshots stay unequipped while retaining starter entitlement',()=>{
  const run=createCampaignRun();
  assert.equal(updateRunEquipment(run,new Set(),null),true);
  assert.equal(run.unlockedWeapons.has('blunderbuss'),true);
  assert.equal(run.selectedWeapon,null);
  assert.equal(completeCampaignAct(run,'act1',{
    hp:4,maxHp:5,unlockedWeapons:new Set(),selectedWeapon:null,kills:0,activeCombatMs:1234.5,
  }),true);
  assert.equal(run.selectedWeapon,null);
  assert.equal(snapshotCampaignRun(run).selectedWeapon,null);
  assert.equal(run.unlockedWeapons.has('blunderbuss'),true);
});
test('rifle and flamethrower pickup selections survive completion without a default override',()=>{
  for(const equipped of ['rifle','flamethrower']){
    const run=createCampaignRun();
    assert.equal(updateRunEquipment(run,new Set([equipped]),equipped),true);
    assert.equal(run.selectedWeapon,equipped);
    assert.equal(completeCampaignAct(run,'act1',{
      hp:2,maxHp:5,unlockedWeapons:new Set([equipped]),selectedWeapon:equipped,
      kills:30,activeCombatMs:2000,
    }),true);
    assert.equal(run.selectedWeapon,equipped);
    assert.equal(run.unlockedWeapons.has('blunderbuss'),true);
    assert.equal(snapshotCampaignRun(run).selectedWeapon,equipped);
  }
});
test('unknown act, invalid selections and incomplete campaign cannot start future scene',()=>{
  const run=createCampaignRun();
  assert.equal(updateRunEquipment(run,new Set(['blunderbuss']),'rifle'),false);
  assert.equal(run.selectedWeapon,null);
  assert.equal(completeCampaignAct(run,'not-an-act',{hp:5,maxHp:5,unlockedWeapons:new Set(['blunderbuss']),selectedWeapon:'blunderbuss',kills:0,activeCombatMs:0}),false);
  assert.equal(nextActHandoff(run,new Set(['Arena','Airship'])),null);
  assert.equal(prepareActStart(run,{actId:'unknown',scene:'Arena'},new Set(['Arena'])),false);
  assert.equal(run.completedActs.size,0);
});
