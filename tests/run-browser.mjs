import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const appPort = 5187;
const chromePort = 9229;
const url = `http://127.0.0.1:${appPort}/klusoczlek/tests/browser-lifecycle.html`;
let binary;
for (const executable of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
  if (!executable) continue;
  try { await access(executable); binary = executable; break; } catch {}
}
assert.ok(binary, 'Chrome/Chromium is required to run the real Phaser browser test');

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(appPort),'--strictPort'], {stdio:'ignore'});
const profile = await mkdtemp(join(tmpdir(), 'klusoczlek-chrome-'));
let chrome;
let socket;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await sleep(150);
  }
  assert.ok(ready, 'Vite failed to serve browser test at ' + url);

  chrome = spawn(binary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    '--remote-debugging-port=' + chromePort, '--user-data-dir=' + profile, url,
  ], {stdio:['ignore','pipe','pipe']});
  let chromeOutput='';
  chrome.stdout.on('data', c=>chromeOutput+=c.toString());
  chrome.stderr.on('data', c=>chromeOutput+=c.toString());
  let seenPages=[];
  let page;
  for (let i = 0; i < 400; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
      seenPages=tabs.map(tab=>({type:tab.type,url:tab.url}));
      page = tabs.find(tab => tab.type === 'page' && tab.url.includes('browser-lifecycle'));
      if (page?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(150);
  }
  assert.ok(page?.webSocketDebuggerUrl, 'Chromium DevTools page unavailable; pages='+JSON.stringify(seenPages)+'; exit='+chrome.exitCode+'; stderr='+chromeOutput.slice(-2000));
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });
  let counter = 0;
  async function cdp(method, params = {}) {
    const id = ++counter;
    return new Promise((resolve,reject) => {
      const timeout = setTimeout(() => { socket.removeEventListener('message', receive); reject(Error(method + ' timed out')); }, 7000);
      function receive(event) {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timeout);
        socket.removeEventListener('message', receive);
        if (message.error) reject(Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
      socket.addEventListener('message', receive);
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await cdp('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if(response.exceptionDetails) throw Error('Browser JavaScript: '+JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  }
  async function snapshot() { return evaluate('window.__snapshot?.()'); }
  async function waitFor(predicate, reason) {
    for(let i=0;i<50;i++){const state=await snapshot();if(state&&predicate(state))return state;await sleep(80);}
    throw Error('Timeout '+reason+'; last='+JSON.stringify(await snapshot()));
  }
  async function click(x,y){
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  async function clickControl(which){
    const state=await snapshot();
    const target=which==='hud'?state.menuButton:state.actions.find(a=>a.label===which);
    assert.ok(target,'Missing '+which+' interactive hit area '+JSON.stringify(state));
    assert.ok(target.y-target.height/2>=0&&target.y+target.height/2<=state.rect.height,'Button clipped: '+which);
    await click(state.rect.x+target.x,state.rect.y+target.y);
  }
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await waitFor(s=>s.menu&&s.actions.length===1&&s.actions[0].label==='NOWA GRA','initial single new game');
  await evaluate('window.__traceEvents()');
  for(const height of [320,360,375,420]){
    const width=Math.round(height*20/9);
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate('window.__game.scale.refresh();true');
    const state=await waitFor(s=>Math.abs(s.rect.height-height)<2,'resize '+height);
    assert.equal(state.actions.length,1);
    assert.ok(state.actions[0].y+state.actions[0].height/2<=height,'NOWA GRA clipped');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});
  await evaluate('window.__game.scale.refresh();true');
  await waitFor(s=>Math.abs(s.rect.height-360)<2,'landscape');
  // Actual HTML click, using the same toggleFullscreen function as production.
  if ((await snapshot()).fullscreenSupported) {
    for (const expected of [true,false,true,false]) {
      const before=await snapshot();
      await click(before.fullscreenRect.x,before.fullscreenRect.y);
      await waitFor(s=>s.fullscreenActive===expected,'fullscreen toggle '+expected);
      const geometry=await waitFor(s=>Math.abs(s.gameBox.width-s.scale.width)<2&&Math.abs(s.gameBox.height-s.scale.height)<2&&Math.abs(s.rect.height-s.gameBox.height)<2,'scale recovery after fullscreen '+expected);
      assert.ok(geometry.actions.every(a=>a.y+a.height/2<=geometry.gameBox.height),'Menu clipped after fullscreen '+expected);
      assert.equal((await snapshot()).fullscreenVisible,true,'Fullscreen HTML button disappeared from Menu');
    }
    console.log('PASS native fullscreen enter/exit/enter/exit through HTML touch');
  } else {
    console.log('INFO: Chromium fullscreen API unsupported; Android manual toggle required');
  }
  await clickControl('NOWA GRA');
  await waitFor(s=>s.arena&&!s.menu,'NOWA GRA to Arena');
  assert.equal((await snapshot()).fullscreenVisible,false);
  await evaluate('window.__movePlayer()');
  // Two simultaneous *real CDP touch points*, right-first to test independent capture.
  const a=await snapshot();
  assert.ok(a.controls&&a.controls.targetCount===3,'Twin-stick training arena not initialized');
  const left={x:a.rect.x+60,y:a.rect.y+a.scale.height-60,id:11};
  const right={x:a.rect.x+a.scale.width-60,y:a.rect.y+a.scale.height-60,id:12};
  const rMove={...right,x:right.x-40,y:right.y-8};
  const lMove={...left,x:left.x+35,y:left.y};
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right]});
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right,left]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[rMove,lMove]});
  await sleep(240);
  let dual=await snapshot();
  assert.notEqual(dual.controls.left.id,null,'left pointer not captured');
  assert.notEqual(dual.controls.right.id,null,'right pointer not captured');
  assert.notEqual(dual.controls.left.id,dual.controls.right.id,'pointers not independent');
  assert.ok(dual.controls.left.x>0,'left movement missing');
  assert.ok(dual.controls.right.x<0,'right aim missing');
  assert.ok(dual.controls.shotAt!==null,'held fire not started');
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[rMove]});
  await sleep(50);
  dual=await snapshot();
  assert.equal(dual.controls.right.id,null,'released right pointer still captured '+JSON.stringify(dual.controls));
  assert.equal(dual.controls.shotAt,null,'released right pointer still firing');
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[lMove]});
  await cdp('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await sleep(45);
  dual=await snapshot();
  assert.equal(dual.controls.left.id,null,'cancel did not release move pointer');
  assert.equal(dual.controls.right.id,null,'cancel did not release aim pointer');
  console.log('PASS real CDP multi-touch, reversed touch order, firing release, cancel');

  for(let i=0;i<20;i++){
    await clickControl('hud');
    let state=await waitFor(s=>s.menu&&s.arenaPaused&&s.actions.length===2,'Menu two buttons '+i);
    assert.deepEqual(state.actions.map(a=>a.label),['NOWA GRA','WZNÓW']);
    assert.equal(state.menuOverArena,true);
    assert.equal(state.fullscreenVisible,true);
    assert.equal(state.physics,true);
    assert.equal(state.samePlayer,true);
    assert.equal(state.sameCamera,true);
    assert.ok(state.actions[1].y-state.actions[0].y>state.actions[0].height,'Overlapping menu hitboxes');
    await evaluate('window.dispatchEvent(new Event("blur"));window.dispatchEvent(new Event("focus"));true');
    assert.equal((await snapshot()).arenaPaused,true);
    await clickControl('WZNÓW');
    state=await waitFor(s=>s.arena&&!s.menu&&!s.arenaPaused,'Resume '+i);
    assert.deepEqual(state.player,{x:552,y:440});
    assert.equal(state.physics,false);
    assert.equal(state.samePlayer,true);
    assert.equal(state.sameCamera,true);
    assert.equal(state.fullscreenVisible,false);
  }
  await clickControl('hud');
  await waitFor(s=>s.menu&&s.actions.length===2,'Menu before new game');
  await clickControl('NOWA GRA');
  const fresh=await waitFor(s=>s.arena&&!s.menu&&!s.arenaPaused,'New game replaces session');
  assert.equal(fresh.samePlayer,false,'NOWA GRA reused existing player');
  assert.notDeepEqual(fresh.player,{x:552,y:440},'NOWA GRA retained old position');
  assert.equal(fresh.physics,false,'New game physics paused');
  await clickControl('hud');
  await waitFor(s=>s.menu&&s.actions.length===2,'Menu again after fresh session');
  console.log('PASS real Phaser touch: NOWA GRA always, WZNÓW additional, 20 cycles, fresh session, physics and fullscreen visibility');

} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  // Chrome may still flush profile files after SIGKILL. Cleanup must never mask the test result.
  await sleep(150);
  try { await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:150}); } catch (error) { console.error('Chrome profile cleanup warning:',error.message); }
}
