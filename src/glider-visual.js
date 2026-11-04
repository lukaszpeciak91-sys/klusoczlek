import Phaser from 'phaser';
import {assetUrl} from './character-visual.js';
import {createBobrozombiRenderer,createBocianolakRenderer} from './enemy-visual.js';
import {ENEMY_TYPES} from './enemy-types.js';
import {AIRSHIP_GROUND_CAP,AIRSHIP_GLIDER_CAP} from './airship-defense.js';
import {GLIDER_ART_KEY,GLIDER_ART_PATH,GLIDER_DEMO,LANDING_MS,GLIDER_EXPANDED_SEARCH_MS,
  landingPosition,makeFlight,stepFlight,stepLanding} from './glider-delivery.js';

const WING_DISPLAY=Object.freeze({width:176,height:94});
function wingFallback(scene){
  const wing=scene.add.graphics();
  wing.fillStyle(0x63513a).fillPoints([
    {x:-89,y:-28},{x:0,y:-72},{x:89,y:-28},{x:61,y:-21},{x:0,y:-41},{x:-61,y:-21}
  ],true);
  wing.lineStyle(4,0x2e2d2b).strokePoints([
    {x:-89,y:-28},{x:0,y:-72},{x:89,y:-28},{x:61,y:-21},{x:0,y:-41},{x:-61,y:-21}
  ],true);
  wing.lineStyle(3,0xccb681);
  wing.lineBetween(-73,-30,0,5);wing.lineBetween(73,-30,0,5);
  wing.lineBetween(0,-65,0,16);
  return wing;
}
export function createGliderDelivery(scene,{demo=false}={}){
  const renderers={
    bobrozombi:createBobrozombiRenderer(scene,Phaser),
    bocianolak:createBocianolakRenderer(scene,Phaser),
  };
  const flights=[],landings=[],groundEnemies=[],started=new Set();
  let elapsed=0,alive=true,stopped=false,airborneCount=0,dropCount=0,blockedCount=0;
  const pendingArt=new Set();
  async function loadVehicle(){
    try{
      if(!scene.textures.exists(GLIDER_ART_KEY)){
        const response=await fetch(assetUrl(import.meta.env.BASE_URL,GLIDER_ART_PATH),{signal:scene.artAbort.signal});
        if(!response.ok)throw Error('PNG HTTP '+response.status);
        const img=await createImageBitmap(await response.blob());
        if(!alive){img.close();return;}
        scene.textures.addImage(GLIDER_ART_KEY,img);
      }
      if(!alive)return;
      scene.textures.get(GLIDER_ART_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
      scene.gliderArtStatus='loaded';
      for(const visual of pendingArt){
        if(!visual.active)continue;
        const art=visual.getData('vehicleImage'),fallback=visual.getData('vehicleFallback');
        art.setTexture(GLIDER_ART_KEY).setDisplaySize(WING_DISPLAY.width,WING_DISPLAY.height).setVisible(true);
        fallback.setVisible(false);
      }
    }catch(error){
      if(alive){scene.gliderArtStatus='fallback';console.info('[Airship glider] procedural fallback:',error.message);}
    }
  }
  scene.gliderArtStatus='pending';
  void loadVehicle();

  function createAirborne(spec){
    if(!alive||stopped||started.has(spec.id))return null;
    if(flights.filter(f=>!f.finished).length>=AIRSHIP_GLIDER_CAP)return null;
    if(groundEnemies.filter(e=>!e.dead).length+landings.filter(l=>!l.finished).length+
      flights.filter(f=>!f.finished&&!f.released).length>=AIRSHIP_GROUND_CAP)return null;
    const flight=makeFlight(spec);
    const visual=scene.add.container(flight.x,flight.y).setDepth(23);
    const wing=wingFallback(scene);
    const approved=scene.add.image(0,-15,'airship-fallback-sky').setVisible(false);
    visual.add([wing,approved]);
    visual.setData('vehicleFallback',wing);
    visual.setData('vehicleImage',approved);
    if(scene.textures.exists(GLIDER_ART_KEY)){
      approved.setTexture(GLIDER_ART_KEY).setDisplaySize(WING_DISPLAY.width,WING_DISPLAY.height).setVisible(true);
      wing.setVisible(false);
    }else pendingArt.add(visual);
    visual.once(Phaser.GameObjects.Events.DESTROY,()=>pendingArt.delete(visual));
    // Exactly one enemy at its usual world scale, suspended below the bar.
    const passenger=renderers[spec.type].create(0,0);
    passenger.setPosition(0,58);
    visual.add(passenger);
    flight.visual=visual;flight.passenger=passenger;flight.telegraph=null;
    flights.push(flight);started.add(flight.id);airborneCount++;
    return flight;
  }
  function releasePassenger(flight){
    if(!flight.passenger||!flight.landingPoint)return;
    const passenger=flight.passenger;
    flight.visual.remove(passenger);
    // Only a visual exists during descent. Logical ground identity is created once at touchdown.
    const descent=scene.add.container(flight.landingPoint.x,flight.landingPoint.y).setDepth(14);
    scene.add.existing(passenger);
    descent.add(passenger);
    passenger.setPosition(0,-100).setScale(1);
    flight.passenger=null;
    const landing={id:flight.id,type:flight.type,x:flight.landingPoint.x,y:flight.landingPoint.y,
      radius:ENEMY_TYPES[flight.type].radius,elapsed:0,finished:false,visual:descent,passenger};
    landings.push(landing);
    dropCount++;
  }
  function finishLanding(landing){
    if(groundEnemies.some(enemy=>enemy.id===landing.id))return;
    landing.visual.destroy();
    const renderer=renderers[landing.type];
    const sprite=renderer.create(landing.x,landing.y);
    const enemy={id:landing.id,type:landing.type,x:landing.x,y:landing.y,
      hp:ENEMY_TYPES[landing.type].hp,seed:groundEnemies.length+1,facing:'s',sprite,dead:false,
      hitUntil:0,activationAt:scene.time.now+900,ignition:null};
    renderer.update(enemy,scene.player,0,0);
    groundEnemies.push(enemy);
  }
  const update=delta=>{
    if(!alive||stopped)return;
    const dt=Math.max(0,Math.min(50,delta));
    elapsed+=dt;
    if(demo)for(const spec of GLIDER_DEMO){
      if(elapsed>=spec.atMs&&!started.has(spec.id))createAirborne(spec);
    }
    for(const flight of flights){
      if(flight.finished)continue;
      const occupied=[...groundEnemies,...landings.filter(l=>!l.finished)].map(e=>({x:e.x,y:e.y,radius:e.radius??ENEMY_TYPES[e.type].radius}));
      const point=flight.phase==='dropping'&&!flight.released
        ?landingPosition(flight.zoneId,scene.player,occupied,ENEMY_TYPES[flight.type].radius,
          flight.elapsed>=GLIDER_EXPANDED_SEARCH_MS):null;
      if(flight.phase==='dropping'&&point&&!flight.released&&!flight.telegraph){
        flight.telegraph=scene.add.ellipse(point.x,point.y,64,24,0xd8a255,0.18)
          .setStrokeStyle(3,0xeccb7d,0.9).setDepth(7);
      }
      if(flight.telegraph?.active)flight.telegraph.setAlpha(.45+.35*Math.sin(elapsed/105));
      const event=stepFlight(flight,dt,point);
      if(event.drop){flight.telegraph?.destroy();flight.telegraph=null;releasePassenger(flight);}
      if(event.blocked){
        blockedCount++;
        flight.telegraph?.destroy();flight.telegraph=null;
        console.warn('[Airship glider] Landing blocked after bounded retries:',flight.id);
      }
      if(flight.visual?.active)flight.visual.setPosition(flight.x,flight.y);
      if(event.finished){flight.visual?.destroy();flight.visual=null;flight.telegraph?.destroy();flight.telegraph=null;}
    }
    for(const landing of landings){
      if(landing.finished)continue;
      const touchdown=stepLanding(landing,dt);
      if(landing.passenger?.active){
        const t=landing.elapsed/LANDING_MS;
        landing.passenger.setPosition(0,-100*(1-t)).setScale(1);
      }
      if(touchdown)finishLanding(landing);
    }
    // Existing Act II combat adapter owns ground movement, hits and damage.
    for(const enemy of groundEnemies)if(!enemy.dead&&enemy.sprite.active)renderers[enemy.type].update(enemy,scene.player,0,0);
  };
  function stop(){
    stopped=true;
    for(const flight of flights){flight.visual?.destroy();flight.visual=null;flight.telegraph?.destroy();flight.telegraph=null;flight.finished=true;flight.phase='finished';}
    for(const landing of landings){landing.visual?.destroy();landing.visual=null;landing.finished=true;}
  }
  function shutdown(){
    if(!alive)return;alive=false;stop();
    for(const flight of flights)flight.visual?.destroy();
    for(const landing of landings)landing.visual?.destroy();
    for(const enemy of groundEnemies)enemy.sprite?.destroy();
    for(const renderer of Object.values(renderers))renderer.shutdown();
    pendingArt.clear();
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,shutdown);
  return {update,shutdown,stop,request:createAirborne,renderers,get flights(){return flights;},get landings(){return landings;},
    get groundEnemies(){return groundEnemies;},get spawnedCount(){return airborneCount;},
    get dropCount(){return dropCount;},get blockedCount(){return blockedCount;},get finishedCount(){return flights.filter(f=>f.finished).length;},
    get activeAirborneVisuals(){return flights.filter(f=>f.visual?.active).length;},
    get activeLandingVisuals(){return landings.filter(l=>l.visual?.active).length;},
    get pendingPassengers(){return flights.filter(f=>!f.released&&!f.finished).length+landings.filter(l=>!l.finished).length;},
    get activeGliders(){return flights.filter(f=>!f.finished).length;}};
}
