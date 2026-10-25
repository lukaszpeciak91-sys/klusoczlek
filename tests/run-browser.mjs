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
  for (let i = 0; i < 100; i++) {
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
    const target=which==='hud'?state.menuButton:state.button;
    assert.ok(target, 'Missing '+which+' interactive hit area: '+JSON.stringify(state));
    assert.ok(target.y-target.height/2>=0 && target.y+target.height/2<=state.rect.height,'Button clipped');
    await click(state.rect.x+target.x,state.rect.y+target.y);
  }
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await waitFor(s=>s.menu&&s.action==='START','initial START');
  await evaluate('window.__traceEvents()');
  assert.equal((await snapshot()).fullscreenHidden,false,'Fullscreen must be visible in menu');
  for(const height of [320,360,375,420]){
    const width=Math.round(height*20/9);
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate('window.__game.scale.refresh();true');
    await waitFor(s=>Math.abs(s.rect.height-height)<2,'resize '+height);
    let state=await snapshot();
    assert.equal(state.action,'START');
    assert.ok(state.button.y+state.button.height/2<=height,'START clipped');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});
  await evaluate('window.__game.scale.refresh();true');
  await waitFor(s=>Math.abs(s.rect.height-360)<2,'return to landscape');

  await clickControl('action');
  await waitFor(s=>s.arena&&!s.menu,'START to Arena');
  assert.equal((await snapshot()).fullscreenHidden,true,'Fullscreen visible immediately after START');
  await evaluate('window.__movePlayer()');
  for(let i=0;i<20;i++){
    await clickControl('hud');
    let menuState=await waitFor(s=>s.menu&&s.arenaPaused&&s.action==='WZNÓW','Arena MENU '+i);
    assert.equal(menuState.player.x,552);
    assert.equal(menuState.player.y,440);
    assert.equal(menuState.samePlayer,true,'Arena player instance replaced');
    assert.equal(menuState.sameCamera,true,'Arena camera instance replaced');
    assert.equal(menuState.fullscreenHidden,false,'Fullscreen must be visible in Main Menu');
    assert.equal(menuState.menuOverArena,true,'Main Menu is rendered behind paused Arena; order='+JSON.stringify(menuState.sceneOrder));
    // Browser focus loss cannot undo an intentional user pause.
    await evaluate('window.dispatchEvent(new Event("blur"));window.dispatchEvent(new Event("focus"))');
    menuState=await snapshot();
    assert.equal(menuState.arenaPaused,true,'Focus unexpectedly resumed Arena');
    await clickControl('action');
    const arenaState=await waitFor(s=>s.arena&&!s.menu&&!s.arenaPaused,'Menu WZNÓW '+i);
    assert.deepEqual(arenaState.player,{x:552,y:440},'Player position reset');
    assert.equal(arenaState.physics,false,'Arcade Physics remained paused');
    assert.equal(arenaState.samePlayer,true,'Player recreated on resume');
    assert.equal(arenaState.sameCamera,true,'Camera recreated on resume');
    assert.equal(arenaState.fullscreenHidden,true,'Fullscreen must be hidden in Arena');
  }
  await clickControl('hud');
  await waitFor(s=>s.menu&&s.action==='WZNÓW','last Menu');
  await evaluate('window.__game.scene.stop("Arena");window.__game.scene.stop("Menu");window.__game.scene.start("Menu");true');
  await waitFor(s=>s.menu&&s.action==='START','START after session termination');
  console.log('PASS real Phaser pointer clicks: 20 MENU/WZNÓW cycles, same player/camera, physics, START after session end');

} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  // Chrome may still flush profile files after SIGKILL. Cleanup must never mask the test result.
  await sleep(150);
  try { await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:150}); } catch (error) { console.error('Chrome profile cleanup warning:',error.message); }
}
