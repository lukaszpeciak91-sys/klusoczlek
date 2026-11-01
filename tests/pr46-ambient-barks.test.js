import test from 'node:test';
import assert from 'node:assert/strict';
import * as barks from '../src/ambient-barks.js';
const pool=['Na niego!','Bić! Zabić!','Aaaaaaaa','Umrzyj!','Cośmy Ci zrobili?!','Atak!','Kruca dosyć tego!'];
test('PR46/53 all seven approved phrases and bounded irregular scheduling',()=>{
 assert.deepEqual(barks.BARK_PHRASES,pool);
 for(const value of [0,.5,1,NaN]){
  const rng=()=>value,s=barks.createBarkSchedule(rng);
  assert.ok(s.remaining>=3000&&s.remaining<=5000);
  const speaker={id:1,hp:3,dead:false};
  const first=barks.advanceBarks(s,s.remaining,true,()=>[speaker],rng);
  assert.equal(first.speaker,speaker);assert.ok(first.life>=1200&&first.life<=2100);
  assert.ok(s.remaining>=3000&&s.remaining<=6000);
  s.remaining=0;
  const second=barks.advanceBarks(s,10,true,()=>[speaker],rng);
  assert.equal(second,null,'One enemy cannot occupy both slots');
  assert.equal(s.active.length,1);
  assert.equal(s.lastPhrase,first.phrase);
 }
});
test('PR46/53 no opportunity backlog, pause clears visible slots while preserving remaining delay',()=>{
 const rng=()=>0,s=barks.createBarkSchedule(rng),e={id:1,hp:3,dead:false};
 barks.advanceBarks(s,1000,true,()=>[],rng);const before=s.remaining;
 barks.advanceBarks(s,999999,false,()=>[e],rng);
 assert.equal(s.remaining,before);assert.equal(s.active.length,0);
 assert.equal(barks.advanceBarks(s,before,true,()=>[],rng),null);
 assert.ok(s.remaining>=3000&&s.remaining<=6000);
 const first=barks.advanceBarks(s,999999,true,()=>[e],rng);
 assert.ok(first);assert.equal(s.active.length,1);
 barks.advanceBarks(s,1,false,()=>[e],rng);
 assert.equal(s.active.length,0);
 assert.equal(s.lastPhrase,first.phrase);
 assert.equal(barks.createBarkSchedule(rng).lastPhrase,null);
});
test('PR46/53 all original lines remain in the spontaneous choice pool',()=>{
 const seen=new Set();
 for(let i=0;i<11;i++){
  const s=barks.createBarkSchedule(()=>0);
  let calls=0;
  const rng=()=>{calls++;return calls===2?(i+.01)/11:0;};
  const event=barks.advanceBarks(s,s.remaining,true,()=>[{id:1,hp:3,dead:false}],rng);
  seen.add(event.phrase);
 }
 for(const phrase of pool)assert.ok([...barks.BARK_PHRASES].includes(phrase),'Original phrase removed: '+phrase);
 assert.ok(seen.size>=2,'Random spontaneous phrase selection is inert');
 const speakers=[{id:1,hp:3},{id:2,hp:3},{id:3,hp:3}];
 for(const [value,index] of [[0,0],[.49,1],[1,2]]){
  const rng=()=>value,s=barks.createBarkSchedule(rng);
  assert.equal(barks.advanceBarks(s,s.remaining,true,()=>speakers,rng).speaker,speakers[index]);
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
