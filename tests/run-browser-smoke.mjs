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
   await wait("(()=>{const d=window.__game.scene.getScene('School').dialoguePanel;return d.loaded.has('blazej')&&d.loaded.has('zubrokryptyda')})()",'both approved boss and ordinary portraits loaded',3500);
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
  {key:'schoolyard-approved-chapel',x:330,y:965,w:235,h:235,depth:12},
  {key:'schoolyard-approved-rack',x:1510,y:857,w:287,h:222,depth:12},
  {key:'schoolyard-approved-school',x:1480,y:420,w:520,h:384,depth:12}
 ].sort((a,b)=>a.key.localeCompare(b.key)),'four approved art layers retain native PNG textures, scaled rack and clear pitch');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.children.list.filter(o=>o.getData('obstacleArt')).length===5&&s.children.list.filter(o=>o.getData('obstacleArt')).every(o=>!!o.getData('atlasSprite'))})()",'five real Act I approved atlas obstacle frames load',9000);
 const atlas=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.children.list.filter(o=>o.getData('obstacleArt')).map(o=>({frame:o.getData('obstacleArt').frame,original:!!o.getData('atlasSprite'),fallbackVisible:o.getData('fallback').visible})).sort((a,b)=>a.frame-b.frame)})()");
 assert.deepEqual(atlas,[0,1,9,10,10].map(frame=>({frame,original:true,fallbackVisible:false})),'two tires, toi-toi and two original rock PNG frames');
 const solids=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return s.obstacles.slice(0,3).map(o=>({id:o.id,w:o.footprint.width,h:o.footprint.height}))})()");
 assert.deepEqual(solids,[{id:'chapel',w:96,h:94},{id:'school',w:430,h:86},{id:'bicycleRack',w:220,h:52}],
  'actual lower-footprint collision dimensions, never complete PNG canvas');
 console.log('PASS Act IV Chromium approved art: 1800x1200 terrain, native obstacle PNGs, alpha-based lower footprints, real Act I atlas pieces, occlusion and HUD');
 await finishCaptainOpening(); // Second scene entry gets exactly one new opening; combat remains gated.
 const optionalBefore=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {intro:s.introActive,started:s.combat.started,maciek:s.maciekSeen,pitch:s.pitchStarted,actors:s.combat.optionalActors.length}})()");
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
 for(let i=0;i<6;i++)await dialogueNext();
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
 // Hold the actual approved portrait request so the final DEBUG panel opens
 // with its fallback, then release it without advancing/restarting the dialog.
 let pausedBlazejPortrait=null;
 const onPortraitPaused=event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Fetch.requestPaused'&&message.params.request.url.includes('dialogue-blazej.png'))
   pausedBlazejPortrait=message.params.requestId;
 };
 socket.addEventListener('message',onPortraitPaused);
 await cdp('Fetch.enable',{patterns:[{urlPattern:'*dialogue-blazej.png',requestStage:'Request'}]});
 await bootSchool('act4-blazej');
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.schoolPhase==='BLAZEJ_PENDING'&&s.dialogueState?.id==='act4-blazej-final'})()",'single post-wave Błażej panel',4500);
 await wait("!window.__game.scene.getScene('School').dialoguePanel.loaded.has('blazej')",'late Błażej portrait still pending');
 assert.ok(pausedBlazejPortrait,'real Błażej PNG request held before final panel');
 const initialPortrait=await evaluate("(()=>{const s=window.__game.scene.getScene('School'),d=s.dialoguePanel;return {id:s.dialogueState.id,index:s.dialogueState.index,text:d.text.text,images:d.shell.list.filter(o=>o.type==='Image'&&o.visible).map(o=>o.texture.key)}})()");
 assert.deepEqual(initialPortrait,{id:'act4-blazej-final',index:0,text:'Ech, kazał pan, musiał sam!',images:[]},
  'late portrait leaves fallback and dialogue index unchanged');
 await cdp('Fetch.continueRequest',{requestId:pausedBlazejPortrait});
 await cdp('Fetch.disable');
 socket.removeEventListener('message',onPortraitPaused);
 await wait("(()=>{const s=window.__game.scene.getScene('School'),d=s.dialoguePanel;return d.loaded.has('blazej')&&d.shell.list.some(o=>o.type==='Image'&&o.visible&&o.texture.key==='dialogue-blazej')})()",'late approved portrait appears without dialogue restart',6000);
 const afterPortrait=await evaluate("(()=>{const s=window.__game.scene.getScene('School');return {id:s.dialogueState.id,index:s.dialogueState.index,text:s.dialoguePanel.text.text}})()");
 assert.deepEqual(afterPortrait,{id:initialPortrait.id,index:initialPortrait.index,text:initialPortrait.text},
  'async portrait image refresh preserves active dialogue panel');
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

 assert.ok(bossStart.hp===48&&bossStart.boss&&bossStart.ordinary===0&&!bossStart.water);
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
 await wait("(()=>{const s=window.__game.scene.getScene('School');return s.bicycleCinematic.ready&&s.bicycleTexture==='artifact-blazej-bicycle'})()",'both actual approved bicycle images decoded in browser',4500);
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
 // Capture only the real Volcano final handoff request; the deterministic QA
 // driver will dispatch that exact data through SceneManager separately.
 await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),original=s.scene.start.bind(s.scene);window.__act4Handoffs=[];s.scene.start=(key,data)=>{if(key==='ActTitle'){window.__act4Handoffs.push({key,data});return s;}return original(key,data);};return true})()");
 for(let i=0;i<3;i++){
  await sleep(230);
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.dialoguePanel.button,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+b.x,y:r.y+b.y,visible:b.visible,hp:s.run.hp,id:s.dialogueState.id}})()");
  assert.ok(p.visible&&p.hp===2&&p.id==='act3-captain-extraction','Act III dialogue must not heal Aloes');
  await touch(p.x,p.y);
 }
 await wait("window.__act4Handoffs?.length===1",'Volcano finale requests Act IV title exactly once',4500);
 await sleep(160);
 const actualHandoff=await evaluate("(()=>{const g=window.__game,r=g.registry.get('campaign-run'),calls=window.__act4Handoffs;return {count:calls.length,key:calls[0].key,act:calls[0].data.actId,scene:calls[0].data.handoff?.scene,hp:calls[0].data.handoff?.hp,max:calls[0].data.handoff?.maxHp,selected:calls[0].data.handoff?.selectedWeapon,horn:calls[0].data.handoff?.artifacts.has('bogdan-hunting-horn'),completed:[...r.completedActs],runtimeHp:r.hp,menu:g.scene.isActive('Menu')}})()");
 assert.deepEqual([actualHandoff.count,actualHandoff.key,actualHandoff.act,actualHandoff.scene,actualHandoff.hp,actualHandoff.max,actualHandoff.selected,actualHandoff.horn,actualHandoff.runtimeHp,actualHandoff.menu],
  [1,'ActTitle','act4','School',5,5,'rifle',true,5,false],'exactly one authorized live Act IV handoff');
 assert.deepEqual(actualHandoff.completed.sort(),['act1','act2','act3']);
 await evaluate("(()=>{const g=window.__game;g.scene.start('ActTitle',window.__act4Handoffs[0].data);return true})()");
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
 // Approved Act III horn: stage the real Bogdan boss using existing DEBUG,
 // then verify original two-panel finale, award, art and eruption sequence.
 await cdp('Page.reload',{ignoreCache:true});
 await wait("typeof window.__createDebugFixture==='function'&&window.__game?.scene.isActive('Menu')",'Menu before approved Bogdan horn QA');
 await evaluate("(()=>{const g=window.__game,f=window.__createDebugFixture('act3-boss');f.run.isDebugRun=true;g.registry.set('campaign-run',f.run);g.scene.getScene('Menu').scene.start('Volcano',{handoff:f.handoff,debugCheckpoint:'act3-boss'});return true})()");
 await wait("(()=>{const s=window.__game?.scene.getScene('Volcano');return s?.boss?.active&&s.boss.ready&&!!s.walkability&&s.finale.state==='BOGDAN_ACTIVE'})()",'real Volcano boss DEBUG with approved terrain and active Bogdan',16000);
 await wait("(()=>{const s=window.__game.scene.getScene('Volcano');return !!s.hornRewardImage?.active&&s.hornRewardImage.texture.key==='artifact-bogdan-horn'})()",'approved Bogdan horn PNG loaded and decoded in Volcano',8500);
 const loadedHorn=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),i=s.hornRewardImage,t=s.textures.get('artifact-bogdan-horn');return {texture:i.texture.key,width:t.source[0].width,height:t.source[0].height,index:s.rewardRoot.list.indexOf(i),visible:s.rewardRoot.visible,owner:s.run.artifacts.has('bogdan-hunting-horn')}})()");
 assert.deepEqual(loadedHorn,{texture:'artifact-bogdan-horn',width:192,height:192,index:2,visible:false,owner:false},
  'validated approved horn image is embedded, without awarding before boss defeat');
 const bogdanDefeat=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.boss;const hit=b.damage(b.hp,s.time.now);return {hit,defeated:b.defeated,pending:b.defeatPending,artifacts:[...s.run.artifacts]}})()");
 assert.ok(bogdanDefeat.hit&&bogdanDefeat.defeated&&bogdanDefeat.pending&&!bogdanDefeat.artifacts.includes('bogdan-hunting-horn'));
 await wait("window.__game.scene.getScene('Volcano').dialogueState.id==='act3-bogdan-final'",'two-panel Bogdan finale dialogue',4000);
 const volcanoDialogueNext=async expected=>{
  await sleep(230);
  const p=await evaluate("(()=>{const s=window.__game.scene.getScene('Volcano'),b=s.dialoguePanel.button,r=window.__game.canvas.getBoundingClientRect();return {x:r.x+b.x,y:r.y+b.y,visible:b.visible,id:s.dialogueState.id,index:s.dialogueState.index,caption:s.dialoguePanel.text.text}})()");
  assert.ok(p.visible&&p.id===expected&&p.caption.length>0,'approved Bogdan final dialogue and DALEJ '+JSON.stringify(p));
  await touch(p.x,p.y);
 };
 await volcanoDialogueNext('act3-bogdan-final');
 assert.equal(await evaluate("window.__game.scene.getScene('Volcano').dialogueState.index"),1,'second original Bogdan panel not skipped');
 await volcanoDialogueNext('act3-bogdan-final');
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
 await volcanoDialogueNext('act3-eruption-warning');
 await wait("window.__game.scene.getScene('Volcano').finale.state==='ESCAPE_ACTIVE'",'existing eruption escape begins',4000);
 console.log('PASS approved Act III horn Chromium: real boss defeat, 2 finale panels, decoded 192x192 PNG, responsive artifact 2/3, DALEJ and eruption escape');
 assert.deepEqual(exceptions,[],'uncaught Chromium exceptions');
 console.log('PASS FAST real Chromium: menu, DEBUG Act II/IV, handoffs, school placeholders, Act IV pause/resume and water filtering');
 console.log('FAST runtime ms',Date.now()-started);
}finally{
 socket?.close();chrome?.kill('SIGKILL');vite.kill('SIGTERM');await sleep(150);
 try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
}
