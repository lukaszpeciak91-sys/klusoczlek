import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue,currentDialogue} from '../src/dialogue-data.js';
import {validDialoguePng} from '../src/dialogue-ui.js';
import {WAVES,TOTAL_ENEMIES,WAVE_TIMING,HEALTH_AFTER_WAVES} from '../src/episode.js';
test('four original and one first-hit boundary dialogues and approved speaker sequence',()=>{
 assert.deepEqual(Object.keys(DIALOGUES),['before-wave-1','before-first-bocianolak','before-first-zubrokryptyda','after-final-enemy','before-marcin','after-first-bocianolak-hit']);
 assert.deepEqual(Object.values(DIALOGUES).map(lines=>lines.length),[3,3,2,3,2,1]);
 const state=createDialogueState();
 for(const [id,lines] of Object.entries(DIALOGUES)){
  assert.equal(beginDialogue(state,id),true);
  assert.equal(beginDialogue(state,id),false);
  for(let i=0;i<lines.length;i++){
   assert.deepEqual(currentDialogue(state),lines[i]);
   assert.equal(advanceDialogue(state),i===lines.length-1?id:'next');
  }
  assert.equal(currentDialogue(state),null);
 }
 assert.equal(advanceDialogue(state),null);
});
test('restart starts with no active narrative and fixed six-wave contract',()=>{
 const state=createDialogueState();beginDialogue(state,'before-wave-1');
 assert.deepEqual(createDialogueState(),{id:null,index:0});
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[4,5,6,7,8,9]);
 assert.equal(WAVES.length,6);assert.equal(TOTAL_ENEMIES,153);
 assert.equal(WAVE_TIMING[1].startMs,35000);assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
});

test('portrait contract allows 192px 8-bit RGB or RGBA but rejects wrong dimensions',()=>{
 const header=kind=>{
  const h=new Uint8Array(26);
  h.set([137,80,78,71,13,10,26,10]);
  h.set([0,0,0,192],16);h.set([0,0,0,192],20);
  h[24]=8;h[25]=kind;return h;
 };
 assert.equal(validDialoguePng(header(2)),true);
 assert.equal(validDialoguePng(header(6)),true);
 assert.equal(validDialoguePng(header(0)),false);
 const invalid=header(6);invalid[23]=191;
 assert.equal(validDialoguePng(invalid),false);
});

test('PR48 approved epilogue and literal stage directions remain exact',()=>{
 assert.deepEqual(DIALOGUES['after-final-enemy'],[
  ['marcin','MARCIN','A więc dokonało się… Przepowiednia się spełniła… Wszystkich nas wykończy przeklęty Kłusoczłek!'],
  ['zubrokryptyda','ŻUBROKRYPTYDA','Nigdy nie zapomnę naszych wspólnych wakacji, Marcin…'],
  ['aloes','ALOES','*chlip* Żegnajcie… przyjaciele…']
 ]);
 assert.deepEqual(DIALOGUES['before-first-bocianolak'][0],['bobrozombi','BOBROZOMBI','Auaaaa! Jako zombie miałem nie czuć bólu… Bleee… *zdechł*']);
 assert.deepEqual(DIALOGUES['before-marcin'],[
  ['bobrozombi','BOBROZOMBI','Taki jesteś?! Czekaj aż zawołam Marcina'],
  ['bobrozombi','BOBROZOMBI','Marcin! Maaaarciiin!']
 ]);
});
