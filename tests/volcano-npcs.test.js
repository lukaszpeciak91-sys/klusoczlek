import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue} from '../src/dialogue-data.js';
import {FAIRY_MARK,FAIRY_TRIGGER_RADIUS,FAIRY_DEPARTURE_MS,fairyTrigger} from '../src/volcano-npcs.js';
import {VOLCANO_START} from '../src/volcano-contract.js';

test('Act III tenants dialogue has the approved exact sequence',()=>{
 assert.deepEqual(DIALOGUES['act3-lawostworki'],[
  ['lawostworek-1','LAWOSTWOREK 1','Ja już mam dosyć tych dzikich lokatorów! Wchodzą bez pytania, rozbijają się po całym wulkanie!'],
  ['lawostworek-2','LAWOSTWOREK 2','A widziałeś ceny najmu? Za dwa pokoje przy kraterze chcą trzy tysiące! Bez czynszu!'],
  ['lawostworek-1','LAWOSTWOREK 1','Ale oni nawet nie płacą!'],
  ['lawostworek-2','LAWOSTWOREK 2','To akurat rozumiem.'],
  ['lawostworek-1','LAWOSTWOREK 1','Czekaj... A ten tam to kto?!'],
  ['lawostworek-2','LAWOSTWOREK 2','NASTĘPNY?!'],
  ['aloes','ALOES','Ja tylko przechodzę!'],
  ['lawostworek-1','LAWOSTWOREK 1','BEZ KAUCJI NIE WEJDZIESZ!']
 ]);
});
test('fairy has exactly three approved panels, distinct from Marlena',()=>{
 assert.deepEqual(DIALOGUES['act3-swinia-wrozka'],[
  ['aloes','ALOES','Co tu robisz, świnio?'],
  ['swinia-wrozka','ŚWINIA-WRÓŻKA','Nie jestem żadną świnią, tylko magiczną wróżką!'],
  ['swinia-wrozka','ŚWINIA-WRÓŻKA','To, że się człowiek roztył, to jeszcze nie powód, żeby go wyzywać!']
 ]);
});
test('dialogue state prevents concurrent encounters and completes once',()=>{
 const state=createDialogueState();
 assert.equal(beginDialogue(state,'act3-opening'),true);
 assert.equal(beginDialogue(state,'act3-lawostworki'),false);
 for(let i=0;i<DIALOGUES['act3-opening'].length-1;i++)assert.equal(advanceDialogue(state),'next');
 assert.equal(advanceDialogue(state),'act3-opening');
 assert.equal(beginDialogue(state,'act3-lawostworki'),true);
 assert.equal(beginDialogue(state,'act3-swinia-wrozka'),false);
 for(let i=0;i<DIALOGUES['act3-lawostworki'].length-1;i++)assert.equal(advanceDialogue(state),'next');
 assert.equal(advanceDialogue(state),'act3-lawostworki');
 assert.equal(beginDialogue(state,'act3-swinia-wrozka'),true);
 for(let i=0;i<2;i++)assert.equal(advanceDialogue(state),'next');
 assert.equal(advanceDialogue(state),'act3-swinia-wrozka');
});
test('fairy stays on approved upper-left island, not at Act III entrance',()=>{
 assert.deepEqual(FAIRY_MARK,{x:333,y:240});
 assert.equal(FAIRY_DEPARTURE_MS,1300);
 assert.equal(fairyTrigger(VOLCANO_START),false);
 assert.equal(fairyTrigger({x:FAIRY_MARK.x+FAIRY_TRIGGER_RADIUS-1,y:FAIRY_MARK.y}),true);
 assert.equal(fairyTrigger({x:FAIRY_MARK.x+FAIRY_TRIGGER_RADIUS+1,y:FAIRY_MARK.y}),false);
});
