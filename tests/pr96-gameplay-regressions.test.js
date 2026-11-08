import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VOLCANO_ZONES} from '../src/volcano-platforms.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {BOGDAN_HP} from '../src/volcano-bogdan.js';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Act II Captain is nonblocking; deck and wheelhouse collision remain',()=>{
 const s=source('../src/airship-scene.js');
 assert.equal(s.includes('point=resolveCaptainFeet('),false);
 assert.ok(s.includes('stepDeckPosition('));
 assert.ok(s.includes('stepAroundWheelhouse('));
});
test('Act III dialogue waits for player travel and has no tiny Lawostworki NPC actors',()=>{
 const s=source('../src/volcano-scene.js');
 assert.ok(s.includes('this.lawosTrigger.radius'));
 assert.equal(s.includes('this.npcs.place('),false);
 assert.ok(s.includes('this.fairyComplete'));
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
 assert.ok(scene.includes('this.captainArrival.actor'));
 assert.ok(scene.includes('this.extractionActor=existing'));
 assert.equal(scene.includes('this.add.sprite(point.x,point.y,key,2)'),false);
 assert.ok(boss.includes('bossHealth.clear().setVisible(false)'));
 assert.ok(boss.includes('bossHealth.destroy()'));
 assert.equal(BOGDAN_HP,80);
});
