import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

export async function measureOpening({cdp,evaluate,sleep,snapshot,waitFor,clickControl,nextLine,click,label='after',verify=true,seeds=[1,41,104729]}){
 const metrics=[];
 for(const seed of seeds)for(const [width,height] of [[568,320],[800,360],[320,240]]){
  if(!(await snapshot()).menu){await clickControl('hud');await waitFor(s=>s.menu,'PR50 menu');}
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await evaluate(`window.__game.scale.refresh();history.replaceState(null,'','?arenaSeed=${seed}');true`);await sleep(90);
  const s=await snapshot(),b=s.actions.find(a=>a.label==='NOWA GRA');await click(s.rect.x+b.x,s.rect.y+b.y);
  for(let i=0;i<100;i++){if(await evaluate("window.__game.scene.getScene('Arena').dialogueState?.id==='before-wave-1'"))break;await sleep(40);}
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'before-wave-1');
  const frozen=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {hp:a.playerHp,actors:a.enemies.map(e=>({x:e.x,y:e.y})),clock:a.elapsedGameplayMs}})()");await sleep(150);
  assert.deepEqual(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {hp:a.playerHp,actors:a.enemies.map(e=>({x:e.x,y:e.y})),clock:a.elapsedGameplayMs}})()"),frozen);
  assert.equal(frozen.actors.length,3,'Do not duplicate the initial trio');
  await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');window.__pacing={initial:a.enemies.map(e=>({x:e.x,y:e.y,distance:Math.hypot(e.x-a.player.x,e.y-a.player.y)})),firstVisibleMs:null,twoVisibleMs:null,threatMs:null,maxLive:0,maxVisible:0,samples:{},frames:0,totalFrameMs:0,maxFrameMs:0};
   const observe=()=>{if(a.dialogueState.id||a.physics.world.isPaused||a.scene.isPaused())return;const m=window.__pacing,t=a.elapsedGameplayMs,v=a.cameras.main.worldView,alive=a.enemies.filter(e=>!e.dead&&e.hp>0);
    const visible=alive.filter(e=>{const art=e.sprite.getData(e.type+'-art')||e.sprite,b=art.getBounds();return Math.min(b.right,v.right)-Math.max(b.x,v.x)>=8&&Math.min(b.bottom,v.bottom)-Math.max(b.y,v.y)>=8;});
    if(visible.length&&m.firstVisibleMs===null)m.firstVisibleMs=t;if(visible.length>=2&&m.twoVisibleMs===null)m.twoVisibleMs=t;
    if(alive.some(e=>Math.hypot(e.x-a.player.x,e.y-a.player.y)<=160)&&m.threatMs===null)m.threatMs=t;
    m.maxLive=Math.max(m.maxLive,alive.length);m.maxVisible=Math.max(m.maxVisible,visible.length);m.frames++;m.totalFrameMs+=a.game.loop.delta;m.maxFrameMs=Math.max(m.maxFrameMs,a.game.loop.delta);
    for(const deadline of [0,500,1000,3000,6000,10000])if(t>=deadline&&!m.samples[deadline])m.samples[deadline]={live:alive.length,visible:visible.length,hp:a.playerHp};
   };a.game.events.on('step',observe);window.__pacingStop=()=>a.game.events.off('step',observe);
   // Measurement-only protection lets the stationary observer collect10s of density;
   // production invulnerability and contact rules are unchanged.
   a.invulnerableUntil=Infinity;})()`);
  for(let i=0;i<3;i++)await nextLine();
  const screenshot=async suffix=>{const png=Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64');assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[width,height]);await writeFile(`dist/pr50-${label}-${seed}-${width}x${height}-${suffix}.png`,png);};
  await screenshot('opening');await sleep(450);await screenshot('first-second');
  for(let i=0;i<140;i++){if(await evaluate('window.__pacing.samples[10000]!==undefined'))break;await sleep(80);}
  const result=await evaluate("(()=>{window.__pacingStop();const a=window.__game.scene.getScene('Arena');return {...window.__pacing,diagnostics:a.spawnDiagnostics??null,clock:a.elapsedGameplayMs,view:{x:a.cameras.main.worldView.x,y:a.cameras.main.worldView.y,width:a.cameras.main.worldView.width,height:a.cameras.main.worldView.height},seed:a.arenaSeed}})()");
  assert.equal(result.seed,seed);assert.ok(result.initial.every(p=>p.distance>=220));assert.ok(result.samples[10000],'Natural observation interval incomplete');
  if(verify){assert.ok(result.twoVisibleMs!==null&&result.twoVisibleMs<=1000,'Opening pressure '+JSON.stringify(result));assert.ok(result.maxLive<=6&&result.maxLive>=3);}
  metrics.push({label,seed,width,height,...result});console.log('INFO PR50 opening '+JSON.stringify(metrics.at(-1)));
 }
 await writeFile(`dist/pr50-${label}-metrics.json`,JSON.stringify(metrics,null,2)+'\n');
 console.log(`PASS PR50 ${label} opening:${metrics.length} real-camera seed/viewport cases; dialogue freeze, three safe initial actors, natural10s visibility/density measurements`);
 return metrics;
}

export async function verifySpawnPacing(context){
 await measureOpening(context);
 const {cdp,evaluate,sleep,snapshot,waitFor,clickControl}=context;
 const caps=[];
 for(let wave=0;wave<6;wave++){
  const result=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies){e.burningFx?.destroy();e.sprite.destroy();}a.enemies=[];window.__stageTimedWave(${wave});a.spawnDueAt=null;a.invulnerableUntil=Infinity;
   a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');a.firstBocianolakHit=true;
   const {WAVES}=await import('/klusoczlek/src/episode.js');
   // An older-wave survivor consumes a current-wave slot, regardless of origin.
   a.spawnReplacement();a.enemies[0].waveIndex=0;window.__survivor=a.enemies[0];
   for(let i=0;i<12;i++)a.spawnReplacement();const count=a.livingNonBoss(),spawned=a.episode.spawned;a.spawnReplacement();
   return {wave:${wave},cap:WAVES[${wave}].maxAlive,live:count,unchanged:a.episode.spawned===spawned,survivor:a.enemies.includes(window.__survivor),heavy:a.enemies.filter(e=>!e.dead&&e.type==='zubrokryptyda').length,diagnostics:{...a.spawnDiagnostics}};})()`);
  assert.equal(result.live,result.cap);assert.equal(result.unchanged,true);assert.equal(result.survivor,true);assert.ok(result.heavy<=1);caps.push(result);
  await sleep(500);
  const visible=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),v=a.cameras.main.worldView;return a.enemies.filter(e=>!e.dead&&e.x>=v.x-35&&e.x<=v.right+35&&e.y>=v.y-35&&e.y<=v.bottom+50).length})()");
  console.log('INFO PR50 wave density '+JSON.stringify({...result,visibleAfter500ms:visible}));
 }
 assert.deepEqual(caps.map(x=>x.cap),[6,7,8,9,9,10]);
 // One ordinary attempt per deadline, even after a paused interval. Observe real
 // Phaser times and actual actors, not merely the exported constant.
 await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies)e.sprite.destroy();a.enemies=[];window.__stageTimedWave(0);a.spawnDueAt=null;for(let i=0;i<3;i++)a.spawnReplacement();a.encounterDirector.nextMs=a.elapsedGameplayMs+450;window.__cadence={start:a.time.now,count:3,arrivals:[],maxDelta:0,maxBatch:0};const f=()=>{const m=window.__cadence;m.maxDelta=Math.max(m.maxDelta,a.game.loop.delta);const n=a.episode.spawned;if(n!==m.count){m.maxBatch=Math.max(m.maxBatch,n-m.count);m.arrivals.push(a.time.now-m.start);m.count=n;}};a.game.events.on('step',f);window.__cadenceStop=()=>a.game.events.off('step',f);})()");
 for(let i=0;i<100;i++){if(await evaluate('window.__cadence.arrivals.length===2'))break;await sleep(20);}
 const cadence=await evaluate('(()=>{window.__cadenceStop();return window.__cadence})()');assert.equal(cadence.arrivals.length,2);assert.equal(cadence.maxBatch,1);
 assert.ok(cadence.arrivals[0]>=350);assert.ok(cadence.arrivals[1]-cadence.arrivals[0]>=300);
 await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const e=a.enemies.find(e=>e.type==='bobrozombi');e.hp=0;a.finalizeEnemyDeath(e);a.enemies=a.enemies.filter(e=>!e.dead);})()");
 await clickControl('hud');const paused=await evaluate("window.__game.scene.getScene('Arena').episode.spawned");await sleep(450);assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.spawned"),paused);
 await clickControl('WZNÓW');await sleep(350);assert.ok(await evaluate("window.__game.scene.getScene('Arena').episode.spawned")<=paused+1);
 const beforeBlur=await evaluate("window.__game.scene.getScene('Arena').episode.spawned");await evaluate("window.dispatchEvent(new Event('blur'));true");await sleep(350);assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.spawned"),beforeBlur);await evaluate("window.dispatchEvent(new Event('focus'));true");
 await cdp('Emulation.setDeviceMetricsOverride',{width:240,height:320,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(350);assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.spawned"),beforeBlur);
 await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:240,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();window.dispatchEvent(new Event("focus"));true');await sleep(350);
 assert.ok(await evaluate("window.__game.scene.getScene('Arena').livingNonBoss()")<=6);
 console.log('PASS PR50 real ordinary caps6/7/8/9/9/10, old survivors counted, one ordinary heavy, measured gameplay-clock cadence '+JSON.stringify(cadence)+'; MENU/focus/orientation no duplicate or burst');
}
