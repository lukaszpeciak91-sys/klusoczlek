import test from 'node:test';
import assert from 'node:assert/strict';
import { FACINGS,facingOf,resolvePose,playerFrame } from '../src/combat-contract.js';
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
test('8 direction single-pose frame mapping and manifest',()=>{
 assert.ok(validateAssetManifest());
 for(let i=0;i<8;i++)assert.equal(playerFrame(FACINGS[i]),i);
 assert.throws(()=>playerFrame('unknown'),RangeError);
 const chars=assetManifest.filter(a=>['player','bobrozombi','zubrokryptyda','enemy_fast'].includes(a.id));
 for(const asset of chars){assert.equal(asset.columns,8);assert.equal(asset.rows,1);assert.equal(asset.width,asset.frameWidth*8);assert.equal(asset.height,asset.frameHeight);}
 assert.equal(chars[0].width,512);assert.equal(chars[0].height,64);
 const bobrozombi=chars.find(a=>a.id==='bobrozombi');
 assert.equal(bobrozombi.path,'enemies/bobrozombi.png');
 assert.equal(bobrozombi.width,768);assert.equal(bobrozombi.height,96);
 assert.equal(bobrozombi.frameWidth,96);assert.equal(bobrozombi.frameHeight,96);
 for(const id of ['zubrokryptyda','enemy_fast']){
  const enemy=chars.find(a=>a.id===id);
  assert.equal(enemy.width,384);assert.equal(enemy.height,48);
  assert.equal(enemy.frameWidth,48);assert.equal(enemy.frameHeight,48);
 }
 for(const w of assetManifest.filter(a=>a.id.startsWith('weapon_'))){assert.equal(w.columns,3);assert.equal(w.rows,1);}
 assert.equal(assetManifest.find(a=>a.id==='dialogue_aloes').approval,'approved_identity');
 assert.ok(!validateAssetManifest([...assetManifest,assetManifest[0]]));
});
