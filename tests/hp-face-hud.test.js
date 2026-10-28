import test from 'node:test';
import assert from 'node:assert/strict';
import {HP_FACE_ASSETS,faceForHp,isValidPortraitPng} from '../src/hp-face-hud.js';
import {arenaHudLayout} from '../src/ui-layout.js';
import {assetManifest} from '../src/asset-manifest.js';
test('five exact approved assets, no old three-band entries',()=>{
 assert.deepEqual(HP_FACE_ASSETS.map(a=>a.path),[5,4,3,2,1].map(n=>'portraits/hp_'+n+'.png'));
 assert.ok(HP_FACE_ASSETS.every(a=>a.width===128&&a.height===128&&a.alpha));
 assert.ok(!assetManifest.some(a=>/^hp_(high|medium|low)$/.test(a.id)));
});
test('health states 5 to zero map without a sixth asset',()=>{
 assert.deepEqual([5,4,3,2,1,0].map(faceForHp),['hp_5','hp_4','hp_3','hp_2','hp_1','hp_1']);
});
test('strict PNG RGBA 128 by 128 validator',()=>{
 const b=new Uint8Array(26);b.set([137,80,78,71,13,10,26,10]);b[19]=128;b[23]=128;b[24]=8;b[25]=6;
 assert.ok(isValidPortraitPng(b));
 b[23]=127;assert.equal(isValidPortraitPng(b),false);
 b[23]=128;b[25]=2;assert.equal(isValidPortraitPng(b),false);
});
test('compact status ribbon zones and joystick clearance',()=>{
 for(const [w,h] of [[320,240],[568,320],[640,360],[800,360],[960,540]]){
  const p=arenaHudLayout(h,w);
  assert.ok(p.weaponX-p.tokenSize/2>p.menuX+p.menuWidth/2);
  assert.ok(p.skullX-p.skullSize/2>p.weaponX+p.tokenSize/2);
  assert.ok(p.killsX+String('28/28').length*p.countFont*.64<p.portraitX-p.portraitSize/2,`count collision ${w}`);
  assert.ok(p.portraitX+p.portraitSize/2<w);
  assert.ok(p.portraitY+p.portraitSize/2<h/2);
  assert.ok(p.hpY+p.hpFont*1.3<p.joystickY-p.joystickRadius);
 }
});
