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
  ], {stdio:'ignore'});

  let page;
  for (let i = 0; i < 100; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
      page = tabs.find(tab => tab.type === 'page' && tab.url.includes('browser-lifecycle'));
      if (page?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(150);
  }
  assert.ok(page?.webSocketDebuggerUrl, 'Chromium DevTools page unavailable');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });
  let counter = 0;
  async function evaluate(expression) {
    const id = ++counter;
    return await new Promise((resolve,reject) => {
      const timeout = setTimeout(() => { socket.removeEventListener('message', receive); reject(Error('Chrome Runtime.evaluate timeout')); }, 5000);
      function receive(event) {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timeout);
        socket.removeEventListener('message', receive);
        if (message.error) reject(Error(JSON.stringify(message.error)));
        else resolve(message.result?.result?.value);
      }
      socket.addEventListener('message', receive);
      socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
    });
  }

  let status;
  for (let i = 0; i < 120; i++) {
    status = await evaluate('document.querySelector("#result")?.dataset.status');
    if (status === 'pass' || status === 'fail') break;
    await sleep(150);
  }
  const details = await evaluate('document.querySelector("#result")?.textContent');
  assert.equal(status, 'pass', 'Real Phaser browser test: ' + details);
  console.log(details);
} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  await rm(profile, {recursive:true,force:true});
}
