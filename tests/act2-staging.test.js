import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_CAPTAIN_START,AIRSHIP_ALOES_START,CAPTAIN_PATROL_POINTS,createCaptainPatrol,advanceCaptainPatrol,captainPointSafe,eligibleAct2Bark,ACT2_BATTLE_CRIES} from '../src/act2-staging.js';
import {facingOf,playerFrame} from '../src/combat-contract.js';

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
    const next=advanceCaptainPatrol(state,p,50);
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
