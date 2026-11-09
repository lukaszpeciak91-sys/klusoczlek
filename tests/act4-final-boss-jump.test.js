import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BLAZEJ_HP,BLAZEJ_ATTACK,BLAZEJ_SPEED} from '../src/school-blazej.js';
import {BLAZEJ_JUMP_DURATION_MS,BLAZEJ_JUMP_LIFT_PX,blazejJumpFrame} from '../src/school-blazej-jump.js';
import {MARCIN} from '../src/marcin.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {BLAZEJ_START,BLAZEJ_RADIUS,blazejJumpLanding} from '../src/school-finale.js';
import {SCHOOL_OBSTACLES,schoolWalkable} from '../src/school-contract.js';
import {firstFootprintHit} from '../src/obstacle-geometry.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Błażej-only 48 HP retains original Marcin and 65/30 reinforcement thresholds',()=>{
 assert.equal(BLAZEJ_HP,48);assert.equal(MARCIN.hp,36);
 assert.equal(BLAZEJ_ATTACK.hp,48);
 assert.equal(BLAZEJ_SPEED,ENEMY_TYPES.zubrokryptyda.speed*1.3);
 assert.deepEqual([BLAZEJ_ATTACK.cooldown,BLAZEJ_ATTACK.lowCooldown,BLAZEJ_ATTACK.warning],[4500,3000,900]);
 const combat=source('../src/school-combat.js');
 assert.ok(combat.includes('[[.65,0],[.30,1]]'));
 assert.ok(combat.includes('reinforcementTriggers.has(group)'));
 assert.ok(combat.includes('scene.blazej?.defeated'));
});
test('visible jump arc moves ground smoothly, raises only artwork and lands once',()=>{
 assert.equal(BLAZEJ_JUMP_DURATION_MS,360);assert.equal(BLAZEJ_JUMP_LIFT_PX,55);
 const start={x:1050,y:750},end={x:1190,y:750};
 let prev=start.x;
 for(let ms=0;ms<=360;ms+=20){
  const f=blazejJumpFrame(start,end,ms);
  assert.ok(f.x>=prev&&f.x<=end.x);prev=f.x;
  assert.equal(f.y,750);
  assert.ok(f.lift>=0&&f.lift<=55.01);
  assert.equal(f.complete,ms===360);
 }
 const middle=blazejJumpFrame(start,end,180);
 assert.equal(middle.lift,55);assert.ok(middle.shadowScale<1);
 assert.equal(blazejJumpFrame(start,end,360).lift<.000001,true);
 const boss=source('../src/school-blazej.js');
 assert.ok(boss.includes('jumpShadow.fillStyle'));
 assert.ok(boss.includes('actor.sprite.setPosition(actor.x,actor.y-frame.lift)'));
 assert.ok(boss.includes('if(frame.complete)'));
 assert.ok(boss.includes('landings++'));
 assert.ok(boss.includes('!firstFootprintHit(actor,scene.player,scene.obstacles,0)'));
 assert.ok(boss.includes("kind=(volleyCount+jumpCount)%2===0?'radial':'jump'"));
});
test('jump landing and full swept segment never cross school/rack solids',()=>{
 for(const [start,player] of [
  [{x:1335,y:785},{x:1200,y:780}],
  [{x:1335,y:830},{x:1660,y:830}],
  [{x:980,y:317},{x:1500,y:317}],
 ]){
  const dest=blazejJumpLanding(start,player);
  assert.ok(dest&&schoolWalkable(dest,BLAZEJ_RADIUS));
  assert.equal(firstFootprintHit(start,dest,SCHOOL_OBSTACLES,BLAZEJ_RADIUS),null);
  assert.ok(Math.hypot(dest.x-start.x,dest.y-start.y)<=165.01);
 }
});
