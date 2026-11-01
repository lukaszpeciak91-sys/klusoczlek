import assert from 'node:assert/strict';
import {WAVES} from '../src/episode.js';
import {writeFile} from 'node:fs/promises';

export async function verifyTimedWaves({cdp,evaluate,sleep,snapshot,waitFor,clickControl,nextLine,setSeed}){
 const wait=async(expression,label)=>{for(let i=0;i<1600;i++){if(await evaluate(expression))return;await sleep(25);}throw Error('PR49 timeout '+label+' '+JSON.stringify(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {wave:a.episode.wave,ms:a.elapsedGameplayMs,due:a.spawnDueAt,now:a.time.now,director:{...a.encounterDirector,history:undefined},events:[...a.narrativeEvents],seen:[...a.introducedEnemyTypes],id:a.dialogueState.id,paused:a.physics.world.isPaused,enemies:a.enemies.map(e=>({type:e.type,x:e.x,y:e.y,hp:e.hp}))}})()")));};
 const shot=async(name,width,height)=>{const png=Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64');assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[width,height]);await writeFile('dist/'+name,png);};
 const fresh=async(seed,width,height)=>{
  if(!(await snapshot()).menu){await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'PR49 MENU');}
  setSeed(seed);await clickControl('NOWA GRA');await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(100);
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.invulnerableUntil=Infinity;a.spawnDueAt=null;})()");
 };
 for(const [seed,width,height] of [[1,568,320],[41,800,360],[104729,320,240]]){
  await fresh(seed,width,height);
  // Natural intervals use the actual monotonic gameplay clock; only long deadlines are staged.
  const before=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");await sleep(320);
  assert.ok(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs")>before+200);
  await evaluate("window.dispatchEvent(new Event('blur'));true");const blurred=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");await sleep(180);assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),blurred);await evaluate("window.dispatchEvent(new Event('focus'));true");
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');while(a.enemies.length<4)a.spawnReplacement();window.__oldWaveActors=[...a.enemies];window.__setActiveTime(34950)})()");
  await wait("window.__game.scene.getScene('Arena').episode.wave===1",'natural35s boundary');
  assert.equal(await evaluate("window.__oldWaveActors.every(e=>window.__game.scene.getScene('Arena').enemies.includes(e)&&!e.dead&&e.hp===3&&e.waveIndex===0)"),true,'Time boundary removed/reset survivors');
  await wait("window.__game.scene.getScene('Arena').dialogueState.id==='before-first-bocianolak'",'prompt first Bocianołak');
  const frozen=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");await sleep(220);assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),frozen);
  assert.equal(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.physics.world.isPaused&&!a.joystick.enabled&&!a.aimJoystick.enabled&&a.enemies.filter(e=>!e.dead).length===a.episode.spawnedByWave.reduce((n,v)=>n+v,0)&&a.enemies.length<=7})()"),true);
  if(seed===1){await clickControl('hud');await sleep(200);assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),frozen);await clickControl('WZNÓW');assert.equal(await evaluate("window.__game.scene.getScene('Arena').physics.world.isPaused"),true);}
  for(let i=0;i<3;i++)await nextLine();
  await evaluate('window.__setActiveTime(74950);true');await wait("window.__game.scene.getScene('Arena').episode.wave===2",'natural75s boundary');
  await wait("window.__game.scene.getScene('Arena').dialogueState.id==='before-first-zubrokryptyda'",'prompt first heavy');
  assert.equal(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.enemies.filter(e=>!e.dead).length===a.episode.spawnedByWave.reduce((n,v)=>n+v,0)&&a.enemies.length<=8})()"),true);
  for(let i=0;i<2;i++)await nextLine();
  const overlap=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {spawns:[...a.episode.spawnedByWave],origins:a.enemies.map(e=>e.waveIndex).sort(),types:[...new Set(a.enemies.map(e=>e.type))].sort(),rifle:a.pickups.filter(p=>p.id==='rifle').length,health:a.pickups.filter(p=>p.id==='health').length,wave:a.waveText.text,kills:a.kills}})()");
  assert.ok(overlap.spawns[0]>=4);assert.ok(overlap.spawns[1]>=1&&overlap.spawns[2]>=1);assert.deepEqual(overlap.spawns.slice(3),[0,0,0]);assert.deepEqual(overlap.origins,overlap.spawns.flatMap((count,wave)=>Array(count).fill(wave)));
  assert.ok(overlap.spawns.reduce((n,v)=>n+v,0)<=8); assert.deepEqual(overlap.types,['bobrozombi','bocianolak','zubrokryptyda']);assert.equal(overlap.rifle,1);assert.equal(overlap.health,1);assert.equal(overlap.kills,0);assert.equal(overlap.wave,'⚑ 3/6');
  // Staged arrived actors make the mixed-species diagnostic readable at native scale.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');window.__mixSaved=[];for(const [i,type] of ['bobrozombi','bocianolak','zubrokryptyda'].entries()){const e=a.enemies.find(e=>e.type===type);window.__mixSaved.push([e,e.x,e.y]);e.x=830+i*80;e.y=630;a.enemyRenderers[type].update(e,a.player);}a.player.body.reset(900,650);a.cameras.main.stopFollow().setZoom(1).centerOn(900,520)})()");await sleep(70);await shot('pr49-mix-'+seed+'-'+width+'x'+height+'.png',width,height);
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const [e,x,y] of window.__mixSaved){e.x=x;e.y=y;a.enemyRenderers[e.type].update(e,a.player);}window.__mixSaved=null;window.__setActiveTime(225000)})()");
  await wait("window.__game.scene.getScene('Arena').episode.wave===5",'large jump across120/170/225s');
  const jump=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {spawns:a.episode.spawnedByWave,rifle:a.pickups.filter(p=>p.id==='rifle').length,flame:a.pickups.filter(p=>p.id==='flamethrower').length,hearts:a.pickups.filter(p=>p.id==='health').length,kills:a.kills,live:a.enemies.filter(e=>!e.dead).length}})()");
  assert.deepEqual(jump.spawns,overlap.spawns);assert.equal(jump.rifle,1);assert.equal(jump.flame,1);assert.equal(jump.hearts,3);assert.equal(jump.kills,0);assert.equal(jump.live,overlap.spawns.reduce((n,v)=>n+v,0));
  await sleep(120);assert.equal(await evaluate("window.__game.scene.getScene('Arena').pickups.filter(p=>p.id==='health').length"),3,'Boundary rewards repeated');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(let i=0;i<20&&a.livingNonBoss()<9;i++)a.spawnReplacement();window.__setActiveTime(259000)})()");
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').livingNonBoss()"),9);assert.equal(await evaluate("window.__game.scene.getScene('Arena').enemies.filter(e=>!e.dead&&e.type==='zubrokryptyda'&&!e.encounterId).length"),1);
  await sleep(80);assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.bossIntroduced"),false);
  await evaluate('window.__setActiveTime(260000);true');await wait("window.__game.scene.getScene('Arena').dialogueState.id==='before-marcin'",'time-only Marcin trigger');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').kills"),0);assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialoguePanel.text.text"),'Taki jesteś?! Czekaj aż zawołam Marcina');await nextLine();assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialoguePanel.text.text"),'Marcin! Maaaarciiin!');await nextLine();
  assert.equal(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.bossEntrancePending&&!a.bossEntrance&&!a.boss&&a.livingNonBoss()===9&&!a.physics.world.isPaused&&a.joystick.enabled})()"),true,'Crowded landing must retain survivors and allow combat');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies.filter(e=>e.type==='bobrozombi'&&!e.dead).slice(0,2)){a.damageEnemy(e,100,a.player,a.time.now);a.finalizeEnemyDeath(e);}})()");
  await wait("!!window.__game.scene.getScene('Arena').boss&&!window.__game.scene.getScene('Arena').bossEntrance",'landing after capacity released');
  const landed=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.boss.attack.elapsed=-100000;return {live:a.livingNonBoss(),total:a.enemies.filter(e=>!e.dead).length,kills:a.kills}})()");assert.deepEqual(landed,{live:7,total:8,kills:2});
  const pools=await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');a.firstBocianolakHit=true;let max=0;
   for(let i=0;i<160;i++){
    if(a.episode.reinforcementSpawned.size===12&&a.escortDue.length===0&&a.episode.bossIntroduced)break;
    const victim=a.enemies.find(e=>!e.dead&&e.type!=='marcin');if(victim){victim.hp=0;a.finalizeEnemyDeath(victim);}
    a.enemies=a.enemies.filter(e=>!e.dead);a.spawnBossSlot(a.time.now+100000+i*380);max=Math.max(max,a.livingNonBoss());
   }
   return {max,escorts:a.episode.specialSpawned.size,reinf:a.episode.reinforcementSpawned.size,ordinary:a.episode.spawnedByWave[5],state:a.episode.state,kills:a.kills};})()`);
  assert.ok(pools.max<=7);assert.equal(pools.escorts,3);assert.equal(pools.reinf,12);assert.ok(pools.ordinary>=jump.spawns[5]);assert.equal(pools.state,'active');
  const fatal=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),boss=a.boss,before=a.kills,live=a.livingNonBoss();boss.hp=0;a.finalizeEnemyDeath(boss);return {before,kills:a.kills,live,state:a.episode.state,remaining:a.enemies.filter(e=>!e.dead).length,queued:a.escortDue.length+a.reinforcementDue.length,shots:a.bossProjectiles.length,bursts:a.deathBursts.length,hud:a.killsText.text}})()");
  assert.equal(fatal.kills,fatal.before+1);assert.equal(fatal.state,'boss-resolving');assert.equal(fatal.remaining,0);assert.equal(fatal.queued,0);assert.equal(fatal.shots,0);assert.ok(fatal.bursts>=fatal.live+1);assert.equal(fatal.hud,String(fatal.kills));
  await shot('pr49-victory-resolution-'+seed+'-'+width+'x'+height+'.png',width,height);
  await wait("window.__game.scene.getScene('Arena').dialogueState.id==='after-final-enemy'",'PR48 cinematic finale');assert.equal(await evaluate("window.__game.scene.getScene('Arena').deathBursts.length"),0);
  await shot('pr49-epilogue-'+seed+'-'+width+'x'+height+'.png',width,height);
  for(let i=0;i<3;i++){assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.ended"),false);await nextLine();}
  await waitFor(v=>v.menu&&v.arenaPaused,'PR49 victory');assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'victory');assert.equal(await evaluate("window.__game.scene.getScene('Arena').kills"),fatal.kills);
  console.log('PASS PR49 seed '+seed+' '+width+'x'+height+': natural active clock/paused blur and dialogues,35/75s intros and overlap,120/170/225 jump/rewards,9 survivors preserved at260s,7-cap handoff,14 specials, truthful PR48 victory '+fatal.hud);
 }
 await fresh(1,568,320);
 const reset=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {wave:a.episode.wave,boss:a.episode.bossIntroduced,kills:a.kills,pickups:a.pickups.map(p=>p.id)}})()");assert.deepEqual(reset,{wave:0,boss:false,kills:0,pickups:['blunderbuss']});
 // A full current-wave cap must retain an owed intro rather than fabricate an extra specimen.
 await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies)e.sprite.destroy();a.enemies=[];window.__stageTimedWave(1);for(let i=0;i<7;i++)a.enemies.push(a.createEnemy('bobrozombi',{x:700+i*50,y:600},4900+i));a.narrativeEvents.add('before-first-bocianolak');a.spawnDueAt=null;a.spawnReplacement();})()");
 assert.equal(await evaluate("window.__game.scene.getScene('Arena').enemies.length"),7);assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null);
 await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=a.enemies[0];e.hp=0;a.finalizeEnemyDeath(e);a.enemies=a.enemies.filter(e=>!e.dead);a.spawnReplacement()})()");
 assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'before-first-bocianolak');assert.equal(await evaluate("window.__game.scene.getScene('Arena').enemies.filter(e=>!e.dead).length"),7);
 for(let i=0;i<3;i++)await nextLine();console.log('PASS PR49 full-cap introduction priority, no duplicate/over-cap actor, NEW GAME clears timed state');
}
