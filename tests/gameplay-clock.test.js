import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayClock,advanceGameplayClock,formatGameplayClock} from '../src/gameplay-clock.js';
test('slow foreground frames count actual active elapsed time rather than capped simulation steps',()=>{
 const c=createGameplayClock();
 assert.equal(advanceGameplayClock(c,1000,true),0);
 assert.equal(advanceGameplayClock(c,1250,true),250);
 assert.equal(advanceGameplayClock(c,2450,true),1450);
 assert.equal(formatGameplayClock(c.elapsedMs),'00:01');
});
test('MENU dialogue blur orientation and terminal boundaries discard inactive wall time',()=>{
 const c=createGameplayClock();advanceGameplayClock(c,100,true);advanceGameplayClock(c,1100,true);
 for(const [off,on] of [[2000,10000],[11000,35000],[37000,99000],[100000,150000],[155000,250000]]){
  advanceGameplayClock(c,off,false);
  assert.equal(advanceGameplayClock(c,on,true),1000);
  assert.equal(advanceGameplayClock(c,on+100,true),1100);
  advanceGameplayClock(c,on+100,false);
 }
 assert.equal(formatGameplayClock(65000),'01:05');
});
test('monotonic drift never subtracts elapsed play and a new session resets',()=>{
 const c=createGameplayClock();advanceGameplayClock(c,200,true);advanceGameplayClock(c,1200,true);
 assert.equal(advanceGameplayClock(c,1000,true),1000);
 assert.equal(createGameplayClock().elapsedMs,0);
});
