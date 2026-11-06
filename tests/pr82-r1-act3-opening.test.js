import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES} from '../src/dialogue-data.js';
import {createCampaignRun,grantWaterFlamethrower,WATER_FLAMETHROWER_ID} from '../src/campaign-run.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';
import {CAMPAIGN_ACTS} from '../src/campaign.js';
import {readFileSync} from 'node:fs';

test('Act III has precisely four approved dialogue panels',()=>{
 assert.deepEqual(DIALOGUES['act3-opening'],[
 ['captain','KAPITAN MARIAN','Oto jesteśmy! Weź to, przyda ci się!'],
 ['captain','KAPITAN MARIAN','Roi się tu od lawostworków!'],
 ['aloes','ALOES','Lawostworków?'],
 ['captain','KAPITAN MARIAN','Tak, lawostworków! A teraz prędko po kolejny artefakt!']
 ]);
});
test('water weapon grant is idempotent and preserves equipment and health',()=>{
 const run=createCampaignRun();run.hp=3;run.unlockedWeapons.add('rifle');
 assert.equal(grantWaterFlamethrower(run),true);
 assert.equal(grantWaterFlamethrower(run),false);
 assert.equal(run.hp,3);
 assert.equal(run.unlockedWeapons.has('rifle'),true);
 assert.equal(run.unlockedWeapons.has(WATER_FLAMETHROWER_ID),true);
 assert.equal(run.selectedWeapon,null);
});
test('DEBUG Act III retains valid inherited handoff and five-act contract',()=>{
 const fixture=createDebugFixture('act3-opening');
 assert.equal(fixture.handoff.actId,'act3');
 assert.equal(fixture.handoff.hp,fixture.run.hp);
 assert.equal(CAMPAIGN_ACTS.length,5);
});
test('Volcano opening gates movement and MENU is brought to top',()=>{
 const source=readFileSync(new URL('../src/volcano-scene.js',import.meta.url),'utf8');
 assert.match(source,/this\.openingComplete=false/);
 assert.match(source,/this\.openingComplete=true/);
 assert.match(source,/this\.scene\.bringToTop\('Menu'\)/);
 assert.match(source,/createDialoguePanel\(this,Phaser/);
 assert.match(source,/grantWaterFlamethrower\(this\.run\)/);
});
