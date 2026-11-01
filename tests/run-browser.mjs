import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { access, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import {WAVES,WAVE_TIMING} from '../src/episode.js';
import {validDialoguePng} from '../src/dialogue-ui.js';
import { deflateSync } from 'node:zlib';
import {verifyTimedWaves} from './pr49-browser.mjs';
import {verifySpawnPacing} from './pr50-browser.mjs';


function syntheticSheetPng(width=512,height=64){
  // Generated solely in browser-test memory. Distinct colors distinguish eight directions.
  const raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=y*(1+width*4)+1+x*4,frame=Math.floor(x/(width/8));
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
  const uncaught=[];
  socket.addEventListener('message', event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown'){uncaught.push(message.params.exceptionDetails);console.log('PHASER UNCAUGHT EXCEPTION',JSON.stringify(message.params.exceptionDetails));}
  });
  await cdp('Runtime.enable');
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
  let arenaRun=0;
  async function clickControl(which){
    if(which==='NOWA GRA')await evaluate("history.replaceState(null,'','?arenaSeed="+[1,41,104729][arenaRun++%3]+"');true");
    const state=await snapshot();
    const target=which==='hud'?state.menuButton:state.actions.find(a=>a.label===which);
    assert.ok(target,'Missing '+which+' interactive hit area '+JSON.stringify(state));
    assert.ok(target.y-target.height/2>=0&&target.y+target.height/2<=state.rect.height,'Button clipped: '+which);
    await click(state.rect.x+target.x,state.rect.y+target.y);
    if(which==='NOWA GRA'){
      for(let k=0;k<60;k++){
        const status=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {ready:!!a.dialoguePanel&&!a.dialogueLoading,id:a.dialogueState?.id??null,index:a.dialogueState?.index??0,button:a.dialoguePanel?.button?{x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y}:null}})()");
        if(!status.ready){await sleep(60);continue;}
        if(status.id!=='before-wave-1')break;
        assert.equal(await evaluate("window.__game.scene.getScene('Arena').physics.world.isPaused"),true,'Opening must freeze combat');
        const sticks=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.joystick,a.aimJoystick].map(j=>({visible:j.base.visible,knob:j.knob.visible,enabled:j.enabled,held:j.held,pointer:j.pointerId}))})()");
        assert.ok(sticks.every(j=>!j.visible&&!j.knob&&!j.enabled&&!j.held&&j.pointer===null),'Both sticks must be disabled during dialogue '+JSON.stringify(sticks));
        if(status.index===0){
          for(const [width,height] of [[320,240],[568,320],[800,360]]){
            await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
            await evaluate('window.__game.scale.refresh();true');await sleep(80);
            const geometry=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.dialoguePanel,t=p.text.getBounds(),b=p.button.getBounds();return {width:a.scale.width,height:a.scale.height,text:{x:t.x,y:t.y,right:t.right,bottom:t.bottom},button:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},line:p.text.text}})()");
            assert.ok(geometry.button.x>=0&&geometry.button.y>=0&&geometry.button.right<=width&&geometry.button.bottom<=height,'DALEJ bounds '+JSON.stringify(geometry));
            assert.ok(geometry.text.x>=0&&geometry.text.right<=width&&geometry.text.bottom<=geometry.button.y+1,'Dialogue overlaps DALEJ '+JSON.stringify(geometry));
            const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
            await writeFile('dist/dialogue-opening-'+width+'x'+height+'.png',Buffer.from(shot.data,'base64'));
          }
        }
        const rect=(await snapshot()).rect;
        if(status.index===0){
          const points=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [{x:a.hudLayout.joystickX,y:a.hudLayout.joystickY},{x:a.hudLayout.aimX,y:a.hudLayout.aimY}]})()");
          for(const point of points){
            await click(rect.x+point.x,rect.y+point.y);
            const isolated=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {index:a.dialogueState.index,held:a.joystick.held||a.aimJoystick.held,dx:a.joystick.direction.x,aim:a.aimJoystick.direction.x}})()");
            assert.deepEqual(isolated,{index:0,held:false,dx:0,aim:0},'Joystick-region tap interfered with dialogue');
          }
        }
        await sleep(205);
        await click(rect.x+status.button.x,rect.y+status.button.y);
      }
      assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null,'Opening failed to complete');
      const restored=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.joystick,a.aimJoystick].map(j=>({visible:j.base.visible,knob:j.knob.visible,enabled:j.enabled,held:j.held,pointer:j.pointerId}))})()");
      assert.ok(restored.every(j=>j.visible&&j.knob&&j.enabled&&!j.held&&j.pointer===null),'Sticks must restore without stale captures '+JSON.stringify(restored));

    }
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
  // Geometry from real rendered Phaser GameObjects, not only calculated layout numbers.
  const assertHudBounds=async(label)=>{
    const geometry=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena'),w=a.scale.width,h=a.scale.height;
      const button=a.input._list.find(o=>o.input&&o.width===a.hudLayout.menuWidth);
      const actual=o=>{const b=o.getBounds();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
      const portrait=actual(a.hpFace.root),menu=actual(button),weapon=actual(a.weaponToken),skull=actual(a.skullIcon),kills=actual(a.killsText),hp=actual(a.hpText);
      return {w,h,portrait,menu,weapon,skull,kills,hp,stickTop:a.hudLayout.joystickY-a.hudLayout.joystickRadius,
        rightStickTop:a.hudLayout.aimY-a.hudLayout.joystickRadius,
        portraitSquare:Math.abs(portrait.width-portrait.height)<2};
    })()`);
    const {w,h,menu,portrait,weapon,skull,kills,hp}=geometry;
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').hudPanel"),undefined,label+' obsolete full-width HUD panel exists');
    for(const box of [menu,portrait,weapon,skull,kills,hp]){
      assert.ok(box.x>=-1&&box.y>=-1&&box.right<=w+1&&box.bottom<=h+1,label+' clipped '+JSON.stringify(geometry));
    }
    const separate=(a,b)=>a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1;
    assert.ok(separate(menu,weapon),label+' MENU/weapon overlap');
    assert.ok(separate(menu,kills)&&separate(weapon,skull)&&separate(skull,kills),label+' controls overlap');
    assert.ok(separate(portrait,weapon)&&separate(portrait,skull)&&separate(portrait,kills),label+' portrait/text overlap');
    assert.ok(portrait.x>w*0.55,label+' portrait not upper right');
    assert.ok(geometry.portraitSquare,label+' distorted portrait');
    assert.ok(hp.bottom<Math.min(geometry.stickTop,geometry.rightStickTop),label+' HP hits joystick');
    return geometry;
  };
  await clickControl('NOWA GRA');
  await waitFor(s=>s.arena&&!s.menu,'NOWA GRA to Arena');
  await assertHudBounds('initial create');
  assert.equal((await snapshot()).fullscreenVisible,false);
  // Initial equipment is gameplay state, independent of optional PNG availability.
  const firstPickup=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),p=a.pickups[0],cam=a.cameras.main;
    return {id:p.id,x:p.x,y:p.y,left:cam.worldView.x,right:cam.worldView.right,top:cam.worldView.y,bottom:cam.worldView.bottom,
      obstacles:a.obstacles.filter(o=>o.alive).map(o=>({x:o.x,y:o.y,r:o.footprint.shape==='circle'?o.footprint.radius:o.footprint.shape==='capsule'?o.footprint.length/2:Math.hypot(o.footprint.width,o.footprint.height)/2}))};
  })()`);
  assert.equal(firstPickup.id,'blunderbuss');
  assert.ok(firstPickup.x>firstPickup.left+25&&firstPickup.x<firstPickup.right-25);
  assert.ok(firstPickup.y>firstPickup.top+25&&firstPickup.y<firstPickup.bottom-25);
  assert.ok(firstPickup.obstacles.every(o=>Math.hypot(firstPickup.x-o.x,firstPickup.y-o.y)>o.r+20));

  const initialToken=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {symbol:a.weaponText.text,color:a.weaponTokenBody.fillColor,kills:a.killsText.text}})()");
  assert.deepEqual(initialToken,{symbol:'—',color:0x6b6153,kills:'0'});

  const initialClock=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {time:a.elapsedGameplayMs,label:a.timerText.text,wave:a.waveText.text}})()");
  assert.equal(initialClock.wave,'⚑ 1/6');assert.ok(initialClock.label.startsWith('◷ 00:'));
  for(const [w,h] of [[320,240],[568,320],[800,360]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
    await evaluate('window.__game.scale.refresh();true');
    await sleep(85);
    const hud=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const toRect=o=>{const r=o.getBounds();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}};return {timer:toRect(a.timerText),kills:toRect(a.killsText),wave:toRect(a.waveText),skull:toRect(a.skullIcon),token:toRect(a.weaponToken),portrait:toRect(a.hpFace.root),width:a.scale.width,panelHeight:a.hudLayout.panelY+a.hudLayout.panelHeight}})()");
    const intersects=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
    for(const name of ['kills','wave','skull','token','portrait'])assert.equal(intersects(hud.timer,hud[name]),false,'Timer overlaps '+name+' at '+w);
    assert.ok(Math.abs((hud.timer.y+hud.timer.bottom)/2-(hud.wave.y+hud.wave.bottom)/2)<3,'Timer is not on single HUD baseline at '+w);
    assert.ok(hud.timer.x>=0&&hud.timer.right<=w&&hud.timer.bottom<=hud.panelHeight,'Timer outside HUD at '+w);
    await writeFile('dist/pr39-hud-'+w+'x'+h+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  }

  await sleep(190);
  const runningClock=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");
  assert.ok(runningClock>initialClock.time,'Gameplay clock failed to advance');
  const lowFps=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.gameplayClock.lastNow=performance.now()-780;return a.elapsedGameplayMs})()");
  await sleep(90);
  assert.ok((await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"))-lowFps>=700,'Low-FPS active frame was incorrectly capped at 50 ms');

  await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'PR39 clock pause');
  const frozenClock=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");
  await sleep(250);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),frozenClock,'Timer advanced in MENU');
  await clickControl('WZNÓW');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'PR39 clock resume');
  await sleep(200);
  assert.ok(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs")>frozenClock,'Timer failed to resume');

  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),null);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerVisual.requestedVariant"),'unarmed');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const p=a.pickups[0];a.player.setPosition(p.x,p.y);a.player.body.reset(p.x,p.y);return true})()");
  await sleep(75);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'blunderbuss');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weaponText.text"),'ϟ');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weaponTokenBody.fillColor"),0xb59b46);
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
  assert.ok(a.controls&&a.controls.targetCount===0,'Arena still has shooting dummies');
  const left={x:a.rect.x+60,y:a.rect.y+a.scale.height-60,id:11};
  const right={x:a.rect.x+a.scale.width-60,y:a.rect.y+a.scale.height-60,id:12};
  const rMove={...right,x:right.x-40,y:right.y-8};
  const lMove={...left,x:left.x+35,y:left.y};
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right]});
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right,left]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[rMove,lMove]});
  await sleep(240);
  let dual=await snapshot();
  assert.notEqual(dual.controls.left.id,null,'left pointer not captured '+JSON.stringify({controls:dual.controls,episode:await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {state:a.episode.state,dialogue:a.dialogueState.id,paused:a.physics.world.isPaused,final:a.finalResolution,loading:a.dialogueLoading}})()")}));
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
  const retainedLayout=(await snapshot()).controls.seed;

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
    assert.equal(state.controls.seed,retainedLayout);
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
  assert.ok(fresh.controls.obstacles.length>=11&&fresh.controls.obstacles.length<=23,'Generated obstacle count outside approved bounds');
  assert.equal(fresh.controls.blockerBodyCount,0,'Duplicate native Arcade collider');
  assert.ok(fresh.controls.obstacles.every(o=>o.depth>fresh.controls.groundDepth),'Foreground obstacles layered under ground');
  assert.equal(fresh.controls.groundActive,true);
  assert.notEqual(fresh.controls.seed,retainedLayout,'NOWA GRA did not select a different deterministic seed');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),null);
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.pickups[0];a.player.body.reset(p.x,p.y);return true})()");
  await sleep(80);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'blunderbuss');
  // Exercise actual Phaser projectile collision and barrel removal while not modifying the ground.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const b=a.obstacles.find(o=>o.type==='toxic_barrel');b.x=a.player.x+130;b.y=a.player.y;b.sprite.setPosition(b.x,b.y);b.footprint=Object.freeze({...b.footprint,x:b.x,y:b.y});return true})()");
  const barrelAim=await snapshot();
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:barrelAim.rect.x+barrelAim.scale.width/2+145,y:barrelAim.rect.y+barrelAim.scale.height/2,button:'none'});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:barrelAim.rect.x+barrelAim.scale.width/2+145,y:barrelAim.rect.y+barrelAim.scale.height/2,button:'left',buttons:1,clickCount:1});
  await sleep(1050);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:barrelAim.rect.x+barrelAim.scale.width/2+145,y:barrelAim.rect.y+barrelAim.scale.height/2,button:'left',buttons:0,clickCount:1});
  const exploded=await snapshot();
  assert.equal(exploded.controls.obstacles.find(o=>o.type==='toxic_barrel').alive,false,'Real input did not destroy barrel');
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
  assert.ok(await evaluate("window.__game.scene.getScene('Arena').kills>=1"),'Actual mouse projectiles did not kill enemy');
  // Contact HP and defeat, while Phaser owns the running scene.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies){e.x=a.player.x;e.y=a.player.y;e.sprite.setPosition(e.x,e.y)}return true})()");
  const damaged=await waitFor(s=>s.controls.hp<5,'Contact damage');
  assert.equal(damaged.controls.hp,4);
  assert.equal(damaged.faceHud.current,'hp_4','Enemy contact did not change Aloes portrait');
  await sleep(200);
  assert.equal((await snapshot()).controls.hp,4,'Invulnerability failed on continuous overlap');
  await waitFor(s=>s.menu&&s.arenaPaused&&s.controls.defeated,'Defeat opens existing Menu');
  const defeat=await snapshot();
  assert.deepEqual(defeat.actions.map(a=>a.label),['NOWA GRA'],'Defeat exposed resume');
  await clickControl('NOWA GRA');
  const revived=await waitFor(s=>s.arena&&!s.menu&&!s.controls.defeated,'New game after defeat');
  assert.equal(revived.controls.hp,5);
  assert.equal(revived.faceHud.current,'hp_5','NOWA GRA portrait did not reset');
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
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/player/player*.png*',requestStage:'Request'}]});
  await cdp('Page.enable');
  await evaluate('window.__qaReloadPending=true');
  await cdp('Page.reload',{ignoreCache:true});
  for(let boot=0;boot<100;boot++){
    try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}
    await sleep(40);
  }
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
  await evaluate('window.__qaReloadPending=true');
  await cdp('Page.reload',{ignoreCache:true});
  for(let boot=0;boot<100;boot++){
    try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}
    await sleep(40);
  }
  await waitFor(v=>v.menu&&!v.arena&&v.actions.length===1,'fresh game before delayed load');
  await clickControl('NOWA GRA');
  for(let attempt=0;attempt<50&&delayedRequest===null;attempt++)await sleep(80);
  assert.ok(delayedRequest,'Expected real pending PNG request');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');window.__deadSession={scene:a,player:a.player,visual:a.playerVisual};window.__game.scene.stop('Arena');window.__game.scene.start('Menu');return true})()");
  assert.equal(await evaluate('window.__game.scene.isActive("Menu")&&!window.__game.scene.isActive("Arena")'),true,'Arena did not stop during pending PNG');
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
  // Load all four optional variants with the existing in-memory eight-frame PNG.
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/player/player-*.png*',requestStage:'Request'}]});
  for(const id of ['unarmed','blunderbuss','rifle','flamethrower']){
    await evaluate("window.__game.scene.getScene('Arena').playerVisual.setVariant('"+id+"')");
    const selected=await waitFor(v=>v.arena&&v.playerVisual.appliedVariant===id,'variant '+id);
    assert.equal(selected.playerVisual.visualScale,1.30);
    assert.equal(selected.playerVisual.shadowCount,1);
    assert.equal(selected.playerVisual.bodyRadius,17);
    assert.equal(selected.playerVisual.followIdentity,true);
  }
  await evaluate("(()=>{const v=window.__game.scene.getScene('Arena').playerVisual;v.setVariant('unarmed');v.setVariant('blunderbuss');v.setVariant('rifle');v.setVariant('flamethrower');return true;})()");
  const rapid=await waitFor(v=>v.playerVisual.appliedVariant==='flamethrower','rapid switch last request wins');
  assert.equal(rapid.playerVisual.shadowCount,1);
  await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'variant menu');
  await clickControl('WZNÓW');
  const resumedVariant=await waitFor(v=>v.arena&&!v.menu,'variant resume');
  assert.equal(resumedVariant.playerVisual.appliedVariant,'flamethrower');
  await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'variant reset menu');
  await clickControl('NOWA GRA');
  const defaultVariant=await waitFor(v=>v.arena&&v.playerVisual.requestedVariant==='unarmed','new Arena visual default');
  assert.equal(defaultVariant.playerVisual.requestedVariant,'unarmed');
  console.log('PASS optional variants: all four synthetic sheets, rapid selection, resume, reset, physics and single shadow');
  // Timed-wave replacement for the obsolete kill-gated progression regression.
  // Accelerated kills exercise a sustained set of72 ordinary enemies; only the active clock advances a wave.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.invulnerableUntil=Infinity;a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');const original=a.dropHealthReward.bind(a);a.healthAwardCount=0;a.dropHealthReward=()=>{a.healthAwardCount++;return original()};})()");
  const killOne=async()=>evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    if(!a.enemies.some(e=>!e.dead&&!e.encounterId))a.spawnReplacement();
    const e=a.enemies.find(e=>!e.dead&&!e.encounterId);if(!e)throw Error('Current timed budget stalled');
    e.hp=0;if(!a.finalizeEnemyDeath(e)||a.finalizeEnemyDeath(e))throw Error('Death must be unique');
    a.enemies=a.enemies.filter(e=>!e.dead);a.spawnReplacement();return {type:e.type,wave:a.episode.wave,state:a.episode.state};
  })()`);
  const typesDefeated=[];
  for(let wave=0;wave<WAVES.length;wave++){
    for(let n=0;n<12;n++){
      const result=await killOne();typesDefeated.push(result.type);assert.equal(result.wave,wave);assert.equal(result.state,'active');
    }
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.wave"),wave,'Kills advanced a timed wave');
    if(wave<5){
      await evaluate('window.__setActiveTime('+WAVE_TIMING[wave+1].startMs+');true');await sleep(100);
      assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.wave"),wave+1,'Time boundary did not advance empty wave');
      if(wave===1||wave===3){
        const reward=wave===1?'rifle':'flamethrower';
        assert.equal(await evaluate("window.__game.scene.getScene('Arena').pickups.filter(p=>p.id==='"+reward+"').length"),1,'Timed reward duplicated/missing');
        if(wave===1){await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.pickups.find(p=>p.id==='rifle');a.player.body.reset(p.x,p.y)})()");await sleep(70);}
        assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'rifle','Optional flamethrower must not force equipment');
      }
    }
  }
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'active');
  assert.equal(await evaluate("!!window.__game.scene.getScene('Arena').boss"),false,'Kills triggered Marcin early');
  await evaluate('window.__setActiveTime(260000);true');
  for(let i=0;i<60;i++){if(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id==='before-marcin'"))break;await sleep(25);}
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'before-marcin');await nextLine();await nextLine();
  // The director never deletes survivors to clear Marcin's seven nonboss landing slots.
  // Sustain combat until genuine player kills free safe slots.
  const pendingBoss=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {live:a.livingNonBoss(),pending:a.bossEntrancePending,spawned:a.episode.spawned}})()");
  if(pendingBoss.live>7){
    assert.equal(pendingBoss.pending,true,'Crowded handoff must wait rather than despawn');
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');while(a.livingNonBoss()>7){const e=a.enemies.find(x=>!x.dead&&x.type!=='marcin');e.hp=0;a.finalizeEnemyDeath(e);a.enemies=a.enemies.filter(x=>!x.dead);}})()");
  }
  for(let i=0;i<120;i++){
    const stage=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {landed:!!a.boss&&!a.bossEntrance,escorts:a.episode.specialSpawned.size-Number(a.episode.specialSpawned.has('marcin')),due:a.escortDue.length,live:a.livingNonBoss()}})()");
    if(stage.landed&&stage.escorts===2&&stage.due===0)break;
    if(stage.landed&&stage.live>=7&&stage.due>0){
      await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(e=>!e.dead&&!e.encounterId);if(e){e.hp=0;a.finalizeEnemyDeath(e);a.enemies=a.enemies.filter(e=>!e.dead);}})()");
    }
    await sleep(60);
  }
  const bossBefore=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {boss:!!a.boss&&a.boss.hp>0,live:a.enemies.filter(e=>!e.dead&&e.type!=='marcin').length,escorts:[...a.episode.specialSpawned].filter(x=>x.startsWith('escort')).length,planned:a.killsText.text,regular:a.episode.defeated}})()");
  assert.equal(bossBefore.boss,true,'Marcin must remain alive after all ordinary enemies die');
  assert.ok(bossBefore.live<=7,'Finale exceeded shared non-boss live cap');
  assert.equal(bossBefore.escorts,2,'Both escorts must have been offered');
  assert.ok(bossBefore.regular>=72);
  assert.equal(bossBefore.planned,String(bossBefore.regular));
  assert.deepEqual(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.weaponText.text,a.weaponTokenBody.fillColor]})()"),['⊕',0x2499ad]);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerVisual.requestedVariant"),'rifle');
  const progression=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {kills:a.kills,completed:a.completed,pending:a.pendingRewards.size,markers:[...a.triggeredMilestones],healthAwards:a.healthAwardCount||0}})()");
  assert.ok(progression.kills>=72);
  assert.ok(typesDefeated.includes('bobrozombi'));
  assert.ok(typesDefeated.includes('bocianolak'));
  assert.ok(typesDefeated.includes('zubrokryptyda'));
  assert.equal(typesDefeated.length,72);
  assert.equal(progression.healthAwards,3,'Heart awards after waves 2, 4, 5 were not exactly once');
  assert.equal(progression.pending,0);
  assert.deepEqual(progression.markers,[2,4]);
  console.log('PASS Phaser timed rewards and72 continuous mixed ordinary kills; ignored flamethrower, timed Marcin and two escorts; boss remains decisive');

  const finaleAtHit=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const live=a.enemies.filter(e=>!e.dead&&e.type!=='marcin').length;const spawned=a.totalSpawned;const boss=a.boss;if(!boss)throw Error('Marcin missing');boss.hp=0;if(!a.finalizeEnemyDeath(boss)||a.finalizeEnemyDeath(boss))throw Error('Marcin fatal hit was not unique');return {live,spawned,kills:a.kills,hud:a.killsText.text,final:a.finalResolution,state:a.episode.state,others:a.enemies.filter(e=>!e.dead&&e.type!=='marcin').length,queued:a.reinforcementDue.length+a.escortDue.length,projectiles:a.bossProjectiles.length,bursts:a.deathBursts.length,dialogue:a.dialogueState.id}})()");
  assert.ok(finaleAtHit.live>=1,'Scripted resolution must have living minions to neutralize');
  assert.equal(finaleAtHit.kills,progression.kills+1,'Only the player-earned Marcin kill may increment the numerator');
  assert.equal(finaleAtHit.hud,String(finaleAtHit.kills));
  assert.equal(finaleAtHit.state,'boss-resolving');
  assert.equal(finaleAtHit.final,true);
  assert.equal(finaleAtHit.others,0,'All spawned live minions must be neutralized atomically');
  assert.equal(finaleAtHit.queued,0,'Pending escorts and reinforcements must be cancelled');
  assert.equal(finaleAtHit.projectiles,0,'Boss projectiles retained after death');
  assert.equal(finaleAtHit.dialogue,null,'Final dialogue started before visual resolution');
  assert.ok(finaleAtHit.bursts>=finaleAtHit.live+1,'Missing visible scripted red death bursts');
  const finalShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/pr48-boss-resolution-active.png',Buffer.from(finalShot.data,'base64'));
  await sleep(950);
  const finalBurstsEnded=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {state:a.episode.state,id:a.dialogueState.id,held:a.finalOutcomeHeld,bursts:a.deathBursts.length,ended:a.episode.ended,kills:a.kills,spawned:a.totalSpawned}})()");
  assert.deepEqual(finalBurstsEnded,{state:'final-pending',id:'after-final-enemy',held:true,bursts:0,ended:false,kills:finaleAtHit.kills,spawned:finaleAtHit.spawned},'Final dialogue must follow settled VFX and cancel future spawns');
  const marcinPortrait=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {loaded:a.dialoguePanel.loaded.has('marcin'),label:a.dialoguePanel.shell.list.some(x=>x.type==='Text'&&x.text==='MARCIN'&&x.visible)}})()");
  let validUploadedMarcin=false,marcinPngMetadata={status:'missing'};
  try{const png=await readFile('public/assets/dialogue/dialogue-marcin.png');validUploadedMarcin=validDialoguePng(png);marcinPngMetadata={status:'present',bytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20),bitDepth:png[24],colorType:png[25],acceptedByLoader:validUploadedMarcin};}catch{}
  console.log('INFO PR48 actual user portrait metadata '+JSON.stringify(marcinPngMetadata));
  assert.equal(marcinPortrait.label,true,'MARCIN speaker must remain visible');
  assert.equal(marcinPortrait.loaded,validUploadedMarcin,'Valid uploaded portrait must load; missing/malformed portrait must fall back');
  if(!validUploadedMarcin)console.log('INFO PR48 user portrait invalid/missing on CI; tested letter fallback instead');

  const clockInFinal=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");
  await sleep(180);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),clockInFinal,'Timer advanced while final dialogue active');
  const finalAfterShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/pr48-boss-final-dialogue.png',Buffer.from(finalAfterShot.data,'base64'));
  const heldFinal=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {state:a.episode.state,held:a.finalOutcomeHeld,id:a.dialogueState.id,first:a.consumeNarrativeBoundary('after-final-enemy')}})()");
  assert.deepEqual(heldFinal,{state:'final-pending',held:true,id:'after-final-enemy',first:false});
  for(let line=0;line<3;line++){
    const before=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,index:a.dialogueState.index,x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y,state:a.episode.state}})()");
    assert.equal(before.id,'after-final-enemy');assert.equal(before.index,line);
    const isolated=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.joystick,a.aimJoystick].every(j=>!j.enabled&&!j.base.visible&&!j.knob.visible&&!j.held&&j.pointerId===null)})()");
    assert.equal(isolated,true,'Joysticks must remain isolated through all three final lines');
    assert.equal(before.state,'final-pending','Victory occurred before final DALEJ');
    await sleep(205);
    const bounds=(await snapshot()).rect;
    await click(bounds.x+before.x,bounds.y+before.y);
    const after=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,index:a.dialogueState.index}})()");
    assert.equal(after.id,line===2?null:'after-final-enemy','Final DALEJ tap skipped or failed');
    if(line<2)assert.equal(after.index,line+1);
  }
  await waitFor(v=>v.menu&&v.arenaPaused,'victory terminal menu');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'victory');
  const terminalClock=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");
  await sleep(160);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),terminalClock,'Timer advanced after victory');

  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'new game progression reset');
  const reset=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {kills:a.kills,total:a.totalSpawned,weapon:a.weapon,pending:a.pendingRewards.size,triggered:a.triggeredMilestones.size,pickups:a.pickups.map(p=>p.id)}})()");
  assert.deepEqual(reset,{kills:0,total:3,weapon:null,pending:0,triggered:0,pickups:['blunderbuss']});
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').timerText.text"),'◷ 00:00','NOWA GRA did not reset timer');
  const postponedSpawn=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(e=>!e.dead);
    e.hp=0;a.finalizeEnemyDeath(e);a.enemies=a.enemies.filter(v=>!v.dead);
    const r=46,W=1800,H=1200;
    for(const [x,y] of [[r,r],[W-r,r],[W-r,H-r],[r,H-r],[W/2,r],[W-r,H/2],[W/2,H-r],[r,H/2]])
      a.obstacles.push({...window.__createObstacle('rock',{id:'spawn-'+x+'-'+y,x,y}),__spawnFixture:true});
    // Block both new camera entries and the preserved world fallback.
    a.obstacles.push({alive:true,footprint:{shape:'circle',x:900,y:600,radius:3000},__spawnFixture:true});
    const before=a.totalSpawned;a.spawnDueAt=null;
    a.spawnReplacement();const blocked={before,after:a.totalSpawned,retry:a.spawnDueAt!==null};
    a.obstacles=a.obstacles.filter(o=>!o.__spawnFixture);
    a.spawnReplacement();
    return {...blocked,recovered:a.totalSpawned,nextType:a.enemies.at(-1).type,active:a.enemies.filter(v=>!v.dead).length};
  })()`);
  assert.equal(postponedSpawn.after,postponedSpawn.before,'Blocked spawn consumed schedule entry');
  assert.equal(postponedSpawn.retry,true,'Blocked spawn did not schedule retry');
  assert.equal(postponedSpawn.recovered,postponedSpawn.before+1,'Scheduled enemy lost after obstruction cleared');
  assert.ok(postponedSpawn.active<=4);
  console.log('PASS Arena blocked spawn: unchanged schedule counter and safe retry after obstacles clear');
  // In-memory valid 8-frame 1024x160 PNG-shaped artwork through Phaser Canvas textures.
  await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),key='enemy-bocianolak-v1';
    if(!a.textures.exists(key)){
      const c=document.createElement('canvas');c.width=1024;c.height=160;
      const g=c.getContext('2d');
      for(let k=0;k<8;k++){
        g.fillStyle='hsl('+k*39+',45%,65%)';
        g.fillRect(k*128+38,16,50,141);
      }
      a.textures.addSpriteSheet(key,c,{frameWidth:128,frameHeight:160});
    }
    return true;
  })()`);
  await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'stork synthetic reload');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'new scene with synthetic stork');
  const storkVisual=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    const e=a.createEnemy('bocianolak',{x:600,y:500},6);
    a.enemyRenderers.bocianolak.update(e,{x:660,y:500});
    const art=e.sprite.getData('bocianolak-art');
    const snapshot={loaded:a.enemyRenderers.bocianolak.loaded,visible:!!art?.active,
      scale:art?.scaleX,frame:art?.frame?.name,offset:art?.y,
      fallbackVisible:e.sprite.list.some(child=>child!==art&&child.visible)};
    e.sprite.destroy();return snapshot;
  })()`);
  assert.equal(storkVisual.loaded,true);
  assert.equal(storkVisual.visible,true);
  assert.equal(storkVisual.scale,0.65);
  assert.equal(Number(storkVisual.frame),0);
  assert.equal(storkVisual.offset,-47);
  assert.equal(storkVisual.fallbackVisible,false);
  console.log('PASS real Canvas Phaser: synthetic 1024x160 directional Bocianołak spritesheet, feet anchor and no duplicate fallback');
  // Synthetic Żubrokryptyda V2 sheet; no user binary committed.
  await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),key='enemy-zubrokryptyda-v2';
    if(!a.textures.exists(key)){
      const c=document.createElement('canvas');c.width=1536;c.height=192;
      const g=c.getContext('2d');
      for(let k=0;k<8;k++){
        g.fillStyle='hsl('+k*39+',35%,43%)';
        g.fillRect(k*192+34,12,124,174);
      }
      a.textures.addSpriteSheet(key,c,{frameWidth:192,frameHeight:192});
    }
    return true;
  })()`);
  await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'heavy synthetic reload');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'new scene with synthetic heavy');
  const heavyVisual=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    const e=a.createEnemy('zubrokryptyda',{x:650,y:500},12);
    a.enemyRenderers.zubrokryptyda.update(e,{x:710,y:500});
    const art=e.sprite.getData('zubrokryptyda-art');
    const rendered={loaded:a.enemyRenderers.zubrokryptyda.loaded,visible:!!art?.active,
      frame:art?.frame?.name,scale:art?.scaleX,offset:art?.y,
      fallbackVisible:e.sprite.list.some(child=>child!==art&&child.visible)};
    e.sprite.destroy();return rendered;
  })()`);
  assert.equal(heavyVisual.loaded,true);
  assert.equal(heavyVisual.visible,true);
  assert.equal(Number(heavyVisual.frame),0);
  assert.equal(heavyVisual.scale,0.55);
  assert.equal(heavyVisual.offset,-48.4);
  assert.equal(heavyVisual.fallbackVisible,false);
  console.log('PASS real Canvas Phaser: synthetic heavy 1536x192 eight-frame render, nearest scale, ground offset, no duplicate fallback');
  // Gait on an actual Phaser Sprite: internal transform only, 3 distinct profiles.
  const gaitProbe=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),types=['bobrozombi','bocianolak','zubrokryptyda'];
    const result=[];
    for(let i=0;i<types.length;i++){
      const type=types[i],e=a.createEnemy(type,{x:530+i*130,y:450},i+12),renderer=a.enemyRenderers[type];
      const sprite=e.sprite,oldX=sprite.x,oldY=sprite.y;
      const image=()=>sprite.getData(type+'-art');
      renderer.update(e,{x:e.x+100,y:e.y},i===0?65/60:i===1?85/60:42/60,1/60);
      const initial=sprite.getData(type+'-gait');
      const first=initial?{phase:initial.phase,intensity:initial.intensity}:null;
      for(let k=0;k<60;k++)renderer.update(e,{x:e.x+100,y:e.y},[65,85,42][i]/60,1/60);
      const moved={rotation:image()?.rotation,y:image()?.y,phase:sprite.getData(type+'-gait')?.phase};
      for(let k=0;k<120;k++)renderer.update(e,{x:e.x+100,y:e.y},0,1/60);
      const idle={rotation:image()?.rotation,y:image()?.y,phase:sprite.getData(type+'-gait')?.phase};
      result.push({type,first,moved,idle,oldX,oldY,x:sprite.x,y:sprite.y,
        scale:image()?.scaleX,visible:image()?.visible,alive:image()?.active});
      sprite.destroy();
    }
    return result;
  })()`);
  assert.equal(gaitProbe.length,3);
  for(const item of gaitProbe){
    assert.equal(item.x,item.oldX,'gait moved enemy container');
    assert.equal(item.y,item.oldY,'gait moved enemy container');
    assert.ok(item.first&&item.first.intensity>0,'walking did not blend in '+item.type);
    assert.equal(item.moved.phase,item.idle.phase,'blocked walking phase changed '+item.type);
    assert.ok(Math.abs(item.idle.rotation)<0.001,'idle rotation remains '+item.type);
    assert.ok(item.visible&&item.alive,'art missing '+item.type);
  }
  assert.deepEqual(gaitProbe.map(e=>e.scale),[0.75,0.65,0.55]);
  console.log('PASS real Phaser enemy gait: three visual-only profiles, distance phase, static enemy containers, idle recovery and original scales');
  // Preserve the prior one-heavy concurrency regression under wave-local ordering.
  const heavyQueue=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    const saved={enemies:a.enemies,total:a.totalSpawned,due:a.spawnDueAt,episode:{...a.episode},clock:{...a.gameplayClock},elapsed:a.elapsedGameplayMs};
    a.introducedEnemyTypes.add('before-first-zubrokryptyda'); // Separate test covers live visual introduction.
    const activeHeavy=a.createEnemy('zubrokryptyda',{x:650,y:500},12);
    a.enemies=[activeHeavy];window.__stageTimedWave(3);a.encounterDirector.counts[3]=[0,0,0];
    a.episode.state='active';a.totalSpawned=70;a.spawnDueAt=null;
    a.spawnReplacement();
    const blocked={total:a.totalSpawned,heavy:a.enemies.filter(e=>!e.dead&&e.type==='zubrokryptyda').length,common:a.enemies.some(e=>e.type==='bobrozombi'),weighted:a.encounterDirector.counts[3].length===3};
    activeHeavy.dead=true;activeHeavy.sprite.destroy();a.enemies=[];
    a.spawnReplacement();
    const unblocked={total:a.totalSpawned,spawned:a.episode.spawned,type:a.enemies[0]?.type};
    for(const e of a.enemies)e.sprite.destroy();
    a.enemies=saved.enemies;a.totalSpawned=saved.total;a.spawnDueAt=saved.due;
    Object.assign(a.episode,saved.episode);
    Object.assign(a.gameplayClock,saved.clock);a.elapsedGameplayMs=saved.elapsed;a.waveText.setText('⚑ '+(a.episode.wave+1)+'/6');
    return {blocked,unblocked};
  })()`);
  assert.equal(heavyQueue.blocked.total,71);assert.equal(heavyQueue.blocked.heavy,1);assert.equal(heavyQueue.blocked.common,true);
  assert.equal(heavyQueue.unblocked.total,72);assert.equal(heavyQueue.unblocked.type,'zubrokryptyda');
  console.log('PASS wave-local heavy concurrency gate under continuous weighted selection');
  // Real Phaser combat: use the running Arena and in-memory 8-frame player art.
  const combatProbe=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'), aim={x:1,y:0};
    const player=a.player,camera=a.cameras.main;
    const identity={player,camera,follow:camera._follow};
    a.weapon='rifle';a.stopWeaponFire();
    const t=a.time.now;
    // Character recoil uses the existing independent visual renderer.
    a.playerVisual.recoil();
    a.playerVisual.update('e',false,16);
    const recoil={x:a.playerVisual.sprite?.x,physicsX:player.x,followSame:camera._follow===player};
    a.weapon='flamethrower';a.stopWeaponFire();
    a.flameEmissionAt=null;
    a.emitFlame({x:player.x+24,y:player.y},aim,t+1000);
    const particles=a.flameParticles.length;
    a.stopWeaponFire();
    return {recoil,particles,limit:60,weapon:a.weapon,followSame:identity.follow===camera._follow};
  })()`);
  assert.equal(combatProbe.followSame,true);
  assert.equal(combatProbe.recoil.followSame,true);
  assert.equal(combatProbe.recoil.physicsX,await evaluate("window.__game.scene.getScene('Arena').player.x"));
  assert.ok(combatProbe.particles<=60);
  assert.equal(combatProbe.weapon,'flamethrower');
  console.log('PASS Phaser visual recoil physics/camera isolation, procedural flame and weapon state');
  // Real mouse-held rifle and flamethrower on the Phaser frame loop.
  const fireScreen=await snapshot();
  const fireX=fireScreen.rect.x+fireScreen.scale.width/2+120;
  const fireY=fireScreen.rect.y+fireScreen.scale.height/2;
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.weapon='rifle';a.stopWeaponFire();a.projectiles.forEach(p=>p.object.destroy());a.projectiles=[];return true})()");
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:fireX,y:fireY,button:'none'});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:fireX,y:fireY,button:'left',buttons:1,clickCount:1});
  await sleep(195);
  const rifleShot=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {count:a.projectiles.length,radius:a.projectiles[0]?.radius,velocity:a.projectiles[0]?.vx,burst:a.firingState.burstShots}})()");
  assert.equal(rifleShot.count,3,'Rifle should fire three projectiles in first burst');
  assert.equal(rifleShot.radius,3);
  assert.ok(rifleShot.velocity>700);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:fireX,y:fireY,button:'left',buttons:0,clickCount:1});
  await sleep(50);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').firingState.burstShots"),0,'Released rifle kept scheduled burst');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.weapon='flamethrower';a.stopWeaponFire();a.flamePressure.value=100;a.flamePressure.locked=false;a.flamePressure.wasHeld=false;a.flamePressure.active=false;return true})()");
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:fireX,y:fireY,button:'left',buttons:1,clickCount:1});
  await sleep(220);
  const flaming=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {particles:a.flameParticles.length,projectiles:a.projectiles.length,active:a.firingState.active}})()");
  assert.ok(flaming.particles>0&&flaming.particles<=60,'Flame particles not bounded and rendered');
  assert.equal(flaming.active,true);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:fireX,y:fireY,button:'left',buttons:0,clickCount:1});
  await sleep(40);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').firingState.active"),false);
  // PR38 real Phaser pressure: full, depletion, blocked held trigger, recharge, fresh press.
  const stateFull=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.flamePressure.value=100;a.flamePressure.locked=false;a.flamePressure.wasHeld=false;a.flamePressure.active=false;a.weapon='flamethrower';a.renderPressureBar();return {value:a.flamePressure.value,meter:a.pressureBar.commandBuffer.length}})()");
  assert.equal(stateFull.value,100);assert.ok(stateFull.meter>0);
  await writeFile('dist/pressure-full.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:fireX,y:fireY,button:'left',buttons:1,clickCount:1});
  await sleep(400);
  const partial=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {value:a.flamePressure.value,locked:a.flamePressure.locked}})()");
  assert.ok(partial.value<100&&partial.value>60,'No pressure drain under real fire');
  await writeFile('dist/pressure-partial.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.flamePressure.value=0.2;return true})()");
  await sleep(120);
  const empty=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {locked:a.flamePressure.locked,active:a.flamePressure.active,value:a.flamePressure.value}})()");
  assert.equal(empty.locked,true);assert.equal(empty.active,false);
  await writeFile('dist/pressure-empty.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await sleep(700);
  const heldAfter=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {value:a.flamePressure.value,active:a.flamePressure.active,locked:a.flamePressure.locked}})()");
  assert.equal(heldAfter.active,false,'Held trigger restarted fire after depletion');
  assert.equal(heldAfter.locked,true);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:fireX,y:fireY,button:'left',buttons:0,clickCount:1});
  await sleep(500);
  const recharge=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {value:a.flamePressure.value,locked:a.flamePressure.locked}})()");
  assert.ok(recharge.value>=20,'Partial recharge did not reach ignition threshold');assert.equal(recharge.locked,false);
  await writeFile('dist/pressure-recharge.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:fireX,y:fireY,button:'left',buttons:1,clickCount:1});
  await sleep(90);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').flamePressure.active"),true,'Fresh press failed after recharge');
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:fireX,y:fireY,button:'left',buttons:0,clickCount:1});
  await sleep(55);
  // Actual virtual aim-stick touch uses the same pressure gating and fresh release.
  const touchAt=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.flamePressure.value=75;a.flamePressure.locked=false;a.flamePressure.wasHeld=false;a.flamePressure.active=false;return {x:a.hudLayout.aimX-22,y:a.hudLayout.aimY,value:a.flamePressure.value}})()");
  const view=(await snapshot()).rect;
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:view.x+touchAt.x,y:view.y+touchAt.y,id:17}]});
  await sleep(180);
  const touched=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {held:a.aimJoystick.held,active:a.flamePressure.active,value:a.flamePressure.value}})()");
  assert.equal(touched.held,true,'Right joystick did not capture genuine touch');
  assert.equal(touched.active,true,'Right joystick did not ignite flamethrower');
  assert.ok(touched.value<touchAt.value,'Touch firing did not drain pressure');
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(100);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').aimJoystick.held"),false,'Touch capture persisted after release');
  assert.ok(await evaluate("window.__game.scene.getScene('Arena').flamePressure.value")>touched.value,'Touch release did not regenerate pressure');
  console.log('PASS real Chromium PR38 virtual aim joystick touch: drain, release, recharge');
  console.log('PASS real Chromium PR38 flame pressure meter, depletion lockout, held no-pulse and fresh press');
  console.log('PASS real held mouse: rifle three-shot burst, release cancellation, flame visual stream and stop');
  // One authoritative barrel explosion path when flame applies three cooldown-limited hits.
  const flameBarrel=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'), barrel=a.obstacles.find(o=>o.type==='toxic_barrel');
    barrel.x=a.player.x+132;barrel.y=a.player.y;barrel.sprite.setPosition(barrel.x,barrel.y);
    barrel.footprint=Object.freeze({...barrel.footprint,x:barrel.x,y:barrel.y});
    a.weapon='flamethrower';a.stopWeaponFire();
    a.flameCooldowns.clear();
    const aim={x:1,y:0},now=a.time.now;
    const beforeHp=a.playerHp;
    for(let i=0;i<3;i++)a.applyFlame(aim,now+300*i);
    const after={alive:barrel.alive,hp:barrel.hp,effects:a.explosionEffects.length,playerHp:a.playerHp,beforeHp};
    a.applyFlame(aim,now+1500);
    return {...after,effectsAfter:a.explosionEffects.length};
  })()`);
  assert.equal(flameBarrel.alive,false,'Flamethrower did not explode barrel after three hits');
  assert.equal(flameBarrel.hp,0);
  assert.equal(flameBarrel.effects,flameBarrel.effectsAfter,'Repeated flame re-exploded the barrel');
  assert.equal(flameBarrel.playerHp,flameBarrel.beforeHp,'Barrel beyond explosion range injured player');
  console.log('PASS real Phaser flame-barrel damage cooldown, one-shot explosion and no self-flame damage');
  // Exercise the actual Phaser Arena hit pipeline, render objects and movement update.
  const panicStart=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    const e=a.enemies.find(e=>e.type==='bobrozombi'&&!e.dead);
    if(!e)throw Error('Missing living Bobrozombi');
    e.x=a.player.x+95;e.y=a.player.y;e.hp=3;
    a.flameCooldowns.clear();
    const before={x:e.x,hp:e.hp};
    a.applyFlame({x:1,y:0},a.time.now);
    window.__panicTestEnemy=e;
    return {before,afterHp:e.hp,burning:e.ignition.ignitedAt!==null,visual:!!e.burningFx?.graphics.active,stream:a.flameStream.commandBuffer.length};
  })()`);
  assert.equal(panicStart.afterHp,panicStart.before.hp-1,'Real flame damage changed');
  assert.equal(panicStart.burning,true,'Visible flame hit did not ignite living enemy');
  assert.equal(panicStart.visual,true,'No attached fire VFX after ignition');
  assert.ok(panicStart.stream>0,'Flame stream not drawn');
  await sleep(160);
  const panicMove=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=window.__panicTestEnemy;return {x:e.x,burning:!!e.burningFx?.graphics.active,visualX:e.burningFx?.graphics.x,visualY:e.burningFx?.graphics.y,playerX:a.player.x}})()");
  assert.ok(panicMove.x>panicStart.before.x+2,'Real Arena frame did not retreat away from Aloes');
  assert.equal(panicMove.visualX,panicMove.x,'Attached fire VFX lagged behind enemy');
  const panicScreen=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/flamethrower-v2-ignition-chromium.png',Buffer.from(panicScreen.data,'base64'));
  await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'burning enemy MENU pause');
  const freeze=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=window.__panicTestEnemy;return {now:a.time.now,until:e.ignition.burningUntil,x:e.x}})()");
  await sleep(270);
  assert.deepEqual(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=window.__panicTestEnemy;return {now:a.time.now,until:e.ignition.burningUntil,x:e.x}})()"),freeze,'Burning advanced during MENU');
  await clickControl('WZNÓW');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'burning enemy resume');
  const extinguish=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=window.__panicTestEnemy;
    e.ignition.burningUntil=a.time.now+35;return true;
  })()`);
  await sleep(115);
  assert.equal(await evaluate("window.__panicTestEnemy.burningFx"),null,'Burning overlay did not extinguish');
  console.log('PASS real Chromium ignite, flee, attached VFX, screenshot, pause/resume and extinguish');



  // In-memory synthetic 128x128 circular portrait artwork; no binary asset committed.
  await evaluate(`(()=>{
    const arena=window.__game.scene.getScene('Arena'),t=arena.textures;
    for(let hp=1;hp<=5;hp++){
      const c=document.createElement('canvas');c.width=c.height=128;
      const ctx=c.getContext('2d');
      ctx.fillStyle=['','#7d3432','#a25a39','#af8547','#8aa76c','#67916b'][hp];
      ctx.beginPath();ctx.arc(64,64,61,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fbe2a2';ctx.font='bold 54px sans-serif';ctx.textAlign='center';ctx.fillText(hp,64,83);
      const key='aloes-hud-hp_'+hp;
      if(!t.exists(key))t.addImage(key,c);
    }
    // Isolate the portrait API probe from real nearby combat. Keep logical
    // and visual HP synchronized; contact/defeat are tested separately above.
    arena.invulnerableUntil=Infinity;arena.setPlayerHp(5);arena.setPlayerHp(4);
    return true;
  })()`);
  await sleep(65);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_4');
  await evaluate("window.__game.scene.getScene('Arena').setPlayerHp(3)");
  await sleep(55);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_3');
  const faceDamage=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const before=a.hpFace.pulse;a.setPlayerHp(3);return {before,after:a.hpFace.pulse}})()");
  assert.equal(faceDamage.before,faceDamage.after,'Same HP retriggered portrait damage pulse');
  // A living Arena with a dialogue must freeze combat while game-clock VFX expires.
  const life=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),victim=a.enemies.find(v=>!v.dead);
    victim.hp=0;
    const accepted=a.finalizeEnemyDeath(victim);
    const e=a.enemies.find(v=>!v.dead);
    if(!e)throw Error('Need a living enemy to assert narrative freeze');
    const x=e.x,y=e.y;
    const activeBefore=a.deathBursts.some(v=>v.graphics.active&&!v.done);
    // Trigger via the first genuine scheduled Bocianołak, not a fabricated boundary.
    window.__stageTimedWave(1);
    a.introducedEnemyTypes.delete('before-first-bocianolak');
    a.pendingIntroductions.delete('before-first-bocianolak');
    a.spawnReplacement();
    return {accepted,id:a.dialogueState.id,paused:a.physics.world.isPaused,x,y,active:activeBefore&&a.deathBursts.some(v=>v.graphics.active&&!v.done),count:a.deathBursts.length};
  })()`);
  assert.equal(life.accepted,true);
  assert.equal(life.active,true,'Dialogue started without an active enemy death burst');
  assert.ok(life.count>0);
  assert.equal(life.id,'before-first-bocianolak');
  assert.equal(life.paused,true);
  await sleep(520);
  const finished=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(v=>!v.dead);
    return {id:a.dialogueState.id,count:a.deathBursts.length,x:e.x,y:e.y};
  })()`);
  assert.equal(finished.count,0,'Death particles leaked across dialogue');
  assert.equal(finished.id,'before-first-bocianolak');
  assert.equal(finished.x,life.x);assert.equal(finished.y,life.y);
  // Dismiss the narrative before verifying terminal presentation.
  for(let i=0;i<3;i++){
    await sleep(205);
    const pos=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y}})()");
    const rect=(await snapshot()).rect;
    await click(rect.x+pos.x,rect.y+pos.y);
  }
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null);
    await evaluate("window.__game.scene.getScene('Arena').setPlayerHp(0)");
  await sleep(60);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.current"),'hp_1');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_1');
  // HP0 now correctly ends the run; restart to capture the actual Arena HUD,
  // not the terminal MENU overlay, at mobile landscape viewports.
  await waitFor(v=>v.menu&&v.arenaPaused,'HP0 defeat outcome');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'HUD screenshot Arena reset');
  await evaluate("window.__game.scene.getScene('Arena').setPlayerHp(3)");
  // Test portrait and layout across tight landscape/fullscreen-equivalent resizes.
  for(const [width,height] of [[320,240],[568,320],[800,360]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate("window.__game.scale.refresh();true");
    await sleep(100);
    await assertHudBounds('resize '+width+'x'+height);
    if(width===320||width===800){
      const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile('dist/hud-preview-'+width+'x'+height+'.png',Buffer.from(screenshot.data,'base64'));
    }
  }
  console.log('PASS synthetic five-portrait Phaser textures, HP states 4/3/0, same-HP pulse suppression, 320/568/800 landscape HUD screenshots');
  await assertHudBounds('after HP loss');
  await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});
  await evaluate("window.__game.scale.refresh();true");
  // Actual barrel explosion updates the same HP face without modifying damage math.
  const explosionHud=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    a.setPlayerHp(5);a.invulnerableUntil=0;
    const x=a.player.x+65,y=a.player.y;
    const sprite=a.add.rectangle(x,y,43,48,0xba3c29);
    const barrel={...window.__createObstacle('toxic_barrel',{id:'explosion-hud',x,y}),hp:1,sprite,hitUntil:0};
    a.obstacles.push(barrel);
    a.hitObstacle(barrel,a.time.now);
    return {hp:a.playerHp,face:a.hpFace.current,alive:barrel.alive};
  })()`);
  assert.deepEqual(explosionHud,{hp:4,face:'hp_4',alive:false});
  console.log('PASS real Phaser barrel explosion maps player HP to fourth portrait');
  await cdp('Fetch.disable');
  socket.removeEventListener('message',onDelayedFetch);
  // Async race: a slower hp_2 fetch must never overwrite a newer hp_4.
  const portraitBase64=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');g.fillStyle='#bd8240';g.beginPath();g.arc(64,64,60,0,7);g.fill();
    return c.toDataURL('image/png').split(',')[1];
  })()`);
  await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    a.hpFace.setHp(5); // Avoid removing an in-use Canvas texture; still test delayed HP2 -> HP4 race.
    for(const n of [2,4])a.textures.remove('aloes-hud-hp_'+n);
    return true;
  })()`);
  let heldPortrait=null;
  const portraitFetch=event=>{
    const message=JSON.parse(event.data);
    if(message.method!=='Fetch.requestPaused')return;
    const id=message.params.requestId,url=message.params.request.url;
    if(url.includes('hp_2.png')){heldPortrait=id;return;}
    cdp('Fetch.fulfillRequest',{requestId:id,responseCode:200,
      responseHeaders:[{name:'Content-Type',value:'image/png'}],body:portraitBase64}).catch(()=>{});
  };
  socket.addEventListener('message',portraitFetch);
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/portraits/hp_*.png*',requestStage:'Request'}]});
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.hpFace.setHp(2);a.hpFace.setHp(4);return true})()");
  for(let k=0;k<30&&!heldPortrait;k++)await sleep(35);
  assert.ok(heldPortrait,'Delayed HP2 portrait request not observed');
  for(let k=0;k<40;k++){
    const key=await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key");
    if(key==='aloes-hud-hp_4')break;
    await sleep(35);
  }
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_4');
  await cdp('Fetch.fulfillRequest',{requestId:heldPortrait,responseCode:200,
    responseHeaders:[{name:'Content-Type',value:'image/png'}],body:portraitBase64});
  await sleep(140);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_4',
    'Stale portrait load overwrote the latest HP');
  await cdp('Fetch.disable');
  socket.removeEventListener('message',portraitFetch);
  console.log('PASS delayed portrait fetch races: old HP2 load cannot overwrite current HP4');

  // Real Phaser heart pickup and pause-frozen timed boundary, on a clean Arena session.
  if(!(await snapshot()).menu)await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'episode health test menu');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'episode health test arena');
  const heart=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),point={x:a.player.x,y:a.player.y};
    a.addPickup('health',point);a.collectPickups();
    const full={hp:a.playerHp,persist:a.pickups.some(p=>p.id==='health')};
    a.setPlayerHp(3);a.collectPickups();
    const healed={hp:a.playerHp,remaining:a.pickups.filter(p=>p.id==='health').length,face:a.hpFace.current};
    a.setPlayerHp(1);a.addPickup('health',point);a.collectPickups();
    const low={hp:a.playerHp,face:a.hpFace.current};
    a.setPlayerHp(5);return {full,healed,low};
  })()`);
  assert.deepEqual(heart,{full:{hp:5,persist:true},healed:{hp:5,remaining:0,face:'hp_5'},low:{hp:3,face:'hp_3'}});
  const wavePause=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    window.__stageTimedWave(1);window.__setActiveTime(74200);
    a.spawnDueAt=null;
    return {before:a.time.now,state:a.episode.state};
  })()`);
  await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'episode intermission pause');
  const pausedClock=await evaluate("window.__game.scene.getScene('Arena').gameplayClock.elapsedMs");
  await sleep(260);
  const pausedClockAfter=await evaluate("window.__game.scene.getScene('Arena').gameplayClock.elapsedMs");
  assert.equal(pausedClockAfter,pausedClock,'Active time advanced while Arena paused');
  await clickControl('WZNÓW');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'episode intermission resume');
  await sleep(950);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.wave"),2);
  console.log('PASS real Chromium Episode 1 hearts: full HP persistence, +2 heal and paused timed boundary');
  // Test both introductions through the *actual* scheduled spawn, not a fabricated boundary.
  for(const [id,type,wave,spawned,lines] of [
    ['before-first-zubrokryptyda','zubrokryptyda',2,19,2],
    ['before-first-bocianolak','bocianolak',1,11,3]
  ]){
    const intro=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena');
      for(const e of a.enemies)if(e.sprite.active)e.sprite.destroy();
      a.enemies=[];window.__stageTimedWave(${wave});a.spawnDueAt=null;a.introducedEnemyTypes.delete('${id}');a.pendingIntroductions.delete('${id}');a.narrativeEvents.delete('${id}');if(${wave}===2)a.introducedEnemyTypes.add('before-first-bocianolak');
      a.totalSpawned=20; // Stable synthetic spawn ordinal; no extra actual enemy.
      const before=a.totalSpawned;
      a.spawnReplacement();
      const e=a.enemies.find(v=>v.type==='${type}');
      if(!e)throw Error('Scheduled introduction enemy was not spawned');
      const v=a.cameras.main.worldView;
      const width=${type==='zubrokryptyda'?105.6:83.2};
      return {id:a.dialogueState.id,type:e.type,x:e.x,y:e.y,live:a.enemies.length,
        spawned:a.totalSpawned-before,paused:a.physics.world.isPaused,
        within:e.x-width/2>=v.x&&e.x+width/2<=v.x+v.width,
        attackAt:a.enemyRenderers[e.type].feedbackOf(e).attackAt};
    })()`);
    assert.equal(intro.id,id,'Introduction did not begin upon visible spawn '+id);
    assert.equal(intro.spawned,1,'Introduction duplicated enemy');
    assert.equal(intro.live,1);
    assert.equal(intro.within,true);
    assert.equal(intro.paused,true);
    assert.ok(!intro.attackAt,'Intro enemy attacked before dialogue');
    // Real rendered dialogue geometry at Android-sized landscape viewports.
    for(const [width,height] of [[320,240],[568,320],[800,360]]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate("window.__game.scale.refresh();true");
      await sleep(85);
      const g=await evaluate(`(()=>{
        const a=window.__game.scene.getScene('Arena'),p=a.dialoguePanel;
        const t=p.text.getBounds(),b=p.button.getBounds();
        return {w:a.scale.width,h:a.scale.height,text:{x:t.x,y:t.y,right:t.right,bottom:t.bottom},
          button:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},font:parseFloat(p.text.style.fontSize),
          body:p.text.text};
      })()`);
      assert.ok(g.text.x>=0&&g.text.right<=width+1&&g.text.y>=0,'Dialogue text clipped '+JSON.stringify(g));
      assert.ok(g.text.bottom<=g.button.y+1,'Dialogue text collides with DALEJ '+JSON.stringify(g));
      assert.ok(g.button.bottom<=height+1&&g.button.x>=0,'DALEJ outside viewport '+JSON.stringify(g));
      const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile('dist/dialogue-intro-'+type+'-'+width+'x'+height+'.png',Buffer.from(shot.data,'base64'));
    }
    await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});
    await evaluate("window.__game.scale.refresh();true");

    for(let i=0;i<lines;i++){
      const before=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,index:a.dialogueState.index,x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y}})()");
      assert.equal(before.id,id);assert.equal(before.index,i);
      assert.equal(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.joystick,a.aimJoystick].every(j=>!j.enabled&&!j.base.visible&&!j.knob.visible&&!j.held&&j.pointerId===null)})()"),true);
      await sleep(215);const rect=(await snapshot()).rect;await click(rect.x+before.x,rect.y+before.y);
      assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.index"),i===lines-1?0:i+1);
    }
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null);
  }
  console.log('PASS real Chromium: scheduled intro enemies visible, nonattacking, once-only, DALEJ and joystick isolation');

  // R1: a pending original offscreen/dead must not steal or lose the single introduction.
  for(const [type,id] of [['bocianolak','before-first-bocianolak'],['zubrokryptyda','before-first-zubrokryptyda']]){
    const state=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena'),id='${id}',type='${type}',view=a.cameras.main.worldView;
      if(!a.__r1SavedEnemies)a.__r1SavedEnemies=a.enemies;
      else for(const e of a.enemies)e.sprite.destroy();
      a.enemies=[];
      a.introducedEnemyTypes.delete(id);a.pendingIntroductions.delete(id);a.narrativeEvents.delete(id);
      const original=a.createEnemy(type,{x:view.x-150,y:view.y+view.height/2},61);
      a.enemies.push(original);a.pendingIntroductions.set(id,original);
      a.markNarrativeBoundary(id);
      const offscreen={id:a.dialogueState.id,pending:a.narrativeEvents.has(id)};
      original.dead=true;original.hp=0;
      const afterDeath=a.tryStartDialogue();
      const successor=a.createEnemy(type,{x:view.x+view.width/2,y:view.y+view.height*.7},62);
      a.enemies.push(successor);
      const afterReplacement=a.tryStartDialogue();
      const state={offscreen,afterDeath,afterReplacement,id:a.dialogueState.id,
        seen:a.introducedEnemyTypes.has(id),originalDead:original.dead,
        selected:a.dialogueState.id===id,paused:a.physics.world.isPaused,
        count:a.enemies.filter(e=>e===original||e===successor).length};
      return state;
    })()`);
    assert.equal(state.offscreen.id,null,'Offscreen original prematurely introduced');
    assert.equal(state.offscreen.pending,true);
    assert.equal(state.afterDeath,false);
    assert.equal(state.afterReplacement,true,'Replacement living visible specimen did not trigger pending introduction');
    assert.equal(state.selected,true);
    assert.equal(state.paused,true);
    assert.equal(state.count,2);
    for(let line=0;line<(type==='bocianolak'?3:2);line++){
      await sleep(210);
      const p=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y}})()");
      const rect=(await snapshot()).rect;await click(rect.x+p.x,rect.y+p.y);
    }
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null);
  }
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies)e.sprite.destroy();a.enemies=a.__r1SavedEnemies;delete a.__r1SavedEnemies;return true})()");
  console.log('PASS Chromium PR36 R1: original offscreen/dead, later visible living replacement, pending once-only narrative');


  // Combat Feedback V1: actual Arena frame, actual accepted contact and real render objects.
  if(!(await snapshot()).menu)await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'combat feedback reset menu');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'combat feedback Arena');
  const contactBefore=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(v=>!v.dead);
    a.player.body.reset(900,600);e.x=922;e.y=600;
    a.setPlayerHp(5);a.invulnerableUntil=0;
    return {hp:a.playerHp,enemy:e.type,playerX:a.player.x,enemyX:e.x};
  })()`);
  await sleep(125);
  const contactAfter=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(v=>!v.dead);
    const fx=a.enemyRenderers[e.type].feedbackOf(e);
    return {hp:a.playerHp,at:fx.attackAt,now:a.time.now,bodyX:e.x,playerX:a.player.x};
  })()`);
  assert.equal(contactAfter.hp,contactBefore.hp-1,'Contact event must remain exactly one HP');
  assert.ok(contactAfter.at>0&&contactAfter.at<=contactAfter.now,'Accepted contact did not animate');
  const screen=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/combat-feedback-contact.png',Buffer.from(screen.data,'base64'));
  const afterEnemyDeath=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(v=>!v.dead);
    e.hp=0;const first=a.finalizeEnemyDeath(e),second=a.finalizeEnemyDeath(e);
    return {first,second,kills:a.kills,bursts:a.deathBursts.length,graphics:a.deathBursts[0]?.graphics.active};
  })()`);
  assert.deepEqual(afterEnemyDeath,{first:true,second:false,kills:1,bursts:1,graphics:true});
  const enemyDeathShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/combat-feedback-enemy-death.png',Buffer.from(enemyDeathShot.data,'base64'));
  await evaluate("window.__game.scene.getScene('Arena').setPlayerHp(0)");
  await waitFor(v=>v.menu&&v.arenaPaused,'combat feedback fatal player');
  assert.equal(await evaluate("window.__game.scene.getScene('Menu').terminalBurst?.graphics.active"),true,'Aloes death burst not visible in terminal Menu');
  const deathShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/combat-feedback-aloes-death.png',Buffer.from(deathShot.data,'base64'));
  const presentation=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),m=window.__game.scene.getScene('Menu');
    const origin=a.cameras.main.getWorldPoint(0,0);
    return {hidden:a.playerVisual.sprite?.visible===false,bodyHidden:a.player.visible===false,
      x:m.terminalBurst.graphics.x,y:m.terminalBurst.graphics.y,
      expectedX:(a.player.x-origin.x)*a.cameras.main.zoom,
      expectedY:(a.player.y-origin.y)*a.cameras.main.zoom,
      active:m.terminalBurst.graphics.active};
  })()`);
  assert.equal(presentation.hidden,true,'Original Aloes sprite remains visible under death');
  assert.equal(presentation.bodyHidden,true);
  assert.equal(presentation.active,true);
  const center=await evaluate("window.__game.scene.getScene('Arena').defeatVisualAt");
  assert.ok(Math.abs(center.x-presentation.expectedX)<0.01&&Math.abs(center.y-presentation.expectedY)<0.01,'Camera-to-screen projection incorrect');
  // Graphics draws absolute screen coordinates; its own origin stays at (0,0).
  assert.equal(presentation.x,0);assert.equal(presentation.y,0);
  for(const [name,delay] of [['mid',145],['late',135]]){
    await sleep(delay);
    const png=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile('dist/combat-feedback-aloes-'+name+'.png',Buffer.from(png.data,'base64'));
  }
  await sleep(260);
  assert.equal(await evaluate("window.__game.scene.getScene('Menu').terminalBurst.done"),true,'Terminal burst failed to expire');
  assert.equal(await evaluate("window.__game.scene.getScene('Menu').terminalBurst.graphics.active"),false,'Terminal death Graphics leaked');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'clean Arena after terminal death');
  const newRun=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {bursts:a.deathBursts.length,ended:a.episode.ended,kills:a.kills,playerVisible:a.playerVisual.sprite?.visible??true}})()");
  assert.deepEqual(newRun,{bursts:0,ended:false,kills:0,playerVisible:true},'NOWA GRA retained stale effects or state');
  // Deferred reward issuance must never gate combat; the later pickup still works.
  const deferred=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.weapon='blunderbuss';const add=a.addPickup.bind(a);a.__rewardAdd=add;a.addPickup=(id,p)=>id==='rifle'?false:add(id,p);window.__stageTimedWave(1);window.__setActiveTime(75000);a.elapsedGameplayMs=75000;a.spawnDueAt=null;a.syncTimedWaves();return {pending:a.pendingRewards.size,weapon:a.weapon}})()");
  assert.deepEqual(deferred,{pending:1,weapon:'blunderbuss'},'Unplaceable rifle reward was lost');
  await sleep(115);
  const continued=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {wave:a.episode.wave,state:a.episode.state,pending:a.pendingRewards.size,weapon:a.weapon}})()");
  assert.deepEqual(continued,{wave:2,state:'active',pending:1,weapon:'blunderbuss'},'Unplaceable pickup blocked next wave');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.addPickup=a.__rewardAdd;delete a.__rewardAdd})()");
  await sleep(110);
  const issued=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {count:a.pickups.filter(p=>p.id==='rifle').length,pending:a.pendingRewards.size,wave:a.episode.wave}})()");
  assert.deepEqual(issued,{count:1,pending:0,wave:2},'Deferred rifle reward duplicated or disappeared');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.pickups.find(p=>p.id==='rifle');a.player.body.reset(p.x,p.y)})()");
  await sleep(105);
  const lateWeapon=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {weapon:a.weapon,visual:a.playerVisual.requestedVariant,wave:a.episode.wave,remaining:a.pickups.filter(p=>p.id==='rifle').length}})()");
  assert.deepEqual(lateWeapon,{weapon:'rifle',visual:'rifle',wave:2,remaining:0},'Late pickup changed progress or failed to equip once');
  console.log('PASS real Phaser optional delayed rifle reward: missing placement does not gate wave, retries once, late collection equips');

    console.log('PASS real Chromium contact lunge, single HP loss, exactly-once enemy pixel death, terminal Aloes red disintegration');






  // Discard synthetic texture fixtures so PR41 screenshots use approved art.
  await evaluate('window.__qaReloadPending=true');
  await cdp('Page.reload',{ignoreCache:true});
  for(let boot=0;boot<100;boot++){
    try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}
    await sleep(40);
  }
  await waitFor(v=>v.menu&&v.actions.length===1,'PR41 clean real-art boot');
  // PR41: actual generated worlds, not a substitute for the full regressions above.
  for(const seed of [1,41,104729]){
    if(!(await snapshot()).menu)await clickControl('hud');
    arenaRun=[1,41,104729].indexOf(seed);
    await clickControl('NOWA GRA');
    await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'PR41 seed '+seed);
    const initial=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena');
      return {generationMs:a.layoutGenerationMs,heap:performance.memory?.usedJSHeapSize??null,seed:a.arenaSeed,counts:a.layoutDiagnostics.counts,fallback:a.layoutDiagnostics.fallback,targets:a.targets??null,colliders:a.physics.world.colliders.getActive().length,playerRadius:a.player.body.radius};
    })()`);
    assert.equal(initial.seed,seed);assert.equal(initial.targets,null);assert.equal(initial.colliders,0);assert.equal(initial.playerRadius,17);
    // Full-world diagnostic overview with the actual existing ground and art.
    await cdp('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.scale.refresh();a.cameras.main.stopFollow();a.cameras.main.setZoom(.5);a.cameras.main.centerOn(900,600);})()");
    await sleep(160);
    await writeFile('dist/pr41-seed-'+seed+'-overview.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.scale.refresh();a.cameras.main.setZoom(1);a.cameras.main.startFollow(a.player,true,.12,.12);})()");
    // Select an actual generated rock with clear approach lanes. Let the live
    // Arena update move a heavy enemy around it; no manual movement stepping.
    const movement=await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena');
      const {clearPoint}=await import('/klusoczlek/src/weapon-progression.js');
      const {placementRadius}=await import('/klusoczlek/src/arena-layout.js');
      const rock=a.obstacles.find(o=>o.type==='rock'&&[-1,1].every(sign=>clearPoint({x:o.x+sign*(placementRadius(o)+90),y:o.y},a.obstacles,32)));
      if(!rock)throw Error('No generated movement fixture');
      for(const e of a.enemies){e.sprite.destroy();e.burningFx?.destroy();}
      const r=placementRadius(rock),goal={x:rock.x+r+90,y:rock.y};
      a.player.body.reset(goal.x,goal.y);a.invulnerableUntil=Infinity;a.spawnDueAt=null;
      const e=a.createEnemy('zubrokryptyda',{x:rock.x-r-90,y:rock.y},123);
      a.enemies=[e];a.__qaFrameTimes=[];a.__qaFrameListener=()=>a.__qaFrameTimes.push(a.game.loop.delta);a.game.events.on('step',a.__qaFrameListener);a.introducedEnemyTypes.add('before-first-zubrokryptyda');
      a.introducedEnemyTypes.add('before-first-bocianolak');
      return {x:e.x,y:e.y,goal,rock:rock.id};
    })()`);
    let arrived=false,maxLateral=0;
    for(let frame=0;frame<65;frame++){
      await sleep(250);
      const state=await evaluate("(async()=>{const a=window.__game.scene.getScene('Arena'),e=a.enemies[0],g=a.player;const {footprintDistance}=await import('/klusoczlek/src/obstacle-geometry.js');return {x:e.x,y:e.y,distance:Math.hypot(e.x-g.x,e.y-g.y),clear:a.obstacles.every(o=>!o.alive||footprintDistance(o.footprint,e)>=30-.01)}})()");
      assert.equal(state.clear,true,'Live heavy penetrated an obstacle');
      maxLateral=Math.max(maxLateral,Math.abs(state.y-movement.y));
      if(state.distance<48){arrived=true;break;}
    }
    assert.ok(arrived,'Live heavy stuck on seed '+seed);assert.ok(maxLateral>20,'Heavy did not route around blocker');
    const timing=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.game.events.off('step',a.__qaFrameListener);const samples=a.__qaFrameTimes;return {frames:samples.length,meanMs:samples.reduce((sum,v)=>sum+v,0)/samples.length,maxMs:Math.max(...samples)}})()");
    console.log('INFO PR41 runtime '+JSON.stringify({seed,generationMs:initial.generationMs,heap:initial.heap,...timing}));
    await writeFile('dist/pr41-seed-'+seed+'-800x360.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    // Original Arcade player circles must stop on the actual rotated capsule.
    const playerFixture=await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena');const {clearPoint}=await import('/klusoczlek/src/weapon-progression.js');
      const log=a.obstacles.find(o=>o.type==='fallen_log'&&clearPoint({x:o.x-120,y:o.y},a.obstacles,17));
      if(!log)throw Error('No capsule player fixture');
      a.player.body.reset(log.x-120,log.y);a.keys.D.isDown=true;a.__qaLog=log;
      return {x:a.player.x,log:log.id};
    })()`);
    await sleep(700);
    const playerAfter=await evaluate("(async()=>{const a=window.__game.scene.getScene('Arena');a.keys.D.isDown=false;const {footprintDistance}=await import('/klusoczlek/src/obstacle-geometry.js');return {x:a.player.x,y:a.player.y,clear:footprintDistance(a.__qaLog.footprint,a.player)>=17-.01}})()");
    assert.ok(playerAfter.x>playerFixture.x,'Arcade player failed to move');assert.equal(playerAfter.clear,true,'Arcade capsule adapter penetrated log');
    await clickControl('hud');await clickControl('WZNÓW');
    // Portrait pauses clock and restores the same session and original camera.
    const timeBefore=await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs");
    await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:false});await sleep(120);
    const paused=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {paused:a.scene.isPaused(),time:a.elapsedGameplayMs,seed:a.arenaSeed}})()");
    assert.equal(paused.paused,true);assert.equal(paused.seed,seed);
    await sleep(150);assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),paused.time);
    await cdp('Emulation.setDeviceMetricsOverride',{width:568,height:320,deviceScaleFactor:1,mobile:false});await sleep(180);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').scene.isActive()"),true);
    assert.ok(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs")>=timeBefore);
    await writeFile('dist/pr41-seed-'+seed+'-568x320.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    console.log('PASS PR41 seed '+seed+': generated counts '+JSON.stringify(initial.counts)+', live heavy detour '+maxLateral.toFixed(1)+'px, Arcade capsule, MENU and orientation');
  }


  // PR42: approved art, real projectile stepping and accepted-source barks.
  await evaluate('window.__qaReloadPending=true');
  await cdp('Page.reload',{ignoreCache:true});
  for(let boot=0;boot<100;boot++){
    try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}
    await sleep(40);
  }
  await waitFor(v=>v.menu&&v.actions.length===1,'PR42 real-art boot');
  for(const [seed,width,height] of [[1,320,240],[41,568,320],[104729,800,360]]){
    arenaRun=[1,41,104729].indexOf(seed);
    if(!(await snapshot()).menu)await clickControl('hud');
    await clickControl('NOWA GRA');
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate('window.__game.scale.refresh();true');
    await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena');await a.enemyRenderers.zubrokryptyda.loading;
      for(const e of a.enemies){e.sprite.destroy();e.burningFx?.destroy();}
      a.player.body.reset(880,545);a.invulnerableUntil=Infinity;a.spawnDueAt=null;
      a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');
      const e=a.createEnemy('zubrokryptyda',{x:1000,y:600},900);a.enemies=[e];
      a.enemyRenderers.zubrokryptyda.update(e,a.player,0,0);
      a.cameras.main.centerOn(a.player.x,a.player.y);
      window.__pr42Heavy=e;
    })()`);
    await sleep(90);
    for(const [weapon,expected] of [['blunderbuss',7],['rifle',6]]){
      await evaluate(`window.__game.scene.getScene('Arena').spawnShot({x:1,y:0},'${weapon}',window.__game.scene.getScene('Arena').time.now)`);
      await sleep(240);
      assert.equal(await evaluate('window.__pr42Heavy.hp'),expected,'Visible shoulder projectile '+weapon+' seed '+seed);
    }
    const blocked=await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena');
      const {createObstacleVisual}=await import('/klusoczlek/src/obstacle-renderer.js');
      const o=window.__createObstacle('rock',{id:'pr42-block',x:a.player.x+65,y:a.player.y});
      o.sprite=createObstacleVisual(a,o);a.obstacles.push(o);window.__pr42Block=o;
      a.spawnShot({x:1,y:0},'rifle',a.time.now);return window.__pr42Heavy.hp;
    })()`);
    await sleep(240);assert.equal(await evaluate('window.__pr42Heavy.hp'),blocked,'Shot passed through rock');
    const flame=await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena'),e=window.__pr42Heavy;
      window.__pr42Block.sprite.destroy();a.obstacles=a.obstacles.filter(o=>o!==window.__pr42Block);
      a.player.body.reset(900,520);e.x=1000;e.y=600;e.hp=8;
      a.enemyRenderers.zubrokryptyda.update(e,a.player,0,0);a.flameCooldowns.clear();
      const {flameTargetVisible}=await import('/klusoczlek/src/weapon-combat.js');
      const old=flameTargetVisible({x:932,y:520},{x:1,y:0},e,30,a.obstacles);
      a.applyFlame({x:1,y:0},a.time.now);return {old,hp:e.hp};
    })()`);
    assert.equal(flame.old,false,'Fixture must expose old feet-circle flame miss');assert.equal(flame.hp,7,'Visible head flame miss');
    const occluded=await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena'),e=window.__pr42Heavy;
      const {createObstacleVisual}=await import('/klusoczlek/src/obstacle-renderer.js');
      const o=window.__createObstacle('fallen_log',{id:'pr42-flame-wall',x:960,y:535,angle:Math.PI/2});
      o.sprite=createObstacleVisual(a,o);a.obstacles.push(o);a.flameCooldowns.clear();
      const before=e.hp;a.applyFlame({x:1,y:0},a.time.now+300);const after=e.hp;
      o.sprite.destroy();a.obstacles=a.obstacles.filter(v=>v!==o);return {before,after};
    })()`);
    assert.equal(occluded.after,occluded.before,'Flame passed through rotated capsule');
    const radius=await evaluate("(async()=>{const {ENEMY_TYPES}=await import('/klusoczlek/src/enemy-types.js');return ENEMY_TYPES.zubrokryptyda.radius})()");
    assert.equal(radius,30);
    await writeFile('dist/pr42-heavy-'+seed+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    console.log('PASS PR42 heavy geometry seed '+seed+' '+width+'x'+height+': shoulder projectiles, head flame, obstacle occlusion, movement radius30');
  }

  // Missing-PNG path: new page/game and an actual failed approved-art request.
  const noHeavyArt=event=>{
    const m=JSON.parse(event.data);if(m.method==='Fetch.requestPaused')void cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:404,body:''});
  };
  socket.addEventListener('message',noHeavyArt);
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/enemies/zubrokryptyda.png*',requestStage:'Request'}]});
  await evaluate('window.__qaReloadPending=true');await cdp('Page.reload',{ignoreCache:true});
  for(let boot=0;boot<100;boot++){try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}await sleep(40);}
  await waitFor(v=>v.menu&&v.actions.length===1,'PR42 missing-art boot');
  await clickControl('NOWA GRA');
  const fallback=await evaluate(`(async()=>{
    const a=window.__game.scene.getScene('Arena');await a.enemyRenderers.zubrokryptyda.loading;
    for(const e of a.enemies)e.sprite.destroy();a.player.body.reset(880,550);a.spawnDueAt=null;
    a.introducedEnemyTypes.add('before-first-zubrokryptyda');
    const e=a.createEnemy('zubrokryptyda',{x:1000,y:600},960);a.enemies=[e];window.__pr42Heavy=e;
    a.enemyRenderers.zubrokryptyda.update(e,a.player,0,0);a.spawnShot({x:1,y:0},'rifle',a.time.now);
    return {loaded:a.enemyRenderers.zubrokryptyda.loaded,fallback:a.enemyRenderers.zubrokryptyda.fallback};
  })()`);
  assert.deepEqual(fallback,{loaded:false,fallback:true});await sleep(240);assert.equal(await evaluate('window.__pr42Heavy.hp'),7);
  await writeFile('dist/pr42-missing-heavy-art.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await cdp('Fetch.disable');socket.removeEventListener('message',noHeavyArt);
  console.log('PASS PR42 missing approved PNG: procedural-body projectile hit');

  // PR43 standard first-hit dialogue: true sources, settled deaths, session ownership.
  await evaluate('window.__qaReloadPending=true');await cdp('Page.reload',{ignoreCache:true});
  for(let boot=0;boot<100;boot++){try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}await sleep(40);}
  await waitFor(v=>v.menu&&v.actions.length===1,'PR43 clean boot');
  const hitId='after-first-bocianolak-hit';
  async function nextLine(){
    await sleep(200);const b=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y}})()");
    const r=(await snapshot()).rect;await click(r.x+b.x,r.y+b.y);await sleep(90);
  }
  for(const [source,width,height] of [['blunderbuss',568,320],['rifle',800,360],['flame',568,320],['barrel',800,360],['burst',568,320]]){
    if(!(await snapshot()).menu)await clickControl('hud');await clickControl('NOWA GRA');
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');
    const initial=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena');for(const e of a.enemies){e.burningFx?.destroy();e.sprite.destroy();}
      a.player.body.reset(900,600);a.invulnerableUntil=Infinity;a.spawnDueAt=null;
      a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');
      const e=a.createEnemy('bocianolak',{x:1000,y:600},1000);a.enemies=[e];window.__pr43Enemy=e;
      window.__pr43Started=0;window.__pr43Trace=[];
      const hitListener=id=>{if(id==='after-first-bocianolak-hit')window.__pr43Started++};a.events.on('episode-boundary',hitListener);a.events.once('shutdown',()=>a.events.off('episode-boundary',hitListener));
      const damage=a.damageEnemy.bind(a);a.damageEnemy=(enemy,...args)=>{const changed=damage(enemy,...args);window.__pr43Trace.push({phase:'damage',id:a.dialogueState.id});return changed;};
      const death=a.finalizeEnemyDeath.bind(a);a.finalizeEnemyDeath=enemy=>{const result=death(enemy);window.__pr43Trace.push({phase:'death',id:a.dialogueState.id,result});return result;};a.events.once('shutdown',()=>{a.damageEnemy=damage;a.finalizeEnemyDeath=death;});
      return {flag:a.firstBocianolakHit,id:a.dialogueState.id};
    })()`);
    assert.deepEqual(initial,{flag:false,id:null},'New game did not reset the one-shot event');
    await evaluate("window.__game.scene.getScene('Arena').spawnShot({x:0,y:-1},'rifle',window.__game.scene.getScene('Arena').time.now)");
    await sleep(80);assert.equal(await evaluate("window.__game.scene.getScene('Arena').firstBocianolakHit"),false,'Miss queued dialogue');
    await evaluate(`(async()=>{
      const a=window.__game.scene.getScene('Arena');const {createObstacleVisual}=await import('/klusoczlek/src/obstacle-renderer.js');
      const o=window.__createObstacle('rock',{id:'pr43-wall',x:950,y:600});o.sprite=createObstacleVisual(a,o);a.obstacles.push(o);window.__pr43Wall=o;
      a.spawnShot({x:1,y:0},'rifle',a.time.now);
    })()`);
    await sleep(100);assert.equal(await evaluate("window.__game.scene.getScene('Arena').firstBocianolakHit"),false,'Blocked shot queued dialogue');
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');window.__pr43Wall.sprite.destroy();a.obstacles=a.obstacles.filter(o=>o!==window.__pr43Wall);a.damageEnemy(window.__pr43Enemy,0,a.player,a.time.now)})()");
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').firstBocianolakHit"),false,'Zero HP reduction queued dialogue');
    if(source==='rifle')await evaluate('window.__pr43Enemy.hp=1');
    if(source==='blunderbuss'||source==='rifle')await evaluate(`window.__game.scene.getScene('Arena').spawnShot({x:1,y:0},'${source}',window.__game.scene.getScene('Arena').time.now)`);
    else if(source==='burst')await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.spawnShot({x:1,y:0},'rifle',a.time.now);a.spawnShot({x:1,y:0},'rifle',a.time.now)})()");
    else if(source==='flame'){
      const batch=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.flameCooldowns.clear();a.applyFlame({x:1,y:0},a.time.now);return {id:a.dialogueState.id,queued:a.narrativeEvents.has('after-first-bocianolak-hit'),hp:window.__pr43Enemy.hp}})()");
      assert.deepEqual(batch,{id:null,queued:true,hp:1});
    }else{
      const batch=await evaluate(`(()=>{
        const a=window.__game.scene.getScene('Arena'),e=window.__pr43Enemy;
        const second=a.createEnemy('bocianolak',{x:e.x,y:e.y+25},1001);a.enemies.push(second);
        const b=window.__createObstacle('toxic_barrel',{id:'pr43-barrel',x:e.x,y:e.y});b.hp=1;b.sprite=a.add.circle(b.x,b.y,23,0x937740);a.obstacles.push(b);
        a.hitObstacle(b,a.time.now);a.openMenu();
        return {id:a.dialogueState.id,queued:a.narrativeEvents.has('after-first-bocianolak-hit'),dead:[e.dead,second.dead],kills:a.kills};
      })()`);
      assert.deepEqual(batch,{id:null,queued:true,dead:[true,true],kills:2},'Explosion opened UI before batch completed');
      await waitFor(v=>v.menu&&v.arenaPaused,'queued-hit MENU');await clickControl('WZNÓW');
    }
    await waitFor(v=>v.physics===true,'first-hit dialogue '+source);
    const state=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,text:a.dialoguePanel.text.text,portrait:a.dialoguePanel.loaded.has('bocianolak'),events:window.__pr43Started,hp:window.__pr43Enemy.hp,dead:window.__pr43Enemy.dead,time:a.elapsedGameplayMs,shots:a.projectiles.map(p=>({x:p.object.x,y:p.object.y})),enemies:a.enemies.map(e=>({x:e.x,y:e.y})),isolated:[a.joystick,a.aimJoystick].every(j=>!j.enabled&&!j.held&&j.pointerId===null),floating:a.children.list.filter(o=>o.type==='Text'&&o.text==='Tylko nie po nogach!').length}})()");
    assert.equal(state.id,hitId);assert.equal(state.text,'Tylko nie po nogach!');assert.equal(state.portrait,true);assert.equal(state.events,1);assert.equal(state.isolated,true);
    assert.equal(state.floating,0,'Floating text remained outside the standard dialogue panel');assert.equal(state.hp,source==='rifle'||source==='barrel'||source==='burst'?0:1);assert.equal(state.dead,source==='rifle'||source==='barrel'||source==='burst');
    const batchTrace=await evaluate('window.__pr43Trace');assert.ok(batchTrace.every(t=>t.id===null),'Dialogue opened inside damage/death iteration');
    assert.equal(batchTrace.filter(t=>t.phase==='death'&&t.result).length,source==='barrel'?2:source==='rifle'||source==='burst'?1:0,'Fatal damage bookkeeping repeated');
    await sleep(200);
    assert.deepEqual(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {time:a.elapsedGameplayMs,shots:a.projectiles.map(p=>({x:p.object.x,y:p.object.y})),enemies:a.enemies.map(e=>({x:e.x,y:e.y}))}})()"),{time:state.time,shots:state.shots,enemies:state.enemies},'Combat or timer moved during dialogue');
    const r=(await snapshot()).rect;for(const x of [60,width-60])await click(r.x+x,r.y+height-60);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),hitId,'Joystick-region touch advanced dialogue');
    await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'dialogue MENU');await clickControl('WZNÓW');
    await evaluate("window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));true");
    assert.deepEqual(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,count:window.__pr43Started,paused:a.physics.world.isPaused,flag:a.firstBocianolakHit}})()"),{id:hitId,count:1,paused:true,flag:true});
    await writeFile('dist/pr43-'+source+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await nextLine();assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null,'One DALEJ did not close the one-line dialogue');
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').physics.world.isPaused"),false);
    assert.ok(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs")>state.time);
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const e=a.createEnemy('bocianolak',{x:1050,y:600},1010);a.enemies.push(e);a.damageEnemy(e,1,a.player,a.time.now);a.damageEnemy(e,1,a.player,a.time.now);a.finalizeEnemyDeath(e)})()");
    await sleep(80);assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null,'Later specimen repeated dialogue');assert.equal(await evaluate('window.__pr43Started'),1);
    console.log('PASS PR43 '+source+' '+width+'x'+height+': settled damage/death, session one-shot, portrait/DALEJ, combat/timer/input freeze, MENU/focus and later specimens');
  }
  await clickControl('hud');await clickControl('NOWA GRA');
  const finalQueued=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');for(const e of a.enemies)e.sprite.destroy();
    window.__stageTimedWave(5,35);a.episode.defeated=34;a.episode.defeatedByWave[5]=34;a.kills=140;a.totalSpawned=141;a.spawnDueAt=null;
    a.episode.bossIntroduced=true;a.episode.specialSpawned=new Set(['marcin']);a.episode.specialDefeated=new Set();
    const e=a.createEnemy('bocianolak',{x:1050,y:600},1100);
    const boss=a.createEnemy('marcin',{x:1150,y:600},1101);boss.encounterId='marcin';boss.attack={phase:'chase',elapsed:0};a.boss=boss;
    a.enemies=[e,boss];a.damageEnemy(e,2,a.player,a.time.now);a.finalizeEnemyDeath(e);
    return {id:a.dialogueState.id,dead:e.dead,kills:a.kills,state:a.episode.state,hit:a.narrativeEvents.has('after-first-bocianolak-hit'),final:a.narrativeEvents.has('after-final-enemy'),bursts:a.deathBursts.length};
  })()`);
  assert.deepEqual(finalQueued,{id:null,dead:true,kills:141,state:'active',hit:true,final:false,bursts:1});
  await waitFor(v=>v.physics===true,'PR43 first-hit portrait panel');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),hitId);
  await sleep(500);assert.equal(await evaluate("window.__game.scene.getScene('Arena').deathBursts.length"),0,'Pixel burst failed to finish during portrait dialogue');
  await nextLine();assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),null);
  const fatal=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.boss.hp=0;a.finalizeEnemyDeath(a.boss);return {state:a.episode.state,kills:a.kills}})()");
  assert.deepEqual(fatal,{state:'boss-resolving',kills:142});
  await sleep(950);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'after-final-enemy');
  for(let line=0;line<3;line++)await nextLine();
  await waitFor(v=>v.menu&&v.arenaPaused,'victory after PR43 and Marcin finale');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'victory');
  console.log('PASS PR43 first-hit portrait remains pausing; Marcin death then final dialogue and victory');

  // PR44 live encounter. Fixtures advance the schedule, not the boss state
  // machine; dialogue, landing, attacks, damage, steering and resume run in Phaser.
  for(const [seed,width,height] of [[1,568,320],[41,800,360],[104729,320,240]]){
    if(!(await snapshot()).menu)await clickControl('hud');
    arenaRun=[1,41,104729].indexOf(seed);await clickControl('NOWA GRA');
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(80);
    const queued=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena');for(const e of a.enemies)e.sprite.destroy();a.enemies=[];
      window.__stageTimedWave(5,29);a.episode.defeated=28;a.episode.defeatedByWave[5]=28;a.kills=131;a.totalSpawned=132;a.spawnDueAt=null;
      a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');a.firstBocianolakHit=true;
      a.invulnerableUntil=Infinity;
      if(a.episode.bossIntroduced||a.boss)throw Error('early boss');
      const e=a.createEnemy('bobrozombi',{x:1000,y:600},130);a.enemies=[e];
      a.damageEnemy(e,3,a.player,a.time.now);a.finalizeEnemyDeath(e);
      return {pending:a.narrativeEvents.has('before-marcin'),dialogue:a.dialogueState.id,remaining:35-a.episode.defeated,boss:!!a.boss};
    })()`);
    assert.deepEqual(queued,{pending:false,dialogue:null,remaining:6,boss:false});
    await evaluate("window.__setActiveTime(260000);true");
    await sleep(100);
    const intro=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,line:a.dialoguePanel.text.text,portrait:a.dialoguePanel.loaded.has('bobrozombi'),clock:a.elapsedGameplayMs,paused:a.physics.world.isPaused,sticks:[a.joystick,a.aimJoystick].every(j=>!j.enabled)}})()");
    assert.equal(intro.id,'before-marcin');assert.equal(intro.line,'Taki jesteś?! Czekaj aż zawołam Marcina');assert.ok(intro.portrait&&intro.paused&&intro.sticks);
    await nextLine();assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialoguePanel.text.text"),'Marcin! Maaaarciiin!');
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').elapsedGameplayMs"),intro.clock);
    await nextLine();
    assert.equal(await evaluate("!!window.__game.scene.getScene('Arena').bossEntrance"),true);
    await clickControl('hud');const age=await evaluate("window.__game.scene.getScene('Arena').bossEntrance.elapsed");await sleep(200);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').bossEntrance.elapsed"),age);
    await clickControl('WZNÓW');assert.equal(await evaluate("window.__game.scene.getScene('Arena').physics.world.isPaused"),true,'Resume released entrance physics');
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(100);
    const portraitAge=await evaluate("window.__game.scene.getScene('Arena').bossEntrance.elapsed");await sleep(130);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').bossEntrance.elapsed"),portraitAge,'Portrait advanced entrance');
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();window.dispatchEvent(new Event("focus"));true');
    await sleep(450);
    await writeFile('dist/pr44-landing-'+seed+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    for(let i=0;i<100;i++){if(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return !!a.boss&&!a.bossEntrance&&a.escortDue.length===0})()"))break;await sleep(40);}
    const active=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {seed:a.arenaSeed,hp:a.boss?.hp,roster:[...a.episode.specialSpawned],escorts:a.enemies.filter(e=>e.encounterId?.startsWith('escort')).length,bar:a.bossHpLabel.visible,body:a.player.body.radius,nav:a.bossNavigation.free===a.bossNavigation.visited,zoom:a.cameras.main.zoom,live:a.enemies.filter(e=>!e.dead&&e.type!=='marcin').length,reinforcements:a.episode.reinforcementSpawned.size,remainingReinforcements:a.reinforcementDue.length,remainingRegular:35-a.episode.spawned}})()");
    assert.equal(active.seed,seed);assert.equal(active.hp,36);assert.deepEqual(active.roster,['marcin','escort-1','escort-2']);assert.equal(active.escorts,2);assert.ok(active.live<=7&&active.reinforcements>=1&&active.remainingReinforcements>0&&active.remainingRegular>0,'Finite reinforcements must respect shared cap while future work remains');assert.ok(active.bar&&active.nav);assert.equal(active.body,17);assert.equal(active.zoom,1);
    // Stop normal scheduling for the attack fixture after proving roster creation.
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.spawnDueAt=null;a.boss.attack.elapsed=5950;window.__bossWarningAt=performance.now()})()");
    await sleep(100);assert.equal(await evaluate("window.__game.scene.getScene('Arena').boss.attack.phase"),'warning');assert.equal(await evaluate("window.__game.scene.getScene('Arena').bossProjectiles.length"),0);
    const bossAt=await evaluate("(()=>{const b=window.__game.scene.getScene('Arena').boss;return {x:b.x,y:b.y}})()");await sleep(300);
    assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('Arena').boss;return {x:b.x,y:b.y}})()"),bossAt,'Boss moved during warning');
    await writeFile('dist/pr44-warning-'+seed+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    for(let i=0;i<60;i++){if(await evaluate("window.__game.scene.getScene('Arena').bossProjectiles.length>0"))break;await sleep(20);}
    const volley=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {phase:a.boss.attack.phase,elapsed:performance.now()-window.__bossWarningAt,shots:a.bossProjectiles.map(p=>({vx:p.vx,vy:p.vy})),hp:a.playerHp}})()");
    assert.equal(volley.phase,'recovery');assert.ok(volley.elapsed>=850);assert.equal(volley.shots.length,8);
    volley.shots.forEach((p,i)=>{assert.ok(Math.abs(p.vx-Math.cos(i*Math.PI/4)*180)<0.001);assert.ok(Math.abs(p.vy-Math.sin(i*Math.PI/4)*180)<0.001);});
    await sleep(220);
    await writeFile('dist/pr44-volley-'+seed+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    // Actual swept enemy-projectile HP/invulnerability, finite deletion.
    // Isolate projectile damage from actor contact after verifying the live volley.
    // Timed waves may leave ordinary survivors beside the short-viewport player.
    await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');a.clearBossProjectiles();a.invulnerableUntil=0;a.boss.attack={phase:'warning',elapsed:-3000};
      window.__projectileActors=a.enemies.map(e=>({e,x:e.x,y:e.y}));
      for(const {e} of window.__projectileActors){e.x=a.player.x+350;e.y=a.player.y+250;e.sprite.setPosition(e.x,e.y);}
      for(let i=0;i<2;i++){const p={x:a.player.x-42,y:a.player.y,vx:180,vy:0,age:0};p.object=a.add.circle(p.x,p.y,6,0xff9450);a.bossProjectiles.push(p);}
    })()`);await sleep(230);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerHp"),4,'Simultaneous projectiles bypassed invulnerability');
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').bossProjectiles.length"),0,'One projectile damaged repeatedly');
    await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena');a.invulnerableUntil=0;
      const rock=window.__createObstacle('rock',{id:'boss-shot-qa',x:a.player.x-65,y:a.player.y});
      const {createObstacleVisual}=await import('/klusoczlek/src/obstacle-renderer.js');rock.sprite=createObstacleVisual(a,rock);rock.hitUntil=0;a.obstacles.push(rock);
      window.__bossShotRock=rock;const p={x:a.player.x-130,y:a.player.y,vx:180,vy:0,age:0};p.object=a.add.circle(p.x,p.y,6,0xff9450);a.bossProjectiles.push(p);
    })()`);await sleep(600);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerHp"),4,'Boss projectile crossed solid rock');
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').bossProjectiles.length"),0);
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');window.__bossShotRock.sprite.destroy();a.obstacles=a.obstacles.filter(o=>o!==window.__bossShotRock);for(const {e,x,y} of window.__projectileActors){e.x=x;e.y=y;e.sprite.setPosition(x,y);}delete window.__projectileActors;})()");
    // Real damage geometry: visible shoulder outside movement circle accepts
    // Pukawka, rifle and flame; movement/contact remain radius40.
    const beforeWeapons=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),b=a.boss;a.clearBossProjectiles();a.invulnerableUntil=Infinity;b.attack={phase:'warning',elapsed:0};const side=b.x<900?1:-1;a.player.body.reset(b.x+side*110,b.y-75);window.__bossAim={x:-side,y:0};a.spawnShot(window.__bossAim,'blunderbuss',a.time.now);return b.hp})()");
    await sleep(170);assert.equal(await evaluate("window.__game.scene.getScene('Arena').boss.hp"),beforeWeapons-1,'Actual Pukawka missed visible shoulder');
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.spawnShot(window.__bossAim,'rifle',a.time.now)})()");await sleep(170);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').boss.hp"),beforeWeapons-2,'Actual rifle missed shoulder');
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.applyFlame(window.__bossAim,a.time.now)})()");
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').boss.hp"),beforeWeapons-3,'Actual flame missed body');
    assert.equal(await evaluate("!!window.__game.scene.getScene('Arena').boss.burningFx"),true,'Flame ignition effect missing');
    if(seed===1){
      const path=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena');const {footprintDistance}=await import('/klusoczlek/src/obstacle-geometry.js');
        const o=a.obstacles.find(o=>o.type==='rock'&&o.x>200&&o.x<1600&&[-140,140].every(dx=>a.obstacles.every(p=>!p.alive||footprintDistance(p.footprint,{x:o.x+dx,y:o.y})>45)));
        if(!o)throw Error('no steering fixture');
        const b=a.boss;b.x=o.x-140;b.y=o.y;b.sprite.setPosition(b.x,b.y);b.attack={phase:'chase',elapsed:-20000};
        b.ignition.ignitedAt=null;b.ignition.burningUntil=0;b.burningFx?.destroy();b.burningFx=null;
        a.player.body.reset(o.x+140,o.y);a.spawnDueAt=null;
        window.__bossPath={x:b.x,y:b.y,maxDetour:0,frames:0,sumMs:0,maxMs:0};
        const step=()=>{const m=window.__bossPath;m.frames++;m.sumMs+=a.game.loop.delta;m.maxMs=Math.max(m.maxMs,a.game.loop.delta);if(a.boss)m.maxDetour=Math.max(m.maxDetour,Math.abs(a.boss.y-m.y));};
        a.game.events.on('step',step);window.__bossPathCleanup=()=>a.game.events.off('step',step);return {x:b.x,y:b.y};})()`);
      for(let i=0;i<100;i++){if(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return Math.hypot(a.boss.x-a.player.x,a.boss.y-a.player.y)<65})()"))break;await sleep(180);}
      const movement=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');window.__bossPathCleanup();return {...window.__bossPath,distance:Math.hypot(a.boss.x-a.player.x,a.boss.y-a.player.y),heap:performance.memory?.usedJSHeapSize??null}})()");
      assert.ok(movement.distance<65&&movement.maxDetour>15,'Live r40 boss trapped '+JSON.stringify(movement));
      console.log('INFO PR44 live boss movement/runtime '+JSON.stringify(movement));
    }
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.boss.hp=12;a.boss.attack.phase='chase';a.boss.attack.elapsed=3950})()");await sleep(100);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').boss.attack.phase"),'warning','LowHP cooldown remained6000');
    for(let i=0;i<60;i++){if(await evaluate("window.__game.scene.getScene('Arena').bossProjectiles.length>0"))break;await sleep(20);}
    assert.ok(await evaluate("window.__game.scene.getScene('Arena').bossProjectiles.length")>0,'No active volley before boss death');
    if(seed===1){
      const allReinforcements=await evaluate(`(()=>{
        const a=window.__game.scene.getScene('Arena');a.player.body.reset(900,600);let maxLive=0,iterations=0;
        for(let i=0;i<100;i++){
          if(a.episode.reinforcementSpawned.size===12&&a.episode.spawned===35&&a.episode.specialSpawned.has('escort-1')&&a.episode.specialSpawned.has('escort-2'))break;
          const living=a.enemies.filter(e=>!e.dead&&e.type!=='marcin');
          maxLive=Math.max(maxLive,living.length);
          // Respect the existing max-one-ordinary-heavy gate: the player must
          // actually defeat an earlier wave-6 heavy before another can spawn.
          const blockingHeavy=living.find(e=>e.type==='zubrokryptyda'&&!e.encounterId);
          if(living.length>=7||(blockingHeavy&&a.episode.spawned<35)){
            const victim=blockingHeavy||living[0];victim.hp=0;a.finalizeEnemyDeath(victim);
            a.enemies=a.enemies.filter(e=>!e.dead);
          }
          a.spawnBossSlot(a.time.now+100000+i*380);
          maxLive=Math.max(maxLive,a.livingNonBoss());
          iterations++;
        }
        return {ids:[...a.episode.reinforcementSpawned],normalSpawned:a.episode.spawned,escorts:[...a.episode.specialSpawned].filter(id=>id.startsWith('escort')).length,maxLive,iterations,living:a.livingNonBoss()};
      })()`);
      assert.equal(allReinforcements.ids.length,12,'All twelve reinforcements must eventually be offered');
      assert.equal(new Set(allReinforcements.ids).size,12,'Reinforcement duplicate ID');
      assert.equal(allReinforcements.normalSpawned,35,'Remaining wave-six schedule starved '+JSON.stringify(allReinforcements));
      assert.equal(allReinforcements.escorts,2,'Escorts starved');
      assert.ok(allReinforcements.maxLive<=7,'Shared cap exceeded while draining every source');
      assert.ok(allReinforcements.living>=1,'Need living minion for boss-death VFX');
      console.log('PASS PR48 real Phaser finite scheduler: all12 unique reinforcements, all remaining wave6 spawns, two escorts, live cap7; '+JSON.stringify(allReinforcements));
    }
    // Killing a boss during a live volley atomically resolves the fight,
    // neutralizes spawned survivors and cancels pending work.
    const death=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),b=a.boss;a.damageEnemy(b,36,a.player,a.time.now);const first=a.finalizeEnemyDeath(b),second=a.finalizeEnemyDeath(b);return {first,second,boss:!!a.boss,shots:a.bossProjectiles.length,state:a.episode.state,bar:a.bossHpLabel.visible,bursts:a.deathBursts.length,living:a.enemies.filter(e=>!e.dead).length,queued:a.escortDue.length+a.reinforcementDue.length}})()");
    assert.ok(death.first&&!death.second&&!death.boss&&!death.bar);assert.equal(death.shots,0);assert.equal(death.state,'boss-resolving');assert.equal(death.living,0);assert.equal(death.queued,0);assert.ok(death.bursts>0);
    const postFatalHp=await evaluate("window.__game.scene.getScene('Arena').playerHp");
    await sleep(150);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerHp"),postFatalHp,'Post-fatal damage reached Aloes during visual resolution');

    console.log('PASS PR44 seed '+seed+' '+width+'x'+height+': timed260s caller without kill gate, portrait/DALEJ, landing MENU/orientation, safe r40, two escorts, warning/eight-way volley, HP/invulnerability, lowHP, death cleanup');
  }

  // Approved Marcin integration. Optional external source is used byte-for-byte
  // only in CDP responses, never copied/committed into the repository.
  let marcinBytes=null,marcinSource='synthetic in-memory contract';
  if(process.env.MARCIN_QA_PNG){marcinBytes=await readFile(process.env.MARCIN_QA_PNG);marcinSource='approved external PNG';}
  else {try{marcinBytes=await readFile('public/assets/enemies/marcin.png');marcinSource='approved repository PNG';}catch{}}
  if(marcinBytes){assert.equal(marcinBytes.readUInt32BE(16),2048);assert.equal(marcinBytes.readUInt32BE(20),256);assert.equal(marcinBytes[24],8);assert.equal(marcinBytes[25],6);}
  const bossImage=marcinBytes?marcinBytes.toString('base64'):syntheticSheetPng(2048,256);
  for(const mode of ['approved','invalid','missing']){
    const fetchBoss=event=>{const m=JSON.parse(event.data);if(m.method!=='Fetch.requestPaused')return;
      void cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:mode==='missing'?404:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:mode==='approved'?bossImage:mode==='invalid'?syntheticSheetPng():''});};
    socket.addEventListener('message',fetchBoss);await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/enemies/marcin.png*',requestStage:'Request'}]});
    await evaluate('window.__qaReloadPending=true');await cdp('Page.reload',{ignoreCache:true});
    for(let i=0;i<100;i++){try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}await sleep(40);}
    await waitFor(v=>v.menu&&v.actions.length===1,'boss asset '+mode);await clickControl('NOWA GRA');
    const init=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena');await a.enemyRenderers.marcin.loading;
      for(const e of a.enemies)e.sprite.destroy();const e=a.createEnemy('marcin',{x:900,y:600},44);e.attack={phase:'warning',elapsed:0};a.enemies=[e];a.boss=e;a.spawnDueAt=null;a.invulnerableUntil=Infinity;
      window.__marcinQA=e;return {loaded:a.enemyRenderers.marcin.loaded,fallback:a.enemyRenderers.marcin.fallback,art:!!e.sprite.getData('marcin-art')};})()`);
    assert.deepEqual(init,mode==='approved'?{loaded:true,fallback:false,art:true}:{loaded:false,fallback:true,art:false});
    if(mode==='approved'){
      for(let frame=0;frame<8;frame++){
        const pose=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena'),e=window.__marcinQA;const angle=${frame}*Math.PI/4;
          a.player.body.reset(e.x+150*Math.cos(angle),e.y+150*Math.sin(angle));a.enemyRenderers.marcin.update(e,a.player);
          const art=e.sprite.getData('marcin-art'),p=a.enemyRenderers.marcin.damagePoseOf(e);
          const {enemyProjectileHit,damageFootprints}=await import('/klusoczlek/src/enemy-damage.js');const shapes=damageFootprints(e,p),head=shapes[0];
          const hit=enemyProjectileHit({x:head.x-100,y:head.y},{x:head.x+100,y:head.y},e,3,p);
          return {frame:Number(art.frame.name),scale:art.scaleX,y:art.y,filter:art.texture.source[0].scaleMode,width:art.displayWidth,hit:!!hit,body:a.player.body.radius,tailFrameCount:Object.keys(art.texture.frames).length};})()`);
        assert.equal(pose.frame,frame);assert.equal(pose.scale,.68);assert.equal(pose.y,-76.16);assert.equal(pose.filter,1);assert.ok(pose.width>192*.55);assert.ok(pose.hit);assert.equal(pose.body,17);
        if(marcinBytes)await writeFile('dist/marcin-approved-frame-'+frame+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      }
      // Real Phaser projectile and flame use renderer-derived pose, not feet.
      const before=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=window.__marcinQA;e.attack={phase:'warning',elapsed:0};a.player.body.reset(e.x-110,e.y-75);a.enemyRenderers.marcin.update(e,{x:e.x+100,y:e.y});a.spawnShot({x:1,y:0},'rifle',a.time.now);return e.hp})()");
      await sleep(170);assert.equal(await evaluate('window.__marcinQA.hp'),before-1);
      const flame=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=window.__marcinQA;const hp=e.hp;a.flameCooldowns.clear();a.applyFlame({x:1,y:0},a.time.now);return hp-e.hp})()");assert.equal(flame,1);
    }
    console.log('PASS Marcin asset '+mode+' ('+(mode==='approved'?marcinSource:'fallback')+'): sheet validation, safe gameplay and pose-aware geometry');
    await cdp('Fetch.disable');socket.removeEventListener('message',fetchBoss);
  }

  // PR45 real approved atlas only; no synthetic art substitute. Missing-file
  // CI explicitly skips positive visuals and always executes negative lifecycle.
  let forestBytes=null;try{forestBytes=await readFile(process.env.FOREST_QA_PNG||'public/assets/obstacles/forest-obstacles.png');}catch{}
  const forestSource=forestBytes?forestBytes.toString('base64'):null;
  for(const mode of [...(forestBytes?['approved']:[]),'missing','invalid','decode','late']){
    let requests=0,held=null;
    const onForest=event=>{const m=JSON.parse(event.data);if(m.method!=='Fetch.requestPaused')return;requests++;
      if(mode==='late'){held=m.params.requestId;return;}
      void cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:mode==='missing'?404:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:mode==='approved'?forestSource:mode==='invalid'?syntheticSheetPng():mode==='decode'?(()=>{const b=Buffer.alloc(26);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(1024,16);b.writeUInt32BE(768,20);b[24]=8;b[25]=6;return b.toString('base64')})():''});};
    socket.addEventListener('message',onForest);await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/obstacles/forest-obstacles.png*',requestStage:'Request'}]});
    await evaluate('window.__qaReloadPending=true');await cdp('Page.reload',{ignoreCache:true});
    for(let i=0;i<100;i++){try{if(await evaluate('!window.__qaReloadPending&&!!window.__snapshot'))break;}catch{}await sleep(40);}
    await waitFor(v=>v.menu&&v.actions.length===1,'forest '+mode+' boot');await clickControl('NOWA GRA');
    if(mode==='late'){
      assert.ok(held,'Atlas request not held');
      assert.equal(await evaluate("window.__game.scene.getScene('Arena').obstacles.every(o=>o.sprite.active&&o.sprite.getData('fallback').visible&&!o.sprite.getData('atlasSprite'))"),true);
      await evaluate("window.__forestOld=window.__game.scene.getScene('Arena').obstacles.map(o=>o.sprite);true");
      await clickControl('hud');
      // Actual scene shutdown aborts the pending request; a late response cannot
      // resurrect old obstacles. Disabling interception releases any request.
      await evaluate("window.__game.scene.stop('Arena');true");
      try{await cdp('Fetch.fulfillRequest',{requestId:held,responseCode:404,body:''});}catch{}
      await cdp('Fetch.disable');await sleep(100);
      assert.equal(await evaluate('window.__forestOld.every(o=>!o.active)'),true);
      console.log('PASS PR45 delayed atlas: visible placeholders then shutdown abort; no revived containers');
      socket.removeEventListener('message',onForest);continue;
    }
    const state=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena'),m=await import('/klusoczlek/src/obstacle-renderer.js'),r=m.obstacleAtlasRenderer(a);await r.loading;
      return {loaded:r.loaded,failed:r.failed,visible:a.obstacles.every(o=>o.sprite.active&&o.sprite.visible&&(o.sprite.getData('atlasSprite')?.visible||o.sprite.getData('fallback').visible)),fallback:a.obstacles.every(o=>o.sprite.getData('fallback').visible),frames:a.obstacles.map(o=>o.sprite.getData('atlasSprite')?.frame.name??null)};})()`);
    assert.equal(state.visible,true);assert.equal(state.loaded,mode==='approved');assert.equal(state.failed,mode!=='approved');assert.equal(state.fallback,mode!=='approved');
    assert.equal(requests,1,'Atlas requested per obstacle instead of per session');
    if(mode==='approved'){
      for(const [seed,width,height] of [[1,320,240],[41,568,320],[104729,800,360]]){
        if(!(await snapshot()).menu){await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'forest MENU');}arenaRun=[1,41,104729].indexOf(seed);await clickControl('NOWA GRA');
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(100);
        const loaded=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena'),m=await import('/klusoczlek/src/obstacle-renderer.js');await m.obstacleAtlasRenderer(a).loading;
          const all=a.obstacles.every(o=>{const art=m.obstacleArt(o),im=o.sprite.getData('atlasSprite');return im?.active&&!o.sprite.getData('fallback').visible&&Number(im.frame.name)===art.frame&&im.scaleX===im.scaleY&&im.originX===art.anchor.x/256&&im.originY===art.anchor.y/256&&Math.abs(Math.sin(o.sprite.rotation-o.angle))<1e-10&&Math.cos(o.sprite.rotation-o.angle)>0&&o.sprite.depth===4;});
          return {seed:a.arenaSeed,all,filter:a.textures.get(m.FOREST_ATLAS.key).source[0].scaleMode,frames:[...Array(12)].every((_,i)=>a.textures.get(m.FOREST_ATLAS.key).has(String(i))),objects:a.obstacles.length};})()`);
        assert.equal(loaded.seed,seed);assert.ok(loaded.all&&loaded.frames,JSON.stringify(loaded));assert.equal(loaded.filter,1);assert.equal(requests,1,'Shared texture fetched again on NEW GAME');
        await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.cameras.main.stopFollow();a.cameras.main.setZoom(Math.min(a.scale.width/1800,a.scale.height/1200));a.cameras.main.centerOn(900,600);})()");await sleep(100);
        await writeFile('dist/pr45-seed-'+seed+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
        await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.cameras.main.setZoom(1);a.cameras.main.startFollow(a.player,true,.12,.12);})()");await sleep(100);
      }
      // Readable atlas gallery, all semantic variants at native gameplay scale.
      await cdp('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');
      const gallery=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena');const {createObstacle}=await import('/klusoczlek/src/obstacle-catalog.js');const {createObstacleVisual}=await import('/klusoczlek/src/obstacle-renderer.js');
        for(const o of a.obstacles)o.sprite.destroy();a.obstacles=[];a.cameras.main.stopFollow().setZoom(1).centerOn(900,600);a.physics.world.pause();
        const defs=[['rock','small'],['rock','medium'],['rock','large'],['stump','default'],['fallen_log','short'],['fallen_log','medium'],['bush','default'],['bush','wide'],['toxic_barrel','default'],['toi_toi','default'],['tire_pile','default'],['broken_wheelbarrow','default']];
        for(let i=0;i<defs.length;i++){const [type,variant]=defs[i],o=createObstacle(type,{id:'gallery-'+i,x:600+(i%6)*120,y:570+Math.floor(i/6)*125,variant,angle:type==='fallen_log'?Math.PI/5:0});o.sprite=createObstacleVisual(a,o);a.obstacles.push(o);}
        return a.obstacles.map(o=>({id:o.id,frame:Number(o.sprite.getData('atlasSprite').frame.name)}));})()`);
      assert.deepEqual(gallery.map(o=>o.frame),Array.from({length:12},(_,i)=>i));
      await writeFile('dist/pr45-atlas-gallery.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      // Actual barrel behavior is unchanged with an image child/container.
      const barrel=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),b=a.obstacles.find(o=>o.type==='toxic_barrel');a.invulnerableUntil=Infinity;for(const e of a.enemies)e.sprite.destroy();a.enemies=[];a.hitObstacle(b,a.time.now);a.hitObstacle(b,a.time.now);a.hitObstacle(b,a.time.now);a.hitObstacle(b,a.time.now);return {alive:b.alive,sprite:b.sprite.active,explosions:a.explosionEffects.length}})()");
      assert.deepEqual(barrel,{alive:false,sprite:false,explosions:1});
      console.log('PASS PR45 real approved atlas:12 frames, anchors/scales/rotations, three seeded viewports, cache reuse, barrel exactly-once removal');
    }else console.log('PASS PR45 atlas '+mode+': visible solid placeholders, no startup failure');
    await cdp('Fetch.disable');socket.removeEventListener('message',onForest);
  }
  if(!forestBytes)console.log('NOT RUN PR45 positive PNG visual QA: user-managed atlas absent; no synthetic substitute used');

  // PR46: actual cosmetic update/UI on real Phaser, one session scheduler.
  for(const [seed,width,height,type] of [[1,568,320,'bobrozombi'],[41,800,360,'bocianolak']]){
    if(!(await snapshot()).menu){await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'bark MENU');}
    arenaRun=[1,41,104729].indexOf(seed);await clickControl('NOWA GRA');
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(100);
    const initial=await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');
      for(const e of a.enemies){e.burningFx?.destroy();e.sprite.destroy();}a.enemies=[];a.spawnDueAt=null;a.invulnerableUntil=Infinity;
      a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');
      const y=${height}===320?610:650;a.player.body.reset(900,y);a.cameras.main.stopFollow().setZoom(1).centerOn(900,520);
      const e=a.createEnemy('${type}',{x:900,y},4600);a.enemies=[e];window.__barkE=e;window.__barkText=a.ambientBarks.text;
      return {remaining:a.ambientBarks.state.remaining,shown:a.ambientBarks.state.shown,start:a.elapsedGameplayMs};})()`);
    assert.equal(initial.shown,0);assert.ok(initial.remaining>11000&&initial.remaining<=20000);
    if(seed===1){
      await sleep(900);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.shown"),0,'Bark appeared before first interval');
      for(let i=0;i<450;i++){if(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"))break;await sleep(50);}
    }else {await sleep(100);await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.remaining=0;true");await sleep(70);}
    const shown=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),b=a.ambientBarks;return {visible:b.root.visible,phrase:b.text.text,life:b.state.active?.life,speaker:b.state.active?.speaker===window.__barkE,remaining:b.state.remaining,shown:b.state.shown,elapsed:a.elapsedGameplayMs,bounds:b.bounds,textBounds:(()=>{const r=b.text.getBounds();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})(),interactive:!!(b.root.input||b.text.input||b.graphics.input),children:b.root.list.length,id:a.dialogueState.id,paused:a.physics.world.isPaused}})()");
    console.log('INFO PR46 timing '+JSON.stringify({seed,actualFirstInterval:seed===1,initialRemaining:initial.remaining,firstGameplay:shown.elapsed,lifetime:shown.life,nextRemaining:shown.remaining}));
    assert.ok(shown.visible&&shown.speaker);assert.ok(shown.life>=1800&&shown.life<=2300);assert.equal(shown.shown,1);assert.ok(shown.remaining>=14000&&shown.remaining<=25000);assert.equal(shown.interactive,false);assert.equal(shown.children,2);assert.equal(shown.id,null);assert.equal(shown.paused,false);
    if(seed===1){assert.ok(shown.elapsed>=12000&&shown.elapsed<=20500,'First bark timing '+shown.elapsed);}
    assert.ok(shown.bounds.x>=8&&shown.bounds.x+shown.bounds.width<=width-8);assert.ok(shown.textBounds.x>=shown.bounds.x&&shown.textBounds.right<=shown.bounds.x+shown.bounds.width+1);
    await writeFile('dist/pr46-'+type+'-'+width+'x'+height+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    // The pooled objects never take touch ownership away from either stick.
    const h=await evaluate("window.__game.scene.getScene('Arena').hudLayout");
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.joystickX+12,y:h.joystickY,id:61}]});
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.joystickX+12,y:h.joystickY,id:61},{x:h.aimX+12,y:h.aimY,id:62}]});
    assert.equal(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.joystick.held&&a.aimJoystick.held&&!a.dialogueState.id&&!a.physics.world.isPaused})()"),true,'Bark intercepted twin sticks');
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'bark active MENU');
    const paused=await evaluate("(()=>{const b=window.__game.scene.getScene('Arena').ambientBarks;return {remaining:b.state.remaining,last:b.state.lastPhrase,shown:b.state.shown,visible:b.root.visible}})()");assert.equal(paused.visible,false);
    await sleep(250);assert.deepEqual(await evaluate("(()=>{const b=window.__game.scene.getScene('Arena').ambientBarks;return {remaining:b.state.remaining,last:b.state.lastPhrase,shown:b.state.shown,visible:b.root.visible}})()"),paused);
    await clickControl('WZNÓW');await sleep(80);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.shown"),1);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.lastPhrase"),paused.last);
    // No eligible speaker: consume one opportunity safely, no backlog.
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.spawnDueAt=null;window.__barkE.x=50;window.__barkE.y=50;a.enemyRenderers[window.__barkE.type].update(window.__barkE,a.player);a.ambientBarks.state.remaining=0})()");await sleep(80);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.shown"),1);
    // Three different rendered body anchors, no fixed feet offset.
    const anchorRows=[];
    for(const speaker of ['bobrozombi','bocianolak','zubrokryptyda']){
      const before=await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');a.ambientBarks.suspend();for(const e of a.enemies)e.sprite.destroy();const y=${height}===320?610:650;
        a.player.body.reset(900,y);const e=a.createEnemy('${speaker}',{x:900,y},4601);a.enemies=[e];window.__barkE=e;a.spawnDueAt=null;return a.ambientBarks.state.lastPhrase;})()`);
      await sleep(50);await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.remaining=0;true");await sleep(70);
      const row=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),b=a.ambientBarks,e=window.__barkE;return {active:b.root.visible,speaker:b.state.active?.speaker===e,last:b.state.lastPhrase,y:a.enemyRenderers[e.type].speechAnchorOf(e).y,textSame:b.text===window.__barkText,bounds:b.bounds}})()");
      assert.ok(row.active&&row.speaker&&row.textSame);assert.notEqual(row.last,before);anchorRows.push(row.y);
    }
    assert.ok(Math.abs(anchorRows[0]-anchorRows[1])>25,'Species anchor ignored visual feet offset');
    const lifeLeft=await evaluate("(()=>{const b=window.__game.scene.getScene('Arena').ambientBarks;return b.state.active.life-b.state.active.age})()");
    await sleep(600);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),true,'Bubble expired before its active lifetime');
    await sleep(Math.max(0,lifeLeft-600)+120);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false,'Bubble lifetime did not expire');
    await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.remaining=0;true");await sleep(80);
    // Camera/resize reflow either fits safely or suppresses; no UI overlap.
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.cameras.main.centerOn(920,520)})()");await sleep(70);
    const moved=await evaluate("window.__game.scene.getScene('Arena').ambientBarks.bounds");if(moved)assert.ok(moved.x>=8&&moved.x+moved.width<=width-8);
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:240,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(80);
    const tiny=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {box:a.ambientBarks.bounds,hud:a.hudLayout}})()");if(tiny.box)assert.ok(tiny.box.x>=8&&tiny.box.x+tiny.box.width<=312&&tiny.box.y>=tiny.hud.panelY+tiny.hud.panelHeight+6);
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');
    await sleep(70);await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.remaining=0;true");await sleep(80);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),true,'No active bubble before fatal cleanup fixture');
    // Fatal speaker damage removes the bubble immediately without preserving it.
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),e=window.__barkE;a.damageEnemy(e,100,a.player,a.time.now);a.finalizeEnemyDeath(e)})()");
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.active"),null);
    // PR43 still owns a standard one-shot portrait panel, not this shared pool.
    await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');a.spawnDueAt=null;const e=a.createEnemy('bocianolak',{x:900,y:${height}===320?610:650},4602);a.enemies=[e];a.damageEnemy(e,1,a.player,a.time.now)})()`);await sleep(100);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'after-first-bocianolak-hit');assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialoguePanel.text.text"),'Tylko nie po nogach!');assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);await nextLine();
    // Active bubble belonging to a different specimen must disappear as soon
    // as the actual six-remaining boss introduction is queued.
    await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');for(const e of a.enemies)e.sprite.destroy();const y=${height}===320?610:650;a.player.body.reset(900,y);a.cameras.main.centerOn(900,520);
      const e=a.createEnemy('bobrozombi',{x:900,y},4603);a.enemies=[e];window.__barkE=e;a.ambientBarks.state.remaining=0;a.spawnDueAt=null;})()`);await sleep(90);
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),true);
    const pending=await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');window.__stageTimedWave(5,30);a.episode.defeated=28;a.episode.defeatedByWave[5]=28;a.kills=131;a.totalSpawned=133;
      window.__setActiveTime(260000);a.elapsedGameplayMs=260000;a.syncTimedWaves();const victim=a.createEnemy('bobrozombi',{x:1100,y:600},4604);a.enemies.push(victim);a.damageEnemy(victim,3,a.player,a.time.now);a.finalizeEnemyDeath(victim);
      return {pending:a.narrativeEvents.has('before-marcin'),bubble:a.ambientBarks.root.visible};})()`);
    assert.deepEqual(pending,{pending:true,bubble:false});await sleep(90);assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'before-marcin');
    await evaluate("window.__game.scene.getScene('Arena').ambientBarks.state.remaining=0;true");await nextLine();await nextLine();
    assert.equal(await evaluate("!!window.__game.scene.getScene('Arena').bossEntrance"),true);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);
    for(let i=0;i<80;i++){if(await evaluate("!window.__game.scene.getScene('Arena').bossEntrance"))break;assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);await sleep(30);}
    await sleep(90);assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.eligible"),true,'Ordinary ambient speech stayed disabled in active boss fight');
    // Focus transition clears the cosmetic without changing the existing pause.
    await evaluate("window.dispatchEvent(new Event('blur'));true");assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);await evaluate("window.dispatchEvent(new Event('focus'));true");
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.episode.state='final-pending';a.markNarrativeBoundary('after-final-enemy')})()");
    assert.equal(await evaluate("window.__game.scene.getScene('Arena').dialogueState.id"),'after-final-enemy');assert.equal(await evaluate("window.__game.scene.getScene('Arena').ambientBarks.root.visible"),false);
    for(let i=0;i<3;i++)await nextLine();await waitFor(v=>v.menu&&v.arenaPaused,'bark fixture finale');
    await evaluate("window.__oldBarkRoot=window.__game.scene.getScene('Arena').ambientBarks.root;true");await clickControl('NOWA GRA');
    const reset=await evaluate("(()=>{const b=window.__game.scene.getScene('Arena').ambientBarks;return {oldActive:window.__oldBarkRoot.active,same:b.text===window.__barkText,last:b.state.lastPhrase,shown:b.state.shown,visible:b.root.visible}})()");
    assert.deepEqual(reset,{oldActive:false,same:false,last:-1,shown:0,visible:false});
    console.log('PASS PR46 '+width+'x'+height+': '+(seed===1?'real first12–20s interval, ':'')+'single pooled bubble, anchors/phrases, twin sticks, pause/focus/resize, death/shutdown, PR43, pending boss/landing/finale suppression and NEW GAME reset');
  }

  // PR47: actual generated forest orientations, not renderer-only corrections.
  assert.ok(forestBytes,'PR47 visual QA requires the real approved forest atlas');
  const orientationShot=async(name,width,height)=>{
    const png=Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[width,height],'Orientation screenshot viewport '+name);
    await writeFile('dist/'+name,png);
  };
  for(const seed of [1,41,104729])for(const [width,height] of [[568,320],[800,360]]){
    if(!(await snapshot()).menu){await clickControl('hud');await waitFor(v=>v.menu&&v.arenaPaused,'orientation MENU');}
    arenaRun=[1,41,104729].indexOf(seed);await clickControl('NOWA GRA');
    // NOWA GRA also checks opening-dialogue resizes; set target metrics after it.
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('window.__game.scale.refresh();true');await sleep(100);
    const state=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena'),m=await import('/klusoczlek/src/obstacle-renderer.js');await m.obstacleAtlasRenderer(a).loading;
      a.spawnDueAt=null;a.physics.world.pause();
      return {seed:a.arenaSeed,all:a.obstacles.every(o=>o.angle===0&&o.footprint.angle===0&&o.sprite.rotation===0&&o.sprite.getData('atlasSprite')?.rotation===0&&!o.sprite.getData('fallback').visible),
        loaded:m.obstacleAtlasRenderer(a).loaded,objects:a.obstacles.length,counts:a.layoutDiagnostics.counts,viewport:[a.scale.width,a.scale.height],
        navigation:a.navigation.free===a.navigation.visited};})()`);
    assert.equal(state.seed,seed);assert.ok(state.all&&state.loaded&&state.navigation&&state.objects>0,JSON.stringify(state));
    assert.deepEqual(state.viewport,[width,height]);
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.cameras.main.stopFollow().setZoom(Math.min(a.scale.width/1800,a.scale.height/1200)).centerOn(900,600)})()");await sleep(80);
    await orientationShot('pr47-seed-'+seed+'-'+width+'x'+height+'-overview.png',width,height);
    await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),o=a.obstacles.find(o=>o.type==='fallen_log');a.cameras.main.setZoom(1).centerOn(o.x,o.y+35)})()");await sleep(80);
    await orientationShot('pr47-seed-'+seed+'-'+width+'x'+height+'-detail.png',width,height);
    console.log('PASS PR47 seed '+seed+' '+width+'x'+height+': all generated/footprint/container/image angles0, approved PNG, connected navigation; counts '+JSON.stringify(state.counts));
  }
  // Readable all-variant gallery sourced from canonical generated definitions.
  const gallery=await evaluate(`(async()=>{const a=window.__game.scene.getScene('Arena');const {generateArenaLayout}=await import('/klusoczlek/src/arena-layout.js');const {createObstacle}=await import('/klusoczlek/src/obstacle-catalog.js');const m=await import('/klusoczlek/src/obstacle-renderer.js');
    const variants=new Map();for(let seed=0;seed<16;seed++)for(const o of generateArenaLayout(seed).obstacles)variants.set(m.obstacleArt(o).frame,o);
    for(const o of a.obstacles)o.sprite.destroy();a.obstacles=[];a.cameras.main.stopFollow().setZoom(1).centerOn(900,600);
    for(const [frame,source] of [...variants].sort((a,b)=>a[0]-b[0])){const o=createObstacle(source.type,{id:'canonical-gallery-'+frame,x:600+(frame%6)*120,y:570+Math.floor(frame/6)*125,variant:source.variant,angle:source.angle});o.sprite=m.createObstacleVisual(a,o);a.obstacles.push(o);}
    return a.obstacles.map(o=>({frame:Number(o.sprite.getData('atlasSprite').frame.name),angle:o.angle,footprint:o.footprint.angle,container:o.sprite.rotation,image:o.sprite.getData('atlasSprite').rotation}));})()`);
  assert.deepEqual(gallery.map(o=>o.frame),[...Array(12).keys()]);assert.ok(gallery.every(o=>o.angle===0&&o.footprint===0&&o.container===0&&o.image===0));
  await sleep(80);await orientationShot('pr47-canonical-gallery-800x360.png',800,360);
  console.log('PASS PR47 all12 generated semantic variants: canonical actual atlas gallery, matching render/physics orientation');

  // PR48: missing dedicated Marcin PNG must fall back to letter while final DALEJ remains usable.
  const missingPortrait=event=>{
    const message=JSON.parse(event.data);
    if(message.method!=='Fetch.requestPaused'||!message.params.request.url.includes('dialogue-marcin.png'))return;
    void cdp('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:404,responseHeaders:[{name:'Content-Type',value:'text/plain'}],body:''});
  };
  socket.addEventListener('message',missingPortrait);
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*assets/dialogue/dialogue-marcin.png*',requestStage:'Request'}]});
  await clickControl('hud');await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu,'PR48 fallback Arena');
  for(let i=0;i<40;i++){if(!await evaluate("window.__game.scene.getScene('Arena').dialogueLoading"))break;await sleep(40);}
  const marcinFallback=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.dialoguePanel.hide();a.dialogueState.id=null;a.dialogueState.index=0;a.narrativeEvents.clear();a.episode.wave=5;a.episode.state='final-pending';a.finalResolution=true;a.markNarrativeBoundary('after-final-enemy');return {loaded:a.dialoguePanel.loaded.has('marcin'),id:a.dialogueState.id,letter:a.dialoguePanel.shell.list.some(x=>x.type==='Text'&&x.text==='M'&&x.visible),label:a.dialoguePanel.shell.list.some(x=>x.type==='Text'&&x.text==='MARCIN'&&x.visible),text:a.dialoguePanel.text.text}})()");
  assert.equal(marcinFallback.loaded,false,'Missing Marcin asset incorrectly registered as loaded');
  assert.equal(marcinFallback.id,'after-final-enemy');
  assert.equal(marcinFallback.letter,true,'Missing portrait did not show letter fallback');
  assert.equal(marcinFallback.label,true,'Missing portrait hid MARCIN speaker label');
  assert.ok(marcinFallback.text.includes('Przepowiednia się spełniła'));
  for(let i=0;i<3;i++)await nextLine();
  await waitFor(v=>v.menu&&v.arenaPaused,'PR48 missing-portrait victory');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'victory');
  await cdp('Fetch.disable');socket.removeEventListener('message',missingPortrait);
  console.log('PASS PR48 missing Marcin portrait: fallback letter, speaker, three lines/DALEJ and victory');

  await verifyTimedWaves({cdp,evaluate,sleep,snapshot,waitFor,clickControl,nextLine,setSeed:seed=>{arenaRun=[1,41,104729].indexOf(seed);}});
  await verifySpawnPacing({cdp,evaluate,sleep,snapshot,waitFor,clickControl,nextLine,click});
  assert.deepEqual(uncaught,[],'Uncaught browser exceptions');
} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  // Chrome may still flush profile files after SIGKILL. Cleanup must never mask the test result.
  await sleep(150);
  try { await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:150}); } catch (error) { console.error('Chrome profile cleanup warning:',error.message); }
}
