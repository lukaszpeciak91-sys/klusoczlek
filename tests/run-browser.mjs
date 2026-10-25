import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { access } from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = 5187;
const url = `http://127.0.0.1:${port}/tests/browser-lifecycle.html`;
let browser;
for (const executable of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
  if (!executable) continue;
  try { await access(executable); browser = executable; break; } catch {}
}
if (!browser) throw Error('Chromium/Chrome not found; browser integration must not be silently skipped.');
const server = spawn('npm', ['run','dev','--','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
try {
  let ready = false;
  for (let i=0;i<90;i++) {
    try { const r=await fetch(url); if(r.ok){ready=true;break;} } catch {}
    await sleep(200);
  }
  assert.ok(ready, 'Vite browser harness did not start');
  const chrome = spawn(browser,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--virtual-time-budget=10000','--dump-dom',url],{stdio:['ignore','pipe','pipe']});
  let output='', errors='';
  chrome.stdout.on('data',c=>output+=c.toString());
  chrome.stderr.on('data',c=>errors+=c.toString());
  const exit = await Promise.race([
    new Promise(resolve=>chrome.on('exit',resolve)),
    sleep(30000).then(()=>{chrome.kill('SIGKILL');throw Error('Chrome integration test timeout');})
  ]);
  assert.equal(exit,0,'Chrome exited with errors: '+errors.slice(-1500));
  const status=output.match(/<p id="result" data-status="([^"]+)">([^<]*)<\/p>/);
  assert.equal(status?.[1],'pass','Real Phaser browser integration failed: '+(status?.[2]??output.slice(-1200)));
  console.log(status[2]);
} finally { server.kill(); }
