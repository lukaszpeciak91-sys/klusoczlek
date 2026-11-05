import Phaser from 'phaser';
import {assetUrl} from './character-visual.js';
import {createBobrozombiRenderer,createBocianolakRenderer} from './enemy-visual.js';
import {ENEMY_TYPES} from './enemy-types.js';
import {AIRSHIP_GROUND_CAP,AIRSHIP_GLIDER_CAP} from './airship-defense.js';
import {GLIDER_ART_KEY,GLIDER_ART_PATH,GLIDER_DEMO,LANDING_MS,GLIDER_EXPANDED_SEARCH_MS,
  landingPosition,landingPointSafe,makeFlight,stepFlight,stepLanding} from './glider-delivery.js';

import {GLIDER_FRAME_SIZE,GLIDER_SHEET_WIDTH,GLIDER_SHEET_HEIGHT,flightDirectionFrame} from './glider-spritesheet.js';

const WING_DISPLAY_WIDTH=176;
function frameForFlight(flight){
  const direction=flight.heading??{x:1,y:0};
  return flightDirectionFrame({x:0,y:0},direction);
}
function showApprovedWing(art,flight){
  art.setTexture(GLIDER_ART_KEY,frameForFlight(flight))
    .setDisplaySize(WING_DISPLAY_WIDTH,WING_DISPLAY_WIDTH).setVisible(true);
}
// Enemy renderer stores its selected direction on the container and on its
// async-attached spritesheet. Keep both in sync with the painted wing frame.
function syncPassengerFacing(flight){
  const passenger=flight.passenger;
  if(!passenger?.active)return;
  const frame=frameForFlight(flight);
  passenger.setData(flight.type+'-facing',frame);
  const art=passenger.getData(flight.type+'-art');
  if(art?.active&&art.frame.name!==frame)art.setFrame(frame);
}
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
        if(img.width!==GLIDER_SHEET_WIDTH||img.height!==GLIDER_SHEET_HEIGHT){
          img.close();
          throw Error('Invalid hang-glider spritesheet dimensions: expected 2560x320');
        }
        scene.textures.addSpriteSheet(GLIDER_ART_KEY,img,{
          frameWidth:GLIDER_FRAME_SIZE,frameHeight:GLIDER_FRAME_SIZE,
          startFrame:0,endFrame:7,margin:0,spacing:0
        });
      }
      if(!alive)return;
      scene.textures.get(GLIDER_ART_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
      scene.gliderArtStatus='loaded';
      for(const visual of pendingArt){
        if(!visual.active)continue;
        const art=visual.getData('vehicleImage'),fallback=visual.getData('vehicleFallback');
        showApprovedWing(art,visual.getData('flight'));
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
    const occupied=[...groundEnemies.filter(e=>!e.dead),...landings.filter(l=>!l.finished),
      ...flights.filter(f=>!f.finished&&!f.released&&f.landingPoint).map(f=>({...f.landingPoint,radius:ENEMY_TYPES[f.type].radius}))];
    const safe=landingPosition(spec.zoneId,scene.player,occupied,ENEMY_TYPES[spec.type].radius);
    const flight=makeFlight(spec,safe);
    const visual=scene.add.container(flight.x,flight.y).setDepth(23);
    // Child order is significant: passenger first, wing OVER it.
    const passenger=renderers[spec.type].create(0,0);
    passenger.setPosition(0,58);
    const wing=wingFallback(scene);
    const approved=scene.add.sprite(0,-20,'airship-fallback-sky').setVisible(false);
    visual.add([passenger,wing,approved]);
    visual.setData('vehicleFallback',wing);
    visual.setData('vehicleImage',approved);
    visual.setData('flight',flight);
    if(scene.textures.exists(GLIDER_ART_KEY)){
      showApprovedWing(approved,flight);
      wing.setVisible(false);
    }else pendingArt.add(visual);
    visual.once(Phaser.GameObjects.Events.DESTROY,()=>pendingArt.delete(visual));
    // Same passenger scale and directional sprite as its ground counterpart.
    flight.visual=visual;flight.passenger=passenger;flight.telegraph=null;
    syncPassengerFacing(flight);
    flights.push(flight);started.add(flight.id);airborneCount++;
    return flight;
  }
  function releasePassenger(flight){
    if(!flight.passenger||!flight.landingPoint)return;
    const passenger=flight.passenger;
    const start={x:flight.visual.x+passenger.x,y:flight.visual.y+passenger.y};
    flight.visual.remove(passenger);
    // Only one visual exists during descent. Logical ground identity is created at touchdown.
    const descent=scene.add.container(flight.landingPoint.x,flight.landingPoint.y).setDepth(14);
    descent.add(passenger);
    const startX=start.x-flight.landingPoint.x,startY=start.y-flight.landingPoint.y;
    passenger.setPosition(startX,startY);
    flight.passenger=null;
    const landing={id:flight.id,type:flight.type,x:flight.landingPoint.x,y:flight.landingPoint.y,
      radius:ENEMY_TYPES[flight.type].radius,elapsed:0,finished:false,visual:descent,passenger,startX,startY};
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
      const occupied=[...groundEnemies.filter(e=>!e.dead),...landings.filter(l=>!l.finished),
        ...flights.filter(f=>f!==flight&&!f.finished&&!f.released&&f.landingPoint)
          .map(f=>({...f.landingPoint,radius:ENEMY_TYPES[f.type].radius}))]
        .map(e=>({x:e.x,y:e.y,radius:e.radius??ENEMY_TYPES[e.type].radius}));
      const radius=ENEMY_TYPES[flight.type].radius;
      const point=!flight.released&&flight.phase!=='departing'
        ?(landingPointSafe(flight.landingPoint,scene.player,occupied,radius)
          ?flight.landingPoint
          :landingPosition(flight.zoneId,scene.player,occupied,radius,
            flight.age>=GLIDER_EXPANDED_SEARCH_MS))
        :null;
      if(!flight.released&&flight.phase!=='departing'){
        if(point){
          if(!flight.telegraph){
            flight.telegraph=scene.add.ellipse(point.x,point.y,64,24,0xd8a255,0.18)
              .setStrokeStyle(3,0xeccb7d,0.9).setDepth(7);
          }else flight.telegraph.setPosition(point.x,point.y);
        }else if(flight.telegraph){
          flight.telegraph.destroy();
          flight.telegraph=null;
        }
      }
      if(flight.telegraph?.active)flight.telegraph.setAlpha(.45+.35*Math.sin(elapsed/105));
      const event=stepFlight(flight,dt,point);
      if(event.drop){flight.telegraph?.destroy();flight.telegraph=null;releasePassenger(flight);}
      if(event.blocked){
        blockedCount++;
        flight.telegraph?.destroy();flight.telegraph=null;
        console.warn('[Airship glider] Landing blocked after bounded retries:',flight.id);
      }
      if(flight.visual?.active){
        flight.visual.setPosition(flight.x,flight.y);
        syncPassengerFacing(flight);
        const art=flight.visual.getData('vehicleImage');
        if(art?.visible&&art.texture.key===GLIDER_ART_KEY){
          const frame=frameForFlight(flight);
          if(art.frame.name!==frame)art.setFrame(frame);
        }
      }
      if(event.finished){flight.visual?.destroy();flight.visual=null;flight.telegraph?.destroy();flight.telegraph=null;}
    }
    for(const landing of landings){
      if(landing.finished)continue;
      const touchdown=stepLanding(landing,dt);
      if(landing.passenger?.active){
        const t=landing.elapsed/LANDING_MS;
        landing.passenger.setPosition(landing.startX*(1-t),landing.startY*(1-t));
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
