import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaHudLayout } from '../src/ui-layout.js';

const viewports=[[320,240],[568,320],[800,360],[960,540],[915,412]];
const bounds=(cx,cy,w,h)=>({l:cx-w/2,r:cx+w/2,t:cy-h/2,b:cy+h/2});
const disjoint=(a,b)=>a.r<=b.l||b.r<=a.l||a.b<=b.t||b.b<=a.t;
for(const [w,h] of viewports){
 test('PR52 independent floating HUD and thumb controls '+w+'x'+h,()=>{
  const x=arenaHudLayout(h,w);
  const r=x.joystickRadius;
  assert.ok(r>=28&&r<=46);
  assert.equal(x.aimX,w-x.joystickX);
  assert.equal(x.aimY,x.joystickY);
  assert.ok(x.joystickX-r>=8);
  assert.ok(x.joystickY+r<=h-8);
  assert.ok(x.aimX+r<=w-8);
  const items=[
   bounds(x.menuX,x.menuY,x.menuWidth,x.menuHeight),
   bounds(x.weaponX,x.weaponY,x.tokenSize,x.tokenSize),
   bounds(x.skullX,x.skullY,x.skullSize,x.skullSize),
   {l:x.killsX,r:x.countRight,t:x.killsY-x.countFont/2,b:x.killsY+x.countFont/2},
   {l:x.waveX,r:x.timerX-3,t:x.waveY-x.waveFont/2,b:x.waveY+x.waveFont/2},
   {l:x.timerX,r:x.timerRight,t:x.timerY-x.timerFont/2,b:x.timerY+x.timerFont/2},
   bounds(x.portraitX,x.portraitY,x.portraitSize,x.portraitSize)
  ];
  for(const item of items){assert.ok(item.l>=0&&item.r<=w&&item.t>=0&&item.b<=h,'floating HUD within safe viewport');assert.ok(item.r>item.l);}
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(disjoint(items[i],items[j]),'HUD elements '+i+' and '+j+' overlap');
  assert.ok(x.hpY+x.hpFont<=h&&x.hpY>=x.portraitY+x.portraitSize/2);
  assert.ok(x.joystickY-x.joystickActivationRadius>Math.max(x.hpY+x.hpFont,x.menuY+x.menuHeight/2),'joystick activation stays below HUD');
  assert.ok(x.aimX-x.joystickX>2*x.joystickActivationRadius,'no competing joystick touch zones');
  assert.equal('hudRibbon' in x,false,'no shared HUD ribbon');
 });
}
test('PR52 normal landscape sticks moved inward from legacy 60px centers',()=>{
 for(const [w,h] of [[568,320],[800,360],[960,540]]){
  const x=arenaHudLayout(h,w);assert.ok(x.joystickX>=80&&x.joystickX<=100);assert.ok(h-x.joystickY>=75&&h-x.joystickY<=90);
 }
});
