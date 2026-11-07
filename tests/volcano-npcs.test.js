import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue} from '../src/dialogue-data.js';
import {FAIRY_MARK,FAIRY_TRIGGER_RADIUS,FAIRY_DEPARTURE_MS,fairyTrigger,findFairyIslandSpawn,createNpcReadiness} from '../src/volcano-npcs.js';
import {VOLCANO_START} from '../src/volcano-contract.js';

test('Act III tenants dialogue has the approved exact sequence',()=>{
 assert.deepEqual(DIALOGUES['act3-lawostworki'],[
  ['lawostworek-1','KRZYŚ','Ja już mam dosyć tych dzikich lokatorów! Wchodzą bez pytania, rozbijają się po całym wulkanie!'],
  ['lawostworek-2','ANDRZEJEK','A widziałeś ceny najmu? Za dwa pokoje przy kraterze chcą trzy tysiące! Bez czynszu!'],
  ['lawostworek-1','KRZYŚ','Ale oni nawet nie płacą!'],
  ['lawostworek-2','ANDRZEJEK','To akurat rozumiem.'],
  ['lawostworek-1','KRZYŚ','Czekaj... A ten tam to kto?!'],
  ['lawostworek-2','ANDRZEJEK','NASTĘPNY?!'],
  ['aloes','ALOES','Ja tylko przechodzę!'],
  ['lawostworek-1','KRZYŚ','BEZ KAUCJI NIE WEJDZIESZ!']
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

function islandMask(width=600,height=500){
 const pixels=new Uint8Array(width*height);
 const fill=(x0,y0,x1,y1)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)pixels[y*width+x]=1;};
 fill(250,170,420,350);fill(440,170,570,350);
 return {width,height,pixels,fill};
}
test('first movement before readiness is retained and consumed exactly once',()=>{
 const state=createNpcReadiness();
 assert.equal(state.requestMovement(),null);
 assert.equal(state.movement,true);
 assert.equal(state.resolve(true),'ready');
 assert.equal(state.started,true);
 assert.equal(state.requestMovement(),null);
 assert.equal(state.resolve(true),null);
});
test('sprites ready before first movement still wait for movement',()=>{
 const state=createNpcReadiness();
 assert.equal(state.resolve(true),null);
 assert.equal(state.requestMovement(),'ready');
 assert.equal(state.requestMovement(),null);
});
test('failed PNG resolves pending trigger without permanent lock',()=>{
 const state=createNpcReadiness();
 assert.equal(state.requestMovement(),null);
 assert.equal(state.resolve(false),'failed');
 assert.equal(state.started,true);
 assert.equal(state.resolve(true),null);
});
test('fairy uses exact valid mark and nearest valid footprint on same island',()=>{
 const mask=islandMask();
 assert.deepEqual(findFairyIslandSpawn(mask),FAIRY_MARK);
 for(let y=225;y<255;y++)for(let x=320;x<345;x++)mask.pixels[y*mask.width+x]=0;
 const fallback=findFairyIslandSpawn(mask);
 assert.ok(fallback);
 assert.ok(fallback.x>=250&&fallback.x<420);
 assert.ok(fallback.y>=170&&fallback.y<350);
 assert.ok(Math.hypot(fallback.x-333,fallback.y-240)<90);
});
test('fairy cannot jump to a separate island or lava',()=>{
 const mask=islandMask();
 for(let y=170;y<350;y++)for(let x=250;x<420;x++)mask.pixels[y*mask.width+x]=0;
 assert.equal(findFairyIslandSpawn(mask),null);
});
