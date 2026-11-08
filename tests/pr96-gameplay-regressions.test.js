import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VOLCANO_ZONES} from '../src/volcano-platforms.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {BOGDAN_HP} from '../src/volcano-bogdan.js';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Act II Captain is nonblocking; deck and wheelhouse collision remain',()=>{
 const s=source('../src/airship-scene.js');
 assert.doesNotMatch(s,/point=resolveCaptainFeet\\(/);
 assert.match(s,/stepDeckPosition\\(/);
 assert.match(s,/stepAroundWheelhouse\\(/);
});
test('Act III dialogue waits for player travel and has no tiny Lawostworki NPC actors',()=>{
 const s=source('../src/volcano-scene.js');
 assert.match(s,/lawosTravel>=125/);
 assert.doesNotMatch(s,/this\\.npcs\\.place\\(/);
 assert.match(s,/this\\.fairyComplete/);
});
test('exactly two entrance enemies and correct story assignment',()=>{
 const first=VOLCANO_ZONES.find(z=>z.id==='entrance');
 assert.deepEqual(first.enemies,['lawostworek-1','lawostworek-2']);
 const dialogue=DIALOGUES['act3-lawostworki'];
 assert.ok(dialogue.filter(x=>x[1]==='KRZYŚ').every(x=>x[0]==='lawostworek-2'));
 assert.ok(dialogue.filter(x=>x[1]==='ANDRZEJEK').every(x=>x[0]==='lawostworek-1'));
});
test('Act III finale reuses existing Captain and has Bogdan damage UI cleanup',()=>{
 const scene=source('../src/volcano-scene.js'),boss=source('../src/volcano-bogdan.js');
 assert.match(scene,/this\\.captainArrival\\.actor/);
 assert.match(scene,/this\\.extractionActor!==this\\.captainArrival\\.actor/);
 assert.match(boss,/bossHealth\\.clear\\(\\)\\.setVisible\\(false\\)/);
 assert.match(boss,/bossHealth\\.destroy\\(\\)/);
 assert.equal(BOGDAN_HP,80);
});
