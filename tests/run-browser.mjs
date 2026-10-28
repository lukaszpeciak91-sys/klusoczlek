import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  // Geometry from real rendered Phaser GameObjects, not only calculated layout numbers.
  const assertHudBounds=async(label)=>{
    const geometry=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena'),w=a.scale.width,h=a.scale.height;
      const button=a.input._list.find(o=>o.input&&o.width===a.hudLayout.menuWidth);
      const actual=o=>{const b=o.getBounds();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
      const portrait=actual(a.hpFace.root),menu=actual(button),weapon=actual(a.weaponText),kills=actual(a.killsText),hp=actual(a.hpText);
      return {w,h,portrait,menu,weapon,kills,hp,stickTop:a.hudLayout.joystickY-a.hudLayout.joystickRadius,
        rightStickTop:a.hudLayout.aimY-a.hudLayout.joystickRadius,
        portraitSquare:Math.abs(portrait.width-portrait.height)<2};
    })()`);
    const {w,h,menu,portrait,weapon,kills,hp}=geometry;
    for(const box of [menu,portrait,weapon,kills,hp]){
      assert.ok(box.x>=-1&&box.y>=-1&&box.right<=w+1&&box.bottom<=h+1,label+' clipped '+JSON.stringify(geometry));
    }
    const separate=(a,b)=>a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1;
    assert.ok(separate(menu,weapon),label+' MENU/weapon overlap');
    assert.ok(separate(menu,kills),label+' MENU/kills overlap');
    assert.ok(separate(portrait,weapon)&&separate(portrait,kills),label+' portrait/text overlap');
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
      obstacles:a.obstacles.filter(o=>o.alive).map(o=>({x:o.x,y:o.y,r:o.sprite.width/2}))};
  })()`);
  assert.equal(firstPickup.id,'blunderbuss');
  assert.ok(firstPickup.x>firstPickup.left+25&&firstPickup.x<firstPickup.right-25);
  assert.ok(firstPickup.y>firstPickup.top+25&&firstPickup.y<firstPickup.bottom-25);
  assert.ok(firstPickup.obstacles.every(o=>Math.hypot(firstPickup.x-o.x,firstPickup.y-o.y)>o.r+20));

  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),null);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerVisual.requestedVariant"),'unarmed');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const p=a.pickups[0];a.player.setPosition(p.x,p.y);a.player.body.reset(p.x,p.y);return true})()");
  await sleep(75);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'blunderbuss');
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
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),null);
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.pickups[0];a.player.body.reset(p.x,p.y);return true})()");
  await sleep(80);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'blunderbuss');
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
  // Real Phaser Arena progression: exercise shared death path, drops and bounded replacement.
  // Exercise real Arena update/proximity and a placement failure that survives MENU/WZNÓW.
  const killOne=async()=>evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    if(!a.enemies.some(e=>!e.dead))a.spawnReplacement();
    const e=a.enemies.find(e=>!e.dead);
    if(!e)throw Error('Encounter stalled');
    e.hp=0;
    if(!a.finalizeEnemyDeath(e)||a.finalizeEnemyDeath(e))throw Error('Death must be unique');
    a.enemies=a.enemies.filter(e=>!e.dead);
    if(a.enemies.length<3&&a.totalSpawned<28)a.spawnReplacement();
    return {kills:a.kills,type:e.type,pending:a.pendingRewards.size,pickups:a.pickups.map(p=>p.id)};
  })()`);
  const typesDefeated=[];
  for(let i=0;i<4;i++)typesDefeated.push((await killOne()).type);
  await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    // Suppress placement by occupying candidate positions with artificial rocks.
    const e=a.enemies.find(e=>!e.dead);
    for(const [dx,dy] of [[0,0],[36,0],[-36,0],[0,36],[0,-36],[50,50],[-50,50],[50,-50],[-50,-50]])
      a.obstacles.push({type:'rock',alive:true,x:e.x+dx,y:e.y+dy,sprite:{active:true,depth:4,width:62,setAlpha(){}},hitUntil:Infinity,__fixture:true});
    return true;
  })()`);
  const fifth=await killOne();typesDefeated.push(fifth.type);
  assert.equal(fifth.kills,5);
  assert.equal(fifth.pending,1);
  assert.ok(!fifth.pickups.includes('rifle'));
  await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'menu pending reward');
  assert.equal(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.pendingRewards.size===1||a.pickups.some(p=>p.id==='rifle')})()"),true,'Reward vanished during MENU transition');
  await clickControl('WZNÓW');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'resume pending reward');
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.obstacles=a.obstacles.filter(o=>!o.__fixture);return true})()");
  await sleep(100);
  const rifle=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.pickups.find(p=>p.id==='rifle')?{x:a.pickups.find(p=>p.id==='rifle').x,y:a.pickups.find(p=>p.id==='rifle').y,pending:a.pendingRewards.size}:null})()");
  assert.ok(rifle&&rifle.pending===0);
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.pickups.find(p=>p.id==='rifle');a.player.body.reset(p.x,p.y);return true})()");
  await sleep(95);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'rifle');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerVisual.requestedVariant"),'rifle');
  for(let i=0;i<5;i++)typesDefeated.push((await killOne()).type);
  const flame=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return a.pickups.find(p=>p.id==='flamethrower')?{x:a.pickups.find(p=>p.id==='flamethrower').x,y:a.pickups.find(p=>p.id==='flamethrower').y}:null})()");
  assert.ok(flame);
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena'),p=a.pickups.find(p=>p.id==='flamethrower');a.player.body.reset(p.x,p.y);return true})()");
  await sleep(95);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').weapon"),'flamethrower');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerVisual.requestedVariant"),'flamethrower');
  for(let i=0;i<18;i++)typesDefeated.push((await killOne()).type);
  const progression=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {kills:a.kills,total:a.totalSpawned,completed:a.completed,pending:a.pendingRewards.size,markers:[...a.triggeredMilestones]}})()");
  assert.equal(progression.kills,28);
  assert.equal(typesDefeated.filter(x=>x==='bobrozombi').length,18);
  assert.equal(typesDefeated.filter(x=>x==='bocianolak').length,10);
  assert.equal(progression.total,28);
  assert.equal(progression.completed,true);
  assert.equal(progression.pending,0);
  assert.deepEqual(progression.markers,[5,10]);
  console.log('PASS Phaser milestones: invalid #5 placement retained/resumed/retried, collected rifle and flamethrower via update, 28 unique deaths');
  await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'menu before reset');
  await clickControl('NOWA GRA');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'new game progression reset');
  const reset=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {kills:a.kills,total:a.totalSpawned,weapon:a.weapon,pending:a.pendingRewards.size,triggered:a.triggeredMilestones.size,pickups:a.pickups.map(p=>p.id)}})()");
  assert.deepEqual(reset,{kills:0,total:3,weapon:null,pending:0,triggered:0,pickups:['blunderbuss']});
  const postponedSpawn=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'),e=a.enemies.find(e=>!e.dead);
    e.hp=0;a.finalizeEnemyDeath(e);a.enemies=a.enemies.filter(v=>!v.dead);
    const r=46,W=1800,H=1200;
    for(const [x,y] of [[r,r],[W-r,r],[W-r,H-r],[r,H-r],[W/2,r],[W-r,H/2],[W/2,H-r],[r,H/2]])
      a.obstacles.push({type:'rock',x,y,alive:true,__spawnFixture:true});
    const before=a.totalSpawned;a.spawnDueAt=null;
    a.spawnReplacement();const blocked={before,after:a.totalSpawned,retry:a.spawnDueAt!==null};
    a.obstacles=a.obstacles.filter(o=>!o.__spawnFixture);
    a.spawnReplacement();
    return {...blocked,recovered:a.totalSpawned,nextType:a.enemies.at(-1).type,active:a.enemies.filter(v=>!v.dead).length};
  })()`);
  assert.equal(postponedSpawn.after,postponedSpawn.before,'Blocked spawn consumed schedule entry');
  assert.equal(postponedSpawn.retry,true,'Blocked spawn did not schedule retry');
  assert.equal(postponedSpawn.recovered,postponedSpawn.before+1,'Scheduled enemy lost after obstruction cleared');
  assert.ok(postponedSpawn.active<=3);
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
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.weapon='flamethrower';a.stopWeaponFire();return true})()");
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:fireX,y:fireY,button:'left',buttons:1,clickCount:1});
  await sleep(220);
  const flaming=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {particles:a.flameParticles.length,projectiles:a.projectiles.length,active:a.firingState.active}})()");
  assert.ok(flaming.particles>0&&flaming.particles<=60,'Flame particles not bounded and rendered');
  assert.equal(flaming.active,true);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:fireX,y:fireY,button:'left',buttons:0,clickCount:1});
  await sleep(40);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').firingState.active"),false);
  console.log('PASS real held mouse: rifle three-shot burst, release cancellation, flame visual stream and stop');
  // One authoritative barrel explosion path when flame applies three cooldown-limited hits.
  const flameBarrel=await evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena'), barrel=a.obstacles.find(o=>o.type==='barrel');
    barrel.x=a.player.x+132;barrel.y=a.player.y;barrel.sprite.setPosition(barrel.x,barrel.y);
    barrel.sprite.body.updateFromGameObject();
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
    arena.hpFace.setHp(4);
    return true;
  })()`);
  await sleep(65);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_4');
  await evaluate("window.__game.scene.getScene('Arena').setPlayerHp(3)");
  await sleep(55);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_3');
  const faceDamage=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const before=a.hpFace.pulse;a.setPlayerHp(3);return {before,after:a.hpFace.pulse}})()");
  assert.equal(faceDamage.before,faceDamage.after,'Same HP retriggered portrait damage pulse');
  await evaluate("window.__game.scene.getScene('Arena').setPlayerHp(0)");
  await sleep(60);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.current"),'hp_1');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').hpFace.image?.texture?.key"),'aloes-hud-hp_1');
  // Test portrait and layout across tight landscape/fullscreen-equivalent resizes.
  for(const [width,height] of [[320,240],[568,320],[800,360]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate("window.__game.scale.refresh();true");
    await sleep(100);
    const layout=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena'),l=a.hudLayout;
      return {menu:{x:l.menuX,w:l.menuWidth,y:l.menuY,h:l.menuHeight},
        weapon:{x:a.weaponText.x,y:a.weaponText.y,width:a.weaponText.width,height:a.weaponText.height},
        kills:{x:a.killsText.x,y:a.killsText.y,width:a.killsText.width,height:a.killsText.height},
        face:{x:l.portraitX,y:l.portraitY,r:l.portraitSize/2},
        hp:{x:a.hpText.x,y:a.hpText.y,width:a.hpText.width,height:a.hpText.height},
        joystickTop:l.joystickY-l.joystickRadius,renderer:a.game.config.renderType};
    })()`);
    assert.ok(layout.weapon.x>layout.menu.x+layout.menu.w/2,'MENU overlaps weapon');
    assert.ok(layout.kills.x>layout.menu.x+layout.menu.w/2,'MENU overlaps kills');
    assert.ok(layout.weapon.x+layout.weapon.width<layout.face.x-layout.face.r,'Weapon overlaps portrait');
    assert.ok(layout.kills.x+layout.kills.width<layout.face.x-layout.face.r,'Kill counter overlaps portrait');
    assert.ok(layout.hp.y+layout.hp.height<layout.joystickTop,'HP overlaps joysticks');
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
    const barrel={type:'barrel',x,y,hp:1,alive:true,sprite,hitUntil:0};
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




} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  // Chrome may still flush profile files after SIGKILL. Cleanup must never mask the test result.
  await sleep(150);
  try { await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:150}); } catch (error) { console.error('Chrome profile cleanup warning:',error.message); }
}
