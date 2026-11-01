import test from 'node:test';
import assert from 'node:assert/strict';
import {BARK_PHRASES,HIT_BARKS,MAX_BUBBLES,createBarkSchedule,advanceBarks,damageBark,boxesOverlap} from '../src/ambient-barks.js';
const random=()=>0;
const e=type=>({type,hp:3,dead:false});
test('PR53 seven approved lines preserved literally',()=>assert.deepEqual(BARK_PHRASES,['Na niego!','Bić! Zabić!','Aaaaaaaa','Umrzyj!','Cośmy Ci zrobili?!','Atak!','Kruca dosyć tego!']));
test('PR53 spontaneous early without any damage and independent speakers',()=>{
 const a=e('bobrozombi'),b=e('bocianolak'),s=createBarkSchedule(random);
 assert.ok(s.remaining>=3000&&s.remaining<=5000);
 assert.ok(advanceBarks(s,3100,true,()=>[a,b],random));
 assert.ok(advanceBarks(s,3200,true,()=>[a,b],random));
 assert.equal(s.active.length,2);assert.notEqual(s.active[0].speaker,s.active[1].speaker);
 assert.equal(advanceBarks(s,3000,true,()=>[a,b],random),null);assert.ok(s.active.length<=2);
});
test('PR53 damage cooldown, global spacing, priority, and species-specific line',()=>{
 const s=createBarkSchedule(random),a=e('bocianolak'),b=e('bobrozombi');
 const first=damageBark(s,a,10000,random);assert.equal(first.phrase,'NIE PO NOGACH!');
 assert.equal(damageBark(s,a,11000,random),null);
 assert.equal(damageBark(s,b,10200,random),null);
 assert.ok(damageBark(s,b,10800,random));
 assert.equal(s.active.length,2);
});
test('PR53 fatal damage and pause silence',()=>{
 const s=createBarkSchedule(random),a=e('zubrokryptyda');
 a.hp=0;assert.equal(damageBark(s,a,5000,random),null);
 advanceBarks(s,4500,true,()=>[e('bobrozombi')],random);
 advanceBarks(s,500,false,()=>[],random);assert.equal(s.active.length,0);
});
test('PR53 alternate phrases, no geometric overlap',()=>{
 assert.ok(HIT_BARKS.bocianolak.includes('NIE PO NOGACH!'));
 assert.ok(boxesOverlap({x:0,y:0,width:50,height:20},{x:40,y:5,width:50,height:20}));
 assert.equal(boxesOverlap({x:0,y:0,width:50,height:20},{x:150,y:30,width:30,height:20}),false);
 assert.equal(MAX_BUBBLES,2);
});
