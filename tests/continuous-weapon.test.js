import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTINUOUS_PALETTES,continuousDamageAllowed,drawContinuousStream,createContinuousWeaponState} from '../src/continuous-weapon.js';
import {availableWeapons,cycleUnlockedWeapon} from '../src/weapon-progression.js';
import {inFlameCone,COMBAT_TUNING} from '../src/weapon-combat.js';
import {muzzlePoint} from '../src/shooting.js';

test('continuous weapon damage eligibility matrix',()=>{
 for(const type of ['bobrozombi','bocianolak','zubrokryptyda','marcin']){
  assert.equal(continuousDamageAllowed('flamethrower',type),true,type);
  assert.equal(continuousDamageAllowed('water-flamethrower',type),false,type);
 }
 for(const type of ['lawostworek-1','lawostworek-2']){
  assert.equal(continuousDamageAllowed('flamethrower',type),false,type);
  assert.equal(continuousDamageAllowed('water-flamethrower',type),true,type);
  for(const weapon of ['rifle','blunderbuss'])assert.equal(continuousDamageAllowed(weapon,type),false);
 }
});
test('shared continuous pressure exhaustion and release',()=>{
 for(const weapon of Object.keys(CONTINUOUS_PALETTES)){
  const state=createContinuousWeaponState();
  for(let i=0;i<60;i++)state.step(true,50);
  assert.equal(state.pressure.value,0,weapon);
  assert.equal(state.step(true,50),false);
  for(let i=0;i<40;i++)state.step(false,50);
  assert.equal(state.pressure.value,100,weapon);
  assert.equal(state.step(true,50),true);
  state.stop();assert.equal(state.step(true,50),false);
  state.step(false,50);assert.equal(state.step(true,50),true);
 }
});
test('same eight-direction muzzle and stream geometry for both variants',()=>{
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,aim={x:Math.cos(angle),y:Math.sin(angle)};
  const origin=muzzlePoint(200,300,aim);
  assert.ok(Math.abs(Math.hypot(origin.x-200,origin.y-300)-24)<1e-8);
  const commands=weapon=>{
   const log=[];
   const g={clear(){log.push(['clear']);},fillStyle(color,alpha){log.push(['color',color,alpha]);return this;},fillTriangle(...p){log.push(['triangle',...p]);return this;},fillCircle(...p){log.push(['circle',...p]);return this;}};
   drawContinuousStream(g,origin,aim,1234,weapon);return log;
  };
  const fire=commands('flamethrower'),water=commands('water-flamethrower');
  assert.deepEqual(fire.filter(x=>x[0]==='triangle'),water.filter(x=>x[0]==='triangle'));
  assert.equal(fire.filter(x=>x[0]==='triangle').length,33);
  assert.notEqual(fire[1][1],water[1][1]);
  assert.equal(inFlameCone(origin,aim,{x:origin.x+aim.x*100,y:origin.y+aim.y*100},COMBAT_TUNING.flamethrower.range,COMBAT_TUNING.flamethrower.halfAngle),true);
 }
});
test('water entitlement persists but selection restricted to Act III',()=>{
 const owned=new Set(['blunderbuss','rifle','water-flamethrower']);
 assert.ok(availableWeapons(owned,'act3').includes('water-flamethrower'));
 for(const act of ['act1','act2','act4','act5']){
  assert.equal(availableWeapons(owned,act).includes('water-flamethrower'),false);
  assert.notEqual(cycleUnlockedWeapon('rifle',owned,act),'water-flamethrower');
 }
 assert.ok(owned.has('water-flamethrower'));
});
