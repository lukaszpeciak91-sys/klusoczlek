import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignRun,completeCampaignAct,updateRunHealth,awardRunArtifact,MARCIN_MOHAWK_ID,nextActHandoff} from '../src/campaign-run.js';
import {CAMPAIGN_SAVE_KEY,CAMPAIGN_SAVE_VERSION,serializeCampaignCheckpoint,readCampaignCheckpoint,writeCampaignCheckpoint} from '../src/campaign-save.js';

function memoryStorage(){
  const items=new Map();
  return {getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v),items};
}
function completedAct1(){
  const run=createCampaignRun();
  awardRunArtifact(run,MARCIN_MOHAWK_ID);
  assert.equal(completeCampaignAct(run,'act1',{hp:1,maxHp:5,
    unlockedWeapons:new Set(['blunderbuss','rifle']),
    selectedWeapon:'rifle',kills:72,activeCombatMs:211000}),true);
  return run;
}
test('PR79 versioned Act I checkpoint round trip reconstructs native Sets',()=>{
  const store=memoryStorage(),run=createCampaignRun();
  assert.equal(writeCampaignCheckpoint(run,'act1',store),true);
  const raw=JSON.parse(store.items.get(CAMPAIGN_SAVE_KEY));
  assert.equal(raw.version,CAMPAIGN_SAVE_VERSION);
  assert.equal(raw.actId,'act1');
  const restored=readCampaignCheckpoint(store);
  assert.ok(restored);
  assert.equal(restored.actId,'act1');
  assert.equal(restored.hp,restored.maxHp);
  for(const name of ['unlockedWeapons','artifacts','completedActs','upgrades'])assert.ok(restored[name] instanceof Set);
  assert.deepEqual([...restored.unlockedWeapons],['blunderbuss']);
  assert.equal(restored.selectedWeapon,null);
});
test('PR79 Act II checkpoint preserves earned gear, artifact and totals but restores starting HP',()=>{
  const store=memoryStorage(),run=completedAct1();
  assert.equal(run.hp,1);
  assert.equal(writeCampaignCheckpoint(run,'act2',store),true);
  const restored=readCampaignCheckpoint(store);
  assert.ok(restored);
  assert.equal(restored.actId,'act2');
  assert.equal(restored.hp,5);
  assert.equal(restored.maxHp,5);
  assert.deepEqual([...restored.unlockedWeapons],['blunderbuss','rifle']);
  assert.equal(restored.selectedWeapon,'rifle');
  assert.equal(restored.artifacts.has(MARCIN_MOHAWK_ID),true);
  assert.equal(restored.completedActs.has('act1'),true);
  assert.equal(restored.stats.kills,72);
  assert.equal(restored.stats.activeCombatMs,211000);
  assert.equal(restored.stats.byAct.act1.kills,72);
  // Restore with the existing authorized Act I -> Act II handoff, not a DEBUG fixture.
  restored.actId='act1';
  const handoff=nextActHandoff(restored,new Set(['Arena','Airship']));
  assert.equal(handoff?.actId,'act2');
  assert.equal(handoff?.hp,5);
  assert.equal(handoff?.selectedWeapon,'rifle');
  assert.equal(handoff?.completedActs.has('act1'),true);
});
test('PR79 save reflects act start not mid-combat damage; PAUSE never heals',()=>{
  const store=memoryStorage(),run=completedAct1();
  assert.equal(writeCampaignCheckpoint(run,'act2',store),true);
  assert.equal(updateRunHealth(run,2),true);
  assert.equal(run.hp,2,'runtime HP remains damaged in paused session');
  assert.equal(readCampaignCheckpoint(store).hp,5,'persistent act-entry checkpoint remains full HP');
  assert.equal(JSON.parse(store.items.get(CAMPAIGN_SAVE_KEY)).stats.kills,72);
});
test('PR79 DEBUG never overwrites legitimate save',()=>{
  const store=memoryStorage(),run=createCampaignRun();
  writeCampaignCheckpoint(run,'act1',store);
  const before=store.items.get(CAMPAIGN_SAVE_KEY);
  const fake=completedAct1();fake.isDebugRun=true;
  assert.equal(writeCampaignCheckpoint(fake,'act2',store),false);
  assert.equal(store.items.get(CAMPAIGN_SAVE_KEY),before);
});
test('PR79 NOWA GRA overwrites old act checkpoint',()=>{
  const store=memoryStorage();
  assert.equal(writeCampaignCheckpoint(completedAct1(),'act2',store),true);
  assert.equal(readCampaignCheckpoint(store).actId,'act2');
  assert.equal(writeCampaignCheckpoint(createCampaignRun(),'act1',store),true);
  assert.equal(readCampaignCheckpoint(store).actId,'act1');
});
test('PR79 rejects fabricated progress, invalid equipment, corrupted stats and unsupported acts',()=>{
  const original=JSON.parse(serializeCampaignCheckpoint(completedAct1(),'act2'));
  const variations=[
    {version:999},{actId:'act3'},{actId:'no-such-act'},{hp:4},{maxHp:0},
    {completedActs:[]},{completedActs:['act1','act2']},{artifacts:[]},
    {selectedWeapon:'flamethrower'},{unlockedWeapons:['rifle']},
    {unlockedWeapons:['blunderbuss','blunderbuss']},{unlockedWeapons:'blunderbuss'},
    {stats:{...original.stats,kills:original.stats.kills+1}},
    {stats:{...original.stats,activeCombatMs:Infinity}},
    {stats:{...original.stats,byAct:{}}},
  ];
  for(const patch of variations){
    const store=memoryStorage();
    store.setItem(CAMPAIGN_SAVE_KEY,JSON.stringify({...original,...patch}));
    assert.equal(readCampaignCheckpoint(store),null,JSON.stringify(patch));
  }
  assert.equal(serializeCampaignCheckpoint(completedAct1(),'act3'),null);
  assert.equal(serializeCampaignCheckpoint(null),null);
});
test('PR79 malformed JSON, storage errors and missing storage cannot crash startup',()=>{
  const store=memoryStorage();
  assert.equal(readCampaignCheckpoint(store),null);
  store.setItem(CAMPAIGN_SAVE_KEY,'not json {');
  assert.equal(readCampaignCheckpoint(store),null);
  assert.equal(readCampaignCheckpoint({getItem(){throw new Error('blocked');}}),null);
  assert.equal(writeCampaignCheckpoint(createCampaignRun(),'act1',{setItem(){throw new Error('blocked');}}),false);
  assert.equal(readCampaignCheckpoint(null),null);
  assert.equal(writeCampaignCheckpoint(createCampaignRun(),'act1',null),false);
});
test('PR79 no Act II completion can silently become a fake Act III checkpoint',()=>{
  const run=completedAct1();
  run.actId='act2';
  assert.equal(completeCampaignAct(run,'act2',{hp:3,maxHp:5,unlockedWeapons:run.unlockedWeapons,
    selectedWeapon:run.selectedWeapon,kills:35,activeCombatMs:180000}),true);
  assert.equal(serializeCampaignCheckpoint(run,'act3'),null);
  assert.equal(serializeCampaignCheckpoint(run,'act2'),null,
    'completed Act II is not a start-of-Act-II checkpoint; retain prior valid save instead');
});
