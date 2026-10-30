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
  socket.addEventListener('message', event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')console.log('PHASER UNCAUGHT EXCEPTION',JSON.stringify(message.params.exceptionDetails));
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
  async function clickControl(which){
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
      obstacles:a.obstacles.filter(o=>o.alive).map(o=>({x:o.x,y:o.y,r:o.sprite.width/2}))};
  })()`);
  assert.equal(firstPickup.id,'blunderbuss');
  assert.ok(firstPickup.x>firstPickup.left+25&&firstPickup.x<firstPickup.right-25);
  assert.ok(firstPickup.y>firstPickup.top+25&&firstPickup.y<firstPickup.bottom-25);
  assert.ok(firstPickup.obstacles.every(o=>Math.hypot(firstPickup.x-o.x,firstPickup.y-o.y)>o.r+20));

  const initialToken=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {symbol:a.weaponText.text,color:a.weaponTokenBody.fillColor,kills:a.killsText.text}})()");
  assert.deepEqual(initialToken,{symbol:'—',color:0x6b6153,kills:'0/66'});
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
  // Accelerated 66-kill regression is not a cutscene test; narrative is tested below via actual spawn.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');a.introducedEnemyTypes.add('before-first-bocianolak');a.introducedEnemyTypes.add('before-first-zubrokryptyda');})()");
  const killOne=async()=>evaluate(`(()=>{
    const a=window.__game.scene.getScene('Arena');
    if(!a.enemies.some(e=>!e.dead))a.spawnReplacement();
    const e=a.enemies.find(e=>!e.dead);
    if(!e)throw Error('Encounter stalled');
    e.hp=0;
    if(!a.finalizeEnemyDeath(e)||a.finalizeEnemyDeath(e))throw Error('Death must be unique');
    a.enemies=a.enemies.filter(e=>!e.dead);
    if(a.episode.state==='intermission'){
      a.episode.wave++;a.episode.spawned=0;a.episode.defeated=0;a.episode.intermissionUntil=null;a.episode.state='active';
    }
    if(a.episode.state==='active'&&a.enemies.filter(e=>!e.dead).length<[3,3,4,4,4,5][a.episode.wave])a.spawnReplacement();
    return {kills:a.kills,type:e.type,pending:a.pendingRewards.size,pickups:a.pickups.map(p=>p.id)};
  })()`);
  const typesDefeated=[];
  // Real 66th-death bookkeeping with deliberate wave-boundary collection.
  // Keep the legacy kill helper's accelerated spawn fixture, but assert rewards
  // against authoritative wave-clear events instead of kill thresholds.
  await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const original=a.dropHealthReward.bind(a);a.healthAwardCount=0;a.dropHealthReward=()=>{a.healthAwardCount++;return original()};a.events.on('episode-boundary',(id,scene)=>{if(id==='after-final-enemy')scene.holdFinalOutcome()})})()");
  for(let i=0;i<66;i++){
    const result=await killOne();
    typesDefeated.push(result.type);
    if(i===4||i===9){
      assert.equal(result.pending,0,'Old kill-threshold reward still active');
      assert.ok(!result.pickups.includes(i===4?'rifle':'flamethrower'));
    }
    if(i===17||i===41){
      const expected=i===17?'rifle':'flamethrower';
      const boundary=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {wave:a.episode.wave,state:a.episode.state,pending:a.mandatoryWeapon,pickups:a.pickups.map(p=>p.id),count:a.pickups.filter(p=>p.id===a.mandatoryWeapon).length}})()");
      assert.equal(boundary.state,'intermission');
      assert.equal(boundary.pending,expected);
      assert.equal(boundary.count,1,'Exactly one mandatory reward pickup');
      if(i===41)assert.ok(boundary.pickups.includes('health'),'Wave 4 health and flamethrower should coexist');
      const p=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');const p=a.pickups.find(p=>p.id===a.mandatoryWeapon);return {x:p.x,y:p.y}})()");
      await evaluate(`(()=>{const a=window.__game.scene.getScene('Arena');a.player.body.reset(${p.x},${p.y});return true})()`);
      await sleep(90);
      const collected=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {weapon:a.weapon,mandatory:a.mandatoryWeapon,visual:a.playerVisual.requestedVariant}})()");
      assert.equal(collected.weapon,expected);assert.equal(collected.visual,expected);assert.equal(collected.mandatory,null);
    }
  }
  assert.deepEqual(await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.weaponText.text,a.weaponTokenBody.fillColor]})()"),['♨',0xd65d32]);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').playerVisual.requestedVariant"),'flamethrower');
  const progression=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {kills:a.kills,total:a.totalSpawned,completed:a.completed,pending:a.pendingRewards.size,markers:[...a.triggeredMilestones],healthAwards:a.healthAwardCount||0}})()");
  assert.equal(progression.kills,66);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').killsText.text"),'66/66');
  assert.equal(typesDefeated.filter(x=>x==='bobrozombi').length,35);
  assert.equal(typesDefeated.filter(x=>x==='bocianolak').length,23);
  assert.equal(typesDefeated.filter(x=>x==='zubrokryptyda').length,8);
  assert.equal(progression.total,66);
  assert.equal(progression.healthAwards,3,'Heart awards after waves 2, 4, 5 were not exactly once');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'final-pending');
  assert.equal(progression.pending,0);
  assert.deepEqual(progression.markers,[2,4]);
  console.log('PASS Phaser wave rewards: no kill 5/10 triggers, rifle after 2, flamethrower and health after 4, 66 unique deaths');
  // The actual 66th gameplay death must leave a live burst throughout the final narrative.
  const finalBurstAtStart=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {state:a.episode.state,id:a.dialogueState.id,held:a.finalOutcomeHeld,kills:a.kills,active:a.deathBursts.some(v=>v.graphics.active&&!v.done),count:a.deathBursts.length}})()");
  assert.equal(finalBurstAtStart.kills,66);
  assert.equal(finalBurstAtStart.state,'final-pending');
  assert.equal(finalBurstAtStart.id,'after-final-enemy');
  assert.equal(finalBurstAtStart.active,true,'Final enemy burst must exist at final-pending boundary');
  const finalShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/combat-feedback-final-enemy-active.png',Buffer.from(finalShot.data,'base64'));
  await sleep(560);
  const finalBurstsEnded=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {state:a.episode.state,id:a.dialogueState.id,held:a.finalOutcomeHeld,bursts:a.deathBursts.length,ended:a.episode.ended}})()");
  assert.deepEqual(finalBurstsEnded,{state:'final-pending',id:'after-final-enemy',held:true,bursts:0,ended:false},'Death bursts must complete while final narrative freezes combat');
  const finalAfterShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('dist/combat-feedback-final-enemy-expired.png',Buffer.from(finalAfterShot.data,'base64'));
  await sleep(120);
  const heldFinal=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {state:a.episode.state,held:a.finalOutcomeHeld,id:a.dialogueState.id,first:a.consumeNarrativeBoundary('after-final-enemy')}})()");
  assert.deepEqual(heldFinal,{state:'final-pending',held:true,id:'after-final-enemy',first:false},'Final dialogue must own the consumed one-shot boundary');
  for(let line=0;line<3;line++){
    const before=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,index:a.dialogueState.index,x:a.dialoguePanel.button.x,y:a.dialoguePanel.button.y,state:a.episode.state}})()");
    assert.equal(before.id,'after-final-enemy');assert.equal(before.index,line);
    const isolated=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return [a.joystick,a.aimJoystick].every(j=>!j.enabled&&!j.base.visible&&!j.knob.visible&&!j.held&&j.pointerId===null)})()");
    assert.equal(isolated,true,'Both joysticks must remain isolated across dialogue lines');
    assert.equal(before.state,'final-pending','Victory occurred while dialogue active');
    await sleep(205);
    const bounds=(await snapshot()).rect;
    await click(bounds.x+before.x,bounds.y+before.y);
    const after=await evaluate("(()=>{const a=window.__game.scene.getScene('Arena');return {id:a.dialogueState.id,index:a.dialogueState.index}})()");
    assert.equal(after.id,line===2?null:'after-final-enemy','Final DALEJ tap skipped or failed');
    if(line<2)assert.equal(after.index,line+1);
  }
  await waitFor(v=>v.menu&&v.arenaPaused,'victory terminal menu');
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.state"),'victory');
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
    const saved={enemies:a.enemies,total:a.totalSpawned,due:a.spawnDueAt,episode:{...a.episode}};
    a.introducedEnemyTypes.add('before-first-zubrokryptyda'); // Separate test covers live visual introduction.
    const activeHeavy=a.createEnemy('zubrokryptyda',{x:650,y:500},12);
    a.enemies=[activeHeavy];a.episode.wave=2;a.episode.spawned=11;a.episode.defeated=0;
    a.episode.state='active';a.totalSpawned=28;a.spawnDueAt=null;
    a.spawnReplacement();
    const blocked={total:a.totalSpawned,spawned:a.episode.spawned,retry:a.spawnDueAt!==null};
    activeHeavy.dead=true;activeHeavy.sprite.destroy();a.enemies=[];
    a.spawnReplacement();
    const unblocked={total:a.totalSpawned,spawned:a.episode.spawned,type:a.enemies[0]?.type};
    for(const e of a.enemies)e.sprite.destroy();
    a.enemies=saved.enemies;a.totalSpawned=saved.total;a.spawnDueAt=saved.due;
    Object.assign(a.episode,saved.episode);
    return {blocked,unblocked};
  })()`);
  assert.deepEqual(heavyQueue.blocked,{total:28,spawned:11,retry:true});
  assert.deepEqual(heavyQueue.unblocked,{total:29,spawned:12,type:'zubrokryptyda'});
  console.log('PASS wave-local heavy concurrency gate: blocked second heavy stays queued');
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
    a.episode.wave=1;a.episode.spawned=7;a.episode.state='active';
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

  // Real Phaser heart pickup and pause-frozen intermission, on a clean Arena session.
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
    a.episode.wave=1;a.episode.spawned=10;a.episode.defeated=10;
    a.episode.state='intermission';a.episode.intermissionUntil=a.time.now+800;
    a.spawnDueAt=null;
    return {before:a.time.now,state:a.episode.state};
  })()`);
  await clickControl('hud');
  await waitFor(v=>v.menu&&v.arenaPaused,'episode intermission pause');
  const pausedClock=await evaluate("window.__game.scene.getScene('Arena').time.now");
  await sleep(260);
  const pausedClockAfter=await evaluate("window.__game.scene.getScene('Arena').time.now");
  assert.equal(pausedClockAfter,pausedClock,'Intermission advanced while Arena paused');
  await clickControl('WZNÓW');
  await waitFor(v=>v.arena&&!v.menu&&!v.arenaPaused,'episode intermission resume');
  await sleep(950);
  assert.equal(await evaluate("window.__game.scene.getScene('Arena').episode.wave"),2);
  console.log('PASS real Chromium Episode 1 hearts: full HP persistence, +2 heal and paused intermission');
  // Test both introductions through the *actual* scheduled spawn, not a fabricated boundary.
  for(const [id,type,wave,spawned,lines] of [
    ['before-first-zubrokryptyda','zubrokryptyda',2,11,2],
    ['before-first-bocianolak','bocianolak',1,7,3]
  ]){
    const intro=await evaluate(`(()=>{
      const a=window.__game.scene.getScene('Arena');
      for(const e of a.enemies)if(e.sprite.active)e.sprite.destroy();
      a.enemies=[];a.episode.wave=${wave};a.episode.spawned=${spawned};a.episode.defeated=0;a.episode.state='active';a.spawnDueAt=null;
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

    console.log('PASS real Chromium contact lunge, single HP loss, exactly-once enemy pixel death, terminal Aloes red disintegration');





} finally {
  socket?.close();
  chrome?.kill('SIGKILL');
  vite.kill('SIGTERM');
  // Chrome may still flush profile files after SIGKILL. Cleanup must never mask the test result.
  await sleep(150);
  try { await rm(profile, {recursive:true,force:true,maxRetries:5,retryDelay:150}); } catch (error) { console.error('Chrome profile cleanup warning:',error.message); }
}
