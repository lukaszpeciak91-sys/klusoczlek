import test from 'node:test';
import assert from 'node:assert/strict';
import * as dialogue from '../src/dialogue-data.js';
const id='after-first-bocianolak-hit';
const session=()=>({firstBocianolakHit:false,narrativeEvents:new Set()});
test('PR43 standard one-line portrait dialogue is registered alongside four original scenes',()=>{
 assert.deepEqual(dialogue.DIALOGUES[id],[['bocianolak','BOCIANOŁAK','Tylko nie po nogach!']]);
 for(const key of ['before-wave-1','before-first-bocianolak','before-first-zubrokryptyda','after-final-enemy'])assert.ok(dialogue.DIALOGUES[key]);
});
test('PR43 accepted first damage queues once per session, not per specimen',()=>{
 const s=session(),a={type:'bocianolak',dead:false},b={...a};
 assert.equal(dialogue.queueBocianolakHitDialogue(s,a,2,2),false);
 assert.equal(dialogue.queueBocianolakHitDialogue(s,{type:'bobrozombi'},3,2),false);
 assert.equal(dialogue.queueBocianolakHitDialogue(s,a,2,1),true);
 assert.equal(s.firstBocianolakHit,true);assert.deepEqual([...s.narrativeEvents],[id]);
 assert.equal(dialogue.queueBocianolakHitDialogue(s,a,1,0),false);
 assert.equal(dialogue.queueBocianolakHitDialogue(s,b,2,1),false);
 s.narrativeEvents.delete(id);
 assert.equal(dialogue.queueBocianolakHitDialogue(s,b,2,0),false,'Consumed session must stay consumed');
 assert.equal(dialogue.queueBocianolakHitDialogue(session(),b,2,0),true,'New game permits fatal first hit');
});
test('PR43 multiple fatal explosion hits collapse into one queued boundary without mutating enemies',()=>{
 const s=session(),enemies=[{type:'bocianolak',hp:0,dead:false},{type:'bocianolak',hp:0,dead:false}];
 const before=structuredClone(enemies);
 assert.deepEqual(enemies.map(e=>dialogue.queueBocianolakHitDialogue(s,e,2,0)),[true,false]);
 assert.equal(s.narrativeEvents.size,1);assert.deepEqual(enemies,before);
 const state=dialogue.createDialogueState();assert.equal(state.id,null);
 assert.equal(dialogue.beginDialogue(state,id),true);assert.equal(dialogue.advanceDialogue(state),id);assert.equal(state.id,null);
});
