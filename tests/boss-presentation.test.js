import test from 'node:test';
import assert from 'node:assert/strict';
import {createBossPresentationState,bossHpRatio} from '../src/boss-presentation.js';
test('boss HP ratio clamps safely without changing combat HP',()=>{
 assert.equal(bossHpRatio(80,80),1);
 assert.equal(bossHpRatio(40,80),.5);
 assert.equal(bossHpRatio(-1,80),0);
 assert.equal(bossHpRatio(90,80),1);
 assert.equal(bossHpRatio(1,0),0);
});
test('boss presentation prevents duplicate activation and cleans up defeat/shutdown',()=>{
 const p=createBossPresentationState();
 assert.equal(p.activate(),true);
 assert.equal(p.activate(),false);
 assert.equal(p.visible,true);
 assert.equal(p.defeat(),true);
 assert.equal(p.visible,false);
 assert.equal(p.activate(),false);
 p.dispose();
 assert.equal(p.visible,false);
 assert.equal(p.activate(),false);
});
