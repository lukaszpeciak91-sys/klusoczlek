import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCHOOL_WORLD,SCHOOL_WAVE_COUNT,SCHOOL_PLACES,SCHOOL_OBSTACLES,schoolWalkable,schoolStep,schoolDebugPoint} from '../src/school-contract.js';
import {SCHOOL_WAVES,SCHOOL_COMBAT_MS,schoolWaveIndex,schoolCombatPhase,schoolWeaponAllowed} from '../src/school-combat.js';
import {PROFILES,TYPES,createDirector,directorOpportunity,directorPopulation,nextDirectorType} from '../src/encounter-director.js';
import {WAVE_TIMING} from '../src/episode.js';
import {createGameplayClock,advanceGameplayClock} from '../src/gameplay-clock.js';
import {ENEMY_TYPES,moveEnemy} from '../src/enemy-types.js';
import {ENCOUNTER,applyPlayerContact,applyEnemyHit} from '../src/bobrozombi.js';
import {PLAYER_RADIUS} from '../src/movement.js';
import {selectOrdinarySpawn} from '../src/enemy-spawn.js';
import {steerObstacleStep,segmentObstacleHit} from '../src/obstacles.js';
import {reachableCells,firstFootprintHit} from '../src/obstacle-geometry.js';
import {COMBAT_TUNING,createFiringState,firingStep,flameTargetVisible} from '../src/weapon-combat.js';
import {enemyProjectileHit,enemyFlameVisible} from '../src/enemy-damage.js';
import {createPressure,stepPressure} from '../src/flame-pressure.js';
import {availableWeapons,cycleUnlockedWeapon} from '../src/weapon-progression.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const nav=reachableCells({...SCHOOL_WORLD,cellSize:20,actorRadius:ENEMY_TYPES.zubrokryptyda.radius,
 origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});

test('R1-R3 exactly four Act I timed profiles, species weights, caps and 170s ordinary combat',()=>{
 assert.equal(SCHOOL_WAVE_COUNT,4);assert.equal(SCHOOL_WAVES.length,4);
 assert.deepEqual(SCHOOL_WAVES.map(x=>x.durationMs),[35000,40000,45000,50000]);
 assert.deepEqual(SCHOOL_WAVES.map(x=>x.maxAlive),[6,7,8,9]);
 assert.deepEqual(SCHOOL_WAVES.map(x=>x.target),PROFILES.slice(0,4).map(p=>p.target));
 assert.deepEqual(SCHOOL_WAVES.map(x=>x.weights),PROFILES.slice(0,4).map(p=>p.weights));
 assert.equal(SCHOOL_COMBAT_MS,170000);
 assert.deepEqual([0,34999,35000,75000,120000,170000].map(schoolWaveIndex),[0,0,1,2,3,3]);
 for(let w=0;w<4;w++){
  const d=createDirector(w+15);
  assert.equal(nextDirectorType(d,w),TYPES[0],'Bobrozombi permitted in every wave');
  for(let i=0;i<3;i++)if(PROFILES[w].weights[i]===0)assert.notEqual(nextDirectorType(d,w),TYPES[i]);
  const cap=PROFILES[w].cap;
  const atCap=directorOpportunity(d,{elapsedMs:WAVE_TIMING[w].startMs,wave:w,
   population:{living:cap,visible:cap,nearby:cap}});
  assert.equal(atCap.spawn,false,'director may not exceed cap');
 }
 assert.deepEqual(SCHOOL_WAVES.map(w=>w.weights.map(v=>v>0)),[
  [true,false,false],[true,true,false],[true,true,true],[true,true,true]
 ]);
});
test('R4-R5 gameplay clock excludes intro, MENU pause, hidden, portrait and dialogue boundaries',()=>{
 const clock=createGameplayClock();
 assert.equal(advanceGameplayClock(clock,1000,false),0);
 assert.equal(advanceGameplayClock(clock,7000,true),0);
 assert.equal(advanceGameplayClock(clock,8000,true),1000);
 assert.equal(advanceGameplayClock(clock,100000,false),1000);
 assert.equal(advanceGameplayClock(clock,200000,true),1000);
 assert.equal(advanceGameplayClock(clock,201000,true),2000);
 const school=source('../src/school-scene.js'),combat=source('../src/school-combat.js');
 assert.ok(school.includes('this.introActive=false;\n          this.syncControls();'));
 assert.ok(school.includes("this.combat.start(); // The first ordinary wave begins only after DALEJ."));
 assert.ok(school.includes('if(!this.controlsAllowed()||this.introActive||this.defeated){this.combat.suspend();return;}'));
 assert.ok(school.includes("this.events.on(Phaser.Scenes.Events.PAUSE,reset)"));
 assert.ok(school.includes("document.addEventListener('visibilitychange',sync)"));
 assert.ok(combat.includes('if(started||defeated||scene.introActive||scene.disposed)return false'));
});
test('R6 spawn selection uses camera-aware Act I candidates, connected navigation and solid geometry',()=>{
 assert.ok(nav.visited>0,'connected school navigation exists');
 const player=SCHOOL_PLACES.playerStart;
 for(const type of ['bobrozombi','bocianolak','zubrokryptyda']){
  const radius=ENEMY_TYPES[type].radius;
  const sample=selectOrdinarySpawn({player,obstacles:SCHOOL_OBSTACLES,index:3,
   radius,seed:104,navigation:nav,occupied:[],
   view:{x:65,y:375,width:800,height:360}});
  assert.ok(sample.point,'safe spawn must exist for '+type);
  assert.ok(schoolWalkable(sample.point,radius));
  assert.ok(nav.isReachable(sample.point));
  assert.ok(Math.hypot(sample.point.x-player.x,sample.point.y-player.y)>=ENCOUNTER.minSpawnDistance);
 }
 for(const place of ['chapel','school','bicycleRack']){
  assert.equal(schoolWalkable(SCHOOL_PLACES[place],ENEMY_TYPES.zubrokryptyda.radius),false);
 }
});
test('R7 enemies retain Act I pursuit and swept steering around chapel, school and bicycle rack',()=>{
 for(const [x,y,direction] of [
  [330,1000,{x:0,y:-1}],[1360,660,{x:0,y:-1}],[1510,915,{x:0,y:-1}]
 ]){
  let e={type:'bobrozombi',x,y,hp:3,seed:2};
  assert.ok(schoolWalkable(e,ENEMY_TYPES.bobrozombi.radius));
  for(let i=0;i<50;i++){
   const desired=moveEnemy(e,{x:e.x+direction.x*260,y:e.y+direction.y*260},.05,i*.05);
   const next=steerObstacleStep(e,desired,{x:e.x+direction.x*260,y:e.y+direction.y*260},
     ENEMY_TYPES.bobrozombi.radius,SCHOOL_OBSTACLES);
   e.x=next.x;e.y=next.y;
   assert.ok(schoolWalkable(e,ENEMY_TYPES.bobrozombi.radius),'enemy entered solid footprint');
  }
 }
 const player={x:330,y:990};
 const after=schoolStep(player,{x:0,y:-1},50);
 assert.ok(schoolWalkable(after,PLAYER_RADIUS));
});
test('R8-R9 all three approved weapons work, water history is never selected or fired',()=>{
 const unlocked=new Set(['blunderbuss','rifle','flamethrower','water-flamethrower']);
 assert.deepEqual(availableWeapons(unlocked,'act4'),['blunderbuss','rifle','flamethrower']);
 assert.equal(schoolWeaponAllowed('water-flamethrower',unlocked),false);
 assert.equal(cycleUnlockedWeapon('flamethrower',unlocked,'act4'),'blunderbuss');
 for(const weapon of ['blunderbuss','rifle']){
  const s=createFiringState();
  assert.equal(firingStep(s,weapon,true,0),1,weapon+' must produce projectile');
  assert.ok(COMBAT_TUNING[weapon].speed>0);
 }
 const pressure=createPressure();
 assert.equal(stepPressure(pressure,true,16),true,'approved flame stream activates');
 assert.equal(schoolWeaponAllowed('flamethrower',unlocked),true);
 const combat=source('../src/school-combat.js');
 assert.ok(combat.includes("const weapon=schoolWeaponAllowed(scene.weapon,scene.run.unlockedWeapons)?scene.weapon:null"));
 assert.ok(combat.includes("weapon==='flamethrower'&&fire.step"));
 assert.equal(combat.includes("drawContinuousStream(stream,origin,aim,now,'water-flamethrower'"),false);
});
test('R10 projectile ordering and flame LOS use the existing solid footprint predicates',()=>{
 const from={x:120,y:840},to={x:700,y:840};
 const wall=firstFootprintHit(from,to,SCHOOL_OBSTACLES,5);
 assert.ok(wall&&wall.obstacle.id==='chapel');
 const enemy={type:'bobrozombi',x:600,y:840,hp:3};
 const hit=enemyProjectileHit(from,to,enemy,5);
 assert.ok(hit&&wall.t<hit.t,'chapel blocks a projectile before monster hit');
 assert.ok(segmentObstacleHit(from,to,SCHOOL_OBSTACLES,5));
 assert.equal(enemyFlameVisible({x:235,y:840},{x:1,y:0},
   {type:'bobrozombi',x:420,y:840,hp:3},SCHOOL_OBSTACLES),false);
 assert.equal(enemyFlameVisible({x:530,y:840},{x:1,y:0},
   {type:'bobrozombi',x:650,y:840,hp:3},SCHOOL_OBSTACLES),true);
 assert.equal(flameTargetVisible({x:235,y:840},{x:1,y:0},
   {x:420,y:840},21,SCHOOL_OBSTACLES),false);
});
test('R11 contact cooldown, HP zero, kill once and no projectile ghost after death',()=>{
 assert.equal(applyEnemyHit(ENEMY_TYPES.bocianolak.hp,99),0);
 const first=applyPlayerContact({hp:2,invulnerableUntil:0},1000);
 assert.equal(first.hp,1);
 assert.equal(applyPlayerContact(first,1001).hp,1);
 const death=applyPlayerContact(first,first.invulnerableUntil);
 assert.equal(death.hp,0);
 assert.equal(applyPlayerContact(death,100000).hp,0);
 const combat=source('../src/school-combat.js');
 assert.ok(combat.includes('if(enemy.dead||enemy.hp>0)return false'));
 assert.ok(combat.includes('if(result.hp===0){'));
 assert.ok(combat.includes('scene.captureSchoolDefeat();'));
 assert.ok(combat.includes('clearCombat();scene.blazej?.clearAttacks();scene.syncControls();'));
 assert.ok(combat.includes('for(const shot of projectiles)shot.object?.destroy()'));
});
test('R12-R13 fixed wave4 handoff clears living enemies once and cannot award Błażej',()=>{
 assert.equal(schoolCombatPhase(169999,0),'COMBAT');
 assert.equal(schoolCombatPhase(170000,3),'CLEANUP');
 assert.equal(schoolCombatPhase(170000,0),'BLAZEJ_PENDING');
 assert.equal(schoolCombatPhase(190000,0),'BLAZEJ_PENDING');
 const combat=source('../src/school-combat.js'),scene=source('../src/school-scene.js');
 assert.ok(combat.includes("phase==='CLEANUP'&&living().length===0&&!finished"));
 assert.ok(combat.includes("transition('BLAZEJ_PENDING')"));
 assert.ok(scene.includes('IDŹ DO SZKOŁY'));
 assert.equal(combat.includes('awardRunArtifact('),false);
 assert.equal(combat.includes("this.scene.start('Cave'"),false);
 assert.equal(scene.includes("scene.start('ActTitle'"),false);
});
test('R14-R15 Act IV fixtures preserve predecessor artifacts and scene resources tear down once',()=>{
 for(const id of ['act4-opening','act4-school','act4-combat','act4-wave4']){
  assert.ok(schoolWalkable(schoolDebugPoint(id)));
  const fixture=createDebugFixture(id);
  assert.deepEqual([...fixture.run.completedActs],['act1','act2','act3']);
  assert.ok(fixture.run.artifacts.has('marcin-mohawk'));
  assert.ok(fixture.run.artifacts.has('bogdan-hunting-horn'));
  assert.ok(fixture.run.unlockedWeapons.has('water-flamethrower'));
  assert.equal(fixture.run.selectedWeapon,'rifle');
 }
 const combat=source('../src/school-combat.js'),scene=source('../src/school-scene.js');
 assert.ok(combat.includes('if(started||defeated||scene.introActive||scene.disposed)return false;'));
 assert.ok(combat.includes('scene.events.once(Phaser.Scenes.Events.SHUTDOWN,destroy)'));
 assert.ok(scene.includes("this.input.off('pointerdown',touchSwitch)"));
 assert.ok(scene.includes("this.input.keyboard.off('keydown',weaponKey)"));
 assert.ok(scene.includes('this.combat?.suspend()'));
});

test('PR105 R1 monotonic School phases are synchronized and terminal transitions happen once',()=>{
 const combat=source('../src/school-combat.js');
 const scene=source('../src/school-scene.js');
 assert.ok(combat.includes('phaseChanges++;scene.schoolPhase=next;'));
 assert.ok(combat.includes("if(phase===next||phase==='DEFEAT'||PHASE_ORDER[next]<=PHASE_ORDER[phase])return false;"));
 assert.ok(combat.includes("started=true;transition('COMBAT');"));
 assert.ok(combat.includes("if(phase==='COMBAT'&&elapsed>=SCHOOL_COMBAT_MS)transition('CLEANUP');"));
 assert.ok(combat.includes("finished=true;transition('BLAZEJ_PENDING');"));
 assert.ok(combat.includes("defeated=true;transition('DEFEAT');"));
 assert.ok(scene.includes("this.schoolPhase='INTRO';this.defeated=false;"));
 const history=[schoolCombatPhase(0,3),schoolCombatPhase(169999,3),schoolCombatPhase(170000,3),
  schoolCombatPhase(170000,1),schoolCombatPhase(170000,0),schoolCombatPhase(190000,0)];
 assert.deepEqual(history,['COMBAT','COMBAT','CLEANUP','CLEANUP','BLAZEJ_PENDING','BLAZEJ_PENDING']);
});
test('PR105 R1 deterministic live QA fixture advances existing clock without player-facing shortcuts',()=>{
 const adapter=source('../src/school-combat.js'),scene=source('../src/school-scene.js');
 assert.ok(adapter.includes('const qa=scene.run.isDebugRun?Object.freeze({'));
 assert.ok(adapter.includes('clock.elapsedMs=value;clock.lastNow=null;return true;'));
 assert.ok(adapter.includes('return hitEnemy(enemy,amount,scene.player,scene.time.now);'));
 assert.ok(adapter.includes("phase==='CLEANUP'&&living().length===0&&!finished"));
 assert.ok(adapter.includes("finished=true;transition('BLAZEJ_PENDING');"));
 assert.ok(adapter.includes('if(phase===\'COMBAT\'){'));
 assert.ok(scene.includes("this.objectiveText=this.add.text(0,0,'IDŹ DO SZKOŁY'"));
 assert.equal(adapter.includes('awardRunArtifact('),false);
 assert.equal(adapter.includes("this.scene.start('Cave'"),false);
});
test('PR105 R1 actual death coordinates and approved existing Menu presentation',()=>{
 const scene=source('../src/school-scene.js'),combat=source('../src/school-combat.js');
 const menu=source('../src/scenes.js');
 assert.ok(combat.includes("scene.captureSchoolDefeat();"));
 assert.ok(combat.includes("clearCombat();scene.blazej?.clearAttacks();scene.syncControls();"));
 assert.ok(combat.includes("scene.openMenu();"));
 assert.ok(scene.includes("const camera=this.cameras.main,origin=camera.getWorldPoint(0,0);"));
 assert.ok(scene.includes("this.defeatVisualAt={x:(this.player.x-origin.x)*camera.zoom,"));
 assert.ok(scene.includes("this.playerVisual.sprite?.setVisible(false);"));
 assert.ok(scene.includes("this.playerVisual.shadow?.setVisible(false);"));
 assert.ok(scene.includes("this.player.setVisible(false);"));
 assert.ok(menu.includes("sessionKey==='School' && this.scene.get('School').defeated"));
 assert.ok(menu.includes("createPixelBurst(this,'aloes',at.x,at.y,7)"));
});

test('PR105 R2 School reuses original Act I bark view and its stable renderers',()=>{
 const scene=source('../src/school-scene.js'),combat=source('../src/school-combat.js'),view=source('../src/ambient-bark-view.js');
 assert.ok(scene.includes("import {createAmbientBarks} from './ambient-bark-view.js'"));
 assert.ok(scene.includes("this.ambientBarks=createAmbientBarks(this,seededRandom("));
 assert.ok(scene.includes("this.enemies=this.combat.enemies;"));
 assert.ok(scene.includes("this.enemyRenderers=this.combat.renderers;"));
 assert.ok(scene.includes("this.schoolPhase==='COMBAT'||this.schoolPhase==='CLEANUP'"));
 assert.ok(scene.includes("this.run.hp>0&&!this.dialogueLoading&&!this.dialogueState?.id"));
 assert.ok(scene.includes("this.ambientBarks.tick(this.combat.elapsedMs);"));
 assert.ok(scene.includes("this.ambientBarks?.guard();"));
 assert.ok(combat.includes("scene.ambientBarks?.hit(enemy,clock.elapsedMs);"));
 assert.ok(combat.includes("scene.ambientBarks?.speakerDied(enemy);"));
 assert.ok(combat.includes("scene.ambientBarks?.suspend();"));
 assert.ok(combat.includes("renderers,get enemies(){return enemies;}"));
 for(const [type,name] of [['bobrozombi','createBobrozombiRenderer'],['bocianolak','createBocianolakRenderer'],['zubrokryptyda','createZubrokryptydaRenderer']])
  assert.ok(combat.includes(type+':'+name+'(scene,Phaser)'));
 assert.ok(view.includes("scene.enemyRenderers[e.type]?.speechAnchorOf?.(e)"));
 assert.ok(view.includes("const candidates=()=>scene.enemies.filter"));
 assert.equal(combat.includes('createBarkSchedule('),false,'no forked bark engine');
 assert.equal(scene.includes('queueBocianolakHitDialogue('),false,'Act I story dialogue not copied');
});
test('PR105 R2 approved bubble caps, existing probabilities and sprite contracts unchanged',()=>{
 const bark=source('../src/ambient-barks.js'),view=source('../src/ambient-bark-view.js');
 const visual=source('../src/enemy-visual.js'),combat=source('../src/school-combat.js');
 assert.ok(bark.includes('export const MAX_BUBBLES=2;'));
 assert.ok(bark.includes('if(unit(rng)>=0.35)return null;'));
 assert.ok(bark.includes('state.enemyCooldown.get(enemy)'));
 assert.ok(bark.includes('if(state.active.length>=MAX_BUBBLES'));
 assert.ok(bark.includes('hud.joystickRadius*1.4+6'));
 assert.ok(view.includes('scene.events.once(\'shutdown\',destroy);'));
 assert.ok(view.includes('scene.scale.off(\'resize\',resize)'));
 assert.ok(view.includes("scene.events.off('pause',suspend)"));
 for(const [type,width,frame] of [['bobrozombi',768,96],['bocianolak',1024,128],['zubrokryptyda',1536,192]]){
  assert.ok(visual.includes("path:'enemies/"+type+".png'"));
  assert.ok(visual.includes('width:'+width));
  assert.ok(visual.includes('frameWidth:'+frame));
 }
 assert.ok(visual.includes('art.setFrame(facing)'));
 assert.ok(visual.includes('advanceEnemyGait(gait,type,distance,seconds)'));
 assert.ok(visual.includes('art.setTint(hitActive('));
 assert.ok(visual.includes('speechAnchorOf=enemy=>'));
 assert.ok(combat.includes('advanceIgnition(enemy.ignition,now)'));
 assert.ok(combat.includes('enemy.burningFx?.update(enemy,now)'));
 assert.ok(combat.includes('createPixelBurst(scene,enemy.type,enemy.x,enemy.y,enemy.seed)'));
 assert.ok(combat.includes('enemy.sprite.destroy()'));
});
