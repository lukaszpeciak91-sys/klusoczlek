import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAim,shouldFire,muzzlePoint,FIRE_INTERVAL_MS} from '../src/shooting.js';
import {resolvePose} from '../src/combat-contract.js';
import {arenaHudLayout} from '../src/ui-layout.js';
test('continuous aim and deadzone',()=>{
 assert.deepEqual(resolveAim(0.2,0),{x:0,y:0});
 const a=resolveAim(1,0.37);
 assert.ok(Math.abs(Math.hypot(a.x,a.y)-1)<1e-12);
 assert.ok(a.y>0&&a.y<0.4);
 assert.equal(resolvePose({movement:{x:0,y:-1},aim:a,aimActive:true}).facing,'e');
});
test('held fire cadence and immediate release',()=>{
 assert.equal(shouldFire(10,null,true),true);
 assert.equal(shouldFire(10+FIRE_INTERVAL_MS-1,10,true),false);
 assert.equal(shouldFire(10+FIRE_INTERVAL_MS,10,true),true);
 assert.equal(shouldFire(1000,null,false),false);
 assert.deepEqual(muzzlePoint(100,200,{x:1,y:0}),{x:124,y:200});
});
test('two sticks fit in short landscape without intersecting',()=>{
 for(const [w,h] of [[711,320],[800,360],[833,375],[933,420]]){
 const a=arenaHudLayout(h,w);
 assert.equal(a.aimY,a.joystickY);
 assert.ok(a.aimX-a.joystickX>=92*2);
 assert.ok(a.aimX+46<=w&&a.aimY+46<=h);
 }
});
