import {spawn} from 'node:child_process';
import {access,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
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
 const wait=async(expression,label,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(error){if(!/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(String(error)))throw error;}await sleep(80);}let detail='';try{detail=JSON.stringify(await evaluate("(()=>{const g=window.__game;return {active:g?.scene?.getScenes(true)?.map(s=>s.scene.key),title:(()=>{const t=g?.scene?.getScene('ActTitle');return t?.assetGate?{act:t.actId,next:t.nextScene,...t.assetGate,progress:t.assetProgress,attempts:t.preparationAttempts,error:t.lastPreparationError,retry:t.children.list.some(x=>x.text==='PONÓW'&&x.visible)}:null})(),school:(()=>{const s=g?.scene?.getScene('School');return s?{phase:s.schoolPhase,intro:s.introActive,dialogue:s.dialogueState,storyBusy:s.storyBusy,started:s.combat?.started,pitch:s.pitchStarted,entryGateReady:s.entryGateReady,allowed:s.controlsAllowed(),focus:document.hasFocus(),hidden:document.hidden,landscape:innerWidth>=innerHeight,shield:s.entryGate?.visible,menuButton:{visible:s.menuButton?.visible,x:s.menuButton?.x,y:s.menuButton?.y}}:null})(),catacombs:(()=>{const s=g?.scene?.getScene('Catacombs');return s?{phase:s.phase,dialogue:s.dialogueState,ready:s.entryGateReady,boss:s.boss?.phase,hp:s.run?.hp}:null})(),airship:g?.scene?.getScene('Airship')?.openingPhase}})()"));}catch{}throw Error('Timeout '+label+' '+detail);};
 const touch=async(x,y)=>{await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 const captureAct5=async(name)=>{
  if(!process.env.CI)return;
  const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await mkdir('qa/act5',{recursive:true});
  await writeFile('qa/act5/'+name+'.png',Buffer.from(data,'base64'));
 };
 const geometry=()=>evaluate("(()=>{const g=window.__game,m=g.scene.getScene('Menu'),r=g.canvas.getBoundingClientRect();return {rect:{x:r.x,y:r.y},active:g.scene.isActive('Menu'),acts:m.actsOpen,buttons:m.children.list.filter(o=>o.type==='Text'&&o.visible&&['NOWA GRA','AKTY','WZNÓW','WRÓĆ','OPCJE'].includes(o.text)).map(o=>({text:o.text,x:o.x,y:o.y}))}})()");
 const tapMenu=async label=>{const g=await geometry();const b=g.buttons.find(b=>b.text===label);assert.ok(b,'Missing '+label+' '+JSON.stringify(g));await touch(g.rect.x+b.x,g.rect.y+b.y);};
 await wait("Boolean(window.__game?.scene.getScene('StudioIntro')?.sys)",'Phaser game and boot scene initialized',7000);
 const introBoot=await evaluate("(()=>{const g=window.__game;return {active:g.scene.isActive('StudioIntro'),exists:!!g.scene.getScene('StudioIntro')}})()");
 assert.equal(introBoot.exists,true,'boot scene is registered');
 if(introBoot.active){
  const brand=await evaluate("(()=>{const s=window.__game.scene.getScene('StudioIntro');return s.children.list.filter(x=>x.type==='Text').map(x=>x.text)})()");
  assert.deepEqual(brand,['NEPAHU STUDIOS','PRESENTS']);
  // The Phaser scene timer must not be the only route to Menu.
  // Simulate an interrupted/paused intro; the independent watchdog
  // must recover without requiring the player to tap again.
  await evaluate("(()=>{window.__game.scene.getScene('StudioIntro').scene.pause();return true})()");
  await wait("window.__game.scene.isActive('Menu')",'paused StudioIntro watchdog routes to Menu',5500);
  assert.equal(await evaluate("window.__game.scene.isActive('StudioIntro')"),false,'watchdog stops intro');
  await cdp('Page.reload',{ignoreCache:true});
  await sleep(250);
  await wait("window.__game?.scene.isActive('StudioIntro')||window.__game?.scene.isActive('Menu')",'reload boot intro',7000);
  if(await evaluate("window.__game.scene.isActive('StudioIntro')"))await touch(25,25);
  await wait("window.__game.scene.isActive('Menu')",'touch skip boot intro',4000);
  assert.equal(await evaluate("window.__game.scene.isActive('StudioIntro')"),false,'intro stopped on skip');
 }
 await wait("window.__game?.scene.isActive('Menu')",'menu boot');
 const menu=await geometry();assert.ok(menu.buttons.some(b=>b.text==='NOWA GRA')&&menu.buttons.some(b=>b.text==='AKTY'),'menu buttons');
 const menuPresentation=await evaluate("(()=>{const m=window.__game.scene.getScene('Menu');return m.children.list.filter(x=>x.type==='Text'&&x.visible).map(x=>x.text)})()");
 assert.ok(menuPresentation.includes('KŁUSOCZŁEK')&&menuPresentation.some(t=>t.includes('NEPAHU STUDIOS')),
  'NES Deluxe logo and footer preserved');
 assert.ok(!menuPresentation.includes('PIĘĆ AKTÓW · JEDNA PRZYGODA'),
  'no ordinary subtitle beneath main menu logo');
 assert.ok(['NOWA GRA','AKTY','OPCJE'].every(t=>menuPresentation.includes(t)),
  'all fresh-menu controls remain visible');
 // Chromium touches actual Phaser controls, not storage-only assertions.
 const audioState=()=>evaluate("(()=>{const m=window.__game.scene.getScene('Menu');return {open:m.optionsOpen,acts:m.actsOpen,save:JSON.parse(localStorage.getItem('klusoczlek-audio-v1')||'{}'),labels:m.children.list.filter(x=>x.type==='Text'&&x.visible).map(x=>x.text)}})()");
 const audioRect=await evaluate("(()=>{const g=window.__game,r=g.canvas.getBoundingClientRect();return {x:r.x,y:r.y,w:g.scale.width,h:g.scale.height}})()");
 const slide=async(kind,value)=>{
  const p={x0:audioRect.x+audioRect.w*.375,x1:audioRect.x+audioRect.w*.765,y:audioRect.y+audioRect.h*(kind==='music'?.55:.705)};
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x0,y:p.y,id:7}]});
  for(let i=1;i<=6;i++)await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x0+(p.x1-p.x0)*value*i/6,y:p.y,id:7}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 };
 assert.ok((await geometry()).buttons.some(b=>b.text==='OPCJE'),'Options in main menu');
 await tapMenu('OPCJE');
 const panel=await audioState();
 assert.equal(panel.open,true);assert.equal(panel.acts,false);
 assert.ok(['DŹWIĘK','MUZYKA','EFEKTY SFX','WYCISZ','WRÓĆ'].every(s=>panel.labels.includes(s)),JSON.stringify(panel));
 assert.ok(!panel.labels.includes('NOWA GRA')&&!panel.labels.includes('AKTY'),'no click-through');
 await slide('music',.32);await slide('sfx',.73);
 const dragged=await audioState();
 assert.ok(Math.abs(dragged.save.music-.32)<=.01,'music dragged '+JSON.stringify(dragged));
 assert.ok(Math.abs(dragged.save.sfx-.73)<=.01,'SFX dragged '+JSON.stringify(dragged));
 assert.ok(dragged.labels.includes(Math.round(dragged.save.music*100)+'%'));
 assert.ok(dragged.labels.includes(Math.round(dragged.save.sfx*100)+'%'));
 const touchLabel=async labelName=>{
  const point=await evaluate("(()=>{const m=window.__game.scene.getScene('Menu'),r=window.__game.canvas.getBoundingClientRect(),t=m.children.list.find(x=>x.type==='Text'&&x.visible&&x.text==="+JSON.stringify(labelName)+");return t?{x:r.x+t.x,y:r.y+t.y}:null})()");
  assert.ok(point,'missing option control '+labelName);await touch(point.x,point.y);
 };
 await touchLabel('WYCISZ');
 const muted=await audioState();
 assert.equal(muted.save.muted,true);assert.equal(muted.save.music,dragged.save.music);assert.equal(muted.save.sfx,dragged.save.sfx);
 await touchLabel('WŁĄCZ');
 assert.deepEqual((await audioState()).save,{music:dragged.save.music,sfx:dragged.save.sfx,muted:false});
 await touchLabel('WRÓĆ');
 assert.equal((await audioState()).open,false);
 await cdp('Page.reload',{ignoreCache:true});
 // CDP Page.reload returns before the new document is installed. Avoid
 // reading the previously active game just before its context is destroyed.
 await sleep(250);
 await wait("window.__game?.scene.isActive('Menu')",'audio settings saved');
 assert.deepEqual((await audioState()).save,{music:dragged.save.music,sfx:dragged.save.sfx,muted:false});
 console.log('PASS Chromium real Options sliders, touch drag, mute, back and reload');
 // Real Marcin boss bark: reach Act I via a validated internal test
 // checkpoint, then assert an actual visible screen-space bubble.
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act1-marcin');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('Arena',{debugCheckpoint:'act1-marcin'});return true})()");
 await wait("(()=>{const s=window.__game?.scene.getScene('Arena');return s?.entryGateReady&&s.boss&&!s.bossEntrance&&!s.dialogueState?.id})()",'real Marcin entered Act I combat',16000);
 await captureAct5('REF-marcin-hp-chromium');
 await evaluate("(()=>{const s=window.__game.scene.getScene('Arena');s.invulnerableUntil=Infinity;return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('Arena');return s.bossBarks.shown>0&&s.bossBarks.root.visible})()",'Marcin boss bark visibly renders',5200);
 const marcinBark=await evaluate("(()=>{const s=window.__game.scene.getScene('Arena'),b=s.bossBarks;return {text:b.caption.text,x:b.root.x,y:b.root.y,visible:b.root.visible,top:s.hudLayout.panelY+s.hudLayout.panelHeight,width:s.scale.width,height:s.scale.height}})()");
 assert.equal(marcinBark.text,'Aaaaaa');
 assert.ok(marcinBark.visible&&marcinBark.x>=0&&marcinBark.y>=marcinBark.top&&marcinBark.y<marcinBark.height,'Marcin visible on mobile '+JSON.stringify(marcinBark));
 await cdp('Page.reload',{ignoreCache:true});await sleep(250);
 await wait("window.__game?.scene.isActive('Menu')",'Menu after Marcin bark QA');
 console.log('PASS real Chromium: Marcin boss bark visible in Act I combat');
 // Public AKTY list: locked entries remain visible but never launch.
 await tapMenu('AKTY');
 assert.equal((await geometry()).acts,true,'AKTY opens');
 await sleep(300);
 const locateLocked=()=>evaluate("(()=>{const m=window.__game.scene.getScene('Menu'),r=window.__game.canvas.getBoundingClientRect();const t=m.children.list.find(x=>x.type==='Text'&&x.visible&&x.text.includes('AKT V')&&x.text.includes('ZABLOKOWANY'));return t?{x:r.x+t.x,y:r.y+t.y}:null})()");
 assert.ok((await evaluate("window.__game.scene.getScene('Menu').children.list.filter(x=>x.type==='Text'&&x.text.includes('ZABLOKOWANY')).length"))>=4);
 let locked=await locateLocked();
 for(let attempt=0;attempt<12&&!locked;attempt++){
  const r=await evaluate("(()=>{const r=window.__game.canvas.getBoundingClientRect();return {x:r.x+r.width/2,top:r.y+r.height*.29,bottom:r.y+r.height*.72}})()");
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.bottom,id:3}]});
  for(let i=1;i<=5;i++)await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.bottom+(r.top-r.bottom)*i/5,id:3}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(70);locked=await locateLocked();
 }
 assert.ok(locked,'locked Act V entry reachable by landscape scrolling');
 await touch(locked.x,locked.y);
 assert.equal(await evaluate("window.__game.scene.isActive('Menu')"),true,'locked Act V cannot launch');
 assert.equal((await geometry()).acts,true,'locked touch cannot close AKTY');
 await tapMenu('WRÓĆ');
 assert.equal((await geometry()).acts,false,'WRÓĆ closes AKTY');
 console.log('PASS real Chromium AKTY: fresh lock, no DEBUG public button, no opening click-through, WRÓĆ');
 // Deterministically complete Act I through the real campaign completion
 // contract (not a DEBUG checkpoint), then exercise the public replay touch.
 const unlockCompleted=await evaluate(`(async()=>{
  const {createCampaignRun,completeCampaignAct,MARCIN_MOHAWK_ID}=await import('/klusoczlek/src/campaign-run.js');
  const {writeCampaignCheckpoint}=await import('/klusoczlek/src/campaign-save.js');
  const {recordActCompletion}=await import('/klusoczlek/src/act-unlocks.js');
  const saved=createCampaignRun();
  if(!writeCampaignCheckpoint(saved,'act1'))return false;
  const run=createCampaignRun();run.artifacts.add(MARCIN_MOHAWK_ID);
  run.unlockedWeapons.add('rifle');run.selectedWeapon='rifle';
  const ok=completeCampaignAct(run,'act1',{hp:run.maxHp,maxHp:run.maxHp,
   unlockedWeapons:run.unlockedWeapons,selectedWeapon:run.selectedWeapon,
   kills:1,activeCombatMs:1000});
  return ok&&recordActCompletion(run,'act1');
 })()`);
 assert.equal(unlockCompleted,true,'normal completion unlocks Act II');
 const savedBeforeReplay=await evaluate("localStorage.getItem('klusoczlek-campaign-v1')");
 await cdp('Page.reload',{ignoreCache:true});
 await sleep(250); // The old context may still be active immediately after CDP reload.
 await wait("window.__game?.scene.isActive('Menu')",'AKTY persisted after reload');
 await tapMenu('AKTY');
 const actTwo=await evaluate("(()=>{const m=window.__game.scene.getScene('Menu'),r=window.__game.canvas.getBoundingClientRect();const t=m.children.list.find(x=>x.type==='Text'&&x.visible&&x.text.includes('AKT II')&&x.text.includes('ODBLOKOWANY'));return t?{x:r.x+t.x,y:r.y+t.y}:null})()");
 assert.ok(actTwo,'legitimate completion visibly unlocks Act II');
 // Model a dropped camera completion event on mobile without replacing
 // the menu input route: the one-shot fallback must still enter ActTitle.
 await evaluate("(()=>{const m=window.__game.scene.getScene('Menu');m.cameras.main.fadeOut=()=>m.cameras.main;return true})()");
 await touch(actTwo.x,actTwo.y);
 await wait("window.__game.scene.isActive('ActTitle')",'AKTY replay watchdog survives missing camera fade event',4500);
 const replay=await evaluate("(()=>{const g=window.__game,t=g.scene.getScene('ActTitle'),r=g.registry.get('campaign-run');return {act:t.actId,entry:r.actId,replay:r.isReplayRun,hp:r.hp,max:r.maxHp,artifacts:[...r.artifacts],weapon:r.selectedWeapon}})()");
 assert.equal(replay.act,'act2');assert.equal(replay.entry,'act1');assert.equal(replay.replay,true);
 assert.equal(replay.hp,replay.max);assert.ok(replay.artifacts.includes('marcin-mohawk'));
 assert.equal(replay.weapon,'rifle');
 assert.equal(await evaluate("localStorage.getItem('klusoczlek-campaign-v1')"),savedBeforeReplay,'replay cannot overwrite WZNÓW');
 await cdp('Page.reload',{ignoreCache:true});
 await sleep(250); // The old context may still be active immediately after CDP reload.
 await wait("window.__game?.scene.isActive('Menu')",'menu after replay reload');
 assert.ok((await geometry()).buttons.some(b=>b.text==='WZNÓW'),'replay retains independent WZNÓW');
 console.log('PASS real Chromium AKTY: normal Act I completion, persistent Act II unlock, touch replay via ActTitle, separate autosave');


 // Fast direct Act V opening visual QA; does not replay Acts I–IV.
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act5-opening');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('ActTitle',{actId:'act5',handoff:f.handoff,debugCheckpoint:'act5-opening'});return true})()");
 await wait("(()=>{const s=window.__game?.scene.getScene('Catacombs');return window.__game?.scene.isActive('Catacombs')&&s?.entryGateReady&&s.dialogueState.id==='act5-betrayal'})()",'direct approved Act V visual QA ready',18000);
 await sleep(440); // Wait for 300ms SceneReveal black shield fade before rendered pixel sampling.
 // Real Chromium pixel/texture audit at the Act V stage, not a file-path-only test.
 const art5=await evaluate(`(()=>{
  const g=window.__game,s=g.scene.getScene('Catacombs');
  const bg=s.catacombsBackground,images=s.catacombsObstacleArt;
  const bounds=(key)=>{
   const source=s.textures.get(key)?.source?.[0]?.image;
   if(!source)return null;
   const c=document.createElement('canvas');c.width=source.width;c.height=source.height;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
   const data=ctx.getImageData(0,0,c.width,c.height).data;
   let left=c.width,top=c.height,right=-1,bottom=-1,opaque=0;
   // Alpha > 32 excludes nearly-transparent edge anti-aliasing.
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    if(data[(y*c.width+x)*4+3]<=32)continue;
    opaque++;left=Math.min(left,x);top=Math.min(top,y);
    right=Math.max(right,x);bottom=Math.max(bottom,y);
   }
   return {width:c.width,height:c.height,left,top,right,bottom,opaque};
  };
  const ctx=g.canvas.getContext('2d',{willReadFrequently:true});
  const points=[[.23,.19],[.4,.19],[.64,.19],[.72,.3],[.45,.32]].map(([x,y])=>{
   const p=ctx.getImageData(Math.round(g.canvas.width*x),Math.round(g.canvas.height*y),1,1).data;
   return [...p];
  });
  return {bg:bg?{key:bg.texture.key,x:bg.x,y:bg.y,w:bg.displayWidth,h:bg.displayHeight,depth:bg.depth}:null,
   images:images.map(o=>({key:o.texture?.key,id:o.getData('catacombsObstacleId'),x:o.x,y:o.y,w:o.displayWidth,h:o.displayHeight,depth:o.depth})),
   column:bounds('act5-column'),altar:bounds('act5-altar'),
   transformed:bounds('act5-marian-transformed'),portrait:bounds('dialogue-marian-transformed'),
   pixelSamples:points,gate:s.entryGateReady,phase:s.phase};
 })()`);
 console.log('ACT V APPROVED PIXEL / ALPHA AUDIT',JSON.stringify(art5));
 assert.deepEqual(art5.bg,{key:'act5-catacombs-background',x:0,y:0,w:960,h:640,depth:-20},
  'real approved catacombs texture rendered at logical world dimensions');
 assert.equal(art5.images.length,5,'one altar and four columns, no doubles');
 assert.equal(art5.images.filter(x=>x.key==='act5-column').length,4);
 assert.equal(art5.images.filter(x=>x.key==='act5-altar').length,1);
 assert.deepEqual(art5.images.map(x=>x.id).sort(),['altar','pillar-left-lower','pillar-left-upper','pillar-right-lower','pillar-right-upper']);
 assert.ok(art5.column.opaque>1000&&art5.altar.opaque>1000,'real nonempty RGBA silhouettes decoded');
 assert.deepEqual([art5.column.width,art5.column.height],[96,221]);
 assert.deepEqual([art5.altar.width,art5.altar.height],[266,176]);
 assert.deepEqual([art5.transformed.width,art5.transformed.height],[2048,256]);
 assert.deepEqual([art5.portrait.width,art5.portrait.height],[192,192]);
 assert.ok(new Set(art5.pixelSamples.map(x=>x.join(','))).size>1,'actual rendered canvas pixels vary');
 const colRequests=await evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('/obstacles/act5-column.png')).length");
 assert.equal(colRequests,1,'all four columns share one decoded/fetched texture');


 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'return from direct Act V visual QA',7000);
 await tapMenu('NOWA GRA');
 await wait("window.__game.scene.isActive('ActTitle')",'NOWA GRA -> Act I title',3000);
 await sleep(340);
 const titleAudio=await evaluate("(()=>{const a=window.__retroAudio;return {gate:a.titleSilence,track:a.track,playing:!!a.music&&!a.music.paused,level:a.music?.volume??0}})()");
 assert.equal(titleAudio.gate,true,'Act I entry keeps title gate closed');
 assert.equal(titleAudio.playing,false,'Act I title has no playing music after 250ms fade');
 assert.equal(titleAudio.level,0,'Act I title music fully silent');
 const earlyPaths=await evaluate("performance.getEntriesByType('resource').map(r=>r.name).filter(p=>p.includes('/assets/')&&/act2-|act3-|act4-|schoolyard|blazej\\.png|bogdan\\.png/.test(p))");
 assert.deepEqual(earlyPaths,[],'cold Act I must not request later-act image resources');
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'saved menu reload');
 assert.ok((await geometry()).buttons.some(b=>b.text==='WZNÓW'),'WZNÓW available with saved campaign');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('ActTitle')",'WZNÓW restores Act I title',3000);
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before internal Act II QA');
 // Public DEBUG navigation was retired. The existing internal fixture still
 // exercises real asset loading, dialogue, handoff and audio.
 let heldSky=null,skyRequests=0;
 const skyPaused=event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Fetch.requestPaused'&&message.params.request.url.includes('act2-sky.png')){
   heldSky=message.params.requestId;skyRequests++;
  }
 };
 socket.addEventListener('message',skyPaused);
 await cdp('Fetch.enable',{patterns:[{urlPattern:'*act2-sky.png',requestStage:'Request'}]});
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act2-results');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('ActTitle',{actId:'act2',handoff:f.handoff,debugCheckpoint:'act2-results'});return true})()");
 await wait("window.__game.scene.isActive('ActTitle')",'Act II title before PNG readiness',4000);
 for(let attempt=0;attempt<80&&!heldSky;attempt++)await sleep(50);
 assert.ok(heldSky,'cold Act II title fetches approved sky PNG once');
 await sleep(2150);
 const slowTitle=await evaluate("(()=>{const g=window.__game,t=g.scene.getScene('ActTitle');return {visible:g.scene.isActive('ActTitle'),airship:g.scene.isActive('Airship'),act:t.actId,ready:t.assetGate.ready,minimum:t.assetGate.minimumElapsed}})()");
 assert.deepEqual(slowTitle,{visible:true,airship:false,act:'act2',ready:false,minimum:true},
   'title remains onscreen past minimum while required sky download is pending');
 const loadingAudio=await evaluate("(()=>{const a=window.__retroAudio;return {gate:a.titleSilence,playing:!!a.music&&!a.music.paused,volume:a.music?.volume??0}})()");
 assert.deepEqual(loadingAudio,{gate:true,playing:false,volume:0},
   'DEBUG Act II title stays fully silent through extended asset loading');
 await cdp('Fetch.continueRequest',{requestId:heldSky});
 await cdp('Fetch.disable');socket.removeEventListener('message',skyPaused);
 await wait("window.__game.scene.isActive('Airship')",'DEBUG Act II results checkpoint',12000);
 assert.equal(skyRequests,1,'Act II approved sky fetched exactly once under slow network');
 await sleep(470);
 const airshipAudio=await evaluate("(()=>{const a=window.__retroAudio;return {gate:a.titleSilence,track:a.track,volume:a.music?.volume??0}})()");
 assert.equal(airshipAudio.gate,false,'gameplay releases ActTitle silence');
 assert.equal(airshipAudio.track,'act2','correct track on entering gameplay');
 assert.ok(Math.abs(airshipAudio.volume-dragged.save.music*.70)<.01,'400ms fade reaches stored target');
 console.log('PASS ActTitle Chromium slow PNG gate: 1900ms minimum, Act II held until decoded sky, one sky request');
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
 // Internal Act IV fixture bypasses only the retired public DEBUG panel.
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act4-opening');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('ActTitle',{actId:'act4',handoff:f.handoff,debugCheckpoint:'act4-opening'});return true})()");
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
 assert.deepEqual(schoolState.obstacles,['chapel','school','bicycleRack','school-tire-pile','school-tire-pile-2','school-toi-toi','school-rock-small','school-rock-medium']);
 assert.deepEqual([schoolState.w,schoolState.h],[1800,1200]);
 // Actual Captain arrival, six untouched panels and departure in real Chromium.
 const captainOpeningText=[
  ['KAPITAN MARIAN','No i jesteśmy! Szkoła zawodowa!\nTu znajdziesz Błażeja i jego rower!','dialogue-captain'],
  ['ALOES','A pan dokąd?','dialogue-aloes'],
  ['KAPITAN MARIAN','Ja wezmę dwa pierwsze artefakty\ni muszę załatwić pewną bardzo ważną\nsprawę w tej kaplicy...','dialogue-captain'],
  ['KAPITAN MARIAN','By móc odesłać Cię do domu oczywiście,\nprzecież parostatkiem nie polecimy\ndo innego wymiaru','dialogue-captain'],
  ['ALOES','Ach rozumiem','dialogue-aloes'],
  ['KAPITAN MARIAN','Nie stój jak widły w gnoju!\nLeć po rower!','dialogue-captain']
 ];
 const finishCaptainOpening=async({pauseMidway=false}={})=>{
  await wait("(()=>{const s=window.__game.scene.getScene('School');return s.introActive&&s.captainArrival.arrived&&s.captainDialogueStarted&&s.dialogueState.id==='act4-captain-opening'})()",'Captain stops beside Aloes and begins approved dialogue',9000);
  await wait("(()=>{const d=window.__game.scene.getScene('School').dialoguePanel;return d.loaded.has('captain')&&d.loaded.has('aloes')})()",'approved Captain and Aloes portraits loaded',6000);
  const stateBefore=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.run.hp,weapon:s.run.selectedWeapon,artifacts:[...s.run.artifacts].sort(),completed:[...s.run.completedActs].sort(),x:s.player.x,y:s.player.y,departure:s.captainDeparting,started:s.combat.started}})()");
  assert.ok(!stateBefore.departure&&!stateBefore.started);
  for(let i=0;i<captainOpeningText.length;i++){
   const actual=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),d=s.dialoguePanel;return {id:s.dialogueState.id,index:s.dialogueState.index,text:d.text.text,speaker:d.shell.list.filter(o=>o.type==='Text').map(o=>o.text),images:d.shell.list.filter(o=>o.type==='Image'&&o.visible).map(o=>o.texture.key),arrival:s.captainArrival.arrived,departure:s.captainDeparting,actor:s.captainArrival.actor?.active??false,controls:s.joystick.enabled,aim:s.aimJoystick.enabled,clock:s.combat.elapsedMs,enemies:s.combat.enemies.length,spawned:s.combat.totalSpawned,bullets:s.combat.projectiles.length,player:[s.player.x,s.player.y]}})()");
   const [who,line,portrait]=captainOpeningText[i];
   assert.deepEqual([actual.id,actual.index,actual.text],['act4-captain-opening',i,line],'Captain panel '+(i+1));
   assert.ok(actual.speaker.includes(who)&&actual.images.includes(portrait),'approved speaker/portrait '+(i+1)+' '+JSON.stringify(actual));
   assert.ok(actual.arrival&&actual.actor&&!actual.departure&&!actual.controls&&!actual.aim,
     'Marian stands, no movement, no departure before last DALEJ');
   assert.deepEqual([actual.clock,actual.enemies,actual.spawned,actual.bullets,actual.player],
     [0,0,0,0,[stateBefore.x,stateBefore.y]],'no wave time, enemies, projectiles or player movement');
   if(pauseMidway&&i===2){
    const menu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
    await touch(menu.x,menu.y);
    await wait("window.__game.scene.isPaused('School')&&window.__game.scene.isActive('Menu')",'MENU during Captain panel 3',2800);
    await tapMenu('WZNÓW');
    await wait("window.__game.scene.isActive('School')",'resume Captain dialogue without restarting',2800);
    assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.dialogueState.id,s.dialogueState.index,s.captainDialogueStarted,s.captainDeparting]})()"),
      ['act4-captain-opening',2,true,false],'MENU/WZNÓW did not duplicate or skip panels');
   }
   await sleep(235);
   const next=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect(),b=s.dialoguePanel.button;return {x:r.x+b.x,y:r.y+b.y}})()");
   await touch(next.x,next.y);
  }
  await wait("(()=>{const s=window.__game.scene.getScene('School');return s.captainDeparting&&s.introActive&&!s.dialogueState.id})()",'Marian departs only after sixth DALEJ',2500);
  const marianStart=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),a=s.captainArrival.actor;return {x:a.x,y:a.y,alpha:a.alpha,walk:s.captainWalkDistance}})()");
  await sleep(160);
  const marianStep=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),a=s.captainArrival.actor;return {x:a.x,y:a.y,alpha:a.alpha,walk:s.captainWalkDistance}})()");
  assert.ok(marianStep.alpha===1&&marianStep.walk>marianStart.walk&&Math.hypot(marianStep.x-marianStart.x,marianStep.y-marianStart.y)>1,
   'Captain walks while fully opaque with actual world displacement');
  await wait("(()=>{const s=window.__game.scene.getScene('School');return !s.introActive&&!s.captainArrival.actor?.active&&s.joystick.enabled&&s.aimJoystick.enabled})()",'one Captain chapel departure and restored movement',3800);
  const after=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.run.hp,weapon:s.run.selectedWeapon,artifacts:[...s.run.artifacts].sort(),completed:[...s.run.completedActs].sort(),start:s.combat.started,dialogue:s.dialogueState.id,departing:s.captainDeparting}})()");
  assert.deepEqual([after.hp,after.weapon,after.artifacts,after.completed],
   [stateBefore.hp,stateBefore.weapon,stateBefore.artifacts,stateBefore.completed],
   'Marian taking artifacts is narrative only, never an inventory transfer');
  assert.equal(after.start,false);assert.equal(after.dialogue,null);assert.equal(after.departing,true);
  return after;
 };
 await finishCaptainOpening({pauseMidway:true});
 console.log('PASS Act IV Chromium Captain: exact six dialogue panels, original portraits, MENU/WZNÓW, only final DALEJ triggers chapel walk, controls and artifacts preserved');
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
  assert.ok(p.alive<=(id==='act4-maciek-seba'?0:2),'only previously activated optional NPCs remain; no wave spawns during dialogue');
  assert.equal(p.clock,0,'no background/dialogue combat time');
  assert.equal(p.boss,false,'boss passive during opening');
  assert.equal(p.enabled,false,'movement disabled while dialogue visible');
  assert.equal(p.bubble,false,'speech bubbles suppressed during dialogue');
  if(id.startsWith('act4-blazej-')){
   await wait("(()=>{const d=window.__game.scene.getScene('School').dialoguePanel;return d.loaded.has('blazej')&&d.loaded.has('bobrozombi')})()",'current-act boss and observer portraits loaded',3500);
   const portrait=await evaluate("(()=>{const d=window.__game.scene.getScene('School').dialoguePanel;return d.shell.list.filter(o=>o.type==='Image'&&o.visible).map(o=>o.texture.key)})()");
   const blazej=id==='act4-blazej-final'||id==='act4-blazej-observer'&&index===0||
     id==='act4-blazej-confrontation'&&index!==1;
   assert.deepEqual(portrait,[blazej?'dialogue-blazej':
     id==='act4-blazej-observer'?'dialogue-bobrozombi':'dialogue-aloes'],
     'portrait changes only for Błażej, speech and DALEJ unchanged');
  }
  await dialogueNext();
 };
 await bootSchool('act4-opening');
 await wait("window.__game.scene.isActive('School')",'School scene starts');
 const schoolIntro=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {intro:s.introActive,started:s.combat.started,enemies:s.combat.enemies.length,weapon:s.weapon,hp:s.run.hp}})()");
 assert.ok(schoolIntro.intro&&!schoolIntro.started&&schoolIntro.enemies===0,'no enemies during Captain cinematic '+JSON.stringify(schoolIntro));
 await wait("(()=>{const s=window.__game.scene.getScene('School');return ['background','school','chapel','bicycleRack'].every(id=>s.schoolArt.loaded.has(id))})()",'all four approved Act IV images load (base PNGs)',12000);
 const artwork=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {parts:[...s.schoolArt.loaded].sort(),images:s.schoolArt.images.filter(x=>x.active).length,allOldVisible:[...s.schoolPlacePlaceholders.values()].some(a=>a.some(x=>x.visible)),pitchVisible:s.schoolTerrainPlaceholders.some(o=>o.visible)}})()");
 assert.ok(artwork.images===4&&!artwork.allOldVisible&&!artwork.pitchVisible,'approved schoolyard art replaces provisional blocks '+JSON.stringify(artwork));
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.blazej.renderer.loaded&&s.combat.renderers.zubrokryptyda.loaded})()",'approved Błażej and untouched ordinary heavy world sheets loaded',10000);
 const approvedBoss=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),a=s.blazej.actor.sprite,art=a.getData('zubrokryptyda-art');return {texture:art?.texture.key,frames:Array.from({length:8},(_,i)=>art?.texture.has(String(i))),frame:art?.frame.name,scale:art?.scaleX,y:art?.y,depth:a.depth,original:s.combat.renderers.zubrokryptyda.loaded,ordinaryTexture:s.textures.exists('enemy-zubrokryptyda-v2'),actors:s.children.list.filter(o=>o===a).length}})()");
 assert.deepEqual([approvedBoss.texture,approvedBoss.scale,approvedBoss.depth,approvedBoss.original,approvedBoss.ordinaryTexture,approvedBoss.actors],
  ['enemy-blazej-v1',.55,9,true,true,1],'dedicated Błażej actor texture, original mechanical size and only one boss actor');
 assert.ok(approvedBoss.frames.every(Boolean)&&String(approvedBoss.frame)==='2'&&Number.isFinite(approvedBoss.y),'eight approved facing frames and ground alignment');
 const schoolArtPlacement=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.schoolArt.images.map(i=>({key:i.texture.key,x:i.x,y:i.y,w:i.displayWidth,h:i.displayHeight,depth:i.depth})).sort((a,b)=>a.key.localeCompare(b.key))})()");
 assert.deepEqual(schoolArtPlacement,[
  {key:'schoolyard-approved-bg',x:0,y:0,w:1800,h:1200,depth:-18},
  {key:'schoolyard-approved-chapel',x:330,y:965,w:317.25,h:317.25,depth:12},
  {key:'schoolyard-approved-rack',x:1510,y:857,w:287,h:222,depth:12},
  {key:'schoolyard-approved-school',x:1480,y:420,w:520,h:384,depth:12}
 ].sort((a,b)=>a.key.localeCompare(b.key)),'four approved art layers retain native PNG textures, scaled rack and clear pitch');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.children.list.filter(o=>o.getData('obstacleArt')).length===5&&s.children.list.filter(o=>o.getData('obstacleArt')).every(o=>!!o.getData('atlasSprite'))})()",'five real Act I approved atlas obstacle frames load',9000);
 const atlas=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.children.list.filter(o=>o.getData('obstacleArt')).map(o=>({frame:o.getData('obstacleArt').frame,original:!!o.getData('atlasSprite'),fallbackVisible:o.getData('fallback').visible})).sort((a,b)=>a.frame-b.frame)})()");
 assert.deepEqual(atlas,[0,1,9,10,10].map(frame=>({frame,original:true,fallbackVisible:false})),'two tires, toi-toi and two original rock PNG frames');
 const solids=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.obstacles.slice(0,3).map(o=>({id:o.id,w:o.footprint.width,h:o.footprint.height}))})()");
 assert.deepEqual(solids,[{id:'chapel',w:129.6,h:126.9},{id:'school',w:430,h:86},{id:'bicycleRack',w:220,h:52}],
  'actual lower-footprint collision dimensions, never complete PNG canvas');
 console.log('PASS Act IV Chromium approved art: 1800x1200 terrain, native obstacle PNGs, alpha-based lower footprints, real Act I atlas pieces, occlusion and HUD');
 await finishCaptainOpening(); // Second scene entry gets exactly one new opening; combat remains gated.
 const optionalBefore=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {intro:s.introActive,started:s.combat.started,maciek:s.maciekSeen,pitch:s.pitchStarted,actors:s.combat.optionalActors.length}})()");
 assert.deepEqual(optionalBefore,{intro:false,started:false,maciek:false,pitch:false,actors:2},'both NPCs staged, optional encounter not automatic');
 const approachMaciek=await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(695,620);s.player.body.reset(695,620);return true})()");
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-maciek-seba'",'optional dialogue on actual approach',4000);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return ['bobrozombi','bocianolak','blazej'].every(k=>s.dialoguePanel.loaded.has(k))})()",'only Act IV dialogue portraits load (no unused Żubrokryptyda portrait)',10000);
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
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1135,785);s.player.body.reset(1135,785);return true})()");
 await sleep(220);
 assert.equal(await evaluate("window.__game.scene.getScene('School').dialogueState.id"),null,
  'Błażej observer must not trigger at 200px from actual boss');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1215,785);s.player.body.reset(1215,785);return true})()");
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-blazej-observer'",'Błażej observer inside 130px',4000);
 const staged=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),actors=s.combat.stagedEntourage;window.__schoolStagedEntourage=[...actors];return {types:actors.map(a=>a.type).sort(),alive:actors.filter(a=>a.hp>0&&a.sprite?.active&&a.sprite.visible).length,ordinary:s.combat.enemies.length,spawned:s.combat.totalSpawned,started:s.combat.started,clock:s.combat.elapsedMs,shots:s.combat.projectiles.length,hp:s.run.hp}})()");
 assert.deepEqual(staged.types,['bobrozombi','bocianolak','zubrokryptyda']);
 assert.equal(staged.alive,3,'three approved enemy sprites visually surround passive Błażej before conversation');
 assert.ok(!staged.started&&staged.ordinary===2&&staged.spawned===0&&staged.clock===0&&staged.shots===0);
 const hpBeforeDialogue=staged.hp;
 await sleep(350);
 assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.run.hp,elapsed:s.combat.elapsedMs,spawned:s.combat.totalSpawned,poses:s.combat.stagedEntourage.map(e=>[e.x,e.y])}})()"),
  {hp:hpBeforeDialogue,elapsed:0,spawned:0,poses:[[1220,785],[1430,720],[1320,900]]},
  'staged monsters stay still, do not hurt Aloes, and do not advance wave time');
 for(const [i,line] of ['...i ja wtedy normalnie od razu','Ty to jednak Błażej jesteś gość'].entries())
  await verifyPanel('act4-blazej-observer',i,line);
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-blazej-confrontation'",'four-panel bike confrontation before waves');
 const prewaves=[
  'Nie wiem kim jesteś ale mam ochotę Cię rozgnieść',
  'Potrzebuję na chwilę Twojego roweru, dasz się karnąć?',
  'Nie, bo ja się boję, że mi stracisz.\nPoza tym uczciwie ukradłem\ni nie mam zamiaru oddawać',
  'Zostaw mój rower, ty kutwo!\nChłopaki, na niego!'
 ];
 for(let i=0;i<prewaves.length;i++)await verifyPanel('act4-blazej-confrontation',i,prewaves[i]);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.combat.started&&s.schoolPhase==='COMBAT'&&!s.dialogueState.id})()",'waves start only after fourth confrontation panel',4000);
 const adopted=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),before=window.__schoolStagedEntourage;return {reused:before.every(e=>s.combat.enemies.includes(e)&&e.sprite?.active),staged:s.combat.stagedEntourage.length,duplicates:new Set(s.combat.enemies.map(e=>e.sprite)).size!==s.combat.enemies.length,count:s.combat.enemies.length,spawned:s.combat.totalSpawned}})()");
 assert.ok(adopted.reused&&!adopted.duplicates&&adopted.staged===0,'exact same preview sprite/actor objects transferred into capped director '+JSON.stringify(adopted));
 assert.ok(adopted.count<=6&&adopted.spawned>=3&&adopted.count<=adopted.spawned+2);
 console.log('PASS Act IV Chromium opening: Captain at chapel, optional Maciek/Seba 3, pitch observer 2, confrontation 4; combat only after approved DALEJ');
 await wait("window.__game.scene.getScene('School').combat.enemies.length>0",'School wave1 spawns',10000);
 const school=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {wave:s.combat.wave,count:s.combat.enemies.length,state:s.schoolPhase,weapon:s.weapon,owned:[...s.run.unlockedWeapons],hp:s.run.hp}})()");
 assert.equal(school.wave,0);assert.ok(school.count<=6&&school.count>0,'wave1 cap');
 const entourage=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {types:[...new Set(s.combat.enemies.map(e=>e.type))].sort(),spawned:s.combat.totalSpawned,alive:s.combat.enemies.filter(e=>!e.dead).length,positions:s.combat.enemies.slice(0,3).map(e=>({x:e.x,y:e.y,type:e.type}))}})()");
 assert.deepEqual(entourage.types,['bobrozombi','bocianolak','zubrokryptyda'],'approved small ordinary entourage near Błażej');
 assert.ok(entourage.spawned>=3&&entourage.alive<=6,'single cap-accounted director '+JSON.stringify(entourage));
 assert.equal(school.owned.includes('water-flamethrower'),true);
 assert.notEqual(school.weapon,'water-flamethrower');
 // Actual right-stick touch: a rifle shot must exist in the live School scene.
 const stick=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.aimJoystick.base.x,y:r.y+s.aimJoystick.base.y,r:s.hudLayout.joystickRadius}})()");
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x,y:stick.y,id:23}]});
 await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x+stick.r*.85,y:stick.y,id:23}]});
 await wait("window.__game.scene.getScene('School').combat.projectiles.length>0",'School real touch firing',3000);
 await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  // R2 real right-stick flame audit: graphics, pressure, eight directions and release.
 for(let j=0;j<3;j++){
  if(await evaluate("window.__game.scene.getScene('School').weapon==='flamethrower'"))break;
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.hudLayout.switchX,y:r.y+s.hudLayout.switchY}})()");
  await touch(p.x,p.y);await sleep(60);
 }
 assert.equal(await evaluate("window.__game.scene.getScene('School').weapon"),'flamethrower');
 const st4=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.aimJoystick.base.x,y:r.y+s.aimJoystick.base.y,r:s.hudLayout.joystickRadius}})()");
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:st4.x,y:st4.y,id:31}]});
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4;
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:st4.x+Math.cos(angle)*st4.r*.85,y:st4.y+Math.sin(angle)*st4.r*.85,id:31}]});
  await sleep(85);
  const q=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.aimJoystick.held,s.combat.pressure.active,s.combat.stream.commandBuffer.length]})()");
  assert.ok(q[0]&&q[1]&&q[2]>0,'Act IV flame direction '+d+' '+JSON.stringify(q));
 }
 await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("(()=>{const s=window.__game.scene.getScene('School');return !s.combat.pressure.active&&s.combat.stream.commandBuffer.length===0})()",'School flame real release');
 console.log('PASS Act IV R2 Chromium 8-way flame, pressure, stream release');
const pausePoint=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(pausePoint.x,pausePoint.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'School MENU pause');
 const enemiesBeforeResume=await evaluate("window.__game.scene.getScene('School').combat.enemies.length");
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'School WZNÓW resume');
 assert.equal(await evaluate("window.__game.scene.getScene('School').combat.enemies.length"),enemiesBeforeResume,'no duplicate enemies on resume');
 // Wave 2 heart using existing DEBUG active-play clock; max HP must not eat it.
 const atWave2=await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.run.hp=s.run.maxHp;s.hpFace.setHp(s.run.hp);s.combat.qa.setElapsedMs(75000);return true})()");
 await wait("(()=>{const h=window.__game.scene.getScene('School').hearts.wave2;return h.spawned&&h.token?.active})()",'one existing-style healing heart at 75000ms',3000);
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(930,1015);s.player.body.reset(930,1015);return true})()");
 await sleep(140);
 assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.run.hp,heart:s.hearts.wave2.token?.active,collected:s.hearts.wave2.collected}})()"),
  {hp:5,heart:true,collected:false},'full HP does not waste wave2 heart');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');window.__wave2Token=s.hearts.wave2.token;return true})()");
 const heartMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(heartMenu.x,heartMenu.y);
 await wait("window.__game.scene.isPaused('School')&&window.__game.scene.isActive('Menu')",'MENU while heart visible');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'resume same wave2 heart');
 assert.equal(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.hearts.wave2.token===window.__wave2Token&&s.hearts.wave2.spawned&&!s.hearts.wave2.collected})()"),true,'no second heart after MENU/WZNÓW');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.run.hp=3;s.hpFace.setHp(3);return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.hearts.wave2.collected&&s.run.hp===5})()",'wave2 heart heals exactly once and clamps',3000);
 const onceHeart=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {spawned:s.hearts.wave2.spawned,collected:s.hearts.wave2.collected,token:s.hearts.wave2.token}})()");
 assert.deepEqual(onceHeart,{spawned:true,collected:true,token:null},'no duplicate wave2 heart');
 console.log('PASS Act IV Chromium: wave2 healing heart at 75s, full HP retention, clamped +2 and one-shot pickup');
 // Fresh DEBUG School stage bypasses Maciek/Seba, but not mandatory pitch conversation.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'menu before optional bypass');
 await bootSchool('act4-school');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s?.combat&&!s.introActive&&!s.combat.started&&!s.dialogueState?.id})()",'free School DEBUG staging before pitch');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1215,785);s.player.body.reset(1215,785);return true})()");
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-blazej-observer'",'bypassed optional Maciek/Seba; boss proximity continues');
 assert.equal(await evaluate("window.__game.scene.getScene('School').maciekSeen"),false,'Maciek bypass is truly optional');
 for(let i=0;i<6;i++){
  const expected=i===0?{id:'act4-blazej-observer',index:1}:
   i===1?{id:'act4-blazej-confrontation',index:0}:
   i<5?{id:'act4-blazej-confrontation',index:i-1}:{id:null,index:0};
  let advanced=false;
  for(let attempt=0;attempt<3&&!advanced;attempt++){
   await dialogueNext();
   await sleep(110);
   const state=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,index:s.dialogueState.index}})()");
   advanced=state.id===expected.id&&state.index===expected.index;
   if(!advanced&&attempt===2)assert.deepEqual(state,expected,'six mandatory panels cannot be skipped or repeated');
  }
 }
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.combat.started&&s.schoolPhase==='COMBAT'})()",'bypassing optional encounter still starts four waves');
 console.log('PASS Act IV Chromium: Maciek/Seba bypass leaves pitch encounter and ordinary combat reachable');
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
 // Long smoke runs must not let incidental enemy contact terminate the
 // paused-scene regression before the resume assertions are exercised.
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.run.hp=999;s.hpFace.setHp(s.run.maxHp);s.player.setPosition(550,450);s.player.body.reset(550,450);return true})()");
 const p=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 for(let attempt=0;attempt<3;attempt++){
  await touch(p.x,p.y);await sleep(180);
  if(await evaluate("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')"))break;
 }
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
 for(let attempt=0;attempt<3;attempt++){
  await touch(barkPause.x,barkPause.y);await sleep(180);
  if(await evaluate("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')"))break;
 }
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
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.hearts.wave4.spawned&&s.hearts.wave4.token?.active})()",'wave4 heart after last ordinary enemy',3000);
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.run.hp=3;s.hpFace.setHp(3);s.player.setPosition(1035,1050);s.player.body.reset(1035,1050);return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.hearts.wave4.collected&&s.run.hp===5})()",'wave4 heart collected before Błażej activates',3000);
 const preBossHeart=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {collected:s.hearts.wave4.collected,token:s.hearts.wave4.token,phase:s.schoolPhase,boss:s.blazej.active,pending:s.pendingApproachArmed}})()");
 assert.ok(preBossHeart.collected&&preBossHeart.token===null&&preBossHeart.phase==='BLAZEJ_PENDING'&&!preBossHeart.boss&&preBossHeart.pending,
  'heart available and boss passive until player chooses to reapproach '+JSON.stringify(preBossHeart));
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1240,785);s.player.body.reset(1240,785);return true})()");
 await wait("window.__game.scene.getScene('School').dialogueState.id==='act4-blazej-final'",'post-wave final Błażej panel after deliberate re-approach',3000);
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.active"),false,'boss gated behind final dialogue DALEJ');
 console.log('PASS Act IV Chromium: wave4 post-cleanup heart heals once, full 170s preserved, boss only after re-approach and DALEJ');
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
 // ActTitle prepares Błażej's approved portrait before gameplay is visible.
 // The late-arrival fallback/refresh is covered independently by focused tests.
 await bootSchool('act4-blazej');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_PENDING'&&s.dialogueState?.id==='act4-blazej-final'})()",'single post-wave Błażej panel',4500);
 await wait("(()=>{const s=window.__game.scene.getScene('School'),d=s.dialoguePanel;return d.loaded.has('blazej')&&d.shell.list.some(o=>o.type==='Image'&&o.visible&&o.texture.key==='dialogue-blazej')})()",'predecoded Błażej portrait remains visible in final DEBUG panel',6000);
 const afterPortrait=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,index:s.dialogueState.index,text:s.dialoguePanel.text.text}})()");
 assert.deepEqual(afterPortrait,{id:'act4-blazej-final',index:0,text:'Ech, kazał pan, musiał sam!'},
  'cached portrait does not reset or advance dialogue');
 const passiveBoss=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,visible:s.blazej.actor.sprite.visible,active:s.blazej.active,target:s.blazej.target,hp:s.blazej.actor.hp,ordinary:s.combat.enemies.length,started:s.combat.started,artifacts:[...s.run.artifacts],dialogue:s.dialogueState.id,pausedBarks:s.ambientBarks.state.active.length}})()");
 assert.equal(passiveBoss.phase,'BLAZEJ_PENDING');
 assert.equal(passiveBoss.visible,true);
 assert.equal(passiveBoss.active,false);
 assert.equal(passiveBoss.target,null);
 assert.equal(passiveBoss.ordinary,0);
 assert.equal(passiveBoss.artifacts.length,2);
 assert.equal(passiveBoss.pausedBarks,0);
 await wait("(()=>{const s=window.__game.scene.getScene('School'),d=s.dialoguePanel;return d.loaded.has('blazej')&&d.shell.list.some(o=>o.type==='Image'&&o.visible&&o.texture.key==='dialogue-blazej')})()",'approved final Błażej portrait in DEBUG pre-boss dialogue',7000);
 // Shared DALEJ helper above verifies one-panel touch advancement.
 const postWave=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,index:s.dialogueState.index,text:s.dialoguePanel.text.text,boss:s.blazej.active,bullets:s.blazej.projectiles.length}})()");
 assert.deepEqual(postWave,{id:'act4-blazej-final',index:0,text:'Ech, kazał pan, musiał sam!',boss:false,bullets:0},'no premature boss before one DALEJ');
 await dialogueNext();
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_BOSS'&&s.blazej.active&&!s.dialogueState.id})()",'Błażej boss begins only after confrontation',3500);
 const bossStart=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {hp:s.blazej.actor.hp,ordinary:s.combat.enemies.length,wave:s.combat.wave,boss:s.blazej.active,water:s.weapon==='water-flamethrower'}})()");
 const bossHitArt=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej,a=b.actor,prev=a.hp,hit=b.damage(1,s.player,s.time.now);b.renderer.update(a,s.player,0,0);const art=a.sprite.getData('zubrokryptyda-art');return {hit,hpLost:prev-a.hp,tint:art.tintTopLeft,texture:art.texture.key,scale:art.scaleX}})()");
 assert.deepEqual(bossHitArt,{hit:true,hpLost:1,tint:0xff5a5a,texture:'enemy-blazej-v1',scale:.55},
  'real Błażej damage tints the dedicated approved sprite without changing mechanics');
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

 assert.ok(bossStart.hp===54&&bossStart.boss&&bossStart.ordinary===0&&!bossStart.water);
 // Short-circuit only the existing debug boss scheduler, never change player-facing timing.
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=5999;return true})()");
 await wait("window.__game.scene.getScene('School').blazej.attack.phase==='warning'",'radial telegraph before attack');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.kind"),'radial');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.volleys"),0,'no bullet before warning');
 const warningShapes=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.children.list.filter(o=>o.type==='Graphics'&&o.depth===16).map(o=>o.commandBuffer.length)})()");
 assert.deepEqual(warningShapes,[0],'no pre-attack Phaser warning circles before radial volley');
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=200;return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School'),a=s.blazej.actor.sprite.getData('zubrokryptyda-art');return a?.tintTopLeft===0xffe1a3})()",'approved Błażej sprite flashes bright before radial fire',650);
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=300;return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School'),a=s.blazej.actor.sprite.getData('zubrokryptyda-art');return a?.tintTopLeft===0xffffff})()",'radial warning tint flashes back to normal',650);
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=899;return true})()");
 await wait("window.__game.scene.getScene('School').blazej.volleys>0",'radial volley after warning',1500);
 const volley=await evaluate("(()=>{const b=window.__game.scene.getScene('School').blazej;return {volley:b.volleys,projectiles:b.projectiles.length}})()");
 assert.equal(volley.volley,1);
 assert.ok(volley.projectiles>0&&volley.projectiles<=24);
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.phase='chase';a.elapsed=5999;return true})()");
 await wait("(()=>{const b=window.__game.scene.getScene('School').blazej;return b.attack.phase==='warning'&&b.kind==='jump'})()",'jump telegraph before landing');
 const preLeap=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej;return {x:b.actor.x,y:b.actor.y,playerX:s.player.x,playerY:s.player.y,target:b.warningTarget}})()");
 assert.equal(preLeap.target,null,'landing is acquired at commitment, not locked during warning');
 await evaluate("(()=>{const a=window.__game.scene.getScene('School').blazej.attack;a.elapsed=899;return true})()");
 await wait("(()=>{const b=window.__game.scene.getScene('School').blazej;return b.jumping&&b.jumpElapsed>60})()",'Błażej visibly airborne after jump warning',1500);
 const jumpLanding=await evaluate("(()=>{const b=window.__game.scene.getScene('School').blazej;return {x:b.warningTarget?.x,y:b.warningTarget?.y}})()");
 assert.ok(Number.isFinite(jumpLanding.x)&&Number.isFinite(jumpLanding.y),'selected a collision-safe target on commitment');
 assert.ok(Math.hypot(jumpLanding.x-preLeap.x,jumpLanding.y-preLeap.y)>25,
  'Błażej makes real forward movement, not an in-place hop');
 const arc=await evaluate("(()=>{const b=window.__game.scene.getScene('School').blazej;return {lift:b.actor.y-b.actor.sprite.y,elapsed:b.jumpElapsed,groundY:b.actor.y,visualY:b.actor.sprite.y,landings:b.landings}})()");
 assert.ok(arc.lift>10&&arc.lift<=56&&arc.groundY>arc.visualY&&arc.landings===0,
   'visible Błażej arc separates logical ground and raised artwork '+JSON.stringify(arc));
 await wait("window.__game.scene.getScene('School').blazej.jumps>0",'safe warned jump landing');
 const jumped=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej;return {x:b.actor.x,y:b.actor.y,shock:b.jumps,alive:s.run.hp>0,phase:s.schoolPhase}})()");
 assert.ok(jumped.alive&&jumped.phase==='BLAZEJ_BOSS');
 assert.ok(Math.hypot(jumped.x-jumpLanding.x,jumped.y-jumpLanding.y)<1);
 assert.ok(Math.hypot(jumped.x-preLeap.playerX,jumped.y-preLeap.playerY)<
   Math.hypot(preLeap.x-preLeap.playerX,preLeap.y-preLeap.playerY),
   'jump landing is closer to captured Aloes position');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.actor.sprite.getData('zubrokryptyda-art').texture.key"),
  'enemy-blazej-v1','dedicated Błażej sprite remains attached after existing collision-safe jump');
 // Boss MENU/WZNÓW preserves live state without duplicating boss actor.
 const bossMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(bossMenu.x,bossMenu.y);
 await wait("window.__game.scene.isActive('Menu')&&window.__game.scene.isPaused('School')",'boss MENU');
 assert.equal(await evaluate("window.__game.scene.getScene('School').blazej.projectiles.length"),0);
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'boss WZNÓW');
 const helperQA=await evaluate(`(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej;const before=s.combat.enemies.filter(e=>e.bossHelper).length;
   b.damage(Math.max(1,b.actor.hp-30),s.player,s.time.now);
   const first=s.combat.enemies.filter(e=>e.bossHelper);
   b.damage(Math.max(1,b.actor.hp-14),s.player,s.time.now);
   const second=s.combat.enemies.filter(e=>e.bossHelper);
   return {before,first:first.length,second:second.length,unique:new Set(second.map(e=>e.sprite)).size,
    active:second.filter(e=>e.hp>0&&e.sprite?.active).length,
    grounded:second.every(e=>s.combat.renderers[e.type].damagePoseOf(e))};})()`);
 assert.ok(helperQA.before===0&&helperQA.first===2&&helperQA.second===4&&
   helperQA.unique===4&&helperQA.active===4&&helperQA.grounded,
   '65%/30% HP reinforcements use four real safe actors '+JSON.stringify(helperQA));
 const killedBoss=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),b=s.blazej;const hit=b.damage(b.actor.hp,s.player,performance.now());return {hit,dead:b.defeated,alive:b.active,phase:s.schoolPhase,burst:b.bursts.length,second:b.damage(1,s.player,performance.now()),helpers:s.combat.enemies.filter(e=>e.bossHelper).length}})()");
 assert.ok(killedBoss.hit&&killedBoss.dead&&!killedBoss.alive&&killedBoss.burst===1&&!killedBoss.second&&killedBoss.helpers===0,'boss death clears surviving helpers exactly once '+JSON.stringify(killedBoss));
 assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('School').ambientBarks;return [b.state.active.length,b.pool.filter(p=>p.root.visible).length]})()"),[0,0],'no stale boss bubble after death');
 const immediate=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {phase:s.schoolPhase,awarded:s.run.artifacts.has('blazej-bicycle'),visible:s.rewardRoot.visible,projectiles:s.blazej.projectiles.length}})()");
 assert.ok(immediate.phase==='BLAZEJ_BOSS'&&!immediate.awarded&&!immediate.visible&&immediate.projectiles===0,'boss pixel death does not immediately award bike '+JSON.stringify(immediate));
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_PICKUP_PENDING'&&!s.storyBusy&&s.objectiveText.text==='PODEJDŹ PO ROWER'&&s.objectiveText.visible})()",'post-boss walkable bicycle pickup phase',3000);
 const pending=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {bike:s.run.artifacts.has('blazej-bicycle'),panel:s.rewardRoot.visible,collected:s.bicycleCollected,phase:s.schoolPhase,controls:s.joystick.enabled,alive:s.blazej.actor.sprite?.active??false}})()");
 assert.deepEqual(pending,{bike:false,panel:false,collected:false,phase:'BLAZEJ_PICKUP_PENDING',controls:true,alive:false});
 const pendingMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(pendingMenu.x,pendingMenu.y);
 await wait("window.__game.scene.isPaused('School')&&window.__game.scene.isActive('Menu')",'pickup-pending MENU pause');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'pending pickup WZNÓW');
 assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.schoolPhase,s.bicycleCollected,s.run.artifacts.has('blazej-bicycle'),s.rewardRoot.visible]})()"),
  ['BLAZEJ_PICKUP_PENDING',false,false,false],'pickup stays pending and unawarded through MENU/WZNÓW');
 await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.player.setPosition(1510,970);s.player.body.reset(1510,970);s.cameras.main.centerOn(1510,970);return true})()");
 await sleep(160);
 assert.equal(await evaluate("window.__game.scene.getScene('School').schoolPhase"),'BLAZEJ_PICKUP_PENDING','no auto-reward far from rack');
 const bikeStick=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.joystick.base.x,y:r.y+s.joystick.base.y,rad:s.hudLayout.joystickRadius}})()");
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bikeStick.x,y:bikeStick.y,id:45}]});
 await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bikeStick.x,y:bikeStick.y-bikeStick.rad*.85,id:45}]});
 try{
  await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_REWARD'&&s.rewardRoot.visible&&s.bicycleCollected})()",'physical left-joystick approach to the accessible side of the rack',4000);
 }finally{await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 const bikeReached=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {at:[s.player.x,s.player.y],phase:s.schoolPhase,awarded:s.run.artifacts.has('blazej-bicycle'),collected:s.bicycleCollected,panel:s.rewardRoot.visible,objective:s.objectiveText.visible}})()");
 assert.ok(bikeReached.awarded&&bikeReached.collected&&bikeReached.panel&&!bikeReached.objective,
  'one physical bicycle pickup from outside solid rack '+JSON.stringify(bikeReached));
 assert.ok(Math.hypot(bikeReached.at[0]-1510,bikeReached.at[1]-883)<46,'Aloes moved within the accessible collection radius');
 assert.equal(await evaluate("window.__game.scene.getScene('School').collectBlazejBicycle()"),false,'no duplicate bicycle reward after collection');
 const bicycleReward=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.run.artifacts.has('blazej-bicycle'),all:[...s.run.artifacts],text:s.rewardName.text,third:s.rewardDetail.text,approvedImage:s.bicycleTexture}})()");
 assert.ok(bicycleReward.id&&bicycleReward.all.length===3&&bicycleReward.text==='ROWER BŁAŻEJA'&&bicycleReward.third==='ARTEFAKT 3/3');
 assert.ok(bicycleReward.approvedImage===null||bicycleReward.approvedImage==='artifact-blazej-bicycle','only validated original bike PNG or honest text fallback');
 const bikeAssetStatus=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),t=s.textures;return {movieReady:s.bicycleCinematic.ready,movieStarted:s.bicycleCinematic.started,movieTexture:t.exists('act4-aloes-bicycle-cinematic'),movieFrames:t.exists('act4-aloes-bicycle-cinematic')?t.get('act4-aloes-bicycle-cinematic').frameTotal:null,artifact:s.bicycleTexture,artifactTexture:t.exists('artifact-blazej-bicycle'),phase:s.schoolPhase}})()");
 console.log('ACT IV BICYCLE ASSET STATUS',JSON.stringify(bikeAssetStatus));
 assert.ok(!bikeAssetStatus.movieTexture&&!bikeAssetStatus.movieReady&&!bikeAssetStatus.movieStarted,
   'large 3072x1296 bicycle film stays lazy until reward DALEJ');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.bicycleTexture==='artifact-blazej-bicycle'})()",'approved bicycle artifact decoded, film intentionally deferred',4500);
 const rewardPoint=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.rewardButton.x,y:r.y+s.rewardButton.y}})()");
 await sleep(250);await touch(rewardPoint.x,rewardPoint.y);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BICYCLE_RIDE'&&s.bicycleRideStarted&&s.storyBusy&&!s.rewardRoot.visible})()",'reward DALEJ opens one cinematic transition',2000);
 assert.equal(await evaluate("window.__game.scene.getScene('School').startBicycleRide()"),false,'rapid second DALEJ cannot start a duplicate movie');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.bicycleCinematic.sprite?.active&&s.bicycleCinematic.backdrop?.active})()",'approved cinematic screen replaces schoolyard after first black fade',3500);
 const cinemaStart=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),c=s.bicycleCinematic,a=c.sprite,p=s.player;const qa=window.__bikeCinematicQA={frames:[0],repeats:0,completions:0,startedAt:0,endedAt:0};a.on('animationstart',()=>{qa.startedAt=performance.now();});a.on('animationupdate',(_animation,frame)=>qa.frames.push(Number(frame.textureFrame)));a.on('animationrepeat',()=>qa.repeats++);a.on('animationcomplete',()=>{qa.completions++;qa.endedAt=performance.now();});return {ready:c.ready,started:c.started,playing:c.playing,texture:a.texture.key,width:a.displayWidth,height:a.displayHeight,depth:a.depth,black:c.backdrop.fillColor,blackDepth:c.backdrop.depth,scroll:a.scrollFactorX,player:[p.x,p.y],phase:s.schoolPhase,size:[s.scale.width,s.scale.height],artifacts:[...s.run.artifacts]}})()");
 console.log('ACT IV CINEMATIC FIT',JSON.stringify(cinemaStart));
 assert.ok(cinemaStart.ready&&cinemaStart.started&&cinemaStart.texture==='act4-aloes-bicycle-cinematic'&&cinemaStart.depth===301&&cinemaStart.black===0&&cinemaStart.blackDepth===300&&cinemaStart.scroll===0);
 assert.ok(cinemaStart.width<=cinemaStart.size[0]+1e-6&&cinemaStart.height<=cinemaStart.size[1]+1e-6&&Math.abs(cinemaStart.width/cinemaStart.height-16/9)<.001,'16:9 768x432 frame is centred, fitted and letterboxed');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.bicycleCinematic.playing&&window.__bikeCinematicQA.frames.length>=2})()",'native 12fps pedalling actually advances frames',2200);
 const animationConfig=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),a=s.bicycleCinematic.sprite,anim=a.anims.currentAnim;return {key:anim.key,rate:anim.frameRate,repeat:anim.repeat,frames:anim.frames.map(f=>Number(f.textureFrame)),playing:a.anims.isPlaying,player:[s.player.x,s.player.y],phase:s.schoolPhase,controls:s.joystick.enabled,aim:s.aimJoystick.enabled}})()");
 assert.deepEqual(animationConfig.frames,Array.from({length:12},(_,i)=>i),'approved exact 0..11 row-major native frames');
 assert.deepEqual([animationConfig.key,animationConfig.rate,animationConfig.repeat,animationConfig.playing,animationConfig.controls,animationConfig.aim],
  ['act4-aloes-bicycle-three-cycles',12,2,true,false,false]);
 assert.deepEqual(animationConfig.player,cinemaStart.player,'top-down Aloes does not move during full-screen film');
 const movieMenu=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(movieMenu.x,movieMenu.y);
 await wait("window.__game.scene.isPaused('School')&&window.__game.scene.isActive('Menu')",'MENU safely pauses active cinematic',2500);
 const frozen=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.bicycleCinematic.cycles,s.bicycleCinematic.sprite.anims.currentFrame.textureFrame,s.bicycleRideStarted]})()");
 await sleep(250);
 assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.bicycleCinematic.cycles,s.bicycleCinematic.sprite.anims.currentFrame.textureFrame,s.bicycleRideStarted]})()"),
  frozen,'paused film does not advance frames or duplicate transition');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'MENU resumes existing film from same animation frame',2500);
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='CHAPEL_RETURN'&&s.dialogueState?.id==='act4-chapel-ending'})()",'three full 12fps cycles then second black fade and chapel return',8500);
 const cinematicOutcome=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),qa=window.__bikeCinematicQA,world=s.bicycleWorld;return {cycles:s.bicycleCinematic.cycles,completed:s.bicycleCinematic.completed,stillSprite:!!s.bicycleCinematic.sprite,stillBackdrop:!!s.bicycleCinematic.backdrop,frames:qa.frames,repeatEvents:qa.repeats,completeEvents:qa.completions,animationMs:qa.endedAt-qa.startedAt,staticBike:{active:world?.active??false,key:world?.texture.key,x:world?.x,y:world?.y,width:world?.displayWidth},normalPlayer:s.playerVisual.sprite?.visible&&s.playerVisual.sprite?.active,phase:s.schoolPhase,dialogue:s.dialogueState.id,artifacts:[...s.run.artifacts]}})()");
 assert.deepEqual([cinematicOutcome.cycles,cinematicOutcome.completed,cinematicOutcome.stillSprite,cinematicOutcome.stillBackdrop,cinematicOutcome.repeatEvents,cinematicOutcome.completeEvents],
  [3,true,false,false,2,1],'exactly three native full cycles with one completion and cleaned film');
 assert.deepEqual([...new Set(cinematicOutcome.frames)].sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i),'all twelve approved frames played in browser');
 assert.ok(cinematicOutcome.animationMs>2750&&cinematicOutcome.animationMs<3550,'3 cycles of 12fps run approximately 3000ms '+cinematicOutcome.animationMs);
 assert.ok(cinematicOutcome.staticBike.active&&cinematicOutcome.staticBike.key==='artifact-blazej-bicycle'&&cinematicOutcome.staticBike.width===96,'original standalone bicycle decorates chapel return');
 assert.ok(cinematicOutcome.normalPlayer&&cinematicOutcome.dialogue==='act4-chapel-ending'&&cinematicOutcome.artifacts.length===3);
 const chapel=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {x:s.player.x,y:s.player.y,captain:s.captainArrival.actor?.active??false,bike:s.run.artifacts.has('blazej-bicycle'),dialogue:s.dialogueState.id,phase:s.schoolPhase}})()");
 assert.ok(Math.hypot(chapel.x-525,chapel.y-1000)<2&&chapel.captain===false&&chapel.bike);
 console.log('PASS Act IV approved bicycle Chromium: 3072x1296 RGBA decoded, 12 frames at 12fps x3, letterboxing, MENU/WZNÓW freeze, two black fades, static bike and chapel finale');
 for(let i=0;i<4;i++)await dialogueNext();
 await wait("window.__game.scene.isActive('Catacombs')&&!window.__game.scene.isActive('School')",'Act IV completed and continued through title to Catacombs',9000);
 const campaign=await evaluate("(()=>{const g=window.__game,r=g.registry.get('campaign-run');return {hp:r.hp,completed:[...r.completedActs],artifacts:[...r.artifacts],selected:r.selectedWeapon,water:r.unlockedWeapons.has('water-flamethrower'),stat:r.stats.byAct.act4,title:g.scene.isActive('ActTitle'),cave:g.scene.keys.Cave??null,debug:r.isDebugRun}})()");
 assert.ok(campaign.completed.includes('act4')&&campaign.artifacts.length===3&&campaign.hp>0);
 assert.ok(campaign.stat?.kills>=1&&campaign.stat?.activeCombatMs>=170000);
 assert.equal(campaign.selected==='water-flamethrower',false);
 assert.equal(campaign.water,true);
 assert.equal(campaign.title,false);
 assert.equal(campaign.cave,null);
 assert.equal(campaign.debug,true);
 console.log('PASS PR106 real Chromium: passive Błażej, authorized confrontation, 900ms warned radial and jump, bounded projectiles, boss MENU/WZNÓW, one death, text-only bicycle reward, chapel/Marian absence, three artifacts, Act IV completion to Catacombs');
 console.log('PASS School real Chromium Android landscape: Captain gating, wave1 enemy spawn, touch rifle, MENU/WZNÓW, wave4 DEBUG, water restriction');
 // Real Act III -> IV handoff QA with deterministic existing Act III escape DEBUG.
 // Its approved extraction dialogue, ActTitle, checkpoint and School scenes run normally.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("typeof window.__createDebugFixture==='function'&&window.__game?.scene.isActive('Menu')",'Menu before Act III HP boundary');
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act3-escape');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('Volcano',{handoff:f.handoff,debugCheckpoint:'act3-escape'});return true})()");
 await wait("(()=>{const s=window.__game?.scene.getScene('Volcano');return s?.finale?.state==='ESCAPE_ACTIVE'&&!!s.extractionPoint&&!!s.dialoguePanel})()",'Act III extraction staged in live Volcano',16000);
 await wait("(()=>{const s=window.__game.scene.getScene('Volcano');return !s.cameras.main.fadeEffect?.isRunning})()",'original Act III camera fade-in completes before accelerated extraction',4500);
 const escapeHP=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),r=s.run;r.hp=2;r.isDebugRun=false;r.artifacts.add('bogdan-hunting-horn');r.selectedWeapon='water-flamethrower';s.weapon='water-flamethrower';s.hpFace.setHp(2);s.hpText.setText('HP 2/5');const before={hp:r.hp,max:r.maxHp,act:r.actId,water:r.unlockedWeapons.has('water-flamethrower'),horn:r.artifacts.has('bogdan-hunting-horn')};s.player.setPosition(s.extractionPoint.x,s.extractionPoint.y);s.player.body.reset(s.player.x,s.player.y);return before})()");
 assert.deepEqual(escapeHP,{hp:2,max:5,act:'act3',water:true,horn:true});
 await wait("window.__game.scene.getScene('Volcano').dialogueState.id==='act3-captain-extraction'",'three-panel Captain extraction',4500);
 // Observe the actual Phaser ScenePlugin transition without intercepting or
 // manually dispatching it. This is the same path as the player's last DALEJ.
 await evaluate("(()=>{const g=window.__game;window.__act4TitleStarts=0;g.scene.getScene('ActTitle').events.on('start',()=>{window.__act4TitleStarts++;});return true})()");
 for(let i=0;i<3;i++){
  await sleep(230);
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.dialoguePanel.button,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+b.x,y:r.y+b.y,visible:b.visible,hp:s.run.hp,id:s.dialogueState.id}})()");
  assert.ok(p.visible&&p.hp===2&&p.id==='act3-captain-extraction','Act III dialogue must not heal Aloes');
  await touch(p.x,p.y);
 }
 await sleep(1300);
 const volcanoTransitionDiag=await evaluate("(()=>{const g=window.__game,v=g.scene.getScene('Volcano'),t=g.scene.getScene('ActTitle'),r=g.registry.get('campaign-run');return {active:g.scene.getScenes(true).map(x=>x.scene.key),volcano:{status:v.sys.settings.status,disposed:v.disposed,finale:v.finale?.state,fadeRunning:v.cameras.main?.fadeEffect?.isRunning},title:{status:t.sys.settings.status,act:t.actId,gate:t.assetGate??null},run:{act:r.actId,completed:[...r.completedActs],hp:r.hp,weapon:r.selectedWeapon,debug:r.isDebugRun},started:window.__act4TitleStarts,save:localStorage.getItem('klusoczlek-campaign-v1')?.slice(0,70)}})()");
 console.log('ACT III TO IV TRANSITION DIAG',JSON.stringify(volcanoTransitionDiag),'BROWSER EXCEPTIONS',JSON.stringify(exceptions.slice(-3)));
 await wait("(()=>{try{return JSON.parse(localStorage.getItem('klusoczlek-campaign-v1'))?.actId==='act4'}catch{return false}})()",'natural Volcano completed Act IV checkpoint',4500);
 const actualHandoff=await evaluate("(()=>{const g=window.__game,r=g.registry.get('campaign-run'),t=g.scene.getScene('ActTitle');return {count:window.__act4TitleStarts,act:t.actId,scene:t.nextScene,hp:t.handoff?.hp,max:t.handoff?.maxHp,selected:t.handoff?.selectedWeapon,horn:t.handoff?.artifacts.has('bogdan-hunting-horn'),completed:[...r.completedActs],runtimeHp:r.hp,menu:g.scene.isActive('Menu')}})()");
 assert.deepEqual([actualHandoff.count,actualHandoff.act,actualHandoff.scene,actualHandoff.hp,actualHandoff.max,actualHandoff.selected,actualHandoff.horn,actualHandoff.runtimeHp,actualHandoff.menu],
  [1,'act4','School',5,5,'rifle',true,5,false],'exactly one native Act IV title from Volcano');
 assert.deepEqual(actualHandoff.completed.sort(),['act1','act2','act3']);
 await wait("(()=>{try{return JSON.parse(localStorage.getItem('klusoczlek-campaign-v1'))?.actId==='act4'}catch{return false}})()",'ActTitle wrote valid Act IV checkpoint',3500);
 const titleHP=await evaluate("(()=>{const g=window.__game,r=g.registry.get('campaign-run'),t=g.scene.getScene('ActTitle'),raw=JSON.parse(localStorage.getItem('klusoczlek-campaign-v1'));return {hp:r.hp,max:r.maxHp,handoffHp:t.handoff?.hp,handoffMax:t.handoff?.maxHp,act:t.actId,selected:r.selectedWeapon,water:r.unlockedWeapons.has('water-flamethrower'),horn:r.artifacts.has('bogdan-hunting-horn'),completed:[...r.completedActs],saved:{act:raw.actId,hp:raw.hp,max:raw.maxHp,selected:raw.selectedWeapon,horn:raw.artifacts.includes('bogdan-hunting-horn')},menu:g.scene.isActive('Menu')}})()");
 assert.deepEqual([titleHP.hp,titleHP.max,titleHP.handoffHp,titleHP.handoffMax],[5,5,5,5]);
 assert.deepEqual(titleHP.saved,{act:'act4',hp:5,max:5,selected:'rifle',horn:true});
 assert.ok(titleHP.act==='act4'&&titleHP.selected==='rifle'&&titleHP.water&&titleHP.horn&&!titleHP.menu);
 assert.deepEqual(titleHP.completed.sort(),['act1','act2','act3']);
 await wait("window.__game.scene.isActive('School')",'real Act IV School after title',6500);
 const directHP=await evaluate("(()=>{const g=window.__game,s=g.scene.getScene('School');return {hp:s.run.hp,max:s.run.maxHp,weapon:s.weapon,label:s.hpText.text,intro:s.introActive,captain:!!s.captainArrival,arrival:s.captainArrival?.arrived,departing:s.captainDeparting,menu:g.scene.isActive('Menu')}})()");
 assert.deepEqual([directHP.hp,directHP.max,directHP.weapon,directHP.label,directHP.captain,directHP.menu],[5,5,'rifle','HP 5/5',true,false]);
 assert.ok(directHP.intro||directHP.departing||directHP.arrival,'approved Captain Marian chapel introduction');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.dialogueState.id==='act4-captain-opening'&&s.captainDialogueStarted&&s.captainArrival.arrived})()",'direct Act III -> IV handoff starts approved Captain dialogue',5000);
 assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.dialogueState.index,s.introActive,s.captainDeparting,s.combat.started,s.run.artifacts.has('bogdan-hunting-horn')]})()"),
  [0,true,false,false,true],'one opening after direct title handoff; Captain remains stopped and horn remains');
 const pause=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y}})()");
 await touch(pause.x,pause.y);
 await wait("window.__game.scene.isPaused('School')&&window.__game.scene.isActive('Menu')",'Act IV MENU after direct handoff',3000);
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('School')",'Act IV WZNÓW after direct handoff',3000);
 assert.deepEqual(await evaluate("(()=>{const s=window.__game.scene.getScene('School');return [s.run.hp,s.dialogueState.id,s.dialogueState.index,s.captainDialogueStarted,s.captainDeparting]})()"),
  [5,'act4-captain-opening',0,true,false],'MENU/WZNÓW preserves first Captain dialogue panel and HP');
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'Menu after saved Act IV reload');
 assert.ok((await geometry()).buttons.some(b=>b.text==='WZNÓW'));
 await tapMenu('WZNÓW');
 await wait("(()=>{const g=window.__game;return g.scene.isActive('ActTitle')||g.scene.isActive('School')})()",'checkpoint resumes Act IV title or School',4000);
 await wait("window.__game.scene.isActive('School')",'checkpoint resumes School',6500);
 const savedHP=await evaluate("(()=>{const g=window.__game,s=g.scene.getScene('School');return {hp:s.run.hp,max:s.run.maxHp,weapon:s.weapon,label:s.hpText.text,horn:s.run.artifacts.has('bogdan-hunting-horn'),completed:[...s.run.completedActs],intro:s.introActive,captain:!!s.captainArrival,arrived:s.captainArrival?.arrived,departing:s.captainDeparting,menu:g.scene.isActive('Menu')}})()");
 assert.deepEqual([savedHP.hp,savedHP.max,savedHP.weapon,savedHP.label,savedHP.horn,savedHP.captain,savedHP.menu],[5,5,'rifle','HP 5/5',true,true,false]);
 assert.ok(savedHP.intro||savedHP.departing||savedHP.arrived,'Captain intro retained after checkpoint reload');
 assert.deepEqual(savedHP.completed.sort(),['act1','act2','act3']);
 await finishCaptainOpening();
 assert.equal(await evaluate("window.__game.scene.getScene('School').captainDialogueStarted"),true,
  'autosave resume played exactly one Captain intro for its new scene entry');
 console.log('PASS Act III -> IV real Chromium: 2/5 during escape/extraction, 5/5 live title, 5/5 autosave reload, horn, rifle, Marian and MENU/WZNÓW');
 // Regression: a missing FADE_OUT_COMPLETE must not strand the final
 // Captain dialogue on a permanently black screen.
 await cdp('Page.reload',{ignoreCache:true});
 await sleep(250);
 await wait("window.__game?.scene.isActive('Menu')",'Menu before stuck fade regression');
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act3-escape');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('Volcano',{handoff:f.handoff,debugCheckpoint:'act3-escape'});return true})()");
 await wait("(()=>{const s=window.__game?.scene.getScene('Volcano');return s?.finale?.state==='ESCAPE_ACTIVE'&&!!s.extractionPoint&&!s.cameras.main?.fadeEffect?.isRunning})()",'Volcano ready for stalled fade',16000);
 await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano');s.run.isDebugRun=false;s.run.artifacts.add('bogdan-hunting-horn');s.player.setPosition(s.extractionPoint.x,s.extractionPoint.y);s.player.body.reset(s.player.x,s.player.y);return true})()");
 await wait("window.__game.scene.getScene('Volcano').dialogueState.id==='act3-captain-extraction'",'Captain extraction before missing fade',4500);
 await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano');s.cameras.main.fadeOut=()=>s.cameras.main;return true})()");
 for(let i=0;i<3;i++){
  await sleep(220);
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.dialoguePanel.button,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+b.x,y:r.y+b.y}})()");
  await touch(p.x,p.y);
 }
 await wait("window.__game.scene.isActive('ActTitle')",'Act III fade watchdog starts real ActTitle with no camera event',4000);
 await wait("window.__game.scene.isActive('School')",'Act III fade watchdog reaches School',8000);
 assert.equal(await evaluate("window.__game.scene.getScene('School').run.artifacts.has('bogdan-hunting-horn')"),true);
 console.log('PASS Act III -> IV Chromium: missing fade event recovered by independent watchdog, real ActTitle -> School');
 // Approved Act III horn: stage the real Bogdan boss using existing DEBUG,
 // then verify original two-panel finale, award, art and eruption sequence.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("typeof window.__createDebugFixture==='function'&&window.__game?.scene.isActive('Menu')",'Menu before approved Bogdan horn QA');
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act3-boss');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('Volcano',{handoff:f.handoff,debugCheckpoint:'act3-boss'});return true})()");
 await wait("(()=>{const s=window.__game?.scene.getScene('Volcano');return s?.boss?.active&&s.boss.ready&&!!s.walkability&&s.finale.state==='BOGDAN_ACTIVE'})()",'real Volcano boss DEBUG with approved terrain and active Bogdan',16000);
 await wait("(()=>{const s=window.__game.scene.getScene('Volcano');return !s.cameras.main.fadeEffect?.isRunning})()",'Bogdan HUD clear of camera reveal fade',3000);
 await captureAct5('REF-bogdan-hp-chromium');
 await wait("(()=>{const s=window.__game.scene.getScene('Volcano');return !!s.hornRewardImage?.active&&s.hornRewardImage.texture.key==='artifact-bogdan-horn'})()",'approved Bogdan horn PNG loaded and decoded in Volcano',8500);
 const loadedHorn=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),i=s.hornRewardImage,t=s.textures.get('artifact-bogdan-horn');return {texture:i.texture.key,width:t.source[0].width,height:t.source[0].height,index:s.rewardRoot.list.indexOf(i),visible:s.rewardRoot.visible,owner:s.run.artifacts.has('bogdan-hunting-horn')}})()");
 assert.deepEqual(loadedHorn,{texture:'artifact-bogdan-horn',width:192,height:192,index:2,visible:false,owner:false},
  'validated approved horn image is embedded, without awarding before boss defeat');
 const bogdanDefeat=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.boss;const hit=b.damage(b.hp,s.time.now);return {hit,defeated:b.defeated,pending:b.defeatPending,artifacts:[...s.run.artifacts]}})()");
 assert.ok(bogdanDefeat.hit&&bogdanDefeat.defeated&&bogdanDefeat.pending&&!bogdanDefeat.artifacts.includes('bogdan-hunting-horn'));
 await wait("window.__game.scene.getScene('Volcano').dialogueState.id==='act3-bogdan-final'",'two-panel Bogdan finale dialogue',4000);
 const volcanoDialogueNext=async(expected,nextIndex)=>{
  const initial=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano');return {id:s.dialogueState.id,index:s.dialogueState.index}})()");
  assert.equal(initial.id,expected,'expected dialogue before DALEJ');
  // A touch during dialogue-ui's 180ms input guard can be ignored.
  // Retry only while the SAME panel remains; never advance state in JS.
  const deadline=Date.now()+1800;
  let last=null,attempts=0;
  while(Date.now()<deadline&&attempts<5){
   await sleep(230);
   const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.dialoguePanel.button,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+b.x,y:r.y+b.y,visible:b.visible,id:s.dialogueState.id,index:s.dialogueState.index,caption:s.dialoguePanel.text.text,loop:s.game.loop.time,focus:document.hasFocus(),hidden:document.hidden,paused:s.scene.isPaused()}})()");
   last=p;
   if(p.id!==initial.id||p.index!==initial.index)break;
   assert.ok(p.visible&&p.caption.length>0,'Bogdan DALEJ visible '+JSON.stringify(p));
   await touch(p.x,p.y);attempts++;
   await sleep(95);
   last=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano');return {id:s.dialogueState.id,index:s.dialogueState.index,loop:s.game.loop.time,focus:document.hasFocus(),hidden:document.hidden,paused:s.scene.isPaused()}})()");
   if(last.id!==initial.id||last.index!==initial.index)break;
  }
  if(nextIndex===null){
   assert.notEqual(last.id,initial.id,'Bogdan finale closes after second DALEJ '+JSON.stringify({initial,last,attempts}));
  }else{
   assert.equal(last.id,expected,'Bogdan panel identity retained '+JSON.stringify({initial,last,attempts}));
   assert.equal(last.index,nextIndex,'second original Bogdan panel not skipped '+JSON.stringify({initial,last,attempts}));
  }
 };
 await volcanoDialogueNext('act3-bogdan-final',1);
 await volcanoDialogueNext('act3-bogdan-final',null);
 await wait("(()=>{const s=window.__game.scene.getScene('Volcano');return s.finale.state==='ARTIFACT_REWARD'&&s.rewardRoot.visible&&s.rewardButton.visible})()",'approved horn reward after both Bogdan panels',3000);
 const hornPanel=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),h=s.scale.height,w=s.scale.width,i=s.hornRewardImage,t=s.rewardRoot.list.filter(o=>o.type==='Text').map(o=>({text:o.text,y:o.y}));return {artifacts:[...s.run.artifacts],image:{key:i.texture.key,x:i.x,y:i.y,w:i.displayWidth,h:i.displayHeight,visible:i.visible},texts:t,button:s.rewardButton.visible,width:w,height:h,layout:s.rewardRoot.visible}})()");
 assert.ok(hornPanel.artifacts.includes('bogdan-hunting-horn')&&hornPanel.layout&&hornPanel.button);
 assert.ok(['ZDOBYŁEŚ ARTEFAKT','RÓG MYŚLIWSKI BOGDANA','ARTEFAKT 2/3'].every(x=>hornPanel.texts.some(t=>t.text===x)));
 assert.ok(hornPanel.image.visible&&hornPanel.image.w===hornPanel.image.h&&hornPanel.image.w<=110);
 assert.ok(Math.abs(hornPanel.image.x-hornPanel.width/2)<1&&Math.abs(hornPanel.image.y-hornPanel.height*.44)<1);
 assert.ok(hornPanel.texts.find(t=>t.text==='RÓG MYŚLIWSKI BOGDANA').y>hornPanel.image.y+hornPanel.image.h/2,
  'landscape reward image sits above name and DALEJ without cropping');
 const nextHorn=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.rewardButton.x,y:r.y+s.rewardButton.y}})()");
 await sleep(250);await touch(nextHorn.x,nextHorn.y);
 await wait("(()=>{const s=window.__game.scene.getScene('Volcano');return s.finale.state==='BOGDAN_EXPLOSION'||s.dialogueState?.id==='act3-eruption-warning'})()",'horn DALEJ advances to existing eruption',3500);
 await wait("window.__game.scene.getScene('Volcano').dialogueState.id==='act3-eruption-warning'",'approved eruption warning retained',5000);
 await volcanoDialogueNext('act3-eruption-warning',null);
 await wait("window.__game.scene.getScene('Volcano').finale.state==='ESCAPE_ACTIVE'",'existing eruption escape begins',4000);
 console.log('PASS approved Act III horn Chromium: real boss defeat, 2 finale panels, decoded 192x192 PNG, responsive artifact 2/3, DALEJ and eruption escape');
 // Act V fast end-to-end using the real approved chapel completion and
 // DEBUG fixture; no four-wave combat replay or new browser test runner.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("window.__game?.scene.isActive('Menu')",'Act V fresh menu');
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act4-finale');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('School',{handoff:f.handoff,debugCheckpoint:'act4-finale'});return true})()");
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.entryGateReady&&!!s.combat})()",'School final chapel debug',15000);
 const act5Handoff=await evaluate("(()=>{const s=window.__game.scene.getScene('School');s.run.artifacts.add('blazej-bicycle');s.run.hp=3;s.schoolPhase='CHAPEL_RETURN';return s.completeActFour()})()");
 assert.equal(act5Handoff,true,'real School.completeActFour handoff');
 // Lifecycle signals must NOT truncate the original 520ms camera fade.
 await evaluate("(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('resize'));document.dispatchEvent(new Event('visibilitychange'));return true})()");
 assert.equal(await evaluate("window.__game.scene.isActive('School')&& !window.__game.scene.isActive('ActTitle')"),true,
  'Act IV handoff is not triggered by premature focus/resize/visibility');
 await wait("(()=>{const g=window.__game,t=g.scene.getScene('ActTitle');return g.scene.isActive('ActTitle')&&t.actId==='act5'&&t.nextScene==='Catacombs'})()",'Act IV -> V via title',5000);
 assert.equal(await evaluate("window.__game.registry.get('campaign-run').hp"),5,'Act V restores full HP');
 await wait("(()=>{const g=window.__game,s=g.scene.getScene('Catacombs');return g.scene.isActive('Catacombs')&&s.entryGateReady&&s.dialogueState.id==='act5-betrayal'})()",'Act V scene opening dialogue',16000);
 const opening5=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {hp:s.run.hp,weapon:s.weapon,phase:s.phase,controls:s.joystick.enabled,artifacts:s.run.artifacts.size}})()");
 assert.equal(opening5.hp,5);assert.equal(opening5.artifacts,3);
 assert.equal(opening5.phase,'opening');assert.equal(opening5.controls,false);
 assert.notEqual(opening5.weapon,'water-flamethrower');
 const next5=async()=>{
  const initial=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {id:s.dialogueState.id,index:s.dialogueState.index}})()");
  assert.ok(initial.id,'Act V dialogue is active');
  for(let attempt=0;attempt<3;attempt++){
   await sleep(235);
   const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),r=window.__game.canvas.getBoundingClientRect(),c=s.cameras.main,b=s.dialoguePanel.button;return {x:r.x+b.x*c.zoom+(1-c.zoom)*s.scale.width/2,y:r.y+b.y*c.zoom+(1-c.zoom)*s.scale.height/2,visible:b.visible,zoom:c.zoom}})()");
   assert.ok(p.visible,'Act V DALEJ');
   await touch(p.x,p.y);await sleep(90);
   const actual=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {id:s.dialogueState.id,index:s.dialogueState.index}})()");
   if(actual.id!==initial.id||actual.index!==initial.index)return;
  }
  throw Error('Act V DALEJ did not advance '+JSON.stringify(initial));
 };
 const act5Opening=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {index:s.dialogueState.index,world:s.bossArt.texture.key,portrait:s.dialoguePanel.shell.list.filter(x=>x.type==='Image'&&x.visible).map(x=>x.texture.key),boss:s.boss.phase}})()");
 assert.equal(act5Opening.index,0);
 assert.equal(act5Opening.world,'npc-captain','normal Marian sheet before first panel');
 assert.ok(act5Opening.portrait.includes('dialogue-captain'),'normal Marian dialogue portrait');
 assert.equal(act5Opening.boss,'staging');
 // Verify rendered screen-space bounds, not world-space coordinates:
 // opening has a local camera zoom to keep Aloes, altar and Marian above DALEJ.
 const originalViewport=await evaluate("({width:innerWidth,height:innerHeight})");
 for(const [w,h] of [[915,412],[960,432],[568,220],[568,240],[568,320]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
  await evaluate('window.__game.scale.refresh();true');
  await wait("window.__game.scale.width==="+w+"&&window.__game.scale.height==="+h,'Act V opening landscape '+w+'x'+h,1800);
  await sleep(110);
  if(w>=900)await captureAct5('A-opening-'+w+'x'+h);
  const view=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),c=s.cameras.main,p=s.playerVisual.sprite,b=s.dialoguePanel.shell.list[0],bounds=p.getBounds();const screen=(x,y)=>({x:(x-c.scrollX)*c.zoom+(1-c.zoom)*s.scale.width/2,y:(y-c.scrollY)*c.zoom+(1-c.zoom)*s.scale.height/2});return {zoom:c.zoom,scroll:{x:c.scrollX,y:c.scrollY},spawn:{x:s.player.x,y:s.player.y},facing:s.facing,walkable:s.player.x===480&&s.player.y===393,marian:s.bossActor.y,altar:312,top:screen(s.bossActor.x,s.bossActor.y-256*.62*1.23).y,playerTop:screen(s.player.x,bounds.top).y,playerBottom:screen(s.player.x,bounds.bottom).y,dialogueTop:b.y,screenCenter:screen(s.player.x,s.player.y).x,viewport:s.scale.width}})()");
  console.log('ACT V OPENING SCREEN QA '+w+'x'+h+' '+JSON.stringify(view));
  assert.equal(view.facing,'n','Aloes looks north toward Marian');
  assert.ok(view.walkable&&view.marian<view.altar&&view.altar<view.spawn.y,
   'central Aloes / altar / Marian staging '+JSON.stringify(view));
  assert.ok(view.top>=-1&&view.playerTop>=0&&view.playerBottom<view.dialogueTop-2,
   'Act V actors clear the actual screen-space dialogue overlay '+w+'x'+h+' '+JSON.stringify(view));
  assert.ok(Math.abs(view.screenCenter-view.viewport/2)<3,'Aloes is visibly centered on phone landscape '+JSON.stringify(view));
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:originalViewport.width,height:originalViewport.height,deviceScaleFactor:1,mobile:false});
 await evaluate('window.__game.scale.refresh();true');
 await wait("window.__game.scale.height==="+originalViewport.height,'restore Act V landscape',1500);
 // All following Act V frames use the approved mobile landscape target.
 await cdp('Emulation.setDeviceMetricsOverride',{width:960,height:432,deviceScaleFactor:1,mobile:false});
 await evaluate('window.__game.scale.refresh();true');
 await wait("window.__game.scale.width===960&&window.__game.scale.height===432",'Act V 960x432 cinematic QA',1500);
 await next5();
 await wait("window.__game.scene.getScene('Catacombs').phase==='transform'",'Marian transforms immediately after panel 1',3000);
 await sleep(160);await captureAct5('B-transformation-960x432');
 const transform5=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {index:s.dialogueState.index,visible:s.dialoguePanel.button.visible,controls:s.joystick.enabled,boss:s.boss.phase,started:s.transformationStarted,completed:s.transformationCompleted}})()");
 assert.equal(transform5.index,1);assert.equal(transform5.visible,false);
 assert.equal(transform5.controls,false);assert.equal(transform5.boss,'staging');
 assert.equal(transform5.started,true);assert.equal(transform5.completed,false);
 await wait("(()=>{const s=window.__game.scene.getScene('Catacombs');return s.phase==='opening'&&s.transformationCompleted&&s.dialoguePanel.button.visible&&s.dialogueState.index===1})()",'transformed Marian resumes with Aloes panel 2',5500);
 await sleep(420);await captureAct5('B2-rudolf-transformed-960x432');
 const revealed5=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {world:s.bossArt.texture.key,portraitLoaded:s.textures.exists('dialogue-marian-transformed'),boss:s.boss.phase,combat:s.canPlay()}})()");
 assert.equal(revealed5.world,'act5-marian-transformed');
 assert.equal(revealed5.portraitLoaded,true);
 assert.equal(revealed5.boss,'staging');assert.equal(revealed5.combat,false);
 for(let i=1;i<17;i++){
  const at=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {index:s.dialogueState.index,speaker:s.dialoguePanel.shell.list.filter(o=>o.type==='Text'&&o.visible).map(o=>o.text)}})()");
  assert.equal(at.index,i,'act5 betrayal panel '+(i+1));
  if(i===2)assert.ok(at.speaker.includes('RUDOLF KŁUSOCZŁEK'));
  await next5();
 }
 await wait("(()=>{const s=window.__game.scene.getScene('Catacombs');return s.phase==='boss'&&s.boss.phase==='gun'&&s.canPlay()})()",'boss after all 17 dialogue panels',4500);
 await sleep(650);await captureAct5('C-rudolf-hp-960x432');
 const bossFraming=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),c=s.cameras.main;return {zoom:c.zoom,head:(s.bossActor.y-s.bossArt.displayHeight-c.scrollY)*c.zoom+(1-c.zoom)*s.scale.height/2,feet:(s.bossActor.y-c.scrollY)*c.zoom+(1-c.zoom)*s.scale.height/2,hp:s.boss.hp,maxHp:s.boss.maxHp,phase:s.phase,label:s.bossHpLabel.visible,scrollY:c.scrollY}})()");
 assert.ok(Math.abs(bossFraming.zoom-1)<.01&&bossFraming.head>=-1&&bossFraming.feet<432,
  'full transformed Rudolf silhouette visible in normal combat follow '+JSON.stringify(bossFraming));
 await wait("window.__game.scene.getScene('Catacombs').bossShots.length>0",'rotating gun emits real shots',6500);
 await wait("(()=>{const s=window.__game.scene.getScene('Catacombs');return s.bossBarks.shown>0&&s.bossBarks.root.visible})()",'Rudolf boss bark visibly renders',5200);
 const rudolfBark=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),b=s.bossBarks;return {text:b.caption.text,x:b.root.x,y:b.root.y,visible:b.root.visible,top:s.hudLayout.panelY+s.hudLayout.panelHeight,width:s.scale.width,height:s.scale.height}})()");
 assert.equal(rudolfBark.text,'Niech Cię kule biją!');
 assert.ok(rudolfBark.visible&&rudolfBark.x>=0&&rudolfBark.y>=rudolfBark.top&&rudolfBark.y<rudolfBark.height,'Rudolf visible on mobile '+JSON.stringify(rudolfBark));
 console.log('PASS real Chromium: Kłusoczłek boss bark visible in Act V combat');
  // R2 live Act V flame: controlled unobstructed boss position and real touch.
 for(let j=0;j<3;j++){
  if(await evaluate("window.__game.scene.getScene('Catacombs').weapon==='flamethrower'"))break;
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.hudLayout.switchX,y:r.y+s.hudLayout.switchY}})()");
  await touch(p.x,p.y);await sleep(60);
 }
 assert.equal(await evaluate("window.__game.scene.getScene('Catacombs').weapon"),'flamethrower');
 await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');s.hitUntil=Infinity;s.bossActor.setPosition(s.player.x,s.player.y+100);return true})()");
 const st5=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.aimJoystick.base.x,y:r.y+s.aimJoystick.base.y,r:s.hudLayout.joystickRadius,hp:s.boss.hp}})()");
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:st5.x,y:st5.y,id:32}]});
 await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:st5.x,y:st5.y+st5.r*.85,id:32}]});
 await wait("(()=>{const s=window.__game.scene.getScene('Catacombs');return s.fire.pressure.value<100&&s.flameStream.commandBuffer.length>0})()",'Act V real flame renderer/pressure');
 await wait("window.__game.scene.getScene('Catacombs').boss.hp<"+st5.hp,'Act V real Rudolf damage',2200);
 for(let d=0;d<8;d++){
  const angle=d*Math.PI/4;
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:st5.x+Math.cos(angle)*st5.r*.85,y:st5.y+Math.sin(angle)*st5.r*.85,id:32}]});
  await sleep(75);
  assert.ok(await evaluate("window.__game.scene.getScene('Catacombs').flameStream.commandBuffer.length>0"),'Act V flame direction '+d);
 }
 await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.__game.scene.getScene('Catacombs').flameStream.commandBuffer.length===0",'Act V real flame release');
 console.log('PASS Act V R2 Chromium 8-way flame, pressure, boss HP, release');
const pause5=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.menuButton.x,y:r.y+s.menuButton.y,clock:s.combatMs}})()");
 await touch(pause5.x,pause5.y);
 await wait("window.__game.scene.isPaused('Catacombs')&&window.__game.scene.isActive('Menu')",'Marian boss MENU pause',3000);
 const paused5=await evaluate("window.__game.scene.getScene('Catacombs').combatMs");
 await sleep(300);
 assert.equal(await evaluate("window.__game.scene.getScene('Catacombs').combatMs"),paused5,'boss timers freeze in MENU');
 await tapMenu('WZNÓW');
 await wait("window.__game.scene.isActive('Catacombs')",'Marian boss WZNÓW',3000);

 const shield=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),before=s.boss.hp;return {before,hit:s.damageBoss(18),phase:s.boss.phase,n:s.boss.summons.length,hp:s.boss.hp,second:s.damageBoss(10)}})()");
 assert.deepEqual(shield,{before:shield.before,hit:true,phase:'summon',n:3,hp:shield.before-18,second:false},'horn summons 3 while Marian invulnerable');
 const cleared=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');for(const e of [...s.summons])s.damageEnemy(e,e.hp);return {phase:s.boss.phase,n:s.summons.length}})()");
 assert.deepEqual(cleared,{phase:'gun',n:0},'defeating all summoned enemies restores vulnerability');
 await sleep(240);
 await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');s.bossActor.setPosition(650,410);s.damageBoss(s.boss.hp);return true})()");
 await wait("window.__game.scene.getScene('Catacombs').phase==='boss-death'",'Rudolf explosion starts');
 await sleep(160);await captureAct5('D-rudolf-death-960x432');
 await wait("(()=>{const s=window.__game.scene.getScene('Catacombs');return s.phase==='fairy'&&s.boss.defeated&&s.fairyActor?.active})()",'Marian defeated once, fairy arrives',4000);
 await sleep(240);await captureAct5('E-fairy-arrival-960x432');
 await wait("window.__game.scene.getScene('Catacombs').dialogueState.id==='act5-fairy'",'fairy dialogue',3500);
 await captureAct5('F-fairy-dialogue-960x432');
 const fairyView=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs'),b=s.fairyActor.getBounds(),v=s.fairyVisibleBounds();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,view:v}})()");
 assert.ok(fairyView.left>=fairyView.view.left&&fairyView.right<=fairyView.view.right&&
  fairyView.top>=fairyView.view.top&&fairyView.bottom<=fairyView.view.bottom,
  'Act V fairy visibly clears camera and dialogue after close-distance boss kill '+JSON.stringify(fairyView));
 // Simulate a Phaser clock stalled at the final MYK gesture. The
 // independent browser timer must still complete Credits exactly once.
 for(let i=0;i<2;i++)await next5();
 await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');s.time.delayedCall=()=>null;return true})()");
 await next5();
 await wait("window.__game.scene.getScene('Catacombs').phase==='magic'",'fairy MYK magic particles',3000);
 assert.equal(await evaluate("window.__game.scene.getScene('Catacombs').dialogueState.id"),null,'no home dialogue');
 await wait("(()=>{const g=window.__game,c=g.scene.getScene('Catacombs');return g.scene.isActive('Credits')&&c.completed&&c.run.completedActs.has('act5')})()",'Act V MYK completes campaign and enters credits',3000);
 await sleep(1600);await captureAct5('G-credits-960x432');
 const creditsStart=await evaluate("(()=>{const s=window.__game.scene.getScene('Credits');return {finished:s.finished,returning:s.returning,lines:s.lines.length,distance:s.scrollDistance,elapsed:s.elapsedScroll,track:window.__retroAudio.track,loop:window.__retroAudio.music?.loop,heading:s.lines.slice(0,2).map(x=>x.text),back:s.backButton.visible}})()");
 assert.equal(creditsStart.finished,false);assert.equal(creditsStart.returning,false);
 assert.equal(creditsStart.lines,64,'32 pairs of credit lines: all 25 originals plus seven additions');
 const creditsRoles=await evaluate("(()=>{const s=window.__game.scene.getScene('Credits');return s.lines.map(x=>x.text)})()");
 assert.equal(creditsRoles.indexOf('PIERWSZE SZKICE BOBROZOMBI, BOCIANOŁAKÓW I ŻUBROKRYPTYD'),
  creditsRoles.indexOf('PROJEKT POSTACI I ŚWIATA')+2,'genuine artwork attribution follows original credit');
 assert.equal(creditsRoles[creditsRoles.indexOf('PIERWSZE SZKICE BOBROZOMBI, BOCIANOŁAKÓW I ŻUBROKRYPTYD')+1],
  'Michał Aloes Świderski','genuine original sketch attribution');
 for(const role of ['KIEROWNIK DS. NIEKONTROLOWANYCH WRZASKÓW',
  'SPECJALISTA DS. NIELEGALNEGO FRYZJERSTWA',
  'NADZÓR NAD PRZEDWCZESNYM KOŃCEM ŚWIATA',
  'KOMISJA DS. POSZUKIWANIA ZAGINIONYCH KIEŁBAS',
  'GŁÓWNY INSPEKTOR DS. TUPANIA','DEPARTAMENT SPRAW BEZNADZIEJNYCH']){
  assert.ok(creditsRoles.includes(role),'missing extra staff credit '+role);
 }
 assert.ok(creditsStart.distance>3000);
 assert.equal(creditsStart.heading[0],'OPARTE NA MOTYWACH SMS-OWEJ OPOWIASTKI');
 assert.ok(creditsStart.heading[1].includes('LEŚNI PRZYJACIELE')&&creditsStart.heading[1].includes('MICHAŁA ALOESA ŚWIDERSKIEGO'));
 assert.equal(creditsStart.track,'credits');assert.equal(creditsStart.loop,true);
 assert.equal(creditsStart.back,true);
 // The full headless browser suite can throttle RAF after a long campaign.
 // Verify the scene's real frame-delta update explicitly in Chromium; the
 // responsive rendered credits and pointer navigation are tested below.
 const scrollStep=await evaluate("(()=>{const s=window.__game.scene.getScene('Credits'),before=s.elapsedScroll;s.update(0,50);return {before,after:s.elapsedScroll,visible:!document.hidden,paused:s.scene.isPaused()}})()");
 assert.equal(scrollStep.paused,false,'credits scene stays active');
 assert.ok(scrollStep.after>scrollStep.before,'credits advance by frame delta in visible Chromium');
 await evaluate("(()=>{const s=window.__game.scene.getScene('Credits');s.elapsedScroll=s.scrollDistance-.5;s.update(0,50);return true})()");
 const endCredits=await evaluate("(()=>{const s=window.__game.scene.getScene('Credits');return {finished:s.finished,dedication:s.dedication.text,visible:s.dedication.visible,back:s.backButton.visible,track:window.__retroAudio.track,elapsed:s.elapsedScroll}})()");
 assert.equal(endCredits.finished,true);assert.equal(endCredits.visible,true);
 await captureAct5('H-static-dedication-960x432');
 assert.equal(endCredits.dedication,'WSZYSTKIEGO NAJLEPSZEGO MICHAŁ!');
 assert.equal(endCredits.back,true);assert.equal(endCredits.track,'credits');
 await sleep(900);
 assert.equal(await evaluate("window.__game.scene.isActive('Credits')"),true,'final dedication remains static');
 const backCredits=await evaluate("(()=>{const s=window.__game.scene.getScene('Credits'),r=window.__game.canvas.getBoundingClientRect();return {x:r.x+s.backButton.x,y:r.y+s.backButton.y}})()");
 await touch(backCredits.x,backCredits.y);
 await wait("window.__game.scene.isActive('Menu')",'WRÓĆ returns from credits to menu',3000);
 await cdp('Emulation.setDeviceMetricsOverride',{width:originalViewport.width,height:originalViewport.height,deviceScaleFactor:1,mobile:false});
 await evaluate('window.__game.scale.refresh();true');
 assert.equal(await evaluate("window.__game.scene.isActive('StudioIntro')"),false,'studio intro does not repeat');
 assert.equal(await evaluate("window.__retroAudio.track"),'menu','menu music takes over from credits');
 console.log('PASS Act V real Chromium Android landscape: approved fairy, Credits scroll and WRÓĆ, birthday dedication, HUD, boss and DEBUG');
 // Remaining final-chapter DEBUG entries must start at their actual stages.
 for(const [id,phase] of [['act5-boss','boss'],['act5-ending','fairy']]){
  await cdp('Page.reload',{ignoreCache:true});
  await sleep(250); // Wait for the new document; the old Menu context can still satisfy the guard.
  await wait("window.__game?.scene.isActive('Menu')&&typeof window.__createDebugFixture==='function'",'menu and fixture before '+id);
  await evaluate(`(()=>{const g=window.__game,f=window.__createDebugFixture(${JSON.stringify(id)});f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('ActTitle',{actId:'act5',handoff:f.handoff,debugCheckpoint:${JSON.stringify(id)}});return true})()`);
  if(id==='act5-ending'){
   await wait("(()=>{const g=window.__game,s=g.scene.getScene('Catacombs');return g.scene.isActive('Catacombs')&&s.entryGateReady&&s.phase==='boss-death'})()",'Act V DEBUG boss death before pause',12000);
   assert.equal(await evaluate("window.__game.scene.getScene('Catacombs').openMenu()"),true,'MENU pauses the boss-death cinematic');
   await wait("window.__game.scene.isActive('Menu')",'Act V finale pause menu');
   await sleep(1850); // Beyond the existing wall-clock death/fairy watchdog.
   const paused=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {phase:s.phase,fairy:s.fairyActor?.active??false,paused:s.scene.isPaused()}})()");
   assert.deepEqual(paused,{phase:'boss-death',fairy:false,paused:true},
    'finale cannot progress behind MENU despite watchdog expiry');
   await tapMenu('WZNÓW');
   await wait("window.__game.scene.isActive('Catacombs')",'Act V finale resumes after MENU');
  }
  await wait(`(()=>{const g=window.__game,s=g.scene.getScene('Catacombs');return g.scene.isActive('Catacombs')&&s.entryGateReady&&s.phase===${JSON.stringify(phase)}})()`,'Act V DEBUG '+id,12000);
  const v=await evaluate("(()=>{const s=window.__game.scene.getScene('Catacombs');return {hp:s.run.hp,artifacts:s.run.artifacts.size,completed:s.run.completedActs.size,water:s.weapon==='water-flamethrower'}})()");
  assert.deepEqual(v,{hp:5,artifacts:3,completed:4,water:false});
 }
 console.log('PASS Act V Chromium DEBUG: opening, Marian boss and ending checkpoints with complete prior artifacts and full HP');
 // Cold-cache Act V recovery: fail ONE required production PNG network request
 // and tap the actual ActTitle PONÓW control before entering Catacombs.
 await cdp('Page.reload',{ignoreCache:true});
 await sleep(250);
 await wait("window.__game?.scene.isActive('Menu')&&typeof window.__createDebugFixture==='function'",'Menu before Act V PNG retry');
 await cdp('Network.clearBrowserCache');
 let failedRequired=0;const interceptErrors=[];
 const interceptRequired=event=>{
  const m=JSON.parse(event.data);
  if(m.method!=='Fetch.requestPaused'||!m.params?.request?.url.includes('act5-catacombs.png'))return;
  const first=failedRequired++===0;
  void cdp(first?'Fetch.failRequest':'Fetch.continueRequest',
   first?{requestId:m.params.requestId,errorReason:'Failed'}:{requestId:m.params.requestId})
   .catch(e=>interceptErrors.push(String(e)));
 };
 socket.addEventListener('message',interceptRequired);
 await cdp('Fetch.enable',{patterns:[{urlPattern:'*act5-catacombs.png',requestStage:'Request'}]});
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act5-opening');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('ActTitle',{actId:'act5',handoff:f.handoff,debugCheckpoint:'act5-opening'});return true})()");
 await wait("(()=>{const g=window.__game,t=g.scene.getScene('ActTitle');return g.scene.isActive('ActTitle')&&t.assetGate?.failed.some(x=>x.required)&&t.children.list.some(o=>o.text==='PONÓW'&&o.visible)})()",
  'Act V failed required PNG exposes PONÓW',16000);
 assert.ok(failedRequired>=1,'required Act V PNG request must be intercepted');
 assert.deepEqual(interceptErrors,[],'failed required PNG interception');
 await cdp('Fetch.disable');
 socket.removeEventListener('message',interceptRequired);
 const retryAt=await evaluate("(()=>{const g=window.__game,t=g.scene.getScene('ActTitle'),p=t.children.list.find(o=>o.text==='PONÓW'&&o.visible),r=g.canvas.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()");
 await touch(retryAt.x,retryAt.y);
 await wait("(()=>{const g=window.__game,s=g.scene.getScene('Catacombs');return g.scene.isActive('Catacombs')&&s.entryGateReady&&s.dialogueState.id==='act5-betrayal'})()",
  'Act V PONÓW recovers required PNG and enters Catacombs',16000);
 console.log('PASS Act V cold-cache required PNG failure -> PONÓW -> playable Catacombs');
 assert.deepEqual(exceptions,[],'uncaught Chromium exceptions');
 console.log('PASS FAST real Chromium: menu, DEBUG Act II/IV, handoffs, school placeholders, Act IV pause/resume and water filtering');
 console.log('FAST runtime ms',Date.now()-started);
}finally{
 socket?.close();chrome?.kill('SIGKILL');vite.kill('SIGTERM');await sleep(150);
 try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
