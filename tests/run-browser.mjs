import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';


function syntheticSheetPng(){
  // Generated solely in browser-test memory. Distinct colors distinguish eight directions.
  const width=512,height=64,raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=y*(1+width*4)+1+x*4,frame=Math.floor(x/64);
    raw[offset]=(frame*31+20)&255;raw[offset+1]=(frame*23+65)&255;
    raw[offset+2]=(frame*19+110)&255;raw[offset+3]=255;
  }
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  const crc32=buffer=>{let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  const chunk=(name,body)=>{const type=Buffer.from(name),crc=Buffer.alloc(4),length=Buffer.alloc(4);length.writeUInt32BE(body.length);crc.writeUInt32BE(crc32(Buffer.concat([type,body])));return Buffer.concat([length,type,body,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

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
  const illustrated=await waitFor(s=>s.controls?.groundType==='TileSprite','approved ground TileSprite load');
  assert.equal(illustrated.controls.groundGridActive,false,'Grid still visible over artwork');
  assert.equal(illustrated.controls.groundWidth,1800);
  assert.equal(illustrated.controls.groundHeight,1200);
  assert.equal(illustrated.controls.groundTextureWidth,1024);
  assert.equal(illustrated.controls.groundTextureHeight,1024);
  assert.equal(illustrated.controls.worldWidth,1800);
  assert.equal(illustrated.controls.worldHeight,1200);
  const tileBefore=[illustrated.controls.groundTileX,illustrated.controls.groundTileY];
  await evaluate('window.__movePlayer()');
  const tileAfter=await snapshot();
  assert.deepEqual([tileAfter.controls.groundTileX,tileAfter.controls.groundTileY],tileBefore,'Tile world phase moved with camera');
  console.log('PASS real approved ground: TileSprite 1800x1200, native 1024 tiles, no grid, world-aligned camera');
  const artState=await snapshot();
  assert.equal(artState.playerVisual.loaded,true,'Approved player PNG should render independently of ground');
  assert.equal(artState.playerVisual.physicsVisible,false,'Illustrated player marker should be hidden');
  assert.equal(artState.playerVisual.bodyRadius,17,'Changed Arcade collision radius');
  assert.equal(artState.playerVisual.followIdentity,true,'Camera stopped following physics player');
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
  const retainedPosition=(await snapshot()).player;
  const retainedObstacles=(await snapshot()).controls.obstacles;
  const retainedLayout=(await snapshot()).controls.layoutIndex;

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
    assert.deepEqual(state.player,retainedPosition);
    assert.equal(state.physics,false);
    assert.equal(state.controls.layoutIndex,retainedLayout);
    assert.deepEqual(state.controls.obstacles,retainedObstacles);
    assert.equal(state.samePlayer,true);
    assert.equal(state.sameCamera,true);
    assert.equal(state.fullscreenVisible,false);
  }
  // Actual desktop CDP keyboard and mouse input, not synthetic Phaser events.
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
  const beforeKeyboard=(await snapshot()).player.x;
  await sleep(170);
  const afterKeyboard=(await snapshot()).player.x;
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
  assert.ok(afterKeyboard>beforeKeyboard+5,'WASD movement missing on desktop');
  const mouseScene=await snapshot();
  const mouseX=mouseScene.rect.x+mouseScene.scale.width/2+120;
  const mouseY=mouseScene.rect.y+mouseScene.scale.height/2;
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:mouseX,y:mouseY,button:'none'});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:mouseX,y:mouseY,button:'left',buttons:1,clickCount:1});
  await sleep(250);
  let desktop=await snapshot();
  assert.equal(desktop.controls.mouseHeld,true,'Desktop primary mouse not captured');
  assert.ok(desktop.controls.shotAt!==null,'Desktop held firing not started');
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:mouseX,y:mouseY,button:'left',buttons:0,clickCount:1});
  await sleep(40);
  desktop=await snapshot();
  assert.equal(desktop.controls.mouseHeld,false,'Desktop mouse release stuck');
  assert.equal(desktop.controls.shotAt,null,'Desktop release did not stop firing');
  console.log('PASS real CDP desktop keyboard + mouse held fire and release');
  await clickControl('hud');
  await waitFor(s=>s.menu&&s.actions.length===2,'Menu before new game');
  await clickControl('NOWA GRA');
  const fresh=await waitFor(s=>s.arena&&!s.menu&&!s.arenaPaused,'New game replaces session');
  assert.equal(fresh.samePlayer,false,'NOWA GRA reused existing player');
  assert.notDeepEqual(fresh.player,{x:552,y:440},'NOWA GRA retained old position');
  assert.equal(fresh.physics,false,'New game physics paused');
  assert.equal(fresh.controls.hp,5,'Fresh player HP not reset');
  assert.equal(fresh.controls.obstacles.length,3,'Fresh obstacles not created');
  assert.ok(fresh.controls.obstacles.every(o=>o.depth>fresh.controls.groundDepth),'Foreground obstacles layered under ground');
  assert.equal(fresh.controls.groundActive,true);
  assert.notEqual(fresh.controls.layoutIndex,retainedLayout,'NOWA GRA did not select next predefined layout');
  // Exercise actual Phaser projectile collision and barrel removal while not modifying the ground.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const b=a.obstacles.find(o=>o.type==='barrel');b.x=a.player.x+130;b.y=a.player.y;b.sprite.setPosition(b.x,b.y);b.sprite.body.updateFromGameObject();return true})()");
  const barrelAim=await snapshot();
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:barrelAim.rect.x+barrelAim.scale.width/2+145,y:barrelAim.rect.y+barrelAim.scale.height/2,button:'none'});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:barrelAim.rect.x+barrelAim.scale.width/2+145,y:barrelAim.rect.y+barrelAim.scale.height/2,button:'left',buttons:1,clickCount:1});
  await sleep(1050);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:barrelAim.rect.x+barrelAim.scale.width/2+145,y:barrelAim.rect.y+barrelAim.scale.height/2,button:'left',buttons:0,clickCount:1});
  const exploded=await snapshot();
  assert.equal(exploded.controls.obstacles.find(o=>o.type==='barrel').alive,false,'Real input did not destroy barrel');
  assert.equal(exploded.controls.groundActive,true,'Barrel removal destroyed arena underlay');
  console.log('PASS browser: obstacle layering, session layout, actual held mouse fire and barrel removal');

  assert.equal(fresh.controls.enemies.length,3,'Fresh deterministic enemy set missing');
  // Force one enemy into predictable aim lane; shoot via actual CDP mouse coordinates.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'); const e=a.enemies[0];e.x=a.player.x+120;e.y=a.player.y;e.sprite.setPosition(e.x,e.y);return true})()");
  const pos=await snapshot();
  const cx=pos.rect.x+pos.scale.width/2;
  const cy=pos.rect.y+pos.scale.height/2;
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx+140,y:cy,button:'none'});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:cx+140,y:cy,button:'left',buttons:1,clickCount:1});
  await sleep(850);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx+140,y:cy,button:'left',buttons:0,clickCount:1});
  const killed=await snapshot();
  assert.ok(killed.controls.enemies.length<3,'Actual mouse projectiles did not kill enemy');
  // Contact HP and defeat, while Phaser owns the running scene.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies){e.x=a.player.x;e.y=a.player.y;e.sprite.setPosition(e.x,e.y)}return true})()");
  const damaged=await waitFor(s=>s.controls.hp<5,'Contact damage');
  assert.equal(damaged.controls.hp,4);
  await sleep(200);
  assert.equal((await snapshot()).controls.hp,4,'Invulnerability failed on continuous overlap');
  await waitFor(s=>s.menu&&s.arenaPaused&&s.controls.defeated,'Defeat opens existing Menu');
  const defeat=await snapshot();
  assert.deepEqual(defeat.actions.map(a=>a.label),['NOWA GRA'],'Defeat exposed resume');
  await clickControl('NOWA GRA');
  const revived=await waitFor(s=>s.arena&&!s.menu&&!s.controls.defeated,'New game after defeat');
  assert.equal(revived.controls.hp,5);
  assert.equal(revived.controls.enemies.length,3);
  console.log('PASS real Phaser shots -> enemy death, contact invulnerability, defeat, clean NEW GAME');
  await clickControl('hud');
  await waitFor(s=>s.menu&&s.actions.length===2,'Menu again after fresh session');
  console.log('PASS real Phaser touch: NOWA GRA always, WZNÓW additional, 20 cycles, fresh session, physics and fullscreen visibility');

  // Positive path: intercept only the optional PNG URL, generated entirely in memory.
  const sheetBase64=syntheticSheetPng();
  const pending=new Set();
  const onFetch=event=>{
    const message=JSON.parse(event.data);
    if(message.method!=='Fetch.requestPaused')return;
    const id=message.params.requestId;
    pending.add(id);
    cdp('Fetch.fulfillRequest',{requestId:id,responseCode:200,
      responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Cache-Control',value:'no-store'}],
      body:sheetBase64}).then(()=>pending.delete(id)).catch(err=>{throw err;});
  };
  socket.addEventListener('message',onFetch);
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/player/player.png*',requestStage:'Request'}]});
  await cdp('Page.enable');
  await cdp('Page.reload',{ignoreCache:true});
  await waitFor(s=>s.menu&&s.actions.length===1,'synthetic sprite fresh page');
  await clickControl('NOWA GRA');
  const art=await waitFor(s=>s.arena&&s.playerVisual?.loaded,'actual synthetic RGBA sprite load');
  assert.deepEqual(art.playerVisual.textureFrames,Array(8).fill(true),'Phaser did not produce eight 64x64 frames');
  assert.equal(art.playerVisual.visualScale,1.30,'Loaded sprite scale');
  assert.equal(art.playerVisual.shadowCount,1,'One contact shadow after loading');
  assert.equal(art.playerVisual.shadowDepth,10);
  assert.equal(art.playerVisual.shadowAlpha,0.24);
  assert.equal(art.playerVisual.shadowAngle,0);
  assert.equal(art.playerVisual.shadowX,art.player.x);
  assert.equal(art.playerVisual.shadowY,art.player.y+17);
  assert.equal(art.playerVisual.physicsVisible,false,'Marker not hidden after successful load');
  assert.equal(art.playerVisual.bodyRadius,17);
  assert.equal(art.playerVisual.followIdentity,true);
  assert.equal(art.playerVisual.filter,1,'Texture filtering is not NEAREST');
  assert.ok(art.playerVisual.visualDepth>art.controls.groundDepth,'Visual behind arena ground');
  const probe=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const result=[];for(const facing of ['e','se','s','sw','w','nw','n','ne']){a.playerVisual.update(facing,false,16);result.push({frame:a.playerVisual.sprite.frame.name,rotation:a.playerVisual.sprite.rotation,x:a.playerVisual.sprite.x,y:a.playerVisual.sprite.y});}return result;})()");
  assert.deepEqual(probe.map(x=>String(x.frame)),['0','1','2','3','4','5','6','7'],'Facing did not switch real texture frames');
  assert.ok(probe.every(x=>x.rotation===0),'Direction should not rotate entire character');
  assert.ok(probe.every(x=>x.x===art.player.x&&x.y===art.player.y),'Visual should follow original physics center while idle');
  const beforeMove=await snapshot();
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
  await sleep(180);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
  await sleep(120); // Allow Arcade velocity reset and renderer to settle after keyup.
  const afterMove=await snapshot();
  assert.ok(afterMove.player.x>beforeMove.player.x+5,'Original keyboard movement regressed with sprite');
  assert.equal(afterMove.playerVisual.shadowCount,1);
  assert.ok(Math.abs(afterMove.playerVisual.shadowX-afterMove.player.x)<1);
  assert.ok(Math.abs(afterMove.playerVisual.shadowY-afterMove.player.y-17)<1);
  assert.ok(Math.abs(afterMove.playerVisual.visualX-afterMove.player.x)<1,'Visual not attached to moving physics object');
  console.log('PASS synthetic in-memory RGBA: actual 8 Phaser frames, facing, nearest, fallback, physics and camera');

  // Three consecutive Arena -> MENU -> NOWA GRA cycles with real Phaser objects.
  for(let cycle=0;cycle<3;cycle++){
    await evaluate('window.__captureVisualSession()');
    const prior=await snapshot();
    assert.equal(prior.playerVisual.shadowCount,1);
    await clickControl('hud');
    const paused=await waitFor(v=>v.menu&&v.arenaPaused&&v.actions.length===2,'menu visual cycle '+cycle);
    assert.equal(paused.playerVisual.shadowCount,1,'Menu duplicated visual shadow');
    const frozen=await evaluate("(()=>{const v=window.__visualSession();window.__resumeIdentity={player:v.player,shadow:v.shadow,sprite:v.sprite};return true;})()");
    assert.equal(frozen,true);
    await clickControl('WZNÓW');
    const resumed=await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'resume visual cycle '+cycle);
    const identity=await evaluate("(()=>{const v=window.__visualSession(),saved=window.__resumeIdentity;return {player:v.player===saved.player,shadow:v.shadow===saved.shadow,sprite:v.sprite===saved.sprite};})()");
    assert.deepEqual(identity,{player:true,shadow:true,sprite:true},'WZNÓW recreated Arena objects');
    assert.equal(resumed.playerVisual.shadowCount,1);
    assert.ok(Math.abs(resumed.playerVisual.shadowX-resumed.player.x)<1);
    assert.ok(Math.abs(resumed.playerVisual.shadowY-resumed.player.y-17)<1);
    await clickControl('hud');
    await waitFor(v=>v.menu&&v.arenaPaused,'menu before replacement '+cycle);
    await clickControl('NOWA GRA');
    const fresh=await waitFor(v=>v.arena&&!v.menu&&v.playerVisual?.loaded,'recreated sprite '+cycle);
    const integrity=await evaluate('window.__sessionIntegrity()');
    assert.equal(fresh.playerVisual.shadowCount,1,'Multiple contact shadows on restart '+cycle);
    assert.equal(fresh.playerVisual.visualScale,1.30);
    assert.equal(fresh.playerVisual.bodyRadius,17);
    assert.equal(integrity.current.shadowActive,true);
    assert.equal(integrity.current.spriteActive,true);
    assert.equal(integrity.current.shadowMatches,true);
    for(const former of integrity.past){
      assert.equal(former.playerSame,false,'Reused former physics player');
      assert.equal(former.shadowSame,false,'Reused former shadow');
      assert.equal(former.spriteSame,false,'Reused former sprite');
      assert.equal(former.shadowActive,false,'Orphan shadow survived shutdown');
      assert.equal(former.spriteActive,false,'Orphan Aloes sprite survived shutdown');
    }
  }
  console.log('PASS three Arena/MENU/NOWA GRA cycles; stable WZNÓW identity, single active shadow/sprite, old visuals destroyed');

  // Hold the first player PNG HTTP request after page reload: no texture is cached.
  let holdLoad=true,delayedRequest=null;
  socket.removeEventListener('message',onFetch);
  const onDelayedFetch=event=>{
    const message=JSON.parse(event.data);
    if(message.method!=='Fetch.requestPaused')return;
    const id=message.params.requestId;
    if(holdLoad&&delayedRequest===null){delayedRequest=id;return;}
    cdp('Fetch.fulfillRequest',{requestId:id,responseCode:200,
      responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Cache-Control',value:'no-store'}],body:sheetBase64})
      .catch(error=>console.error('Delayed fixture fulfillment failed',error));
  };
  socket.addEventListener('message',onDelayedFetch);
  await cdp('Page.reload',{ignoreCache:true});
  await waitFor(v=>v.menu&&!v.arena&&v.actions.length===1,'fresh game before delayed load');
  await clickControl('NOWA GRA');
  for(let attempt=0;attempt<50&&delayedRequest===null;attempt++)await sleep(80);
  assert.ok(delayedRequest,'Expected real pending PNG request');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');window.__deadSession={scene:a,player:a.player,visual:a.playerVisual};window.__game.scene.stop('Arena');window.__game.scene.start('Menu');return true})()");
  await waitFor(v=>v.menu&&!v.arena,'Arena stopped during pending PNG');
  holdLoad=false;
  await cdp('Fetch.fulfillRequest',{requestId:delayedRequest,responseCode:200,
    responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Cache-Control',value:'no-store'}],body:sheetBase64});
  await sleep(250);
  const dead=await evaluate("(()=>{const d=window.__deadSession;return {loaded:d.visual.loaded,shadow:d.visual.shadow!==null,sprite:d.visual.sprite!==null,shadowCount:d.scene.children.list.filter(o=>o.type==='Ellipse'&&o.depth===10&&o.active).length};})()");
  assert.deepEqual(dead,{loaded:false,shadow:false,sprite:false,shadowCount:0},'Delayed response revived destroyed visuals');
  await clickControl('NOWA GRA');
  const recovered=await waitFor(v=>v.arena&&v.playerVisual?.loaded,'Arena recovers after delayed previous load');
  assert.equal(recovered.playerVisual.shadowCount,1);
  assert.equal(recovered.playerVisual.visualScale,1.30);
  assert.equal(recovered.playerVisual.bodyRadius,17);
  console.log('PASS delayed PNG after Arena shutdown: no orphan visuals, later Arena loads normally');
  await cdp('Fetch.disable');
  socket.removeEventListener('message',onDelayedFetch);



} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  // Chrome may still flush profile files after SIGKILL. Cleanup must never mask the test result.
  await sleep(150);
  try { await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:150}); } catch (error) { console.error('Chrome profile cleanup warning:',error.message); }
}
