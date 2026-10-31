import test from 'node:test';
import assert from 'node:assert/strict';
import * as barks from '../src/ambient-barks.js';
const pool=['Na niego!','Bić! Zabić!','Aaaaaaaa','Umrzyj!','Cośmy Ci zrobili?!','Atak!','Kruca dosyć tego!'];
test('PR46 approved pool and bounded global timing/no immediate repeats',()=>{
 assert.deepEqual(barks.BARK_PHRASES,pool);
 for(const value of [0,.5,1,NaN]){
  const rng=()=>value,s=barks.createBarkSchedule(rng);assert.ok(s.remaining>=12000&&s.remaining<=20000);
  const speaker={id:1};const first=barks.advanceBarks(s,s.remaining,true,()=>[speaker],rng);assert.equal(first.speaker,speaker);assert.ok(first.life>=1800&&first.life<=2300);assert.ok(s.remaining>=15000&&s.remaining<=25000);
  const second=barks.advanceBarks(s,s.remaining,true,()=>[speaker],rng);assert.notEqual(second.phrase,first.phrase);assert.equal(s.active,second);
 }
});
test('PR46 one opportunity/no backlog, pause preserves delay/history, no speaker skips',()=>{
 const rng=()=>0,s=barks.createBarkSchedule(rng),e={id:1};
 barks.advanceBarks(s,1000,true,()=>[],rng);const before=s.remaining;
 barks.advanceBarks(s,999999,false,()=>[e],rng);assert.equal(s.remaining,before);assert.equal(s.active,null);
 assert.equal(barks.advanceBarks(s,before,true,()=>[],rng),null);assert.equal(s.remaining,15000);
 const first=barks.advanceBarks(s,999999,true,()=>[e],rng);assert.ok(first);assert.equal(s.remaining,15000);
 assert.equal(barks.advanceBarks(s,0,true,()=>[e],rng),null);assert.equal(s.active,first);
 barks.advanceBarks(s,1,false,()=>[e],rng);assert.equal(s.active,null);assert.equal(s.lastPhrase,0);
 assert.equal(barks.createBarkSchedule(rng).lastPhrase,-1);
});
test('PR46 all phrases available and speaker selection bounded',()=>{
 const seen=new Set();for(let i=0;i<7;i++){
  const values=[0,0,0,(i+.1)/7,0],rng=()=>values.shift()??0,s=barks.createBarkSchedule(rng);
  seen.add(barks.advanceBarks(s,20000,true,()=>[{id:1}],rng).phrase);
 }assert.deepEqual([...seen],pool);
 const speakers=[{id:1},{id:2},{id:3}];
 for(const [value,index] of [[0,0],[.49,1],[1,2]]){
  const rng=()=>value,s=barks.createBarkSchedule(rng);
  assert.equal(barks.advanceBarks(s,20000,true,()=>speakers,rng).speaker,speakers[index]);
 }
});
test('PR46 visible ordinary living speakers only; safe layout avoids HUD/sticks',()=>{
 const view={x:800,y:500,width:800,height:360};const anchor={x:1100,y:700,left:1080,top:700,right:1120,bottom:780};
 const e={type:'bobrozombi',hp:3,dead:false};assert.ok(barks.eligibleBarkSpeaker(e,anchor,view));
 for(const changed of [{type:'marcin'},{hp:0},{dead:true},{dying:true},{spawning:true},{landing:true}])assert.equal(barks.eligibleBarkSpeaker({...e,...changed},anchor,view),false);
 assert.equal(barks.eligibleBarkSpeaker(e,null,view),false);assert.equal(barks.eligibleBarkSpeaker(e,{...anchor,left:2000,right:2100},view),false);
 const hud={panelY:10,panelHeight:106,joystickX:60,joystickY:300,aimX:740,aimY:300,joystickRadius:46};
 assert.ok(barks.bubblePlacement({x:400,y:220},150,30,800,360,hud));
 assert.equal(barks.bubblePlacement({x:400,y:110},150,30,800,360,hud),null);
 assert.equal(barks.bubblePlacement({x:60,y:300},150,30,800,360,hud),null);
 assert.equal(barks.bubblePlacement({x:195,y:286},150,30,800,360,hud),null,'Extended joystick capture area must stay clear');
 assert.equal(barks.bubblePlacement({x:400,y:220},900,30,800,360,hud),null);
});
