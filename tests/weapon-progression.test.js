import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS,initialPickupPoint,dropPoint,safeEnemySpawn,pickupCollected,clearPoint,fallbackRewardPoint } from '../src/weapon-progression.js';
import { ARENA } from '../src/movement.js';
const player={x:ARENA.width/2,y:ARENA.height/2};
test('initial blunderbuss is visible and clear on 320x240 landscape',()=>{
 const p=initialPickupPoint(player,null,{width:320,height:240},[]);
 assert.ok(p);
 assert.ok(p.x>=player.x-160+36&&p.x<=player.x+160-36);
 assert.ok(p.y>=player.y-120+36&&p.y<=player.y+120-36);
 assert.ok(!pickupCollected(player,p));
 assert.ok(pickupCollected({x:p.x+10,y:p.y},p));
});
test('milestone drop does not collide with obstacle',()=>{
 const obstacles=[{type:'rock',x:150,y:150,alive:true}];
 const p=dropPoint({x:150,y:150},obstacles);
 assert.ok(p);assert.ok(clearPoint(p,obstacles));
});
test('spawn sequence deterministic and remote from player, inside arena',()=>{
 for(let i=0;i<18;i++){
  const p=safeEnemySpawn(player,[],i);
  assert.ok(p);
  assert.ok(Math.hypot(p.x-player.x,p.y-player.y)>=220);
  assert.ok(clearPoint(p,[]));
 }
});
test('three pickup variants and labels remain distinct',()=>{
 assert.deepEqual(Object.keys(WEAPONS),['blunderbuss','rifle','flamethrower']);
 assert.equal(new Set(Object.values(WEAPONS).map(x=>x.color)).size,3);
});

test('blocked death location uses a safe world fallback',()=>{
 const blockers=[{type:'rock',x:player.x,y:player.y,alive:true}];
 const p=fallbackRewardPoint(player,blockers);
 assert.ok(p);
 assert.ok(clearPoint(p,blockers));
 assert.ok(Math.hypot(p.x-player.x)>52);
});
