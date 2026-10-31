import test from 'node:test';
import assert from 'node:assert/strict';
import * as visual from '../src/marcin-renderer.js';
import {damageFootprints,enemyProjectileHit} from '../src/enemy-damage.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
test('approved Marcin production contract and world feet anchor',()=>{
 assert.equal(visual.MARCIN_ASSET.path,'enemies/marcin.png');
 assert.deepEqual([visual.MARCIN_ASSET.width,visual.MARCIN_ASSET.height,visual.MARCIN_ASSET.frameWidth,visual.MARCIN_ASSET.frameHeight],[2048,256,256,256]);
 assert.equal(visual.MARCIN_VISUAL_SCALE,0.68);assert.equal(visual.MARCIN_FEET_OFFSET,-76.16);
 assert.equal(ENEMY_TYPES.marcin.radius,40);
});
test('approved art pose transforms damage union; fallback remains separate',()=>{
 const e={type:'marcin',x:900,y:600};
 for(let frame=0;frame<8;frame++){
  const p={art:true,x:900,y:523.84,scale:0.68,angle:0,frame};
  const parts=damageFootprints(e,p);assert.ok(parts.length>=3&&parts.length<=4);
  assert.ok(parts.some(s=>s.y<510));
  assert.ok(enemyProjectileHit({x:750,y:530},{x:1050,y:530},e,3,p));
  assert.equal(enemyProjectileHit({x:750,y:400},{x:1050,y:400},e,3,p),null);
  const shifted=damageFootprints(e,{...p,x:910,y:528.84});
  parts.forEach((s,i)=>{assert.ok(Math.abs(shifted[i].x-s.x-10)<1e-8);assert.ok(Math.abs(shifted[i].y-s.y-5)<1e-8);});
 }
 assert.notDeepEqual(damageFootprints(e,{art:true,x:900,y:523.84,scale:.68,angle:0,frame:0}),damageFootprints(e,{art:true,x:900,y:523.84,scale:.68,angle:0,frame:4}));
});
