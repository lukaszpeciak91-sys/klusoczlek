import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHOOL_ART} from '../src/schoolyard-art.js';
import {SCHOOL_PLACES,SCHOOL_VISIBLE_FOOTPRINTS,SCHOOL_OBSTACLES,schoolWalkable,schoolStep} from '../src/school-contract.js';
import {CHAPEL_RETURN} from '../src/school-finale.js';

test('Act IV chapel production PNG, visible silhouette and collision are scaled together',()=>{
 const a=SCHOOL_ART.chapel,p=SCHOOL_VISIBLE_FOOTPRINTS.chapel;
 const obstacle=SCHOOL_OBSTACLES.find(o=>o.id==='chapel');
 assert.equal(a.path,'obstacles/act4-chapel.png');
 assert.deepEqual([a.x,a.bottomY,a.width,a.height],[395,995,380.7,380.7]);
 assert.deepEqual([p.x,p.y,p.width,p.height],[395,851,155.52,152.28]);
 assert.deepEqual(obstacle.footprint,{shape:'box',x:p.x,y:p.y,width:p.width,height:p.height,angle:0});
 const pixel=a.width/a.sourceWidth;
 const visual={left:a.x-a.width/2+74*pixel,right:a.x-a.width/2+160*pixel,
  top:a.bottomY-a.height+47*pixel,bottom:a.bottomY-a.height+182*pixel};
 assert.ok(visual.left>=p.x-p.width/2&&visual.right<=p.x+p.width/2,
  'solid covers the chapel painted lateral wall band');
 assert.ok(visual.top<p.y-p.height/2&&visual.bottom<p.y+p.height/2,
  'footprint covers lower body, not the transparent upper roof or full PNG');
 assert.ok(a.x>330&&a.width>317.25,'chapel enlarged and moved right from approved original');
});

test('Act IV chapel entrance, captain approach and bicycle finale remain walkable',()=>{
 const door=SCHOOL_PLACES.chapelDoor;
 assert.deepEqual(door,{x:431,y:965});
 assert.ok(schoolWalkable(door,17),'Captain can reach the new chapel entrance');
 assert.ok(schoolWalkable(SCHOOL_PLACES.playerStart,17),'original Act IV spawn remains free');
 assert.ok(schoolWalkable(CHAPEL_RETURN,17),'bicycle finale chapel return remains free');
 assert.ok(schoolWalkable({x:CHAPEL_RETURN.x+76,y:CHAPEL_RETURN.y+15},17),'decorative bicycle drop remains free');
 for(let i=0;i<=20;i++){
  const t=i/20,p={x:CHAPEL_RETURN.x+(door.x-CHAPEL_RETURN.x)*t,y:CHAPEL_RETURN.y+(door.y-CHAPEL_RETURN.y)*t};
  assert.ok(schoolWalkable(p,17),'chapel return-to-door approach remains open at '+i);
 }
 const solid=SCHOOL_VISIBLE_FOOTPRINTS.chapel;
 assert.ok(!schoolWalkable({x:solid.x,y:solid.y},17),'chapel walls are impassable');
 let actor={x:solid.x,y:solid.y+solid.height/2+60};
 assert.ok(schoolWalkable(actor));
 for(let i=0;i<100;i++){
  const next=schoolStep(actor,{x:0,y:-1},50);
  assert.ok(schoolWalkable(next,17));
  actor=next;
 }
 assert.ok(actor.y>=solid.y+solid.height/2+17-1,'player never crosses through chapel lower wall');
});
