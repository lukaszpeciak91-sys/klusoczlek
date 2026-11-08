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
 assert.deepEqual(schoolState.obstacles,['chapel','school','bicycleRack']);
 assert.deepEqual([schoolState.w,schoolState.h],[1800,1200]);
 await wait("!window.__game.scene.getScene('School').introActive",'Captain enters chapel',8000);
 const schoolMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(schoolMenu.x,schoolMenu.y);
 await wait("window.__game.scene.isActive('Menu')",'Act IV MENU button',3000);
 assert.equal(await evaluate("window.__game.scene.isPaused('School')"),true);
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'Act IV in-memory WZNÓW',3000);
 assert.deepEqual(exceptions,[],'uncaught Chromium exceptions');
 console.log('PASS FAST real Chromium: menu, DEBUG Act II/IV, handoffs, school placeholders, Act IV pause/resume and water filtering');
 console.log('FAST runtime ms',Date.now()-started);
}finally{
 socket?.close();chrome?.kill('SIGKILL');vite.kill('SIGTERM');await sleep(150);
 try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
