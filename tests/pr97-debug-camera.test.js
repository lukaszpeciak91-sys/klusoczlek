import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEBUG_CHECKPOINTS,createDebugFixture} from '../src/debug-checkpoints.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ids=['act3-lawos','act3-fairy','act3-apartment','act3-boss','act3-escape'];
test('five distinct Act III debug checkpoints and valid campaign fixtures',()=>{
 for(const id of ids){
  assert.equal(DEBUG_CHECKPOINTS.filter(c=>c.id===id).length,1);
  const fixture=createDebugFixture(id);
  assert.equal(fixture.checkpoint.scene,'Volcano');
  assert.ok(fixture.run.completedActs.has('act2'));
  assert.equal(fixture.handoff.actId,'act3');
 }
});
test('Act III debug state is initialized after terrain and boss asset readiness',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('return this.initializeDebugCheckpoint(ready)'));
 assert.ok(s.includes('this.debugPreparation=this.boss.prepare().then(async ready=>'));
 assert.ok(s.includes('critical:()=>!!this.walkability&&this.terrainImage.visible'));
 assert.ok(s.includes('nearestVolcanoSpawn(this.walkability,target.x,target.y,PLAYER_RADIUS'));
 assert.ok(s.includes('this.run.hp=this.run.maxHp'));
 assert.ok(s.includes('this.boss.debugBeginBoss()'));
 assert.ok(s.includes('this.boss.debugDefeatBoss()'));
 assert.ok(s.includes('this.bogdanHeartCollected=true'));
 assert.ok(s.includes('this.startEscape()'));
});
test('debug boss methods reuse one boss instance',()=>{
 const s=read('../src/volcano-bogdan.js');
 assert.ok(s.includes('function debugBeginBoss()'));
 assert.ok(s.includes('if(!ready||disposed||active||!bogdan?.active)return false'));
 assert.ok(s.includes('return activate()'));
});
test('apartment camera recovers by Phaser completion and interrupted-pan fallback',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes("camera.once('camerapancomplete',resume)"));
 assert.ok(s.includes('!this.cameras.main.panEffect.isRunning'));
 assert.ok(s.includes('this.cancelApartmentCameraRecovery()'));
 assert.ok(s.includes('camera.startFollow(this.player,true,.12,.12)'));
 assert.equal(s.includes('progress===1'),false);
});
test('normal NOWA GRA route remains first Act',()=>{
 const s=read('../src/scenes.js');
 assert.ok(s.includes("this.scene.start('ActTitle',{actId:FIRST_ACT_ID})"));
});
