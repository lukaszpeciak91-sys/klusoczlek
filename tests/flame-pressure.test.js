import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESSURE,createPressure,stepPressure,cancelPressureTrigger} from '../src/flame-pressure.js';
import {COMBAT_TUNING} from '../src/weapon-combat.js';
import {TOTAL_ENEMIES,TOTAL_WAVES} from '../src/episode.js';
function ticks(s,held,n,dt=50){let fired=0;for(let i=0;i<n;i++)fired+=Number(stepPressure(s,held,dt));return fired;}
test('pressure drains in 3000ms, locks until release, and never pulses while held',()=>{
 const s=createPressure();const count=ticks(s,true,60);
 assert.ok(count>=59);assert.equal(s.value,0);assert.equal(s.locked,true);
 assert.equal(ticks(s,true,40),0);assert.equal(s.value,100);
 assert.equal(ticks(s,true,20),0);
 ticks(s,false,1);
 assert.equal(stepPressure(s,true,50),true);
});
test('regeneration begins immediately, 20% fresh press ignites, full recharge 2000ms',()=>{
 const s=createPressure();ticks(s,true,60);
 ticks(s,false,8);assert.equal(s.value,20);
 assert.equal(stepPressure(s,true,50),true);
 assert.ok(s.value<20);
 ticks(s,false,40);assert.equal(s.value,100);
});
test('different frame rates conserve time; giant deltas bounded',()=>{
 const a=createPressure(),b=createPressure();
 ticks(a,true,60,50);ticks(b,true,120,25);
 assert.ok(Math.abs(a.value-b.value)<1e-8);assert.ok(a.value<1e-8);
 const c=createPressure();stepPressure(c,true,900000);assert.ok(c.value>=98);
});
test('cancelling held trigger cannot cause a restart without release',()=>{
 const s=createPressure();ticks(s,true,10);cancelPressureTrigger(s);
 assert.equal(ticks(s,true,30),0);
 ticks(s,false,1);assert.equal(stepPressure(s,true,50),true);
});
test('combat tuning and encounter remain unaffected',()=>{
 assert.equal(TOTAL_ENEMIES,138);assert.equal(TOTAL_WAVES,6);
 assert.equal(COMBAT_TUNING.flamethrower.damage,1);
 assert.equal(COMBAT_TUNING.flamethrower.damageInterval,250);
 assert.equal(COMBAT_TUNING.flamethrower.range,145);
 assert.equal(PRESSURE.igniteAt,20);
});
