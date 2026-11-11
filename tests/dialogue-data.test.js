import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue,currentDialogue} from '../src/dialogue-data.js';
import {validDialoguePng} from '../src/dialogue-ui.js';
import {WAVES,WAVE_TIMING,HEALTH_AFTER_WAVES} from '../src/episode.js';
test('four original and one first-hit boundary dialogues and approved speaker sequence',()=>{
 assert.deepEqual(Object.keys(DIALOGUES).filter(id=>!id.startsWith('act4-')&&!id.startsWith('act5-')&&!id.startsWith('act3-lawostworki')&&!id.startsWith('act3-swinia-wrozka')&&!id.startsWith('act3-apartment-argument')&&!id.startsWith('act3-bogdan-confrontation')&&!id.startsWith('act3-bogdan-final')&&!id.startsWith('act3-eruption-warning')&&!id.startsWith('act3-captain-extraction')),['act3-opening','before-wave-1','before-first-bocianolak','before-first-zubrokryptyda','after-final-enemy','act1-marcin-last','act1-witness-last','act1-aloes-last','act1-captain','act2-opening','act2-finale','before-marcin','after-first-bocianolak-hit']);
 assert.deepEqual(Object.entries(DIALOGUES).filter(([id])=>!id.startsWith('act4-')&&!id.startsWith('act5-')&&!['act3-lawostworki','act3-swinia-wrozka','act3-apartment-argument','act3-bogdan-confrontation','act3-bogdan-final','act3-eruption-warning','act3-captain-extraction'].includes(id)).map(([,lines])=>lines.length),[4,3,3,2,3,1,1,1,6,23,2,2,1]);
 assert.deepEqual([...DIALOGUES['act1-marcin-last'],...DIALOGUES['act1-witness-last'],...DIALOGUES['act1-aloes-last']],DIALOGUES['after-final-enemy'],'PR54 finale splits existing verbatim lines only');
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
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[6,7,8,9,9,10]);
 assert.equal(WAVES.length,6);assert.equal(WAVES.length,6);
 assert.equal(WAVE_TIMING[1].startMs,35000);assert.deepEqual(HEALTH_AFTER_WAVES,[1,2,3,4,5]);
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

test('PR66 captain finale and uncertain Bobrozombi wording are exact',()=>{
 assert.equal(DIALOGUES['before-wave-1'][1][2],'Matko Boska! To z pewnością Kłusoczłek! Szybko, bracia, do ataku!');
 assert.deepEqual(DIALOGUES['act2-finale'],[
  ['captain','KAPITAN','Uff udało się nam...'],
  ['captain','KAPITAN','A teraz nie ma co mitrężyć! Kurs na Wulkan Bogdana!']
 ]);
});

test('PR72 Bober Wojtek speaks only after the original Captain command',()=>{
 const lines=DIALOGUES['act2-opening'];
 assert.equal(lines.length,23);
 assert.deepEqual(lines.slice(-3),[
  ['captain','KAPITAN','NIE MA CZASU NA WYJAŚNIENIA! BROŃ PAROSTATKU!'],
  ['bobrozombi','BOBROZOMBI','Haha! Tego się nie spodziewaliście!'],
  ['bobrozombi','BOBROZOMBI','Bober Wojtek — As przestworzy! ATAAAAK!']
 ]);
});

test('Act II Captain names the same school without repeated nearby wording',()=>{
 const lines=DIALOGUES['act2-opening'];
 const originalSpeaker=lines.filter(p=>p[2].includes('Bocianołak Bogdan mieszka'));
 assert.equal(lines.length,23,'unchanged Act II panel count');
 assert.deepEqual(originalSpeaker,[['captain','KAPITAN',
  'Bocianołak Bogdan mieszka w pobliskim wulkanie, a Żubrokryptyda Błażej uczy się w tamtejszej szkole zawodowej!']]);
 const state=createDialogueState();
 assert.equal(beginDialogue(state,'act2-opening'),true);
 for(let i=0;i<lines.length;i++){
  assert.deepEqual(currentDialogue(state),lines[i]);
  assert.equal(advanceDialogue(state),i===lines.length-1?'act2-opening':'next');
 }
});
