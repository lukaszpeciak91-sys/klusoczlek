import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {SCHOOL_PLACES,SCHOOL_OBSTACLES,schoolWalkable,SCHOOL_WAVE_COUNT} from '../src/school-contract.js';
import {SCHOOL_WAVES,SCHOOL_COMBAT_MS,schoolCombatPhase} from '../src/school-combat.js';
import {BLAZEJ_BICYCLE_ID,BLAZEJ_START,BLAZEJ_RADIUS,BLAZEJ_CONFRONT_RADIUS,
 blazejConfrontationReady,blazejJumpLanding,CHAPEL_RETURN,chapelReturnValid} from '../src/school-finale.js';
import {BLAZEJ_HP,BLAZEJ_SHOCKWAVE_RADIUS,BLAZEJ_MAX_PROJECTILES} from '../src/school-blazej.js';
import {createBossAttack,bossAttackStep,radialVolley,bossProjectileStep,MARCIN} from '../src/marcin.js';
import {firstFootprintHit} from '../src/obstacle-geometry.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {damageFootprints} from '../src/enemy-damage.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';
import {awardRunArtifact,completeCampaignAct,prepareActStart} from '../src/campaign-run.js';
import {serializeCampaignCheckpoint} from '../src/campaign-save.js';
import {getAct} from '../src/campaign.js';

const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('PR106 retains exactly 170 seconds of approved waves, four caps and Act I behaviour',()=>{
 assert.equal(SCHOOL_WAVE_COUNT,4);
 assert.equal(SCHOOL_COMBAT_MS,170000);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.durationMs),[35000,40000,45000,50000]);
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.maxAlive),[6,7,8,9]);
 assert.equal(schoolCombatPhase(170000,2),'CLEANUP');
 assert.equal(schoolCombatPhase(170000,0),'BLAZEJ_PENDING');
 const code=source('../src/school-combat.js');
 assert.ok(code.includes('moveEnemy(enemy,scene.player'));
 assert.ok(code.includes('steerObstacleStep(enemy,desired'));
 assert.ok(code.includes('createAmbientBarks')===false);
 assert.ok(code.includes('scene.ambientBarks?.hit'));
 assert.ok(code.includes('createPixelBurst(scene,enemy.type,enemy.x,enemy.y,enemy.seed)'));
});
test('PR106 Błażej is a passive, invulnerable visual observer until authoritative handoff',()=>{
 const scene=source('../src/school-scene.js'),combat=source('../src/school-combat.js');
 const boss=source('../src/school-blazej.js');
 assert.ok(schoolWalkable(BLAZEJ_START,BLAZEJ_RADIUS));
 assert.equal(blazejConfrontationReady('COMBAT',BLAZEJ_START),false);
 assert.equal(blazejConfrontationReady('CLEANUP',BLAZEJ_START),false);
 assert.equal(blazejConfrontationReady('BLAZEJ_PENDING',{x:100,y:100}),false);
 assert.equal(blazejConfrontationReady('BLAZEJ_PENDING',BLAZEJ_START),true);
 assert.ok(BLAZEJ_CONFRONT_RADIUS<300);
 assert.ok(boss.includes('createBlazejRenderer(scene,Phaser)'));
 assert.ok(boss.includes('renderer.create(BLAZEJ_START.x,BLAZEJ_START.y)'));
 assert.ok(boss.includes("if(active||defeated||disposed||scene.schoolPhase!=='BLAZEJ_BOSS')return false;"));
 assert.ok(boss.includes("if(!active||defeated||disposed"));
 assert.ok(combat.includes("phase!=='BLAZEJ_PENDING'||living().length"));
 assert.ok(combat.includes("get target(){return active&&!defeated?actor:null;}")===false);
 assert.ok(combat.includes('scene.blazej?.target'));
 assert.ok(scene.includes("this.bossConfronted=this.beginSchoolDialogue('act4-blazej-final')"));
});
test('PR106 telegraph, radial volleys, jump landing and solid obstacles are bounded',()=>{
 const state=createBossAttack();assert.equal(state.phase,'chase');
 for(let i=0;i<MARCIN.cooldown/50;i++)bossAttackStep(state,MARCIN.hp,50);
 assert.equal(state.phase,'warning');
 for(let i=0;i<MARCIN.warning/50-1;i++)bossAttackStep(state,MARCIN.hp,50);
 assert.equal(bossAttackStep(state,MARCIN.hp,50),true);
 assert.equal(state.phase,'recovery');
 assert.equal(radialVolley(BLAZEJ_START).length,8);
 assert.equal(BLAZEJ_MAX_PROJECTILES,MARCIN.maxProjectiles);
 assert.equal(BLAZEJ_SHOCKWAVE_RADIUS,95);
 assert.equal(BLAZEJ_HP,54);
 assert.equal(MARCIN.hp,36);
 const jump=blazejJumpLanding(BLAZEJ_START,{x:1170,y:785});
 assert.ok(jump&&schoolWalkable(jump,BLAZEJ_RADIUS));
 assert.ok(Math.hypot(jump.x-BLAZEJ_START.x,jump.y-BLAZEJ_START.y)<=240.1);
 // The bicycle rack blocks a jump from its near to its far side.
 const blocked=blazejJumpLanding({x:1335,y:830},{x:1660,y:830});
 assert.ok(blocked&&schoolWalkable(blocked,BLAZEJ_RADIUS));
 assert.ok(blocked.x<1400,'cannot jump across solid bicycle rack');
 const school=blazejJumpLanding({x:980,y:317},{x:1500,y:317});
 assert.ok(school&&schoolWalkable(school,BLAZEJ_RADIUS));
 assert.ok(school.x<=SCHOOL_OBSTACLES.find(o=>o.id==='school').footprint.x-SCHOOL_OBSTACLES.find(o=>o.id==='school').footprint.width/2-BLAZEJ_RADIUS+1,'cannot cross the approved lower school foundation');
 const shot={x:1335,y:830,vx:180,vy:0,age:0},player={x:1700,y:830};
 let result=null;
 for(let i=0;i<180&&!result;i++)result=bossProjectileStep(shot,50,player,SCHOOL_OBSTACLES);
 assert.equal(result,'blocked','existing swept Marcin bullet respects rack');
 const code=source('../src/school-blazej.js');
 assert.ok(code.includes("kind=(volleyCount+jumpCount)%2===0?'radial':'jump'"));
 assert.ok(code.includes("projectiles.push(...shots.slice(0,Math.max(0,BLAZEJ_MAX_PROJECTILES-projectiles.length)))"));
 assert.ok(code.includes('firstFootprintHit(actor,scene.player,scene.obstacles,0)'));
});
test('PR106 reuses enemy body footprints, ignition, gait and pixel death instead of creating new graphics',()=>{
 assert.equal(ENEMY_TYPES.zubrokryptyda.radius,BLAZEJ_RADIUS);
 assert.equal(damageFootprints({type:'zubrokryptyda',x:100,y:200}).length,3);
 const code=source('../src/school-blazej.js');
 for(const phrase of ['renderer.update(actor,scene.player','createPixelBurst(scene,\'zubrokryptyda\'',
   'createBurningFx(scene,\'zubrokryptyda\'','igniteEnemy(ignition,\'zubrokryptyda\'',
   'bossProjectileStep(p,dt,scene.player,scene.obstacles)'])assert.ok(code.includes(phrase),phrase);
 assert.equal(code.includes('load('),false);
 assert.equal(code.includes('add.sprite('),false);
 assert.equal(code.includes('new Image('),false);
});
test('PR106 only approved dialogue lines and Act I portrait presentation; no story leaks to barks',()=>{
 const observer=DIALOGUES['act4-blazej-observer'].map(line=>line[2]);
 assert.deepEqual(observer,['...i ja wtedy normalnie od razu','Ty to jednak Błażej jesteś gość']);
 const confrontation=DIALOGUES['act4-blazej-confrontation'].map(line=>line[2]);
 for(const text of ['Nie wiem kim jesteś ale mam ochotę Cię rozgnieść',
  'Potrzebuję na chwilę Twojego roweru, dasz się karnąć?',
  'Nie, bo ja się boję, że mi stracisz.\nPoza tym uczciwie ukradłem\ni nie mam zamiaru oddawać'])
  assert.ok(confrontation.includes(text),text);
 assert.equal(confrontation.length,4);
 assert.equal(confrontation.includes('Kazał pan, musiał sam!'),false);
 assert.deepEqual(DIALOGUES['act4-blazej-final'],[['blazej','BŁAŻEJ','Ech, kazał pan, musiał sam!']]);
 assert.equal(confrontation.some(text=>text.includes('na pierwszą komunię')),false);
 const ending=DIALOGUES['act4-chapel-ending'];
 assert.deepEqual(ending.slice(0,3).map(x=>x[2]),['Łuuuuuu...','Łeeee...','Łuuuuu...']);
 assert.ok(ending.at(-1)[2].includes('Mam nadzieję, że z Marianem'));
 assert.equal(source('../src/ambient-barks.js').includes('Kazał pan'),false);
 const school=source('../src/school-scene.js');
 assert.ok(school.includes('createDialoguePanel(this,Phaser,id=>this.onSchoolDialogueEnded(id))'));
 assert.ok(school.includes('this.combat.suspend();this.ambientBarks.suspend();'));
 assert.ok(school.includes('if(this.storyBusy||this.dialogueState.id)'));
});
test('PR106 artifact awarded once and Act IV completion preserves weapons, HP, all artifacts and stats',()=>{
 const fixture=createDebugFixture('act4-finale');
 assert.ok(prepareActStart(fixture.run,fixture.handoff,new Set(['Arena','Airship','Volcano','School'])));
 const run=fixture.run;run.hp=3;
 assert.equal(awardRunArtifact(run,BLAZEJ_BICYCLE_ID),true);
 assert.equal(awardRunArtifact(run,BLAZEJ_BICYCLE_ID),false);
 assert.deepEqual([...run.artifacts].sort(),['blazej-bicycle','bogdan-hunting-horn','marcin-mohawk']);
 const kills=run.stats.kills,ms=run.stats.activeCombatMs;
 const args={hp:run.hp,maxHp:run.maxHp,unlockedWeapons:run.unlockedWeapons,
  selectedWeapon:'rifle',kills:28,activeCombatMs:173500};
 assert.equal(completeCampaignAct(run,'act4',args),true);
 assert.equal(completeCampaignAct(run,'act4',args),false);
 assert.equal(run.hp,3);
 assert.ok(run.completedActs.has('act4'));
 assert.equal(run.stats.kills,kills+28);
 assert.equal(run.stats.activeCombatMs,ms+173500);
 assert.ok(run.unlockedWeapons.has('water-flamethrower'));
 assert.equal(run.selectedWeapon,'rifle');
 assert.equal(getAct('act5').scene,'Catacombs');
 const school=source('../src/school-scene.js');
 assert.ok(school.includes("completeCampaignAct(this.run,'act4'"));
 assert.ok(school.includes("awardRunArtifact(this.run,BLAZEJ_BICYCLE_ID)"));
 assert.ok(school.includes("this.scene.start('Menu')"));
 assert.equal(school.includes("scene.start('Cave'"),false);
 assert.ok(school.includes("scene.start('ActTitle',{actId:'act5',handoff})"));
});
test('PR106 optional bicycle asset is honestly absent; no fake bike and DEBUG never persists save',()=>{
 assert.equal(existsSync(new URL('../public/assets/artifacts/artifact-blazej-bicycle.png',import.meta.url)),false);
 const school=source('../src/school-scene.js');
 assert.ok(school.includes("artifacts/artifact-blazej-bicycle.png"));
 assert.ok(school.includes("artifacts/artifact-blazej-bike.png"));
 assert.ok(school.includes("validPngHeader(data,{width:192,height:192})"));
 assert.ok(school.includes('Missing/corrupt approved sheet: complete the existing finale'));
 assert.ok(chapelReturnValid());
 assert.ok(schoolWalkable(CHAPEL_RETURN));
 for(let i=0;i<=100;i++){
  const t=i/100,p={x:BLAZEJ_START.x+(CHAPEL_RETURN.x-BLAZEJ_START.x)*t,
   y:BLAZEJ_START.y+(CHAPEL_RETURN.y-BLAZEJ_START.y)*t};
  assert.ok(schoolWalkable(p),'approved bicycle route must not cross School solids');
 }
 const fixture=createDebugFixture('act4-finale');
 fixture.run.isDebugRun=true;
 assert.equal(serializeCampaignCheckpoint(fixture.run),null);
 for(const id of ['act4-blazej','act4-boss','act4-finale'])assert.ok(createDebugFixture(id));
});
