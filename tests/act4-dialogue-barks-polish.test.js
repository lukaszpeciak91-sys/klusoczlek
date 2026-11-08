import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue,currentDialogue} from '../src/dialogue-data.js';
import {BLAZEJ_OBSERVER_BARKS,BLAZEJ_BOSS_BARKS,BLAZEJ_START} from '../src/school-finale.js';
import {MAX_BUBBLES,BARK_PHRASES,EXTRA_BARKS,HIT_BARKS} from '../src/ambient-barks.js';
import {SCHOOL_COMBAT_MS,SCHOOL_WAVES} from '../src/school-combat.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';

const code=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Act IV has only the exact approved narrative, in the exact pre-wave and post-wave panel counts',()=>{
 assert.deepEqual(DIALOGUES['act4-maciek-seba'],[
  ['bobrozombi','MACIEK','Najpierw Marcin...potem Bogdan...\no co chodzi temu Kłusoczłeku?'],
  ['bobrozombi','MACIEK','I w ogóle Sebuś, czemu Kłusoczłek,\nże kłusuje jak koń?'],
  ['bocianolak','SEBA','Ty to Maciek jednak głupi jesteś...\nA to nie jest czasem on? Do ataku!']
 ]);
 assert.deepEqual(DIALOGUES['act4-blazej-observer'],[
  ['zubrokryptyda','BŁAŻEJ','...i ja wtedy normalnie od razu'],
  ['bobrozombi','BOBROZOMBI','Ty to jednak Błażej jesteś gość']
 ]);
 assert.deepEqual(DIALOGUES['act4-blazej-confrontation'],[
  ['zubrokryptyda','BŁAŻEJ','Kazał pan, musiał sam!'],
  ['zubrokryptyda','BŁAŻEJ','Nie wiem kim jesteś ale mam ochotę Cię rozgnieść'],
  ['aloes','ALOES','Potrzebuję na chwilę Twojego roweru, dasz się karnąć?'],
  ['zubrokryptyda','BŁAŻEJ','Nie, bo ja się boję, że mi stracisz.\nPoza tym uczciwie ukradłem\ni nie mam zamiaru oddawać'],
  ['zubrokryptyda','BŁAŻEJ','Zostaw mój rower, ty kutwo!\nChłopaki, na niego!']
 ]);
 assert.deepEqual(DIALOGUES['act4-blazej-final'],[
  ['zubrokryptyda','BŁAŻEJ','Ech, kazał pan, musiał sam!']
 ]);
 assert.equal(Object.values(DIALOGUES).flat().some(x=>x[2].includes('na pierwszą komunię')),false);
 const state=createDialogueState();
 for(const id of ['act4-maciek-seba','act4-blazej-observer','act4-blazej-confrontation','act4-blazej-final']){
  assert.equal(beginDialogue(state,id),true);
  const lines=DIALOGUES[id];
  for(let i=0;i<lines.length;i++){
   assert.deepEqual(currentDialogue(state),lines[i]);
   assert.equal(advanceDialogue(state),i===lines.length-1?id:'next');
  }
 }
});
test('only approved 4+3 Błażej guest barks; original ordinary vocabulary and two-bubble cap intact',()=>{
 assert.deepEqual(BLAZEJ_OBSERVER_BARKS,['Szybciej!','Na niego!','Co z wami?','Do ataku!']);
 assert.deepEqual(BLAZEJ_BOSS_BARKS,['Nie oddam roweru!','Zniszczę Cię!','To je moje!']);
 assert.equal(new Set([...BLAZEJ_OBSERVER_BARKS,...BLAZEJ_BOSS_BARKS]).size,7);
 assert.equal(MAX_BUBBLES,2);
 assert.deepEqual(BARK_PHRASES,['Na niego!','Bić! Zabić!','Aaaaaaaa','Umrzyj!','Cośmy Ci zrobili?!','Atak!','Kruca dosyć tego!']);
 assert.equal(EXTRA_BARKS.length,4);
 assert.deepEqual(Object.keys(HIT_BARKS),['bobrozombi','bocianolak','zubrokryptyda']);
 const view=code('../src/ambient-bark-view.js'),school=code('../src/school-scene.js');
 assert.ok(view.includes('createAmbientBarks(scene,rng,{guest=null}={})'));
 assert.ok(view.includes('state.active.length<MAX_BUBBLES'));
 assert.ok(view.includes('place(speaker,size)'));
 assert.ok(view.includes('guestState.nextAt=elapsed+guestDelay()'));
 assert.ok(view.includes('const guestRng=guest?.rng??rng;'));
 assert.ok(view.includes("scene.events.once('shutdown',destroy);"));
 assert.ok(school.includes('speaker:()=>this.blazej?.actor'));
 assert.ok(school.includes('rng:seededRandom((104^0x46ba22)>>>0)'));
 assert.ok(school.includes("phase:()=>['COMBAT','CLEANUP'].includes(this.schoolPhase)?'observer':"));
 assert.ok(school.includes("this.schoolPhase==='BLAZEJ_BOSS'?'boss':null"));
});
test('Captain -> Maciek/Seba -> observer -> five-panel confrontation -> waves; post-wave one panel -> boss',()=>{
 const school=code('../src/school-scene.js');
 assert.ok(school.includes('this.introActive=false;\n          this.openingPending=true;'));
 assert.ok(school.includes("this.openingDialogueStarted=this.beginSchoolDialogue('act4-maciek-seba')"));
 assert.ok(school.includes("this.beginSchoolDialogue('act4-blazej-observer')"));
 assert.ok(school.includes("this.beginSchoolDialogue('act4-blazej-confrontation')"));
 assert.ok(school.includes("this.combat.start(); // The first ordinary wave begins only after DALEJ."));
 assert.ok(school.includes("this.bossConfronted=this.beginSchoolDialogue('act4-blazej-final')"));
 assert.ok(school.includes("if(this.combat.enterBoss())this.blazej.activate()"));
 assert.equal(school.includes("this.bossConfronted=this.beginSchoolDialogue('act4-blazej-confrontation')"),false);
 assert.equal(school.includes('observerShown'),false);
 assert.ok(school.includes("this.combat.suspend();this.ambientBarks.suspend();"));
 assert.ok(school.includes('if(this.storyBusy||this.dialogueState.id)'));
 assert.equal(SCHOOL_COMBAT_MS,170000);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.durationMs),[35000,40000,45000,50000]);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.maxAlive),[6,7,8,9]);
 assert.deepEqual([BLAZEJ_START.x,BLAZEJ_START.y],[1335,785]);
});
test('DEBUG boss and finale start at the same protected original handoff',()=>{
 for(const id of ['act4-opening','act4-school','act4-combat','act4-wave4',
  'act4-blazej','act4-boss','act4-finale']){
  const fixture=createDebugFixture(id);
  assert.ok(fixture);
  assert.equal(fixture.handoff.scene,'School');
  assert.equal(fixture.run.artifacts.has('blazej-bicycle'),false);
 }
 const school=code('../src/school-scene.js'),combat=code('../src/school-combat.js');
 assert.ok(school.includes("this.debugCheckpoint!=='act4-blazej'"));
 assert.ok(combat.includes("phase!=='BLAZEJ_PENDING'||living().length"));
 assert.ok(combat.includes("phase==='CLEANUP'&&living().length===0&&!finished"));
 assert.ok(combat.includes("get target(){return active&&!defeated?actor:null;}")===false);
});
