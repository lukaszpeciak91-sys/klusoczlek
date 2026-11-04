import Phaser from 'phaser';
import {assetUrl} from './character-visual.js';
import {createBobrozombiRenderer,createBocianolakRenderer,createZubrokryptydaRenderer} from './enemy-visual.js';
import {ENEMY_TYPES} from './enemy-types.js';
import {GLIDER_ART_KEY,GLIDER_ART_PATH,GLIDER_DEMO,LANDING_MS,
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
export function createGliderDelivery(scene){
  const renderers={
    bobrozombi:createBobrozombiRenderer(scene,Phaser),
    bocianolak:createBocianolakRenderer(scene,Phaser),
    zubrokryptyda:createZubrokryptydaRenderer(scene,Phaser),
  };
  const flights=[],landings=[],groundEnemies=[],started=new Set();
  let elapsed=0,alive=true,airborneCount=0,dropCount=0;
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
    const pilot=renderers.zubrokryptyda.create(0,0);
    pilot.setScale(.48).setPosition(0,-21);
    const passenger=renderers[spec.type].create(0,0);
    passenger.setScale(.68).setPosition(0,47);
    visual.add([pilot,passenger]);
    flight.visual=visual;flight.pilot=pilot;flight.passenger=passenger;
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
    passenger.setPosition(0,-115).setScale(.68);
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
      hp:ENEMY_TYPES[landing.type].hp,seed:groundEnemies.length+1,facing:'s',sprite,dead:false};
    renderer.update(enemy,scene.player,0,0);
    groundEnemies.push(enemy);
  }
  const update=delta=>{
    if(!alive)return;
    const dt=Math.max(0,Math.min(50,delta));
    elapsed+=dt;
    for(const spec of GLIDER_DEMO){
      if(elapsed>=spec.atMs&&!started.has(spec.id))createAirborne(spec);
    }
    for(const flight of flights){
      if(flight.finished)continue;
      const occupied=[...groundEnemies,...landings.filter(l=>!l.finished)].map(e=>({x:e.x,y:e.y,radius:e.radius??ENEMY_TYPES[e.type].radius}));
      const point=flight.phase==='dropping'&&!flight.released
        ?landingPosition(flight.zoneId,scene.player,occupied,ENEMY_TYPES[flight.type].radius):null;
      const event=stepFlight(flight,dt,point);
      if(event.drop)releasePassenger(flight);
      if(flight.visual?.active){
        flight.visual.setPosition(flight.x,flight.y);
        flight.visual.setRotation(Math.sin(elapsed/320)*.018);
      }
      if(event.finished){flight.visual?.destroy();flight.visual=null;}
    }
    for(const landing of landings){
      if(landing.finished)continue;
      const touchdown=stepLanding(landing,dt);
      if(landing.passenger?.active){
        const t=landing.elapsed/LANDING_MS;
        landing.passenger.setPosition(0,-115*(1-t)).setScale(.68+.32*t);
      }
      if(touchdown)finishLanding(landing);
    }
    // Ground actors are intentionally inert in PR63: only the existing renderer is updated.
    for(const enemy of groundEnemies)if(enemy.sprite.active)renderers[enemy.type].update(enemy,scene.player,0,0);
  };
  function shutdown(){
    if(!alive)return;alive=false;
    for(const flight of flights)flight.visual?.destroy();
    for(const landing of landings)landing.visual?.destroy();
    for(const enemy of groundEnemies)enemy.sprite?.destroy();
    for(const renderer of Object.values(renderers))renderer.shutdown();
    pendingArt.clear();
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,shutdown);
  return {update,shutdown,renderers,get flights(){return flights;},get landings(){return landings;},
    get groundEnemies(){return groundEnemies;},get spawnedCount(){return airborneCount;},
    get dropCount(){return dropCount;},get finishedCount(){return flights.filter(f=>f.finished).length;},
    get activeAirborneVisuals(){return flights.filter(f=>f.visual?.active).length;},
    get activeLandingVisuals(){return landings.filter(l=>l.visual?.active).length;}};
}
