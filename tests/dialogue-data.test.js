import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue,currentDialogue} from '../src/dialogue-data.js';
import {WAVES,TOTAL_ENEMIES,INTERMISSION_MS,HEALTH_AFTER_WAVES} from '../src/episode.js';
test('four exact one-shot boundary dialogues and approved speaker sequence',()=>{
 assert.deepEqual(Object.keys(DIALOGUES),['before-wave-1','before-first-bocianolak','before-first-zubrokryptyda','after-final-enemy']);
 assert.deepEqual(Object.values(DIALOGUES).map(lines=>lines.length),[3,3,2,3]);
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
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[3,3,4,4,4,5]);
 assert.equal(WAVES.length,6);assert.equal(TOTAL_ENEMIES,66);
 assert.equal(INTERMISSION_MS,3000);assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
});
