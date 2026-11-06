import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPAIGN_ACTS,sceneForAct} from '../src/campaign.js';
import {VOLCANO_START,VOLCANO_TEMP_BOUNDS,VOLCANO_ASSETS,volcanoStep} from '../src/volcano-contract.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';

test('Act III is registered with approved title',()=>{
 const act=CAMPAIGN_ACTS.find(a=>a.id==='act3');
 assert.equal(act.title,'PRZYTULNE M4 W CENTRUM WULKANU');
 assert.equal(sceneForAct('act3'),'Volcano');
});
test('temporary walk bounds never permit lava crossing',()=>{
 const p=volcanoStep(VOLCANO_START,{x:-1,y:-1},100000,235,17);
 assert.ok(p.x>=VOLCANO_TEMP_BOUNDS.left&&p.y>=VOLCANO_TEMP_BOUNDS.top);
 const q=volcanoStep({x:1609,y:1044},{x:1,y:1},100000,235,17);
 assert.ok(q.x<=VOLCANO_TEMP_BOUNDS.right&&q.y<=VOLCANO_TEMP_BOUNDS.bottom);
});
test('Act III debug checkpoint carries completed predecessors and equipment',()=>{
 const fixture=createDebugFixture('act3-opening');
 assert.ok(fixture);
 assert.equal(fixture.handoff.scene,'Volcano');
 assert.ok(fixture.run.completedActs.has('act1'));
 assert.ok(fixture.run.completedActs.has('act2'));
 assert.ok(fixture.run.unlockedWeapons.has('rifle'));
});
test('artist asset paths and dimensions are explicit',()=>{
 assert.equal(VOLCANO_ASSETS.terrain.width,1800);
 assert.equal(VOLCANO_ASSETS.terrain.height,1200);
 assert.equal(VOLCANO_ASSETS.terrain.status,'pending');
 assert.equal(VOLCANO_ASSETS.lava.repeat,'seamless both axes');
});
