import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPON_ORDER,cycleUnlockedWeapon,selectUnlockedWeapon} from '../src/weapon-progression.js';
import {arenaHudLayout} from '../src/ui-layout.js';

test('weapon selection only cycles owned weapons in canonical order',()=>{
 const owned=new Set(['blunderbuss']);
 assert.deepEqual(WEAPON_ORDER,['blunderbuss','rifle','flamethrower']);
 assert.equal(cycleUnlockedWeapon('blunderbuss',owned),'blunderbuss');
 assert.equal(selectUnlockedWeapon('rifle',owned),null);
 owned.add('flamethrower');
 assert.equal(cycleUnlockedWeapon('blunderbuss',owned),'flamethrower');
 assert.equal(cycleUnlockedWeapon('flamethrower',owned),'blunderbuss');
 owned.add('rifle');
 assert.equal(cycleUnlockedWeapon('blunderbuss',owned),'rifle');
 assert.equal(cycleUnlockedWeapon('rifle',owned),'flamethrower');
 assert.equal(cycleUnlockedWeapon('flamethrower',owned),'blunderbuss');
 assert.equal(selectUnlockedWeapon('water-thrower',owned),null);
});

test('weapon touch control never overlaps joystick activation radii',()=>{
 for(const [width,height] of [[320,240],[568,320],[800,360],[960,540]]){
  const p=arenaHudLayout(height,width);
  assert.ok(p.switchX-p.switchSize/2>p.joystickX+p.joystickActivationRadius,
    'left touch overlap at '+width);
  assert.ok(p.switchX+p.switchSize/2<p.aimX-p.joystickActivationRadius,
    'right touch overlap at '+width);
  assert.ok(p.switchX-p.switchSize/2>0&&p.switchX+p.switchSize/2<width);
  assert.ok(p.switchY+p.switchSize/2<=height);
 }
});
