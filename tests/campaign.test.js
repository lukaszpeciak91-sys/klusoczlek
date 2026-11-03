import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPAIGN_ACTS,FIRST_ACT_ID,getAct,nextAct,nextAvailableAct,sceneForAct,completionDestination,FUTURE_ACT_ASSETS} from '../src/campaign.js';

test('five stable acts with exact approved Polish title cards',()=>{
  assert.deepEqual(CAMPAIGN_ACTS.map(({label,title})=>[label,title]),[
    ['AKT I','POBUDKA'],
    ['AKT II','W PRZESTWORZACH'],
    ['AKT III','PRZYTULNE M4 W WULKANIE'],
    ['AKT IV','ROWER BŁAŻEJA'],
    ['AKT V','TOŻSAMOŚĆ MARIANA'],
  ]);
  assert.deepEqual(CAMPAIGN_ACTS.map(act=>act.id),['act1','act2','act3','act4','act5']);
  assert.equal(FIRST_ACT_ID,'act1');
  assert.deepEqual(CAMPAIGN_ACTS.map(act=>act.nextActId),['act2','act3','act4','act5',null]);
});
test('unimplemented acts cannot route to unregistered gameplay scenes',()=>{
  assert.equal(sceneForAct('act1'),'Arena');
  assert.equal(getAct('act2').scene,null);
  assert.equal(nextAct('act1')?.id,'act2');
  assert.equal(nextAct('act5'),null);
  assert.equal(nextAct('unknown'),null);
  assert.equal(nextAvailableAct('act1'),null);
  assert.equal(completionDestination('act1'),null);
  assert.equal(sceneForAct('act2'),null);
  assert.equal(sceneForAct('unknown'),null);
});
test('future asset contracts describe paths but require no PNG binaries',()=>{
  assert.deepEqual(FUTURE_ACT_ASSETS,[
    'arenas/airship-deck.png','backgrounds/act2-sky.png',
    'backgrounds/act2-clouds-far.png','backgrounds/act2-clouds-mid.png',
    'backgrounds/act2-clouds-near.png','vehicles/hang-glider.png',
  ]);
});
