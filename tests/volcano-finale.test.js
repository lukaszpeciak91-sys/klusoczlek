import test from 'node:test';
import assert from 'node:assert/strict';
import {createVolcanoFinaleState,formatEscape,HORN_ID,ESCAPE_MS} from '../src/volcano-finale.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {createCampaignRun,awardRunArtifact,completeCampaignAct,MARCIN_MOHAWK_ID} from '../src/campaign-run.js';
import {createBogdanEncounter,MARLENA_BARKS} from '../src/volcano-bogdan.js';
test('approved finale lines and order are exact',()=>{
 assert.deepEqual(DIALOGUES['act3-bogdan-final'].map(x=>x[2]),[
  'GŁUPCZE! Przez ciebie przypadkiem WŁĄCZYŁEM główny zawór lawy!',
  'Powiedz Marlenie... Niech ją piekło pochłonie... Bleee... *zdechł*']);
 assert.deepEqual(DIALOGUES['act3-eruption-warning'].map(x=>x[2]),['O kurczę! Wulkan zaraz wybuchnie!']);
 assert.deepEqual(DIALOGUES['act3-captain-extraction'].map(x=>x[2]),['Masz róg?!','Tak!','Cudownie! Wynośmy się stąd!']);
 assert.deepEqual(MARLENA_BARKS,['Mama miała rację!','Niech sam w tym smrodzie siedzi, pajac!']);
});
test('single-fire ordered finale; no premature escape countdown',()=>{
 const f=createVolcanoFinaleState();assert.equal(f.remaining,ESCAPE_MS);
 assert.equal(f.tick(500),false);assert.equal(f.remaining,ESCAPE_MS);
 for(const state of ['BOGDAN_ACTIVE','BOGDAN_DEFEATED','FINAL_DIALOGUE','ARTIFACT_REWARD','BOGDAN_EXPLOSION','ALOES_WARNING']){
  assert.equal(f.state,state);assert.equal(f.advance(state),true);assert.equal(f.advance(state),false);
 }
 assert.equal(f.state,'ESCAPE_ACTIVE');assert.equal(f.tick(1000),false);assert.equal(f.remaining,59000);
 assert.equal(f.advance('ESCAPE_ACTIVE'),true);assert.equal(f.state,'CAPTAIN_EXTRACTION');
 assert.equal(f.tick(1000),false);assert.equal(f.advance('CAPTAIN_EXTRACTION'),true);
 assert.equal(f.completed,true);assert.equal(f.advance('CAPTAIN_EXTRACTION'),false);
});
test('timeout, retry and HP failure retain checkpoint without boss replay',()=>{
 const f=createVolcanoFinaleState();
 for(const state of ['BOGDAN_ACTIVE','BOGDAN_DEFEATED','FINAL_DIALOGUE','ARTIFACT_REWARD','BOGDAN_EXPLOSION','ALOES_WARNING'])f.advance(state);
 assert.equal(f.tick(60000),true); // full elapsed gameplay delta is counted
 assert.equal(f.state,'ESCAPE_RETRY');assert.equal(f.retry(),true);
 assert.equal(f.state,'ESCAPE_ACTIVE');assert.equal(f.remaining,60000);
 assert.equal(f.fail(),true);assert.equal(f.retry(),true);
 assert.equal(formatEscape(60000),'01:00');assert.equal(formatEscape(1),'00:01');assert.equal(formatEscape(0),'00:00');
});
test('Marcin artifact and weapon unlocks survive idempotent horn and Act III completion',()=>{
 const run=createCampaignRun();run.actId='act3';run.unlockedWeapons.add('rifle');
 awardRunArtifact(run,MARCIN_MOHAWK_ID);
 assert.equal(awardRunArtifact(run,HORN_ID),true);
 assert.equal(awardRunArtifact(run,HORN_ID),false);
 assert.equal(completeCampaignAct(run,'act3',{hp:4,maxHp:5,unlockedWeapons:run.unlockedWeapons,selectedWeapon:'rifle',kills:0,activeCombatMs:0}),true);
 assert.equal(completeCampaignAct(run,'act3',{hp:4,maxHp:5,unlockedWeapons:run.unlockedWeapons,selectedWeapon:'rifle',kills:0,activeCombatMs:0}),false);
 assert.equal(run.artifacts.has(MARCIN_MOHAWK_ID),true);assert.equal(run.artifacts.has(HORN_ID),true);
 assert.equal(run.unlockedWeapons.has('rifle'),true);assert.equal(run.actId,'act3');
});

test('60-second countdown stays accurate at 60, 30, 10 and 1 FPS',()=>{
 for(const fps of [60,30,10,1]){
  const f=createVolcanoFinaleState();
  for(const state of ['BOGDAN_ACTIVE','BOGDAN_DEFEATED','FINAL_DIALOGUE','ARTIFACT_REWARD','BOGDAN_EXPLOSION','ALOES_WARNING'])f.advance(state);
  for(let i=0;i<fps*59;i++)f.tick(1000/fps);
  assert.ok(Math.abs(f.remaining-1000)<.01,'fps='+fps);
  for(let i=0;i<fps;i++)f.tick(1000/fps);
  assert.equal(f.state,'ESCAPE_RETRY','fps='+fps);
 }
});
test('nonfinite or negative frame delta never advances countdown',()=>{
 const f=createVolcanoFinaleState();
 for(const state of ['BOGDAN_ACTIVE','BOGDAN_DEFEATED','FINAL_DIALOGUE','ARTIFACT_REWARD','BOGDAN_EXPLOSION','ALOES_WARNING'])f.advance(state);
 f.tick(NaN);f.tick(-200);f.tick(Infinity);assert.equal(f.remaining,60000);
});
