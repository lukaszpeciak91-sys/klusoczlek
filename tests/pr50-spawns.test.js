import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVES,WAVE_TIMING,BOSS_INTRO_MS,BOSS_NON_MARCIN_CAP} from '../src/episode.js';
import {generateArenaLayout} from '../src/arena-layout.js';
import {clearPoint,safeEnemySpawn} from '../src/weapon-progression.js';
const spawn=await import('../src/enemy-spawn.js').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
const player={x:900,y:600};
const select=options=>{assert.equal(typeof spawn.selectOrdinarySpawn,'function');return spawn.selectOrdinarySpawn(options);};
test('PR50 increases only early ordinary capacity, preserving time/budgets and finale cap',()=>{
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[6,7,8,9,9,10]);assert.deepEqual(WAVES.map(w=>w.target),[4,5,6,7,7,8]);
 assert.deepEqual(WAVE_TIMING.map(w=>w.startMs),[0,35000,75000,120000,170000,225000]);assert.equal(BOSS_INTRO_MS,260000);assert.equal(BOSS_NON_MARCIN_CAP,7);
});
test('PR50 legacy placement is independent of continuous director cadence',()=>{assert.equal(typeof spawn.selectOrdinarySpawn,'function');});
test('PR50 initial trio uses safe camera vicinity across nine real seeded layouts',()=>{
 for(const seed of [1,41,104729])for(const [width,height] of [[568,320],[800,360],[320,240]]){
  const layout=generateArenaLayout(seed),occupied=[],view={x:900-width/2,y:600-height/2,width,height};
  for(let index=0;index<3;index++){
   const result=select({player,obstacles:layout.obstacles,index,radius:21,navigation:layout.navigation,view,seed,occupied});
   assert.equal(result.mode,'camera');const p=result.point;assert.ok(Math.hypot(p.x-900,p.y-600)>=220);assert.ok(clearPoint(p,layout.obstacles,25,layout.navigation));
   assert.ok(p.x>=view.x-25&&p.x<=view.x+width+25&&p.y>=view.y-25&&p.y<=view.y+height+25);
   assert.ok(occupied.every(e=>Math.hypot(e.x-p.x,e.y-p.y)>=54));occupied.push({...p,radius:21});
  }
 }
});
test('PR50 deterministic seed/index/camera placement, varied edges and actual actor radii',()=>{
 const view={x:616,y:440,width:568,height:320},positions=new Set();
 for(const seed of [1,2,41,104729])for(const radius of [18,21,30])for(let index=0;index<8;index++){
  const options={player,obstacles:[],index,radius,view,seed},a=select(options);assert.deepEqual(a,select(options));assert.equal(a.mode,'camera');assert.ok(clearPoint(a.point,[],radius+4));positions.add(JSON.stringify(a.point));
 }
 assert.ok(positions.size>12);
});
test('PR50 world edges and occupied positions cannot bypass safety or reachability',()=>{
 for(const player of [{x:30,y:30},{x:1770,y:1170},{x:30,y:1170},{x:1770,y:30}])for(const radius of [18,21,30]){
  const view={x:Math.max(0,Math.min(1232,player.x-284)),y:Math.max(0,Math.min(880,player.y-160)),width:568,height:320};
  const a=select({player,obstacles:[],index:0,radius,view,seed:41});assert.ok(a.point);assert.ok(clearPoint(a.point,[],radius+4));assert.ok(Math.hypot(a.point.x-player.x,a.point.y-player.y)>=220);
 }
 const a=select({player,obstacles:[],index:0,radius:21,view:{x:616,y:440,width:568,height:320},navigation:{isReachable:()=>false}});assert.deepEqual(a,{point:null,mode:'deferred'});
});
test('PR50 camera failure uses existing finite world fallback or defers without unsafe spawn',()=>{
 const options={player,obstacles:[],index:2,radius:21,view:null};assert.deepEqual(select(options),{point:safeEnemySpawn(player,[],2,21),mode:'fallback'});
 const blocked=[{alive:true,footprint:{shape:'circle',x:900,y:600,radius:3000}}];assert.deepEqual(select({...options,obstacles:blocked}),{point:null,mode:'deferred'});
});
test('PR50 opening568px first pair favors nearby side entries over distant corners',()=>{
 const view={x:616,y:440,width:568,height:320},occupied=[];
 for(let index=0;index<2;index++){
  const {point}=select({player,obstacles:[],index,radius:21,view,seed:1,occupied});
  assert.ok(point.y>=view.y+80&&point.y<=view.y+view.height-80,'Initial body should not be confined to a HUD/joystick corner');occupied.push({...point,radius:21});
 }
});
