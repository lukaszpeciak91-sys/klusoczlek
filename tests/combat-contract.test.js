import test from 'node:test';
import assert from 'node:assert/strict';
import { FACINGS,STATES,facingOf,resolvePose,playerFrame } from '../src/combat-contract.js';
import {assetManifest,validateAssetManifest} from '../src/asset-manifest.js';
test('octants map consistently, including boundaries',()=>{
  for(let i=0;i<8;i++){
    const theta=i*Math.PI/4;
    assert.equal(facingOf(Math.cos(theta),Math.sin(theta)),FACINGS[i]);
  }
  assert.equal(facingOf(0,0,'nw'),'nw');
});
test('movement and aim remain independent, analog aim remains 360 degrees',()=>{
 const pose=resolvePose({movement:{x:0,y:-1},aim:{x:1,y:0.2},aimActive:true,lastFacing:'w'});
 assert.equal(pose.facing,'e');assert.equal(pose.animation,'fire_e');
 assert.deepEqual(pose.movement,{x:0,y:-1});
 assert.ok(pose.aim.y>0&&pose.aim.y<0.3);
 assert.equal(resolvePose({movement:{x:-1,y:0},aim:{x:1,y:1},aimActive:false}).facing,'w');
 assert.equal(resolvePose({lastFacing:'nw'}).facing,'nw');
 assert.equal(resolvePose({aimActive:true,aim:{x:0,y:0},lastFacing:'ne'}).shooting,false);
});
test('manifest is unique, dimensionally sound and references every frame',()=>{
 assert.ok(validateAssetManifest());
 const sheet=assetManifest.find(a=>a.id==='player');
 for(const state of STATES) for(const facing of FACINGS) for(let frame=0;frame<4;frame++){
   const index=playerFrame(state,facing,frame);
   assert.ok(index>=0&&index<sheet.columns*sheet.rows);
 }
 assert.equal(playerFrame('idle','e',0),0);
 assert.equal(playerFrame('walk','e',0),32);
 assert.equal(playerFrame('fire','ne',3),95);
 assert.throws(()=>playerFrame('walk','s',4),RangeError);
 assert.ok(!validateAssetManifest([...assetManifest,assetManifest[0]]));
});

test('exact character grid and weapon grid are distinct',()=>{
 for(const a of assetManifest.filter(x=>x.id==='player'||x.id==='bobrozombi'||x.id==='zubrokryptyda'||x.id==='enemy_fast')){assert.equal(a.columns,4);assert.equal(a.rows,24);assert.equal(a.width,a.frameWidth*4);assert.equal(a.height,a.frameHeight*24);}
 for(const a of assetManifest.filter(x=>x.id.startsWith('weapon_'))){assert.equal(a.columns,3);assert.equal(a.rows,1);assert.equal(a.width,96);assert.equal(a.height,32);}
 assert.equal(assetManifest.find(x=>x.id==='dialogue_aloes').approval,'approved_identity');
 for(const id of ['dialogue_player','dialogue_narrator'])assert.equal(assetManifest.find(x=>x.id===id).approval,'provisional_identity');
});
