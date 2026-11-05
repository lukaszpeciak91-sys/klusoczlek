import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_CAPTAIN_START,AIRSHIP_ALOES_START,CAPTAIN_PATROL_POINTS,CAPTAIN_PANIC_SPEED,CAPTAIN_PANIC_PHRASES,createCaptainPatrol,advanceCaptainPatrol,captainPointSafe,CAPTAIN_FEET_RADIUS,resolveCaptainFeet,createCaptainSpeech,stepCaptainSpeech,eligibleAct2Bark,eligibleAirborneBark,ACT2_BATTLE_CRIES,ACT2_GROUND_CRIES} from '../src/act2-staging.js';
import {BARK_PHRASES,EXTRA_BARKS} from '../src/ambient-barks.js';
import {facingOf,playerFrame} from '../src/combat-contract.js';
import {insideDeck,AIRSHIP_PLAYER_LOWER_MARGIN,WHEELHOUSE_FOOTPRINT,wheelhouseSegmentHit} from '../src/airship-contract.js';

test('PR72 Act II opening stages Aloes and Captain safely face-to-face',()=>{
  assert.ok(captainPointSafe(AIRSHIP_CAPTAIN_START));
  assert.ok(captainPointSafe(AIRSHIP_ALOES_START));
  assert.ok(AIRSHIP_CAPTAIN_START.x>AIRSHIP_ALOES_START.x+90);
  assert.equal(facingOf(AIRSHIP_CAPTAIN_START.x-AIRSHIP_ALOES_START.x,0),'e');
  assert.equal(facingOf(AIRSHIP_ALOES_START.x-AIRSHIP_CAPTAIN_START.x,0),'w');
  assert.equal(playerFrame('e'),0);
  assert.equal(playerFrame('w'),4);
});

test('PR72 Captain patrol stays clear of deck perimeter and wheelhouse for many 180-second frames',()=>{
  for(const p of CAPTAIN_PATROL_POINTS)assert.equal(captainPointSafe(p),true,JSON.stringify(p));
  const state=createCaptainPatrol();
  let p={...AIRSHIP_CAPTAIN_START},moves=0,stops=0,changed=0,previous=state.target;
  for(let i=0;i<3600;i++){
    const enemies=i>450&&i<1200?[{x:320,y:320,hp:3,dead:false}]:[];
    const next=advanceCaptainPatrol(state,p,50,enemies);
    assert.equal(captainPointSafe(next),true,JSON.stringify(next));
    if(next.moving)moves++;else stops++;
    p={x:next.x,y:next.y};
    if(state.target!==previous)changed++;
    previous=state.target;
  }
  assert.ok(moves>500&&stops>100&&changed>5,{moves,stops,changed});
});

test('PR72 bark eligibility rejects dead, inactive and offscreen ground attackers',()=>{
  assert.deepEqual(ACT2_BATTLE_CRIES,['BANZAI!!!','Do abordażu!']);
  const v={x:0,y:0,right:800,bottom:450};
  const living={x:250,y:250,dead:false,hp:3,sprite:{active:true}};
  assert.equal(eligibleAct2Bark(living,v),true);
  assert.equal(eligibleAct2Bark({...living,dead:true},v),false);
  assert.equal(eligibleAct2Bark({...living,hp:0},v),false);
  assert.equal(eligibleAct2Bark({...living,sprite:{active:false}},v),false);
  assert.equal(eligibleAct2Bark({...living,x:20},v),false);
});

test('PR74 airborne-only cries extend—not replace—the original Act II ground vocabulary',()=>{
 assert.deepEqual(ACT2_BATTLE_CRIES,['BANZAI!!!','Do abordażu!']);
 assert.deepEqual(ACT2_GROUND_CRIES,[...BARK_PHRASES,...EXTRA_BARKS]);
 for(const phrase of ACT2_BATTLE_CRIES)assert.equal(ACT2_GROUND_CRIES.includes(phrase),false);
 const view={x:0,y:0,right:960,bottom:540};
 const flight={x:320,y:200,phase:'approaching',released:false,blocked:false,
  passenger:{active:true},visual:{active:true}};
 assert.equal(eligibleAirborneBark(flight,view),true);
 for(const overrides of [{phase:'dropping'},{phase:'departing'},{released:true},{passenger:null},{x:-20}]){
  assert.equal(eligibleAirborneBark({...flight,...overrides},view),false,JSON.stringify(overrides));
 }
});

test('PR76 seeded panic varies destinations, flees monsters and never exits PR75 safe deck',()=>{
 assert.equal(CAPTAIN_PANIC_SPEED,116);
 const a=createCaptainPatrol(12345),b=createCaptainPatrol(12345);
 let left={...AIRSHIP_CAPTAIN_START},right={...AIRSHIP_CAPTAIN_START};
 let moving=0,stopping=0,headingChanges=0,lastFacing=null,maxY=0;
 for(let n=0;n<3600;n++){
  const enemies=n>300&&n<1600?[{x:500,y:330,hp:4,dead:false}]:[];
  const next=advanceCaptainPatrol(a,left,50,enemies);
  const copy=advanceCaptainPatrol(b,right,50,enemies);
  assert.deepEqual(next,copy,'same seed reproduces exact Captain path');
  assert.ok(captainPointSafe(next),'Captain crossed deck edge or wheelhouse');
  assert.ok(next.y<=390+1e-6,'PR75 lower rail safety');
  assert.ok(Math.hypot(next.x-left.x,next.y-left.y)<=CAPTAIN_PANIC_SPEED*.05+1e-6,'no teleport');
  if(next.moving)moving++;else stopping++;
  if(lastFacing&&lastFacing!==next.facing)headingChanges++;
  lastFacing=next.facing;maxY=Math.max(maxY,next.y);
  left={x:next.x,y:next.y};right={x:copy.x,y:copy.y};
 }
 assert.ok(moving>1000&&stopping>120&&headingChanges>10,{moving,stopping,headingChanges});
 assert.ok(a.destinations.length>15,'Captain must choose frequent new destinations');
 assert.ok(new Set(a.destinations.map(p=>p.x+','+p.y)).size>=5,'routes must vary');
 assert.equal(a.dashes,b.dashes);
});
test('PR76 all five exact panic phrases occur, without immediate repeats, with bounded timing',()=>{
 assert.deepEqual(CAPTAIN_PANIC_PHRASES,[
  'AAAAAA!','Zrób coś!','Wszyscy tu zginiemy!','Pruj z karabinku!','Jezu, Jezu, Jezuuuuuuu!'
 ]);
 const speech=createCaptainSpeech(82);
 let last=null,previousAt=0,previousCount=0;
 for(let i=0;i<3600;i++){
  const current=stepCaptainSpeech(speech,50,true);
  if(speech.spoken.length!==previousCount){
   assert.notEqual(current,last,'same phrase cannot repeat consecutively');
   if(previousAt)assert.ok(speech.elapsed-previousAt>=6000&&speech.elapsed-previousAt<=12050);
   previousAt=speech.elapsed;last=current;previousCount=speech.spoken.length;
  }
 }
 assert.ok(new Set(speech.spoken).size===5,'all five barks need to be reachable');
 assert.ok(speech.spoken.length>=12&&speech.spoken.length<=30);
 const elapsed=speech.elapsed,oldCount=speech.spoken.length;
 assert.equal(stepCaptainSpeech(speech,0,false),null);
 assert.equal(speech.spoken.length,oldCount);
 assert.equal(speech.elapsed,elapsed,'pause must not accumulate time');
});

test('final Act II Captain collision is feet-only and separates without entering walls or railings',()=>{
 assert.equal(CAPTAIN_FEET_RADIUS,14);
 const captain={x:540,y:326},minimum=17+CAPTAIN_FEET_RADIUS+3;
 for(const initial of [{x:495,y:326},{x:585,y:326},{x:540,y:280},{x:540,y:329}]){
  let player={...initial};
  for(let i=0;i<75;i++){
   const toward={x:player.x+(captain.x-player.x)*.15,y:player.y+(captain.y-player.y)*.15};
   const next=resolveCaptainFeet(player,toward,captain);
   assert.ok(insideDeck(next,25,AIRSHIP_PLAYER_LOWER_MARGIN));
   assert.ok(Math.hypot(next.x-captain.x,next.y-captain.y)>=minimum-.1);
   assert.equal(wheelhouseSegmentHit(player,next,24),false);
   player=next;
  }
 }
});
test('final Act II Captain at lower railing cannot force Aloes off deck',()=>{
 for(const captain of [{x:390,y:318},{x:720,y:317},{x:300,y:319}]){
  assert.ok(captainPointSafe(captain));
  let player={x:captain.x,y:captain.y-45};
  for(let i=0;i<100;i++){
   const next=resolveCaptainFeet(player,{x:captain.x,y:captain.y+12},captain);
   assert.ok(insideDeck(next,25));
   player=next;
  }
 }
});
