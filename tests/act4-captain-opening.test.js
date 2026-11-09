import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue,currentDialogue} from '../src/dialogue-data.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';
import {actPortraitKeys,scenePortraitKeys} from '../src/act-asset-preparation.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');

const approved=[
 ['captain','KAPITAN MARIAN','No i jesteśmy! Szkoła zawodowa!\nTu znajdziesz Błażeja i jego rower!'],
 ['aloes','ALOES','A pan dokąd?'],
 ['captain','KAPITAN MARIAN','Ja wezmę dwa pierwsze artefakty\ni muszę załatwić pewną bardzo ważną\nsprawę w tej kaplicy...'],
 ['captain','KAPITAN MARIAN','By móc odesłać Cię do domu oczywiście,\nprzecież parostatkiem nie polecimy\ndo innego wymiaru'],
 ['aloes','ALOES','Ach rozumiem'],
 ['captain','KAPITAN MARIAN','Nie stój jak widły w gnoju!\nLeć po rower!']
];

test('Act IV opening dialogue matches all six approved panels, original speakers and portrait IDs exactly',()=>{
 assert.deepEqual(DIALOGUES['act4-captain-opening'],approved);
 assert.deepEqual(DIALOGUES['act4-captain-opening'].map(x=>x[0]),['captain','aloes','captain','captain','aloes','captain']);
 assert.equal(DIALOGUES['act4-captain-opening'].length,6);
 const ui=source('../src/dialogue-ui.js');
 assert.ok(ui.includes('scenePortraitKeys(scene.scene.key)'));
 assert.ok(actPortraitKeys('act4').includes('captain'));
 assert.ok(actPortraitKeys('act4').includes('blazej'));
 assert.ok(!actPortraitKeys('act1').includes('bogdan'));
 assert.deepEqual(scenePortraitKeys('School'),actPortraitKeys('act4'));
 assert.ok(ui.includes("const line=currentDialogue(state)"));
 assert.ok(ui.includes("if(ended==='next')"));
 const state=createDialogueState();
 assert.equal(beginDialogue(state,'act4-captain-opening'),true);
 assert.equal(beginDialogue(state,'act4-captain-opening'),false,'cannot restart active dialogue');
 for(let i=0;i<approved.length;i++){
  assert.deepEqual(currentDialogue(state),approved[i]);
  assert.equal(state.index,i);
  assert.equal(advanceDialogue(state),i===approved.length-1?'act4-captain-opening':'next');
 }
 assert.equal(state.id,null);
 assert.equal(currentDialogue(state),null);
});

test('Marian waits until arrival and the final DALEJ before a single ground-based chapel walk',()=>{
 const scene=source('../src/school-scene.js'),captain=source('../src/captain-arrival.js');
 assert.ok(captain.includes('export const CAPTAIN_ARRIVAL_MS=800;'));
 assert.ok(source('../src/captain-sheet-contract.js').includes("directions:['e','se','s','sw','w','nw','n','ne']"));
 assert.ok(captain.includes('if(t>=1){arrived=true'));
 assert.ok(scene.includes('this.captainArrival.update(delta);'));
 assert.ok(scene.includes("this.captainDialogueStarted=this.beginSchoolDialogue('act4-captain-opening');"));
 assert.ok(scene.includes("if(id==='act4-captain-opening'){\n      this.startCaptainDeparture();"));
 assert.ok(scene.includes('this.captainDeparting=true;this.storyBusy=false;'));
 assert.ok(scene.includes('!this.captainDialogueStarted||this.captainDeparting'));
 assert.ok(scene.includes("if(actor.active)actor.destroy();"));
 assert.ok(scene.includes('this.introActive=false; // One-shot departure stays recorded'));
 assert.ok(scene.includes("const door=SCHOOL_PLACES.chapelDoor;"));
 assert.ok(scene.includes('this.updateCaptainDeparture(delta);'));
 assert.ok(scene.includes('const step=captainWalkStep(actor,door,delta);'));
 assert.ok(scene.includes('actor.setPosition(step.x,step.y).setAlpha(1);'));
 assert.ok(scene.includes('this.captainArrival.sprite?.setFrame(playerFrame(facingOf('));
 // Only one approved departure entrypoint, with no alpha-fading tween.
 assert.ok(!scene.includes('alpha:0,duration:1100'));
 assert.equal((scene.match(/this\.startCaptainDeparture\(\)/g)||[]).length,1);
 assert.ok(!scene.includes("if(this.introActive&&this.captainArrival.arrived&&!this.captainDeparting){"));
});

test('narrative-only Captain introduction keeps actual run artifacts, HP, weapon and Act III handoff unchanged',()=>{
 const scene=source('../src/school-scene.js'),data=source('../src/dialogue-data.js');
 const captainFlow=scene.slice(scene.indexOf('  startCaptainDeparture(){'),scene.indexOf('  onBlazejDefeated(){'));
 assert.ok(!/awardRunArtifact\(|completeCampaignAct\(|run\.artifacts\.(clear|delete|add)|run\.hp\s*=|run\.selectedWeapon\s*=/.test(captainFlow));
 assert.ok(data.includes("'act4-captain-opening'"));
 assert.ok(scene.includes('this.combat.suspend();this.ambientBarks.suspend();'));
 assert.ok(scene.includes('this.resetMovement();this.syncControls();'));
 assert.ok(scene.includes("!this.introActive&&!this.defeated&&!this.storyBusy&&!this.dialogueState?.id"));
 assert.ok(scene.includes("if(!this.controlsAllowed()||this.introActive||this.defeated){this.combat.suspend();return;}"));
 const fixture=createDebugFixture('act4-opening'),run=fixture.run;
 assert.equal(run.artifacts.has('marcin-mohawk'),true);
 assert.equal(run.artifacts.has('bogdan-hunting-horn'),true);
 assert.equal(run.completedActs.has('act3'),true);
 const baseline={hp:run.hp,weapon:run.selectedWeapon,artifacts:[...run.artifacts],completed:[...run.completedActs]};
 const state=createDialogueState();
 assert.ok(beginDialogue(state,'act4-captain-opening'));
 for(let i=0;i<6;i++)advanceDialogue(state);
 assert.deepEqual({hp:run.hp,weapon:run.selectedWeapon,artifacts:[...run.artifacts],completed:[...run.completedActs]},baseline);
});

test('Act IV DEBUG mid-act checkpoints bypass Captain introduction and ordinary waves remain gated',()=>{
 const scene=source('../src/school-scene.js');
 assert.ok(scene.includes("this.introActive=!['act4-school','act4-combat','act4-wave4','act4-blazej','act4-boss','act4-finale'].includes(this.debugCheckpoint)"));
 assert.ok(scene.includes("if(!this.introActive&&this.debugCheckpoint!=='act4-school')"));
 assert.ok(scene.includes('this.entryGate=beginSceneReveal(this'));
 assert.ok(scene.includes('this.captainArrival.loading'));
 assert.ok(scene.includes('if(this.introActive&&!this.captainArrival.start())'));
 for(const id of ['act4-opening','act4-school','act4-combat','act4-wave4','act4-blazej','act4-boss','act4-finale'])
  assert.ok(createDebugFixture(id),id);
 assert.ok(scene.includes('this.captainDialogueStarted=false;'));
 assert.ok(scene.includes('this.controlsAllowed()'));
 assert.ok(scene.includes('this.introActive=false;this.syncControls();return true;'),'failsafe when Captain no longer exists');
});

test('Captain ground walk is collision-safe and reaches enlarged chapel doorway',async()=>{
 const {SCHOOL_PLACES,schoolWalkable,captainWalkStep,CAPTAIN_WALK_SPEED}=await import('../src/school-contract.js');
 assert.equal(CAPTAIN_WALK_SPEED,95);
 assert.ok(schoolWalkable(SCHOOL_PLACES.chapelDoor));
 for(const origin of [{x:460,y:1056},{x:590,y:1056},{x:460,y:1000}]){
  let p=origin,last=Infinity,done=false;
  for(let i=0;i<200;i++){
   const n=captainWalkStep(p,SCHOOL_PLACES.chapelDoor,50);
   assert.ok(schoolWalkable(n,17),'captain passed through chapel');
   const d=Math.hypot(n.x-SCHOOL_PLACES.chapelDoor.x,n.y-SCHOOL_PLACES.chapelDoor.y);
   assert.ok(d<=last+.01,'walk advances toward door');last=d;p=n;
   if(n.arrived){done=true;break;}
  }
  assert.ok(done,'captain must arrive');
 }
});
