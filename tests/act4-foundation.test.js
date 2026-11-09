import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHOOL_WORLD,SCHOOL_PLACES,SCHOOL_OBSTACLES,SCHOOL_WAVE_COUNT,schoolWalkable,schoolStep,schoolDebugPoint} from '../src/school-contract.js';
import {availableWeapons,cycleUnlockedWeapon,selectUnlockedWeapon} from '../src/weapon-progression.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';

test('Act IV is an Act I-sized world with safe reachable opening and school checkpoints',()=>{
  assert.deepEqual([SCHOOL_WORLD.width,SCHOOL_WORLD.height],[1800,1200]);
  assert.equal(SCHOOL_WAVE_COUNT,4);
  assert.deepEqual(SCHOOL_OBSTACLES.map(o=>o.id),['chapel','school','bicycleRack','school-tire-pile','school-tire-pile-2','school-toi-toi','school-rock-small','school-rock-medium']);
  for(const id of ['act4-opening','act4-school']){
    const p=schoolDebugPoint(id);
    assert.equal(schoolWalkable(p),true,id);
    assert.equal(createDebugFixture(id)?.handoff.scene,'School');
  }
  assert.equal(schoolWalkable(SCHOOL_PLACES.chapel),false);
  assert.equal(schoolWalkable(SCHOOL_PLACES.school),false);
  assert.equal(schoolWalkable(SCHOOL_PLACES.pitch),true,'pitch is playable, not a solid roof');
});

test('Act I swept obstacle movement never tunnels through chapel or bicycle rack',()=>{
  let p={x:SCHOOL_PLACES.chapel.x,y:SCHOOL_PLACES.chapel.y+SCHOOL_PLACES.chapel.height/2+48};
  for(let i=0;i<35;i++)p=schoolStep(p,{x:0,y:-1},50);
  assert.ok(p.y>=927+17-.5,JSON.stringify(p));
  assert.equal(schoolWalkable(p),true);
  p={x:SCHOOL_PLACES.bicycleRack.x,y:915};
  for(let i=0;i<35;i++)p=schoolStep(p,{x:0,y:-1},50);
  const rack=SCHOOL_OBSTACLES.find(o=>o.id==='bicycleRack').footprint;
  assert.ok(p.y>=rack.y+rack.height/2+17-.5);
  assert.equal(schoolWalkable(p),true);
  let outer={x:1750,y:1150};
  for(let i=0;i<30;i++)outer=schoolStep(outer,{x:1,y:1},50);
  assert.ok(outer.x<=SCHOOL_WORLD.width-17&&outer.y<=SCHOOL_WORLD.height-17);
});

test('Act IV and V weapon filters preserve water history without selecting it',()=>{
  const owned=new Set(['blunderbuss','rifle','flamethrower','water-flamethrower']);
  assert.equal(availableWeapons(owned,'act3').includes('water-flamethrower'),true);
  for(const actId of ['act4','act5']){
    assert.deepEqual(availableWeapons(owned,actId),['blunderbuss','rifle','flamethrower']);
    assert.equal(selectUnlockedWeapon('water-flamethrower',owned,actId),null);
    assert.equal(cycleUnlockedWeapon('flamethrower',owned,actId),'blunderbuss');
    assert.equal(cycleUnlockedWeapon('water-flamethrower',owned,actId),'blunderbuss');
  }
  assert.equal(owned.has('water-flamethrower'),true,'the historical entitlement is not destroyed');
});

test('School flamethrower respects pressure lock and authentic trigger release',async()=>{
 const {createContinuousWeaponState}=await import('../src/continuous-weapon.js');
 const state=createContinuousWeaponState();
 assert.ok(state.step(true,50));state.stop();
 assert.equal(state.step(true,50),false,'holding after interruption stays locked');
 state.step(false,50);assert.ok(state.step(true,50),'release rearms');
 let powered=true;
 for(let i=0;i<65;i++)powered=state.step(true,50);
 assert.equal(powered,false,'pressure depletes');
 assert.equal(state.step(true,50),false,'staying held cannot auto-restart');
 state.step(false,50);
 for(let i=0;i<12;i++)state.step(false,50);
 assert.ok(state.step(true,50),'regen and release allow restart');
 const scene=readFileSync(new URL('../src/school-combat.js',import.meta.url),'utf8');
 assert.ok(scene.includes('if(!scene.aimJoystick?.held)fire.step(false,0)'));
 assert.ok(scene.includes("retroAudio.stream('flamethrower',flame)"));
 assert.ok(scene.includes('enemyFlameVisible(origin,aim,boss'));
});
