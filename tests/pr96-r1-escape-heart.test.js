import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {healOneHp,canCollectBogdanHeart} from '../src/volcano-heart.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Bogdan heart restores exactly one HP, clamped to maximum',()=>{
 assert.equal(healOneHp(2,5),3);
 assert.equal(healOneHp(4,5),5);
 assert.equal(healOneHp(5,5),5);
});
test('heart can only be collected once and only near death position',()=>{
 const point={x:400,y:300};
 assert.equal(canCollectBogdanHeart({x:400,y:300},point,false),true);
 assert.equal(canCollectBogdanHeart({x:400,y:300},point,true),false);
 assert.equal(canCollectBogdanHeart({x:900,y:300},point,false),false);
});
test('heart survives explosion and escape retry and updates HP face and text',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('this.spawnBogdanHeart();'));
 assert.ok(s.includes('this.collectBogdanHeart();'));
 assert.ok(s.includes('this.hpFace.setHp(this.run.hp)'));
 assert.ok(s.includes('this.bogdanHeartCollected=true'));
 assert.equal((s.match(/this\.bogdanHeart\?\.destroy\(\)/g)||[]).length,1);
});
test('finale Captain never creates a separate sprite or fallback world actor',()=>{
 const s=read('../src/volcano-scene.js');
 const block=s.slice(s.indexOf('async spawnExtractionCaptain()'),s.indexOf('updateEscape(delta)'));
 assert.ok(block.includes('this.captainArrival.actor'));
 assert.equal(block.includes('this.add.sprite('),false);
 assert.equal(block.includes('this.add.circle('),false);
 assert.ok(block.includes("this.finale.state!=='ESCAPE_ACTIVE'"));
});
test('escape reinforcements count successful spawns and respect population cap',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('this.escapeSuccessfulSpawns++'));
 assert.ok(s.includes('living.length<6'));
 assert.ok(s.includes('this.escapeSuccessfulSpawns<3?2100:4200'));
 assert.ok(s.includes('this.escapeSuccessfulSpawns=0'));
});
test('Bogdan damage numbers use actual applied damage',()=>{
 const s=read('../src/volcano-bogdan.js');
 assert.ok(s.includes('showDamageNumber(applied)'));
 assert.ok(s.includes('Math.min(hp,Math.max(0,amount))'));
});
