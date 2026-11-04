import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue} from '../src/dialogue-data.js';
import {createAirshipDefense,currentDefensePhase,nextDeliverySpec,tickAirshipDefense,
 AIRSHIP_SURVIVAL_MS,AIRSHIP_GROUND_CAP,AIRSHIP_GLIDER_CAP,finishAirshipDefense} from '../src/airship-defense.js';
import {COMBAT_TUNING} from '../src/weapon-combat.js';
import {ENCOUNTER} from '../src/bobrozombi.js';
import {landingPosition} from '../src/glider-delivery.js';
import {insideDeck} from '../src/airship-contract.js';

test('Act II opening is exactly approved and final acknowledgement closes once',()=>{
 const lines=DIALOGUES['act2-opening'];
 assert.equal(lines.length,23);
 assert.deepEqual(lines.map(line=>line[1]),[
 'ALOES','KAPITAN','ALOES','KAPITAN','ALOES','KAPITAN','ALOES','KAPITAN',
 'ALOES','KAPITAN','ALOES','KAPITAN','ALOES','KAPITAN','ALOES','KAPITAN',
 'KAPITAN','ALOES','KAPITAN','ALOES','KAPITAN','BOBROZOMBI','BOBROZOMBI']);
 assert.equal(lines[0][2],'Kapitanie, gdzie my właściwie jesteśmy? Co to za magiczna kraina?');
 assert.equal(lines[15][2],'Oczywiście! Masz moje kapitańskie słowo!');
 assert.equal(lines[16][2],'O nie! Kłusoczłeku! Chwyć za broń!');
 assert.equal(lines[20][2],'NIE MA CZASU NA WYJAŚNIENIA! BROŃ PAROSTATKU!');
 const state=createDialogueState();
 assert.equal(beginDialogue(state,'act2-opening'),true);
 let ended=0;
 for(let i=0;i<lines.length;i++){
  assert.equal(state.index,i);
  if(advanceDialogue(state)==='act2-opening')ended++;
 }
 assert.equal(ended,1);
 assert.equal(state.id,null);
 assert.equal(advanceDialogue(state),null);
});
test('three-minute active clock only moves while combat is active',()=>{
 const d=createAirshipDefense();
 assert.equal(d.state,'ready');
 assert.equal(tickAirshipDefense(d,1000,{active:true,ground:0,airborne:0,pending:0}),null);
 assert.equal(d.elapsedMs,0);
 d.state='active';
 assert.equal(tickAirshipDefense(d,2000,{active:true,ground:0,airborne:0,pending:0}),null);
 assert.equal(d.elapsedMs,0);
 tickAirshipDefense(d,3000,{active:true,ground:0,airborne:0,pending:0});
 assert.equal(d.elapsedMs,1000);
 tickAirshipDefense(d,4000,{active:false,ground:0,airborne:0,pending:0});
 tickAirshipDefense(d,120000,{active:true,ground:0,airborne:0,pending:0});
 assert.equal(d.elapsedMs,1000,'inactive duration cannot advance clock');
 const e=tickAirshipDefense(d,120500,{active:true,ground:0,airborne:0,pending:0});
 assert.equal(e.delivery.type,'bobrozombi');
 assert.equal(d.elapsedMs,1500);
 assert.equal(finishAirshipDefense(d,'survived'),true);
 assert.equal(finishAirshipDefense(d,'survived'),false);
 assert.equal(d.result.activeCombatMs,1500);
});
test('phase pressure grows, but ground and aircraft caps gate scheduling',()=>{
 assert.equal(currentDefensePhase(0),0);
 assert.equal(currentDefensePhase(60000),1);
 assert.equal(currentDefensePhase(120000),2);
 assert.deepEqual([0,1,2,3,4,5].map(i=>nextDeliverySpec(i).type),
 ['bobrozombi','bobrozombi','bocianolak','bobrozombi','bobrozombi','bocianolak']);
 const d=createAirshipDefense();d.state='active';d.clock.elapsedMs=123000;
 assert.equal(tickAirshipDefense(d,1000,{active:true,ground:AIRSHIP_GROUND_CAP,airborne:0,pending:0}),null);
 assert.equal(tickAirshipDefense(d,1100,{active:true,ground:0,airborne:AIRSHIP_GLIDER_CAP,pending:0}),null);
 const result=tickAirshipDefense(d,1200,{active:true,ground:3,airborne:1,pending:1});
 assert.equal(result.delivery.type,'bobrozombi');
 assert.ok(d.nextDeliveryMs>123000);
});
test('victory at 180 s is one-shot and cannot supersede defeat',()=>{
 const d=createAirshipDefense();d.state='active';
 d.clock.elapsedMs=AIRSHIP_SURVIVAL_MS-50;
 tickAirshipDefense(d,1000,{active:true,ground:0,airborne:0,pending:0});
 const win=tickAirshipDefense(d,1051,{active:true,ground:0,airborne:0,pending:0});
 assert.deepEqual(win,{outcome:'survived'});
 assert.equal(finishAirshipDefense(d,'survived'),true);
 assert.equal(finishAirshipDefense(d,'defeat'),false);
 assert.equal(d.result.outcome,'survived');
 const dead=createAirshipDefense();dead.state='active';dead.elapsedMs=120000;
 assert.equal(finishAirshipDefense(dead,'defeat'),true);
 assert.equal(tickAirshipDefense(dead,999999,{active:true,ground:0,airborne:0,pending:0}),null);
 assert.equal(finishAirshipDefense(dead,'survived'),false);
 assert.equal(dead.result.outcome,'defeat');
});
test('weapons retain Act I combat tuning and landing stays inside ship',()=>{
 assert.equal(COMBAT_TUNING.blunderbuss.interval,180);
 assert.equal(COMBAT_TUNING.rifle.shots,3);
 assert.equal(COMBAT_TUNING.flamethrower.range,145);
 assert.equal(ENCOUNTER.invulnerabilityMs,800);
 for(const type of ['bobrozombi','bocianolak']){
  const p=landingPosition('port-aft',{x:480,y:270},[],type==='bobrozombi'?21:18);
  assert.ok(p&&insideDeck(p));
 }
});
