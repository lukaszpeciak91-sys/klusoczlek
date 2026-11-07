import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue} from '../src/dialogue-data.js';
import {APARTMENT,MARLENA_BARKS,BOGDAN_HP,apartmentReached,bossPhase,bossAttackFor,bossFan,bossBeamPoint,BOSS_TELEGRAPH_MS,BOSS_BEAM_MS} from '../src/volcano-bogdan.js';

test('approved apartment dialogue exactly five panels',()=>{
 assert.deepEqual(DIALOGUES['act3-apartment-argument'],[
 ['marlena','MARLENA','Bogdan! Wszystkie normalne Bocianołaki mieszkają w lesie! Albo chociaż w chlewie! A ty musiałeś przyżydzić i zamieszkać w wulkanie!'],
 ['bogdan','BOGDAN','Marlena, ale zobacz, jaka okolica! Szkoła blisko, przychodnia blisko...'],
 ['marlena','MARLENA','Śmierdzi siarką, lawa płynie pod oknami, a te lawostworki wyją po nocach!'],
 ['bogdan','BOGDAN','NO NIE ZNIOSĘ JUŻ TEGO ZRZĘDZENIA! SAMA CHCIAŁAŚ MIESZKAĆ W CENTRUM!'],
 ['marlena','MARLENA','ALE NIE WULKANU! WRACAM DO MAMY!']
 ]);
});
test('approved Bogdan confrontation exactly five panels',()=>{
 assert.deepEqual(DIALOGUES['act3-bogdan-confrontation'],[
 ['aloes','ALOES','Przepraszam, szukam rogu myśliwskiego. Podobno pan taki posiada.'],
 ['bogdan','BOGDAN','Rogu?! Aaa, tego lejka do lewatywy?'],
 ['aloes','ALOES','Do... czego?!'],
 ['bogdan','BOGDAN','Słuchaj no! Mam dzisiaj wyjątkowo parszywy dzień! A ty w ogóle co robisz w moim domu?!'],
 ['bogdan','BOGDAN','ZARAZ CI ZROBIĘ ZA POMOCĄ TEGO LEJKA LEWATYWĘ Z LAWY!']
 ]);
 assert.deepEqual(MARLENA_BARKS,['Mama miała rację!','Niech sam w tym smrodzie siedzi, pajac!']);
});
test('dialogue state prevents overlapping apartment and boss encounters',()=>{
 const state=createDialogueState();
 assert.equal(beginDialogue(state,'act3-apartment-argument'),true);
 assert.equal(beginDialogue(state,'act3-bogdan-confrontation'),false);
 for(let i=0;i<4;i++)assert.equal(advanceDialogue(state),'next');
 assert.equal(advanceDialogue(state),'act3-apartment-argument');
 assert.equal(beginDialogue(state,'act3-bogdan-confrontation'),true);
 for(let i=0;i<4;i++)assert.equal(advanceDialogue(state),'next');
 assert.equal(advanceDialogue(state),'act3-bogdan-confrontation');
});
test('apartment trigger is bounded and independent of fairy zone',()=>{
 assert.equal(apartmentReached(APARTMENT.trigger),true);
 assert.equal(apartmentReached({x:333,y:240}),false);
});
test('boss attack scheduler deterministic and 40 percent phase boundary',()=>{
 assert.equal(bossPhase(33),1);
 assert.equal(bossPhase(32),2);
 assert.equal(bossPhase(0),2);
 assert.deepEqual(Array.from({length:6},(_,i)=>bossAttackFor(i,1)),['beam','spread','charge','beam','spread','charge']);
 assert.deepEqual(Array.from({length:4},(_,i)=>bossAttackFor(i,2)),['beam','spread','charge','charge']);
 assert.equal(BOGDAN_HP,80);
 assert.equal(BOSS_TELEGRAPH_MS.beam,900);
 assert.equal(BOSS_BEAM_MS,700);
});
test('projectile fan creates visible dodge gaps in both phases',()=>{
 const a=bossFan({x:10,y:20},0,1),b=bossFan({x:10,y:20},0,2);
 assert.equal(a.length,5);assert.equal(b.length,7);
 assert.ok(a[0].vy<0&&a.at(-1).vy>0);
 assert.ok(b[0].vy<a[0].vy);
});
test('beam stops at blocked terrain',()=>{
 const width=200,height=200,pixels=new Uint8Array(width*height);
 for(let y=30;y<170;y++)for(let x=30;x<110;x++)pixels[y*width+x]=1;
 const p=bossBeamPoint({x:50,y:90},0,130,{width,height,pixels});
 assert.ok(p.x>50&&p.x<110);
});
