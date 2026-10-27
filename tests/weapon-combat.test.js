import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBAT_TUNING,createFiringState,resetFiring,firingStep,inFlameCone,flameTargetVisible,cooldownReady} from '../src/weapon-combat.js';
test('unarmed silent and baseline blunderbuss 180ms',()=>{
 const s=createFiringState();assert.equal(firingStep(s,null,true,0),0);
 assert.equal(firingStep(s,'blunderbuss',true,0),1);
 assert.equal(firingStep(s,'blunderbuss',true,179),0);
 assert.equal(firingStep(s,'blunderbuss',true,180),1);
 assert.equal(COMBAT_TUNING.blunderbuss.speed,510);
 assert.equal(COMBAT_TUNING.blunderbuss.radius,5);
 assert.equal(COMBAT_TUNING.blunderbuss.damage,1);
});
test('rifle three at 70ms, 300ms between bursts; release cancels',()=>{
 const s=createFiringState();
 assert.equal(firingStep(s,'rifle',true,0),1);
 assert.equal(firingStep(s,'rifle',true,69),0);
 assert.equal(firingStep(s,'rifle',true,70),1);
 assert.equal(firingStep(s,'rifle',true,140),1);
 assert.equal(firingStep(s,'rifle',true,439),0);
 assert.equal(firingStep(s,'rifle',true,440),1);
 assert.equal(firingStep(s,'rifle',false,450),0);
 assert.equal(firingStep(s,'rifle',true,500),1);
 resetFiring(s,'flamethrower');
 assert.equal(s.nextShot,null);
});
test('flame cone range/angle and obstacle interception',()=>{
 const from={x:0,y:0},aim={x:1,y:0};
 assert.ok(inFlameCone(from,aim,{x:145,y:0}));
 assert.ok(!inFlameCone(from,aim,{x:146,y:0}));
 assert.ok(!inFlameCone(from,aim,{x:80,y:80}));
 assert.ok(flameTargetVisible(from,aim,{x:100,y:0},0,[]));
 assert.ok(!flameTargetVisible(from,aim,{x:100,y:0},0,[{type:'rock',x:50,y:0,alive:true}]));
});
test('flame damage cadence is time based and independent of frames',()=>{
 const target={},times=new Map();let hits=0;
 for(const now of [0,16,33,90,249,250,251,500])if(cooldownReady(times,target,now,250))hits++;
 assert.equal(hits,3);
 assert.equal(COMBAT_TUNING.flamethrower.maxParticles,60);
});
