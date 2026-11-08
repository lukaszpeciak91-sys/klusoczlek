import {spawn} from 'node:child_process';
import {access,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {DEBUG_CHECKPOINTS} from '../src/debug-checkpoints.js';
import {MARCIN_MOHAWK_ID} from '../src/campaign-run.js';

const started=Date.now(),port=5191,debugPort=9231;
const url=`http://127.0.0.1:${port}/klusoczlek/tests/browser-lifecycle.html`;
let binary;
for(const path of [process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']){
 if(!path)continue;try{await access(path);binary=path;break;}catch{}
}
assert.ok(binary,'Real Chromium executable required');
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
const profile=await mkdtemp(join(tmpdir(),'klusoczlek-smoke-'));
let chrome,socket;
try{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(100);}
 assert.ok(ready,'Vite did not start');
 chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+debugPort,'--user-data-dir='+profile,url],{stdio:'ignore'});
 let tab;
 for(let i=0;i<150;i++){try{tab=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'&&t.url.includes('browser-lifecycle'));if(tab?.webSocketDebuggerUrl)break;}catch{}await sleep(100);}
 assert.ok(tab?.webSocketDebuggerUrl,'Chromium CDP unavailable');
 socket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
 let serial=0;const exceptions=[];
 const cdp=(method,params={})=>new Promise((ok,fail)=>{
  const id=++serial;const timer=setTimeout(()=>{socket.removeEventListener('message',receive);fail(Error('CDP timeout: '+method));},12000);
  function receive(event){const m=JSON.parse(event.data);if(m.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',receive);m.error?fail(Error(JSON.stringify(m.error))):ok(m.result);}
  socket.addEventListener('message',receive);socket.send(JSON.stringify({id,method,params}));
 });
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);});
 await cdp('Runtime.enable');
 await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:3});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 const wait=async(expression,label,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(error){if(!/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(String(error)))throw error;}await sleep(80);}throw Error('Timeout '+label);};
 const touch=async(x,y)=>{await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 const geometry=()=>evaluate("(()=>{const g=window.__game,m=g.scene.getScene('Menu'),r=g.canvas.getBoundingClientRect();return {rect:{x:r.x,y:r.y},active:g.scene.isActive('Menu'),debug:m.debugOpen,buttons:m.children.list.filter(o=>o.type==='Text'&&o.visible&&['NOWA GRA','DEBUG','WZNÓW','WRÓĆ'].includes(o.text)).map(o=>({text:o.text,x:o.x,y:o.y}))}})()");
 const tapMenu=async label=>{const g=await geometry();const b=g.buttons.find(b=>b.text===label);assert.ok(b,'Missing '+label+' '+JSON.stringify(g));await touch(g.rect.x+b.x,g.rect.y+b.y);};
 await wait("window.__game?.scene.isActive('Menu')",'menu boot');
 const menu=await geometry();assert.ok(menu.buttons.some(b=>b.text==='NOWA GRA')&&menu.buttons.some(b=>b.text==='DEBUG'),'menu buttons');
 await tapMenu('NOWA GRA');
 await wait("window.__game.scene.isActive('ActTitle')",'NOWA GRA -> Act I title',3000);
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'saved menu reload');
 assert.ok((await geometry()).buttons.some(b=>b.text==='WZNÓW'),'WZNÓW available with saved campaign');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('ActTitle')",'WZNÓW restores Act I title',3000);
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before DEBUG');
 await tapMenu('DEBUG');
 assert.equal((await geometry()).debug,true,'DEBUG opens');
 await sleep(330);
 assert.equal(await evaluate("window.__game.scene.isActive('Menu')"),true,'opening DEBUG cannot select checkpoint');
 // Scroll using actual touch gestures; locate checkpoint by its configured label,
 // not by index, count, or a hard-coded screen coordinate.
 const target=DEBUG_CHECKPOINTS.find(c=>c.id==='act2-results');
 assert.ok(target,'Act II results fixture required for implemented handoff');
 const locate=()=>evaluate(`(()=>{const m=window.__game.scene.getScene('Menu'),r=window.__game.canvas.getBoundingClientRect(),o=m.children.list.find(o=>o.type==='Text'&&o.visible&&o.text===${JSON.stringify(target.label)});return o?{x:r.x+o.x,y:r.y+o.y}:null})()`);
 let point=await locate();
 for(let k=0;k<15&&!point;k++){
  const r=await evaluate("(()=>{const r=window.__game.canvas.getBoundingClientRect();return {x:r.x+r.width/2,top:r.y+r.height*.28,bottom:r.y+r.height*.73}})()");
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.bottom,id:2}]});
  for(let j=1;j<=5;j++)await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.bottom+(r.top-r.bottom)*j/5,id:2}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(80);point=await locate();
 }
 assert.ok(point,'DEBUG checkpoint scroll did not reveal '+target.id);
 await touch(point.x,point.y);
 await wait("window.__game.scene.isActive('Airship')",'DEBUG Act II results checkpoint');
 await wait("window.__game.scene.getScene('Airship').dialogueState?.id==='act2-finale'",'Act II finale',12000);
 for(let k=0;k<12;k++){
  const state=await evaluate("(()=>{const a=window.__game.scene.getScene('Airship'),r=window.__game.canvas.getBoundingClientRect();return {id:a.dialogueState?.id,final:a.finalResultsPending,active:a.dialoguePanel?.active,x:r.x+a.dialoguePanel.button.x,y:r.y+a.dialoguePanel.button.y}})()");
  if(state.final)break;
  assert.equal(state.id,'act2-finale','finale remains active');
  await sleep(230);await touch(state.x,state.y);
 }
 await wait("window.__game.scene.getScene('Airship').resultOverlay.visible",'final results');
 const before=await evaluate("(()=>{const a=window.__game.scene.getScene('Airship'),r=a.campaignRun;return {visible:a.resultOverlay.visible,pending:a.finalResultsPending,armed:a.resultsArmedAt,now:a.game.loop.time,started:a.act2TransitionStarted,result:a.defense.result,act:r.actId,completed:[...r.completedActs],artifacts:[...r.artifacts],hp:r.hp,maxHp:r.maxHp,weapons:[...r.unlockedWeapons],selected:r.selectedWeapon,kills:r.stats.kills,time:r.stats.activeCombatMs,registered:Object.keys(a.scene.manager.keys),x:a.resultsButton.x,y:a.resultsButton.y}})()");
 assert.ok(before.visible&&before.pending&&!before.started&&before.registered.includes('Volcano')&&before.registered.includes('ActTitle'),'Act II pre-handoff state '+JSON.stringify(before));
 assert.ok(before.artifacts.includes(MARCIN_MOHAWK_ID),'Act I mohawk preserved');
 while(await evaluate("window.__game.loop.time<window.__game.scene.getScene('Airship').resultsArmedAt"))await sleep(40);
 const rect=await evaluate("(()=>{const r=window.__game.canvas.getBoundingClientRect();return {x:r.x,y:r.y}})()");
 await touch(rect.x+before.x,rect.y+before.y);
 await wait("window.__game.scene.isActive('ActTitle')",'Act II DALEJ -> Act III title',3500);
 const after=await evaluate("(()=>{const r=window.__game.registry.get('campaign-run');return {act:r.actId,completed:[...r.completedActs],artifacts:[...r.artifacts],hp:r.hp,maxHp:r.maxHp,weapons:[...r.unlockedWeapons],selected:r.selectedWeapon,kills:r.stats.kills,time:r.stats.activeCombatMs,act2:r.stats.byAct.act2}})()");
 assert.ok(after.completed.includes('act2')&&after.completed.filter(x=>x==='act2').length===1,'Act II completion once');
 assert.ok(before.artifacts.every(artifact=>after.artifacts.includes(artifact)),
  'Campaign handoff must preserve every previously acquired artifact');
 assert.deepEqual(after.weapons,before.weapons,'equipment preserved');
 assert.equal(after.hp,before.hp,'HP preserved');
 assert.equal(after.selected,before.selected,'selected weapon preserved');
 assert.equal(after.kills,before.kills+before.result.kills,'kills accumulated once');
 assert.equal(after.time,before.time+before.result.activeCombatMs,'time accumulated once');
 await wait("window.__game.scene.isActive('Volcano')",'Act III title -> Volcano',6000);
 assert.equal(await evaluate("window.__game.scene.isActive('Menu')"),false,'no unexpected Menu');
 // DEBUG fixtures are intentionally not persisted as campaign saves.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'saved menu after DEBUG');
 assert.ok((await geometry()).buttons.some(b=>b.text==='WZNÓW'),'real saved WZNÓW survives DEBUG');

 // PR104: exercise the REAL new Phaser scene, not just a pure school contract.
 await tapMenu('DEBUG');
 await sleep(300);
 const schoolTarget=DEBUG_CHECKPOINTS.find(c=>c.id==='act4-opening');
 assert.ok(schoolTarget,'Act IV opening checkpoint missing');
 const locateSchool=()=>evaluate(`(()=>{const m=window.__game.scene.getScene('Menu'),r=window.__game.canvas.getBoundingClientRect(),o=m.children.list.find(o=>o.type==='Text'&&o.visible&&o.text===${JSON.stringify(schoolTarget.label)});return o?{x:r.x+o.x,y:r.y+o.y}:null})()`);
 let schoolPoint=await locateSchool();
 for(let k=0;k<25&&!schoolPoint;k++){
   const r=await evaluate("(()=>{const r=window.__game.canvas.getBoundingClientRect();return {x:r.x+r.width/2,top:r.y+r.height*.28,bottom:r.y+r.height*.73}})()");
   await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.bottom,id:2}]});
   for(let j=1;j<=5;j++)await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.bottom+(r.top-r.bottom)*j/5,id:2}]});
   await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await sleep(70);schoolPoint=await locateSchool();
 }
 assert.ok(schoolPoint,'DEBUG checkpoint scroll did not reach Act IV opening');
 await touch(schoolPoint.x,schoolPoint.y);
 await wait("window.__game.scene.isActive('ActTitle')",'Act IV title',3200);
 try{
   await wait("window.__game.scene.isActive('School')",'Act IV school scene',6000);
 }catch(error){
   const diagnostic=await evaluate("(()=>{const g=window.__game;return {scenes:Object.keys(g.scene.keys).map(id=>({id,active:g.scene.isActive(id),paused:g.scene.isPaused(id)})),act:g.registry.get('campaign-run')?.actId}})()");
   throw new Error(error.message+' '+JSON.stringify({diagnostic,exceptions}));
 }
 const schoolState=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=s.run;return {act:r.actId,selected:r.selectedWeapon,owned:[...r.unlockedWeapons],artifacts:[...r.artifacts],player:{x:s.player.x,y:s.player.y},obstacles:s.obstacles.map(o=>o.id),w:s.physics.world.bounds.width,h:s.physics.world.bounds.height}})()");
 assert.equal(schoolState.act,'act4','DEBUG handoff reached Act IV');
 assert.notEqual(schoolState.selected,'water-flamethrower','water is Act III-only');
 assert.ok(schoolState.owned.includes('water-flamethrower'),'water history retained');
 assert.ok(schoolState.artifacts.includes('bogdan-hunting-horn'),'horn inherited');
 assert.deepEqual(schoolState.obstacles,['chapel','school','bicycleRack','school-tire-pile','school-toi-toi']);
 assert.deepEqual([schoolState.w,schoolState.h],[1800,1200]);
 await wait("!window.__game.scene.getScene('School').introActive",'Captain enters chapel',8000);
 const schoolMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(schoolMenu.x,schoolMenu.y);
 await wait("window.__game.scene.isActive('Menu')",'Act IV MENU button',3000);
 assert.equal(await evaluate("window.__game.scene.isPaused('School')"),true);
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'Act IV in-memory WZNÓW',3000);
 // PR105: real SchoolScene interaction, not just imports/unit assertions.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before School gameplay');
 const bootSchool=async id=>evaluate(`(()=>{
   const g=window.__game,m=g.scene.getScene('Menu');
   const fixture=window.__createDebugFixture(${JSON.stringify(id)});
   fixture.run.isDebugRun=true;g.registry.set('campaign-run',fixture.run);
   m.scene.start('School',{handoff:fixture.handoff,debugCheckpoint:${JSON.stringify(id)}});
   return true;
 })()`);
 const dialogueNext=async()=>{await sleep(230);const pt=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.dialoguePanel.button,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+b.x,y:r.y+b.y,visible:b.visible,id:s.dialogueState.id}})()");assert.ok(pt.visible,'approved DALEJ available '+JSON.stringify(pt));await touch(pt.x,pt.y);};
 const verifyPanel=async(id,index,phrase)=>{
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,index:s.dialogueState.index,text:s.dialoguePanel.text.text,started:s.combat.started,bullets:s.combat.projectiles.length,alive:s.combat.enemies.length,clock:s.combat.elapsedMs,boss:s.blazej.active,enabled:s.joystick.enabled,bubble:s.ambientBarks.pool.some(p=>p.root.visible)}})()");
  assert.equal(p.id,id,'correct narrative beat '+JSON.stringify(p));
  assert.equal(p.index,index,'DALEJ advances exactly one panel');
  assert.equal(p.text,phrase,'approved literal panel');
  assert.equal(p.started,false,'waves cannot start before confrontation');
  assert.equal(p.bullets,0,'no attacks during dialogue');
  assert.equal(p.alive,0,'no ordinary enemies during dialogue');
  assert.equal(p.clock,0,'no background/dialogue combat time');
  assert.equal(p.boss,false,'boss passive during opening');
  assert.equal(p.enabled,false,'movement disabled while dialogue visible');
  assert.equal(p.bubble,false,'speech bubbles suppressed during dialogue');
  await dialogueNext();
 };
 await bootSchool('act4-opening');
 await wait("window.__game.scene.isActive('School')",'School scene starts');
 const schoolIntro=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {intro:s.introActive,started:s.combat.started,enemies:s.combat.enemies.length,weapon:s.weapon,hp:s.run.hp}})()");
 assert.ok(schoolIntro.intro&&!schoolIntro.started&&schoolIntro.enemies===0,'no enemies during Captain cinematic '+JSON.stringify(schoolIntro));
 await wait("(()=>{const s=window.__game.scene.getScene('School');return !s.introActive&&!s.dialogueState.id&&!s.combat.started})()",'Captain enters chapel; player free to explore schoolyard',25000);
 const optionalBefore=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {intro:s.introActive,started:s.combat.started,maciek:s.maciekSeen,pitch:s.pitchStarted,actors:s.maciekSebaActors?.length}})()");
 assert.deepEqual(optionalBefore,{intro:false,started:false,maciek:false,pitch:false,actors:2},'both NPCs staged, optional encounter not automatic');
 const approachMaciek=await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(695,620);s.player.body.reset(695,620);return true})()");
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-maciek-seba'",'optional dialogue on actual approach',4000);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return ['bobrozombi','bocianolak','zubrokryptyda'].every(k=>s.dialoguePanel.loaded.has(k))})()",'original three character portraits load',10000);
 const first=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {captain:s.captainArrival.actor?.active??false,active:s.combat.started,phase:s.schoolPhase,boss:s.blazej.active}})()");
 assert.deepEqual(first,{captain:false,active:false,phase:'INTRO',boss:false});
 const maciek=[
  'Najpierw Marcin...potem Bogdan...\no co chodzi temu Kłusoczłeku?',
  'I w ogóle Sebuś, czemu Kłusoczłek,\nże kłusuje jak koń?',
  'Ty to Maciek jednak głupi jesteś...\nA to nie jest czasem on? Do ataku!'
 ];
 for(let i=0;i<maciek.length;i++)await verifyPanel('act4-maciek-seba',i,maciek[i]);
 const optionalDone=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,started:s.combat.started,seen:s.maciekSeen}})()");
 assert.deepEqual(optionalDone,{id:null,started:false,seen:true},'Maciek/Seba once and no automatic combat');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1065,870);s.player.body.reset(1065,870);return true})()");
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-blazej-observer'",'pitch observer exchange after optional encounter',4000);
 for(const [i,line] of ['...i ja wtedy normalnie od razu','Ty to jednak Błażej jesteś gość'].entries())
  await verifyPanel('act4-blazej-observer',i,line);
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-blazej-confrontation'",'five-panel bike confrontation before waves');
 const prewaves=[
  'Kazał pan, musiał sam!',
  'Nie wiem kim jesteś ale mam ochotę Cię rozgnieść',
  'Potrzebuję na chwilę Twojego roweru, dasz się karnąć?',
  'Nie, bo ja się boję, że mi stracisz.\nPoza tym uczciwie ukradłem\ni nie mam zamiaru oddawać',
  'Zostaw mój rower, ty kutwo!\nChłopaki, na niego!'
 ];
 for(let i=0;i<prewaves.length;i++)await verifyPanel('act4-blazej-confrontation',i,prewaves[i]);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.combat.started&&s.schoolPhase==='COMBAT'&&!s.dialogueState.id})()",'waves start only after fifth confrontation panel',4000);
 console.log('PASS Act IV Chromium opening: Captain at chapel, optional Maciek/Seba 3, pitch observer 2, confrontation 5; combat only after approved DALEJ');
 await wait("window.__game.scene.getScene('School').combat.enemies.length>0",'School wave1 spawns',10000);
 const school=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {wave:s.combat.wave,count:s.combat.enemies.length,state:s.schoolPhase,weapon:s.weapon,owned:[...s.run.unlockedWeapons],hp:s.run.hp}})()");
 assert.equal(school.wave,0);assert.ok(school.count<=6&&school.count>0,'wave1 cap');
 assert.equal(school.owned.includes('water-flamethrower'),true);
 assert.notEqual(school.weapon,'water-flamethrower');
 // Actual right-stick touch: a rifle shot must exist in the live School scene.
 const stick=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.aimJoystick.base.x,y:r.y+s.aimJoystick.base.y,r:s.hudLayout.joystickRadius}})()");
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x,y:stick.y,id:23}]});
 await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x+stick.r*.85,y:stick.y,id:23}]});
 await wait("window.__game.scene.getScene('School').combat.projectiles.length>0",'School real touch firing',3000);
 await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const pausePoint=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(pausePoint.x,pausePoint.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'School MENU pause');
 const enemiesBeforeResume=await evaluate("window.__game.scene.getScene('School').combat.enemies.length");
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'School WZNÓW resume');
 assert.equal(await evaluate("window.__game.scene.getScene('School').combat.enemies.length"),enemiesBeforeResume,'no duplicate enemies on resume');
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before wave4 DEBUG');
 await bootSchool('act4-wave4');
 await wait("(()=>{const s=window.__game?.scene.getScene('School');return s?.combat?.started&&s.combat.wave===3})()",'School wave4 DEBUG checkpoint');
 const wave4=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {wave:s.combat.wave,elapsed:s.combat.elapsedMs,water:s.weapon==='water-flamethrower',act:s.run.actId,phase:s.schoolPhase}})()");
 assert.equal(wave4.wave,3);assert.ok(wave4.elapsed>=120000);
 assert.equal(wave4.water,false);assert.equal(wave4.act,'act4');
 // R2: real approved enemy sheets, eight directions and gait (not procedural stand-ins).
 await wait("(()=>{const s=window.__game.scene.getScene('School');return Object.values(s.combat.renderers).every(r=>r.loaded)})()",'all three approved School sheets',9000);
 const sheets=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),types=['bobrozombi','bocianolak','zubrokryptyda'];return types.map(type=>{const r=s.combat.renderers[type],p=s.cameras.main.getWorldPoint(s.scale.width/2,s.scale.height*.65),sprite=r.create(p.x,p.y),e={type,x:p.x,y:p.y,seed:7,facing:'s',sprite},frames=new Set();for(let i=0;i<8;i++){const a=i*Math.PI/4;r.update(e,{x:e.x+Math.cos(a)*100,y:e.y+Math.sin(a)*100},4,.03);frames.add(String(sprite.getData(type+'-art')?.frame?.name));}const art=sprite.getData(type+'-art'),gait=sprite.getData(type+'-gait'),before=gait.phase;r.update(e,{x:e.x+100,y:e.y},8,.04);const result={type,loaded:r.loaded,frames:frames.size,sprite:art?.active===true,gait:gait.phase!==before,footprint:!!r.damagePoseOf(e),anchor:!!r.speechAnchorOf(e)};sprite.destroy();return result;})})()");
 for(const x of sheets)assert.ok(x.loaded&&x.frames===8&&x.sprite&&x.gait&&x.footprint&&x.anchor,'approved sprite parity '+JSON.stringify(x));
 await wait("window.__game.scene.getScene('School').combat.enemies.some(e=>!e.dead)",'live School bark candidate');
 const setup=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),e=s.combat.enemies.find(e=>!e.dead),p=s.cameras.main.getWorldPoint(s.scale.width*.5,s.scale.height*.8);e.x=p.x;e.y=p.y;s.combat.renderers[e.type].update(e,s.player,0,0);s.ambientBarks.state.remaining=0;return {eligible:s.ambientBarks.eligible,type:e.type}})()");
 assert.equal(setup.eligible,true);
 await wait("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return b.state.shown>0&&b.pool.some(p=>p.root.visible&&p.event?.kind==='spontaneous')})()",'approved School spontaneous bark',5000);
 const bubble=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks,p=b.pool.find(p=>p.root.visible),a=p.bounds,h=s.hudLayout;const clear=(x,y)=>{const px=Math.max(a.x,Math.min(a.x+a.width,x)),py=Math.max(a.y,Math.min(a.y+a.height,y));return Math.hypot(x-px,y-py)>h.joystickRadius*1.4+6};return {count:b.state.active.length,hud:a.y>=h.panelY+h.panelHeight+6,left:clear(h.joystickX,h.joystickY),right:clear(h.aimX,h.aimY??h.joystickY)}})()");
 assert.ok(bubble.count<=2&&bubble.hud&&bubble.left&&bubble.right,'approved bark layout '+JSON.stringify(bubble));
 const invisible=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks,p=b.pool.find(p=>p.root.visible&&p.event?.kind==='spontaneous'),e=p.event.speaker;e.sprite.setVisible(false);b.tick(s.combat.elapsedMs);const hidden=b.pool.every(p=>!p.root.visible||p.event?.speaker!==e);e.sprite.setVisible(true);b.tick(s.combat.elapsedMs);return hidden})()");
 assert.equal(invisible,true,'no speech bubble attached to invisible enemy');
 const hit=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks,e=b.state.active[0].speaker;e.hp=60;let attempts=0;while(b.state.hitShown===0&&attempts++<30)s.combat.qa.damage(e,1);return {attempts,hit:b.state.hitShown,visible:b.pool.some(p=>p.root.visible&&p.event?.kind==='damage'),hp:e.hp}})()");
 assert.ok(hit.hit>0&&hit.visible&&hit.hp<60,'real damage bark under original probability '+JSON.stringify(hit));
 const following=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks,p=b.pool.find(p=>p.root.visible&&p.event?.kind==='damage'),e=p.event.speaker,oldX=p.bounds.x;e.x+=18;s.combat.renderers[e.type].update(e,s.player,18,.03);b.tick(s.combat.elapsedMs);const next=b.pool.find(p=>p.root.visible&&p.event?.speaker===e);return {visible:!!next,dx:(next?.bounds.x??oldX)-oldX}})()");
 assert.ok(following.visible&&Math.abs(following.dx)>7,'bubble follows moving enemy '+JSON.stringify(following));
 const p=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(p.x,p.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'School bark MENU pause');
 assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return [b.state.active.length,b.pool.filter(p=>p.root.visible).length]})()"),[0,0],'barks hidden on MENU');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'resume School bark QA');
 const listeners=await evaluate("window.__game.scene.getScene('School').scale.listenerCount('resize')");
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');window.__r2OldRoot=s.ambientBarks.root;s.scene.restart({debugCheckpoint:'act4-wave4'});return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.combat?.started&&s.combat.wave===3&&!!s.ambientBarks?.root?.active&&s.ambientBarks.root!==window.__r2OldRoot})()",'School in-place restart');
 const restarted=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {listeners:s.scale.listenerCount('resize'),oldDestroyed:!window.__r2OldRoot.active,poolHidden:s.ambientBarks.pool.every(p=>!p.root.visible)}})()");
 assert.ok(restarted.listeners===listeners&&restarted.oldDestroyed&&restarted.poolHidden,'no duplicate bark listeners on restart '+JSON.stringify(restarted));
 console.log('PASS R2 real Chromium: eight-direction sprites and gait for three approved enemies; spontaneous/hit bark; moving attachment; HUD exclusion; pause and in-place restart cleanup');
 // New narrative guest shares the original bubbles (not a second bubble UI).
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.combat.renderers.zubrokryptyda.loaded&&s.combat.enemies.length>0})()",'Błażej approved sprite and wave4 enemies');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1170,660);s.player.body.reset(1170,660);s.cameras.main.centerOn(1170,660);s.ambientBarks.state.remaining=Number.MAX_SAFE_INTEGER;return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.cameras.main.worldView.y>410&&s.cameras.main.worldView.y<490&&s.cameras.main.worldView.x>720})()",'Phaser smoothed camera settles on Błażej viewport',3500);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return !!s.combat.renderers.zubrokryptyda.speechAnchorOf(s.blazej.actor)})()",'existing Żubrokryptyda speech anchor');
 const expectedObserver=['Szybciej!','Na niego!','Co z wami?','Do ataku!'];
 for(const phrase of expectedObserver){
  const v=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks;b.state.active.length=0;b.guestState.nextAt=Number.MAX_SAFE_INTEGER;b.tick(s.combat.elapsedMs);b.guestState.nextAt=0;b.tick(s.combat.elapsedMs);const p=b.pool.find(x=>x.root.visible&&x.event?.kind==='blazej-observer');const h=s.hudLayout,a=p?.bounds;return {phrase:p?.event?.phrase,visible:!!p,bounds:a,active:b.state.active.length,next:b.guestState.nextAt-s.combat.elapsedMs,shown:b.guestState.shown,hudMin:h.panelY+h.panelHeight+6,anchor:s.combat.renderers.zubrokryptyda.speechAnchorOf(s.blazej.actor),view:{x:s.cameras.main.worldView.x,y:s.cameras.main.worldView.y,w:s.scale.width,h:s.scale.height},actorVisible:s.blazej.actor.sprite.visible,mode:b.guestState.mode,attempts:b.guestState.attempts}})()");
  assert.equal(v.phrase,phrase,'approved observer bark phrase '+JSON.stringify(v));
  assert.ok(v.visible&&v.active<=2&&v.bounds.y>=v.hudMin,'same approved bubble HUD exclusions');
  assert.ok(v.next>=4500&&v.next<=7500,'barks are occasional and cooldown bounded');
 }
 const observed=await evaluate("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return {history:b.guestState.history,mode:b.guestState.mode,shown:b.guestState.shown}})()");
 assert.deepEqual(observed.history,expectedObserver);
 assert.equal(observed.mode,'observer');
 assert.equal(observed.shown,4);
 const hiddenGuest=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks,actor=s.blazej.actor;actor.sprite.setVisible(false);b.tick(s.combat.elapsedMs);const hidden=b.pool.every(p=>!p.root.visible||p.event?.speaker!==actor);actor.sprite.setVisible(true);return hidden})()");
 assert.equal(hiddenGuest,true,'invisible Błażej cannot retain speech bubble');
 const barkPause=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(barkPause.x,barkPause.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'observer bark MENU pause');
 assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return [b.state.active.length,b.pool.filter(p=>p.root.visible).length]})()"),[0,0],'guest bubbles gone on MENU');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'resume after observer bark pause');
 console.log('PASS Act IV Chromium: all four passive observer barks, approved two-bubble layout, rate limit, invisibility and MENU cleanup');

 // R1: use the approved DEBUG run only to stage the existing active-play
 // clock. The real SchoolCombat.update owns all transitions and rendering.
 await wait("window.__game.scene.getScene('School').combat.enemies.length>0",'wave4 real active enemy for timed completion');
 const beforeCleanup=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,combat:s.combat.state,transitions:s.combat.phaseChanges,spawned:s.combat.totalSpawned,alive:s.combat.enemies.filter(e=>!e.dead).length,qa:!!s.combat.qa}})()");
 assert.equal(beforeCleanup.phase,'COMBAT');
 assert.equal(beforeCleanup.combat,'COMBAT');
 assert.equal(beforeCleanup.transitions,1);
 assert.ok(beforeCleanup.alive>0&&beforeCleanup.qa);
 assert.equal(await evaluate("window.__game.scene.getScene('School').combat.qa.setElapsedMs(170000)"),true);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='CLEANUP'&&s.combat.state==='CLEANUP'})()",'170000ms transitions to CLEANUP',3000);
 const cleanup=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,changes:s.combat.phaseChanges,alive:s.combat.enemies.filter(e=>!e.dead).length,spawns:s.combat.totalSpawned,elapsed:s.combat.elapsedMs}})()");
 assert.equal(cleanup.changes,2,'INTRO -> COMBAT -> CLEANUP exactly once');
 assert.ok(cleanup.alive>0,'live enemies retained after timer');
 assert.ok(cleanup.elapsed>=170000,'timed wave4 boundary');
 await sleep(420);
 assert.equal(await evaluate("window.__game.scene.getScene('School').combat.totalSpawned"),cleanup.spawns,'no new ordinary enemies after 170000ms');
 // The unchanged MENU pause/resume must not bill time to the active-play clock.
 const cp=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(cp.x,cp.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'School CLEANUP MENU pause');
 const pausedTime=await evaluate("window.__game.scene.getScene('School').combat.elapsedMs");
 await sleep(420);
 assert.equal(await evaluate("window.__game.scene.getScene('School').combat.elapsedMs"),pausedTime,'no paused time charged');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'School CLEANUP WZNÓW');
 await sleep(110);
 const resumedTime=await evaluate("window.__game.scene.getScene('School').combat.elapsedMs");
 assert.ok(resumedTime-pausedTime<300,'MENU duration excluded from combat clock');
 const retained=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),e=s.combat.enemies.find(x=>!x.dead);if(!e)return null;const old=e.hp;const hit=s.combat.qa.damage(e,1);return {hit,old,hp:e.hp,dead:e.dead}})()");
 assert.ok(retained?.hit,'remaining enemy is still damageable during cleanup');
 assert.equal(retained.hp,retained.old-1);
 const finalKills=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),combat=s.combat;const before=combat.kills;const victims=[...combat.enemies].filter(e=>!e.dead);for(const e of victims)combat.qa.damage(e,e.hp);return {before,after:combat.kills,victims:victims.length,double:combat.qa.damage(victims[0],1)}})()");
 assert.equal(finalKills.after-finalKills.before,finalKills.victims,'every remaining kill recorded once');
 assert.equal(finalKills.double,false,'dead enemy cannot be credited twice');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_PENDING'&&s.combat.state==='BLAZEJ_PENDING'&&s.objectiveText.visible})()",'final kill -> BLAZEJ_PENDING',3000);
 const finalState=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,transitions:s.combat.phaseChanges,alive:s.combat.enemies.filter(e=>!e.dead).length,spawns:s.combat.totalSpawned,objective:s.objectiveText.text,visible:s.objectiveText.visible,act:s.run.actId,artifacts:[...s.run.artifacts]}})()");
 assert.equal(finalState.transitions,3,'pending handoff exactly once');
 assert.equal(finalState.alive,0);
 assert.equal(finalState.objective,'IDŹ DO SZKOŁY');
 assert.equal(finalState.act,'act4');
 assert.equal(finalState.artifacts.includes('blazej-bicycle'),false);
 await sleep(250);
 const stable=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,transitions:s.combat.phaseChanges,spawns:s.combat.totalSpawned,act:s.run.actId}})()");
 assert.equal(stable.phase,'BLAZEJ_PENDING');
 assert.equal(stable.transitions,3);
 assert.equal(stable.spawns,finalState.spawns);
 assert.equal(stable.act,'act4');
 console.log('PASS R1 real Chromium: 170000ms CLEANUP, no spawns, remaining damage, final enemy exactly once, BLAZEJ_PENDING, objective, MENU time exclusion');
 // R1: defeat must use Arena's same Menu pixel burst at the actual location.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before School death QA');
 await bootSchool('act4-combat');
 await wait("(()=>{const s=window.__game?.scene.getScene('School');return s?.combat?.started&&s.combat.enemies.length>0})()",'School combat for death QA');
 const injured=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),e=s.combat.enemies.find(e=>!e.dead);s.run.hp=1;s.hpFace.setHp(1);s.hpText.setText('HP 1/'+s.run.maxHp);e.x=s.player.x;e.y=s.player.y;e.sprite.setPosition(e.x,e.y);return {enemy:e.type,player:{x:s.player.x,y:s.player.y}}})()");
 assert.ok(injured.enemy);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'School defeat opens existing Menu',3500);
 const death=await evaluate("(()=>{const g=window.__game,s=g.scene.getScene('School'),m=g.scene.getScene('Menu'),c=s.cameras.main,origin=c.getWorldPoint(0,0);const at=s.defeatVisualAt;return {phase:s.schoolPhase,combat:s.combat.state,transitions:s.combat.phaseChanges,defeated:s.defeated,hp:s.run.hp,playerVisible:s.player.visible,spriteVisible:s.playerVisual.sprite?.visible??null,shadowVisible:s.playerVisual.shadow?.visible??null,bullets:s.combat.projectiles.length,alive:s.combat.enemies.length,at,expected:{x:(s.player.x-origin.x)*c.zoom,y:(s.player.y-origin.y)*c.zoom},menuBurst:!!m.terminalBurst?.graphics?.active,subtitle:m.children.list.some(o=>o.type==='Text'&&o.text==='KONIEC GRY'),menuOverSchool:g.scene.scenes.indexOf(m)>g.scene.scenes.indexOf(s)}})()");
 assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return [b.state.active.length,b.pool.filter(p=>p.root.visible).length]})()"),[0,0],'all bark bubbles cleared after Aloes defeat');
 assert.equal(death.phase,'DEFEAT');
 assert.equal(death.combat,'DEFEAT');
 assert.equal(death.transitions,2);
 assert.equal(death.hp,0);
 assert.equal(death.defeated,true);
 assert.equal(death.playerVisible,false);
 assert.notEqual(death.spriteVisible,true);
 assert.notEqual(death.shadowVisible,true);
 assert.equal(death.bullets,0);
 assert.equal(death.alive,0);
 assert.ok(Math.hypot(death.at.x-death.expected.x,death.at.y-death.expected.y)<2,'actual camera-space death location');
 assert.ok(death.menuBurst&&death.subtitle&&death.menuOverSchool,'approved Menu terminal pixel death VFX');
 await tapMenu('NOWA GRA');
 await wait("window.__game.scene.isActive('ActTitle')",'NOWA GRA after School defeat');
 console.log('PASS R1 real Chromium: correct death screen coordinates, hidden Aloes, no ghost attacks, existing MENU death burst, NOWA GRA');
 // PR106: stage only through existing DEBUG conventions; never replay 170s.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before PR106 boss QA');
 await bootSchool('act4-blazej');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_PENDING'&&s.dialogueState?.id==='act4-blazej-final'})()",'single post-wave Błażej panel',4500);
 const passiveBoss=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,visible:s.blazej.actor.sprite.visible,active:s.blazej.active,target:s.blazej.target,hp:s.blazej.actor.hp,ordinary:s.combat.enemies.length,started:s.combat.started,artifacts:[...s.run.artifacts],dialogue:s.dialogueState.id,pausedBarks:s.ambientBarks.state.active.length}})()");
 assert.equal(passiveBoss.phase,'BLAZEJ_PENDING');
 assert.equal(passiveBoss.visible,true);
 assert.equal(passiveBoss.active,false);
 assert.equal(passiveBoss.target,null);
 assert.equal(passiveBoss.ordinary,0);
 assert.equal(passiveBoss.artifacts.length,2);
 assert.equal(passiveBoss.pausedBarks,0);
 // Shared DALEJ helper above verifies one-panel touch advancement.
 const postWave=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,index:s.dialogueState.index,text:s.dialoguePanel.text.text,boss:s.blazej.active,bullets:s.blazej.projectiles.length}})()");
 assert.deepEqual(postWave,{id:'act4-blazej-final',index:0,text:'Ech, kazał pan, musiał sam!',boss:false,bullets:0},'no premature boss before one DALEJ');
 await dialogueNext();
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_BOSS'&&s.blazej.active&&!s.dialogueState.id})()",'Błażej boss begins only after confrontation',3500);
 const bossStart=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.blazej.actor.hp,ordinary:s.combat.enemies.length,wave:s.combat.wave,boss:s.blazej.active,water:s.weapon==='water-flamethrower'}})()");
 // Test three approved Błażej boss barks through exactly the same view.
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1170,660);s.player.body.reset(1170,660);s.cameras.main.centerOn(1170,660);s.ambientBarks.state.remaining=Number.MAX_SAFE_INTEGER;return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.cameras.main.worldView.y>410&&s.cameras.main.worldView.y<490&&s.cameras.main.worldView.x>720})()",'Phaser smoothed camera settles on Błażej viewport',3500);
 const bossBarkBefore=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.blazej.actor.hp,phase:s.blazej.attack.phase,volley:s.blazej.volleys,jump:s.blazej.jumps}})()");
 const bossPhrases=['Nie oddam roweru!','Zniszczę Cię!','To je moje!'];
 for(const phrase of bossPhrases){
  const v=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.ambientBarks;b.state.active.length=0;b.guestState.nextAt=Number.MAX_SAFE_INTEGER;b.tick(s.combat.elapsedMs);b.guestState.nextAt=0;b.tick(s.combat.elapsedMs);const p=b.pool.find(x=>x.root.visible&&x.event?.kind==='blazej-boss');return {phrase:p?.event?.phrase,active:b.state.active.length,shown:b.guestState.shown,kind:p?.event?.kind}})()");
  assert.equal(v.phrase,phrase,'approved boss bark '+JSON.stringify(v));
  assert.ok(v.active<=2&&v.kind==='blazej-boss');
 }
 const bossBarkAfter=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.blazej.actor.hp,phase:s.blazej.attack.phase,volley:s.blazej.volleys,jump:s.blazej.jumps,history:s.ambientBarks.guestState.history}})()");
 assert.deepEqual(bossBarkAfter.history,bossPhrases,'all three boss phrases shown');
 assert.equal(bossBarkAfter.hp,bossBarkBefore.hp,'cosmetic barks never alter boss HP');
 assert.equal(bossBarkAfter.volley,bossBarkBefore.volley,'no radial attack generated by bark');
 assert.equal(bossBarkAfter.jump,bossBarkBefore.jump,'no jump generated by bark');
 console.log('PASS Act IV Chromium: all three boss barks with shared original bubbles and no gameplay-side effects');

 assert.ok(bossStart.hp>0&&bossStart.boss&&bossStart.ordinary===0&&!bossStart.water);
 // Short-circuit only the existing debug boss scheduler, never change player-facing timing.
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=5999;return true})()");
 await wait("window.__game.scene.getScene('School').blazej.attack.phase==='warning'",'radial telegraph before attack');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.kind"),'radial');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.volleys"),0,'no bullet before warning');
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=899;return true})()");
 await wait("window.__game.scene.getScene('School').blazej.volleys>0",'radial volley after warning',1500);
 const volley=await evaluate("(()=>{const b=window.__game.scene.getScene('School').blazej;return {volley:b.volleys,projectiles:b.projectiles.length}})()");
 assert.equal(volley.volley,1);
 assert.ok(volley.projectiles>0&&volley.projectiles<=24);
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.phase='chase';a.elapsed=5999;return true})()");
 await wait("(()=>{const b=window.__game.scene.getScene('School').blazej;return b.attack.phase==='warning'&&b.kind==='jump'})()",'jump telegraph before landing');
 const jumpLanding=await evaluate("(()=>{const b=window.__game.scene.getScene('School').blazej;return {x:b.warningTarget?.x,y:b.warningTarget?.y}})()");
 assert.ok(Number.isFinite(jumpLanding.x)&&Number.isFinite(jumpLanding.y));
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=899;return true})()");
 await wait("window.__game.scene.getScene('School').blazej.jumps>0",'safe warned jump landing');
 const jumped=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej;return {x:b.actor.x,y:b.actor.y,shock:b.jumps,alive:s.run.hp>0,phase:s.schoolPhase}})()");
 assert.ok(jumped.alive&&jumped.phase==='BLAZEJ_BOSS');
 assert.ok(Math.hypot(jumped.x-jumpLanding.x,jumped.y-jumpLanding.y)<1);
 // Boss MENU/WZNÓW preserves live state without duplicating boss actor.
 const bossMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(bossMenu.x,bossMenu.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'boss MENU');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.projectiles.length"),0);
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'boss WZNÓW');
 const killedBoss=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej;const hit=b.damage(b.actor.hp,s.player,performance.now());return {hit,dead:b.defeated,alive:b.active,phase:s.schoolPhase,burst:b.bursts.length,second:b.damage(1,s.player,performance.now())}})()");
 assert.ok(killedBoss.hit&&killedBoss.dead&&!killedBoss.alive&&killedBoss.burst===1&&!killedBoss.second,'boss death exactly once '+JSON.stringify(killedBoss));
 assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return [b.state.active.length,b.pool.filter(p=>p.root.visible).length]})()"),[0,0],'no stale boss bubble after death');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_REWARD'&&s.rewardRoot.visible})()",'bicycle artifact reward panel',3000);
 const bicycleReward=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.run.artifacts.has('blazej-bicycle'),all:[...s.run.artifacts],text:s.rewardName.text,third:s.rewardDetail.text,approvedImage:s.bicycleTexture}})()");
 assert.ok(bicycleReward.id&&bicycleReward.all.length===3&&bicycleReward.text==='ROWER BŁAŻEJA'&&bicycleReward.third==='ARTEFAKT 3/3');
 assert.ok(bicycleReward.approvedImage===null||bicycleReward.approvedImage==='artifact-blazej-bicycle','only validated original bike PNG or honest text fallback');
 const rewardPoint=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.rewardButton.x,y:r.y+s.rewardButton.y}})()");
 await sleep(250);await touch(rewardPoint.x,rewardPoint.y);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='CHAPEL_RETURN'&&s.dialogueState?.id==='act4-chapel-ending'})()",'bicycle fade and chapel return',5000);
 const chapel=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {x:s.player.x,y:s.player.y,captain:s.captainArrival.actor?.active??false,bike:s.run.artifacts.has('blazej-bicycle'),dialogue:s.dialogueState.id,phase:s.schoolPhase}})()");
 assert.ok(Math.hypot(chapel.x-525,chapel.y-1000)<2&&chapel.captain===false&&chapel.bike);
 for(let i=0;i<4;i++)await dialogueNext();
 await wait("window.__game.scene.isActive('Menu')&&!window.__game.scene.isActive('School')",'Act IV completed and returned to Menu',4500);
 const campaign=await evaluate("(()=>{const g=window.__game,r=g.registry.get('campaign-run');return {hp:r.hp,completed:[...r.completedActs],artifacts:[...r.artifacts],selected:r.selectedWeapon,water:r.unlockedWeapons.has('water-flamethrower'),stat:r.stats.byAct.act4,title:g.scene.isActive('ActTitle'),cave:g.scene.keys.Cave??null,debug:r.isDebugRun}})()");
 assert.ok(campaign.completed.includes('act4')&&campaign.artifacts.length===3&&campaign.hp>0);
 assert.ok(campaign.stat?.kills>=1&&campaign.stat?.activeCombatMs>=170000);
 assert.equal(campaign.selected==='water-flamethrower',false);
 assert.equal(campaign.water,true);
 assert.equal(campaign.title,false);
 assert.equal(campaign.cave,null);
 assert.equal(campaign.debug,true);
 console.log('PASS PR106 real Chromium: passive Błażej, authorized confrontation, 900ms warned radial and jump, bounded projectiles, boss MENU/WZNÓW, one death, text-only bicycle reward, chapel/Marian absence, three artifacts, Act IV completion to Menu');
 console.log('PASS School real Chromium Android landscape: Captain gating, wave1 enemy spawn, touch rifle, MENU/WZNÓW, wave4 DEBUG, water restriction');
 assert.deepEqual(exceptions,[],'uncaught Chromium exceptions');
 console.log('PASS FAST real Chromium: menu, DEBUG Act II/IV, handoffs, school placeholders, Act IV pause/resume and water filtering');
 console.log('FAST runtime ms',Date.now()-started);
}finally{
 socket?.close();chrome?.kill('SIGKILL');vite.kill('SIGTERM');await sleep(150);
 try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
