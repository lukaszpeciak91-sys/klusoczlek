import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignRun,completeCampaignAct,MARCIN_MOHAWK_ID,WATER_FLAMETHROWER_ID} from '../src/campaign-run.js';
import {HORN_ID} from '../src/volcano-finale.js';
import {BLAZEJ_BICYCLE_ID} from '../src/school-finale.js';
import {readCampaignCheckpoint,writeCampaignCheckpoint,CAMPAIGN_SAVE_KEY} from '../src/campaign-save.js';
import {ACT_UNLOCKS_KEY,readActUnlocks,actIsUnlocked,recordActCompletion,createActReplay} from '../src/act-unlocks.js';

const storage=()=>{
 const values=new Map();
 return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),
  removeItem:k=>values.delete(k)};
};
const finish=(run,id)=>{
 assert.equal(completeCampaignAct(run,id,{
  hp:run.maxHp,maxHp:run.maxHp,unlockedWeapons:run.unlockedWeapons,
  selectedWeapon:run.selectedWeapon,kills:0,activeCombatMs:0
 }),true);
};
const advance=(run,id)=>{run.actId=id;run.hp=run.maxHp;};
test('AKTY initially exposes Act I only; malformed unlock storage fails closed',()=>{
 const s=storage();
 assert.equal(readActUnlocks(s).highest,1);
 assert.equal(actIsUnlocked('act1',s),true);
 assert.equal(actIsUnlocked('act2',s),false);
 assert.equal(createActReplay('act5',s),null);
 for(const raw of ['{oops','{"version":1,"highest":5,"entries":{}}',
  '{"version":1,"highest":99,"entries":{}}']){
  s.setItem(ACT_UNLOCKS_KEY,raw);
  assert.equal(readActUnlocks(s).highest,1);
  assert.equal(createActReplay('act5',s),null);
 }
});
test('legitimate act completions unlock in sequence, preserve separate save and replay starts',()=>{
 const s=storage(),run=createCampaignRun();
 assert.equal(recordActCompletion(run,'act1',s),false,'unfinished act cannot unlock');
 run.artifacts.add(MARCIN_MOHAWK_ID);
 run.unlockedWeapons.add('rifle');run.unlockedWeapons.add('flamethrower');
 run.selectedWeapon='rifle';
 finish(run,'act1');
 assert.equal(recordActCompletion(run,'act1',s),true);
 assert.equal(readActUnlocks(s).highest,2);
 assert.equal(recordActCompletion(run,'act1',s),true,'idempotent');
 const two=createActReplay('act2',s);
 assert.ok(two?.run.isReplayRun&&two.handoff?.actId==='act2');
 assert.deepEqual([...two.run.artifacts],[MARCIN_MOHAWK_ID]);
 assert.equal(two.run.hp,two.run.maxHp);
 assert.equal(readCampaignCheckpoint(s),null,'unlocks do not replace autosave');
 advance(run,'act2');finish(run,'act2');assert.equal(recordActCompletion(run,'act2',s),true);
 assert.equal(readActUnlocks(s).highest,3);
 const three=createActReplay('act3',s);
 assert.ok(three?.handoff?.actId==='act3');
 assert.deepEqual([...three.run.completedActs].sort(),['act1','act2']);
 advance(run,'act3');run.artifacts.add(HORN_ID);
 run.unlockedWeapons.add(WATER_FLAMETHROWER_ID);
 finish(run,'act3');
 assert.equal(recordActCompletion(run,'act3',s),true);
 const four=createActReplay('act4',s);
 assert.ok(four?.handoff?.actId==='act4');
 assert.deepEqual([...four.run.artifacts].sort(),[MARCIN_MOHAWK_ID,HORN_ID].sort());
 assert.ok(!four.run.unlockedWeapons.has(WATER_FLAMETHROWER_ID),'water remains Act III-only');
 assert.notEqual(four.run.selectedWeapon,WATER_FLAMETHROWER_ID);
 advance(run,'act4');run.artifacts.add(BLAZEJ_BICYCLE_ID);finish(run,'act4');
 assert.equal(recordActCompletion(run,'act4',s),true);
 const five=createActReplay('act5',s);
 assert.ok(five?.handoff?.actId==='act5');
 assert.deepEqual([...five.run.artifacts].sort(),[MARCIN_MOHAWK_ID,HORN_ID,BLAZEJ_BICYCLE_ID].sort());
 assert.deepEqual([...five.run.completedActs].sort(),['act1','act2','act3','act4']);
 assert.equal(five.run.hp,five.run.maxHp);
 assert.equal(recordActCompletion(five.run,'act4',s),false,'replays do not persist unlocks');
 advance(run,'act5');finish(run,'act5');
 assert.equal(recordActCompletion(run,'act5',s),true);
 assert.equal(readActUnlocks(s).highest,5);
 assert.equal(s.getItem(CAMPAIGN_SAVE_KEY),null);
});
test('validated older checkpoint migrates without changing WZNÓW; corrupted checkpoint is ignored',()=>{
 const s=storage(),run=createCampaignRun();
 run.artifacts.add(MARCIN_MOHAWK_ID);finish(run,'act1');
 advance(run,'act2');finish(run,'act2');
 advance(run,'act3');
 assert.equal(writeCampaignCheckpoint(run,'act3',s),true);
 const old=s.getItem(CAMPAIGN_SAVE_KEY);
 assert.equal(readActUnlocks(s).highest,3);
 assert.equal(s.getItem(CAMPAIGN_SAVE_KEY),old);
 assert.ok(createActReplay('act2',s)?.handoff);
 assert.ok(createActReplay('act3',s)?.handoff);
 s.removeItem(ACT_UNLOCKS_KEY);
 s.setItem(CAMPAIGN_SAVE_KEY,'{"version":1,"actId":"act5"}');
 assert.equal(readActUnlocks(s).highest,1);
});
test('debug and replay completions cannot write permanent progress',()=>{
 const s=storage(),run=createCampaignRun();
 run.artifacts.add(MARCIN_MOHAWK_ID);finish(run,'act1');
 run.isDebugRun=true;
 assert.equal(recordActCompletion(run,'act1',s),false);
 assert.equal(readActUnlocks(s).highest,1);
 run.isDebugRun=false;run.isReplayRun=true;
 assert.equal(recordActCompletion(run,'act1',s),false);
 assert.equal(readActUnlocks(s).highest,1);
});
