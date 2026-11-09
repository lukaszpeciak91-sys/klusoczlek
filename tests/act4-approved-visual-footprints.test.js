import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {SCHOOL_ART,validSchoolyardBackground} from '../src/schoolyard-art.js';
import {SCHOOL_WORLD,SCHOOL_PLACES,SCHOOL_OBSTACLES,SCHOOL_VISIBLE_FOOTPRINTS,
 schoolWalkable,schoolStep} from '../src/school-contract.js';
import {BLAZEJ_START,BLAZEJ_RADIUS,CHAPEL_RETURN,blazejJumpLanding} from '../src/school-finale.js';
import {SCHOOL_HEART_POINTS,SCHOOL_ENTOURAGE} from '../src/school-staging.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {PLAYER_RADIUS} from '../src/movement.js';
import {reachableCells} from '../src/obstacle-geometry.js';
import {segmentObstacleHit,steerObstacleStep} from '../src/obstacles.js';
import {selectOrdinarySpawn} from '../src/enemy-spawn.js';
import {obstacleArt,FOREST_ATLAS} from '../src/forest-obstacle-art.js';

const asset=path=>readFileSync(new URL('../public/assets/'+path,import.meta.url));
const pngHeader=b=>({width:b.readUInt32BE(16),height:b.readUInt32BE(20),depth:b[24],color:b[25],interlace:b[28]});
// Strictly test real approved RGBA alpha, not the large transparent PNG canvas.
// Pixel reconstruction exists only in this test, not in the production collision engine.
function alphaBounds(bytes,fromRow=0){
 const {width,height,depth,color,interlace}=pngHeader(bytes);
 assert.equal(depth,8);assert.equal(color,6);assert.equal(interlace,0);
 let p=8,parts=[];
 while(p<bytes.length){
  const len=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8);
  if(kind==='IDAT')parts.push(bytes.subarray(p+8,p+8+len));
  p+=len+12;if(kind==='IEND')break;
 }
 const unfiltered=inflateSync(Buffer.concat(parts)),rowBytes=width*4;
 assert.equal(unfiltered.length,height*(rowBytes+1));
 let offset=0,prev=new Uint8Array(rowBytes);
 let minX=width,maxX=-1,minY=height,maxY=-1;
 for(let y=0;y<height;y++){
  const filter=unfiltered[offset++],row=new Uint8Array(rowBytes);
  for(let i=0;i<rowBytes;i++){
   const left=i>=4?row[i-4]:0,up=prev[i],ul=i>=4?prev[i-4]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   if(filter===2)predictor=up;
   if(filter===3)predictor=(left+up)>>1;
   if(filter===4){const q=left+up-ul,d0=Math.abs(q-left),d1=Math.abs(q-up),d2=Math.abs(q-ul);predictor=d0<=d1&&d0<=d2?left:d1<=d2?up:ul;}
   assert.ok(filter<=4);
   row[i]=(unfiltered[offset++]+predictor)&255;
  }
  if(y>=fromRow)for(let x=0;x<width;x++)if(row[x*4+3]>=48){
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);
   minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  prev=row;
 }
 return {minX,maxX,minY,maxY};
}

test('Act IV background is exact native 1800x1200 and separate assets retain native sizes, world anchors and occlusion',()=>{
 const bg=asset(SCHOOL_ART.background.path),head=pngHeader(bg);
 assert.deepEqual([head.width,head.height,head.depth],[1800,1200,8]);
 assert.equal(validSchoolyardBackground(bg),true);
 for(const [id,w,h,x,bottom,dw=w,dh=h] of [
  ['school',610,450,1420,595],['chapel',235,235,330,965],
  ['bicycleRack',330,255,1510,857,287,222]]){
  const def=SCHOOL_ART[id],header=pngHeader(asset(def.path));
  assert.deepEqual([header.width,header.height,header.color],[w,h,6]);
  assert.deepEqual([def.width,def.height,def.x,def.bottomY],[dw,dh,x,bottom]);
 }
 const source=readFileSync(new URL('../src/schoolyard-art.js',import.meta.url),'utf8');
 assert.ok(source.includes('.setDisplaySize(def.width,def.height).setDepth(12)'));
 assert.ok(source.includes('.setDepth(-18)'));
 assert.ok(source.includes("scene.add.image(def.x,def.bottomY,def.key).setOrigin(.5,1)"));
 assert.ok(source.includes('n(16)===SCHOOL_WORLD.width&&n(20)===SCHOOL_WORLD.height'));
});

test('school, chapel and bicycle rack collision boxes follow actual lower opaque bands, not padded canvases',()=>{
 const bands={school:330,chapel:142,bicycleRack:163};
 for(const id of ['school','chapel','bicycleRack']){
  const a=SCHOOL_ART[id],o=SCHOOL_VISIBLE_FOOTPRINTS[id],alpha=alphaBounds(asset(a.path),bands[id]);
  const native=pngHeader(asset(a.path)),scaleX=a.width/native.width,scaleY=a.height/native.height;
  const left=a.x-a.width/2,top=a.bottomY-a.height;
  const x0=left+alpha.minX*scaleX,x1=left+alpha.maxX*scaleX;
  const y1=top+alpha.maxY*scaleY;
  assert.ok(o.width<a.width&&o.height<a.height,'transparent PNG margins are non-solid: '+id);
  assert.ok(o.x-o.width/2>=x0-22&&o.x+o.width/2<=x1+22,'ground-contact width matches visible alpha '+id);
  assert.ok(o.y+o.height/2>=y1-7&&o.y+o.height/2<=y1+24,'ground-contact bottom follows visible alpha '+id);
  assert.ok(o.y-o.height/2<y1&&o.y-o.height/2>=top,'solid lower band, not entire canvas '+id);
  assert.equal(schoolWalkable(o),false);
 }
 // Transparent roof/canvas margins no longer block an otherwise walkable player.
 assert.ok(schoolWalkable({x:1110,y:280}));
 assert.ok(schoolWalkable({x:330,y:750}));
 assert.ok(schoolWalkable({x:1510,y:690}));
});

test('five approved Act I pieces surround the pitch without crowding centre or story locations',()=>{
 const extras=SCHOOL_OBSTACLES.slice(3);
 assert.deepEqual(extras.map(x=>x.type),['tire_pile','tire_pile','toi_toi','rock','rock']);
 assert.equal(FOREST_ATLAS.path,'obstacles/forest-obstacles.png');
 assert.deepEqual(extras.map(obstacleArt).map(a=>a.frame),[10,10,9,0,1]);
 for(const point of [
  SCHOOL_PLACES.playerStart,SCHOOL_PLACES.chapelDoor,SCHOOL_PLACES.schoolEntrance,
  SCHOOL_PLACES.maciek,SCHOOL_PLACES.seba,SCHOOL_PLACES.pitch,
  SCHOOL_PLACES.pitchApproach,BLAZEJ_START,CHAPEL_RETURN,
  ...Object.values(SCHOOL_HEART_POINTS),...SCHOOL_ENTOURAGE])
  assert.ok(schoolWalkable(point,PLAYER_RADIUS),'story/spawn point blocked '+JSON.stringify(point));
 const nav=reachableCells({width:SCHOOL_WORLD.width,height:SCHOOL_WORLD.height,cellSize:20,
  actorRadius:ENEMY_TYPES.zubrokryptyda.radius,origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});
 assert.ok(nav.visited>0);
 for(const target of [
  SCHOOL_PLACES.maciek,SCHOOL_PLACES.seba,SCHOOL_PLACES.pitchApproach,
  BLAZEJ_START,SCHOOL_PLACES.schoolEntrance,
  {x:1510,y:930},...Object.values(SCHOOL_HEART_POINTS),...SCHOOL_ENTOURAGE])
  assert.ok(nav.isReachable(target),'heavy-enemy-size corridor reachable '+JSON.stringify(target));
 const playerNav=reachableCells({width:SCHOOL_WORLD.width,height:SCHOOL_WORLD.height,cellSize:12,
  actorRadius:PLAYER_RADIUS,origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});
 assert.ok(playerNav.isReachable(SCHOOL_PLACES.chapelDoor),'player/Captain chapel approach reachable');
 assert.ok(playerNav.isReachable({x:1510,y:875}),'Aloes can approach bicycle rack on visible lower side');
});

test('existing swept motion, projectiles, spawn checks and boss jump respect the compact solids',()=>{
 const chapel={x:330,y:1020};
 for(let i=0,p=chapel;i<45;i++){
  p=schoolStep(p,{x:0,y:-1},50);
  assert.ok(schoolWalkable(p),'Aloes penetrated lower chapel foundation');
 }
 const shot=segmentObstacleHit({x:800,y:450},{x:1750,y:450},SCHOOL_OBSTACLES,4);
 assert.equal(shot?.id,'school');
 const rack=segmentObstacleHit({x:1350,y:800},{x:1700,y:800},SCHOOL_OBSTACLES,4);
 assert.equal(rack?.id,'bicycleRack');
 let enemy={type:'bobrozombi',x:940,y:450,hp:3,seed:2};
 for(let i=0;i<60;i++){
  const goal={x:1640,y:450},desired={x:enemy.x+10,y:enemy.y};
  const next=steerObstacleStep(enemy,desired,goal,ENEMY_TYPES.bobrozombi.radius,SCHOOL_OBSTACLES);
  enemy.x=next.x;enemy.y=next.y;
  assert.ok(schoolWalkable(enemy,ENEMY_TYPES.bobrozombi.radius),'enemy entered building');
 }
 const landing=blazejJumpLanding(BLAZEJ_START,{x:1430,y:470},SCHOOL_OBSTACLES);
 assert.ok(landing&&schoolWalkable(landing,BLAZEJ_RADIUS));
 const nav=reachableCells({width:1800,height:1200,cellSize:20,
  actorRadius:ENEMY_TYPES.zubrokryptyda.radius,origin:SCHOOL_PLACES.playerStart,obstacles:SCHOOL_OBSTACLES});
 for(const type of ['bobrozombi','bocianolak','zubrokryptyda']){
  const p=selectOrdinarySpawn({player:SCHOOL_PLACES.pitchApproach,obstacles:SCHOOL_OBSTACLES,
   index:10,radius:ENEMY_TYPES[type].radius,view:{x:650,y:580,width:850,height:450},
   navigation:nav,seed:104,occupied:[]});
  assert.ok(p.point&&schoolWalkable(p.point,ENEMY_TYPES[type].radius),'safe ordinary spawn '+type);
 }
});
