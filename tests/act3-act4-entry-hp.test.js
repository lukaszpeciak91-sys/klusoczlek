import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDebugFixture} from '../src/debug-checkpoints.js';
import {completeCampaignAct,prepareActStart,updateRunHealth,nextActHandoff,awardRunArtifact} from '../src/campaign-run.js';
import {serializeCampaignCheckpoint,readCampaignCheckpoint,CAMPAIGN_SAVE_KEY} from '../src/campaign-save.js';
import {HORN_ID} from '../src/volcano-finale.js';
import {availableWeapons,selectUnlockedWeapon} from '../src/weapon-progression.js';

const scenes=new Set(['Arena','Airship','Volcano','School']);
const code=readFileSync(new URL('../src/volcano-scene.js',import.meta.url),'utf8');

test('Act III -> IV restores exactly full HP only after recording the Act III completion, before Act IV handoff',()=>{
 const complete=code.slice(code.indexOf('  completeActThree(){'),code.indexOf('  refreshWeaponHud(){'));
 assert.ok(complete.includes("completeCampaignAct(this.run,'act3'"));
 assert.ok(complete.includes('updateRunHealth(this.run,this.run.maxHp);'));
 assert.ok(complete.includes("selectUnlockedWeapon(this.run.selectedWeapon,this.run.unlockedWeapons,'act4')"));
 assert.ok(complete.includes('nextActHandoff(this.run,'));
 assert.ok(complete.includes("this.scene.start('ActTitle',{actId:'act4',handoff})"));
 assert.ok(complete.indexOf("completeCampaignAct(this.run,'act3'")<
   complete.indexOf('updateRunHealth(this.run,this.run.maxHp);'));
 assert.ok(complete.indexOf('updateRunHealth(this.run,this.run.maxHp);')<
   complete.indexOf('nextActHandoff(this.run,'));
 assert.equal((code.match(/updateRunHealth\(this.run,this.run.maxHp\)/g)||[]).length,1);
 assert.equal(code.slice(code.indexOf('  startEscape(){'),code.indexOf('  completeActThree(){')).includes('updateRunHealth('),false);
});

test('2/5 HP after the Act III escape yields identical 5/5 live handoff and reloaded Act IV checkpoint',()=>{
 const fixture=createDebugFixture('act3-escape');
 assert.ok(fixture&&prepareActStart(fixture.run,fixture.handoff,scenes));
 const run=fixture.run;
 run.hp=2;run.selectedWeapon='water-flamethrower';
 run.unlockedWeapons.add('water-flamethrower');
 assert.equal(awardRunArtifact(run,HORN_ID),true);
 assert.equal(completeCampaignAct(run,'act3',{
  hp:run.hp,maxHp:run.maxHp,unlockedWeapons:run.unlockedWeapons,
  selectedWeapon:run.selectedWeapon,kills:0,activeCombatMs:0
 }),true);
 assert.equal(run.hp,2,'ending of Act III does not heal before completion');
 assert.equal(run.completedActs.has('act3'),true);
 assert.equal(updateRunHealth(run,run.maxHp),true);
 const allowed=availableWeapons(run.unlockedWeapons,'act4');
 run.selectedWeapon=selectUnlockedWeapon(run.selectedWeapon,run.unlockedWeapons,'act4')
  ??(allowed.includes('rifle')?'rifle':allowed[0]??'blunderbuss');
 const handoff=nextActHandoff(run,scenes);
 assert.equal(handoff?.actId,'act4');assert.equal(handoff?.scene,'School');
 assert.equal(handoff?.hp,5);assert.equal(handoff?.maxHp,5);
 assert.equal(run.hp,5);
 assert.equal(handoff?.selectedWeapon,'rifle');
 assert.equal(handoff?.unlockedWeapons.has('water-flamethrower'),true);
 assert.equal(handoff?.artifacts.has(HORN_ID),true);
 assert.deepEqual([...handoff.completedActs].sort(),['act1','act2','act3']);
 const save=serializeCampaignCheckpoint(run,'act4');
 assert.ok(save);
 const restored=readCampaignCheckpoint({getItem(key){return key===CAMPAIGN_SAVE_KEY?save:null;}});
 assert.ok(restored);
 assert.equal(restored.actId,'act4');
 assert.deepEqual([restored.hp,restored.maxHp],[handoff.hp,handoff.maxHp]);
 assert.equal(restored.selectedWeapon,handoff.selectedWeapon);
 assert.deepEqual([...restored.unlockedWeapons].sort(),[...handoff.unlockedWeapons].sort());
 assert.deepEqual([...restored.artifacts].sort(),[...handoff.artifacts].sort());
 assert.deepEqual([...restored.completedActs].sort(),[...handoff.completedActs].sort());
 assert.ok(prepareActStart(run,handoff,scenes));
 assert.equal(run.actId,'act4');
 assert.equal(run.hp,5);
 const school=readFileSync(new URL('../src/school-scene.js',import.meta.url),'utf8');
 assert.ok(school.includes('this.hpFace.setHp(this.run.hp);'));
 assert.ok(school.includes("'HP '+this.run.hp+'/'+this.run.maxHp"));
 assert.ok(school.includes('this.captainArrival=createCaptainArrival(this);'));
 assert.ok(school.includes("this.cameras.main.fadeIn(360,0,0,0);"));
});
