import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue} from '../src/dialogue-data.js';
import {FAIRY_MARK,FAIRY_TRIGGER_RADIUS,FAIRY_DEPARTURE_MS,fairyTrigger,findFairyIslandSpawn,findFairyRouteSpawn,FAIRY_ROUTE_MARKS,createNpcReadiness,shouldRevealFairy,fairyTextureLayout} from '../src/volcano-npcs.js';
import {VOLCANO_START} from '../src/volcano-contract.js';

test('Act III tenants dialogue has the approved exact sequence',()=>{
 assert.deepEqual(DIALOGUES['act3-lawostworki'],[
  ['lawostworek-2','KRZYŚ','Ja już mam dosyć tych dzikich lokatorów! Wchodzą bez pytania, rozbijają się po całym wulkanie!'],
  ['lawostworek-1','ANDRZEJEK','A widziałeś ceny najmu? Za dwa pokoje przy kraterze chcą trzy tysiące! Bez czynszu!'],
  ['lawostworek-2','KRZYŚ','Ale oni nawet nie płacą!'],
  ['lawostworek-1','ANDRZEJEK','To akurat rozumiem.'],
  ['lawostworek-2','KRZYŚ','Czekaj... A ten tam to kto?!'],
  ['lawostworek-1','ANDRZEJEK','NASTĘPNY?!'],
  ['aloes','ALOES','Ja tylko przechodzę!'],
  ['lawostworek-2','KRZYŚ','BEZ KAUCJI NIE WEJDZIESZ!']
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
test('fairy now prefers the apartment travel corridor, not the former island',()=>{
 assert.deepEqual(FAIRY_MARK,{x:333,y:240});
 assert.deepEqual(FAIRY_ROUTE_MARKS[0],{x:780,y:820});
 assert.equal(FAIRY_ROUTE_MARKS.length,4);
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
 assert.deepEqual(findFairyIslandSpawn(mask,{x:333,y:240}),{x:333,y:240});
 for(let y=225;y<255;y++)for(let x=320;x<345;x++)mask.pixels[y*mask.width+x]=0;
 const fallback=findFairyIslandSpawn(mask,{x:333,y:240});
 assert.ok(fallback);
 assert.ok(fallback.x>=250&&fallback.x<420);
 assert.ok(fallback.y>=170&&fallback.y<350);
 assert.ok(Math.hypot(fallback.x-333,fallback.y-240)<90);
});
test('fairy cannot jump to a separate island or lava',()=>{
 const mask=islandMask();
 for(let y=170;y<350;y++)for(let x=250;x<420;x++)mask.pixels[y*mask.width+x]=0;
 assert.equal(findFairyIslandSpawn(mask,{x:333,y:240}),null);
});

test('fairy reveal follows completed tenants dialogue without combat-zone clearance',()=>{
 assert.equal(shouldRevealFairy(false,false),false);
 assert.equal(shouldRevealFairy(true,false),true);
 assert.equal(shouldRevealFairy(true,true),false);
 assert.equal(shouldRevealFairy(false,true),false);
});

test('fairy route candidate requires walkable ground and player reachability',()=>{
 const width=1800,height=1200,pixels=new Uint8Array(width*height);
 for(let y=600;y<1050;y++)for(let x=250;x<1200;x++)pixels[y*width+x]=1;
 const mask={width,height,pixels};
 const player={x:300,y:1000};
 const reachable=(m,from,to)=>[to];
 const point=findFairyRouteSpawn(mask,player,reachable);
 assert.deepEqual(point,FAIRY_ROUTE_MARKS[0]);
 assert.equal(findFairyRouteSpawn(mask,player,()=>null),null);
 for(let y=780;y<860;y++)for(let x=740;x<820;x++)pixels[y*width+x]=0;
 const fallback=findFairyRouteSpawn(mask,player,reachable);
 assert.ok(fallback);
 assert.notDeepEqual(fallback,FAIRY_ROUTE_MARKS[0]);
});

test('approved fairy PNG accepts static artwork or eight horizontal frames',()=>{
 assert.deepEqual(fairyTextureLayout(192,192),{frameWidth:192,frameHeight:192,frames:1});
 assert.deepEqual(fairyTextureLayout(1024,128),{frameWidth:128,frameHeight:128,frames:8});
 assert.equal(fairyTextureLayout(800,120),null);
});

test('production fairy sprite path and PNG header match supported layout',()=>{
 const png=readFileSync(new URL('../public/assets/npcs/swinia-wrozka.png',import.meta.url));
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 console.log('APPROVED FAIRY PNG DIMENSIONS',width,height);
 assert.ok(fairyTextureLayout(width,height),'Approved fairy sprite is neither square nor eight horizontal frames');
});
