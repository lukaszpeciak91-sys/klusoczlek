// PR51: deterministic, bounded, gameplay-clock-driven ordinary encounter director.
// This module owns no Phaser objects or timers. One tick permits at most one spawn.
export const PROFILES=Object.freeze([
 {target:4,cap:6,weights:[100,0,0]},
 {target:5,cap:7,weights:[70,30,0]},
 {target:6,cap:8,weights:[55,35,10]},
 {target:7,cap:9,weights:[45,40,15]},
 {target:7,cap:9,weights:[40,45,15]},
 {target:8,cap:10,weights:[35,45,20]}
].map(p=>Object.freeze({...p,weights:Object.freeze(p.weights)})));
export const TYPES=Object.freeze(['bobrozombi','bocianolak','zubrokryptyda']);
export const PREBOSS_STOP_MS=242000;
export const MIX_WINDOW=40;
export function createDirector(seed=0){
 return {seed:seed>>>0,nextMs:0,ordinal:0,attempts:0,success:0,counts:PROFILES.map(()=>[0,0,0]),history:PROFILES.map(()=>[])};
}
export function directorPopulation(enemies,view,player){
 let living=0,visible=0,nearby=0,heavy=false;
 for(const e of enemies){
  if(e.dead||e.hp<=0||e.encounterId||e.type==='marcin')continue;
  living++;
  if(e.type==='zubrokryptyda')heavy=true;
  const r=e.type==='zubrokryptyda'?58:e.type==='bocianolak'?43:32;
  if(e.x+r>=view.x&&e.x-r<=view.x+view.width&&e.y+r>=view.y&&e.y-r<=view.y+view.height)visible++;
  if(Math.hypot(e.x-player.x,e.y-player.y)<=Math.max(280,Math.min(view.width,view.height)*.8))nearby++;
 }
 return {living,visible,nearby,heavy};
}
function hash(x){x=Math.imul(x^x>>>16,0x7feb352d);x=Math.imul(x^x>>>15,0x846ca68b);return (x^x>>>16)>>>0;}
export function nextDirectorType(d,wave,blocked=[],priority=[]){
 const p=PROFILES[wave],counts=d.counts[wave];
 const permitted=TYPES.map((type,i)=>({type,i})).filter(o=>p.weights[o.i]>0&&!blocked.includes(o.type));
 if(!permitted.length)return null;
 for(const type of priority)if(permitted.some(o=>o.type===type))return type;
 const sum=counts.reduce((a,b)=>a+b,0)+1;
 permitted.sort((a,b)=>{
  const da=sum*p.weights[a.i]/100-counts[a.i],db=sum*p.weights[b.i]/100-counts[b.i];
  const diff=db-da;
  return Math.abs(diff)>0.00001?diff:hash(d.seed^d.ordinal^Math.imul(a.i+1,7919))-hash(d.seed^d.ordinal^Math.imul(b.i+1,7919));
 });
 return permitted[0].type;
}
export function recordDirectorSpawn(d,wave,type){
 const i=TYPES.indexOf(type);if(i<0)return false;
 const history=d.history[wave];history.push(i);d.counts[wave][i]++;
 if(history.length>MIX_WINDOW)d.counts[wave][history.shift()]--;
 d.success++;return true;
}
export function directorOpportunity(d,{elapsedMs,wave,population,active=true,introPending=false}){
 if(!active||!Number.isFinite(elapsedMs))return {due:false};
 if(elapsedMs<d.nextMs)return {due:false};
 const p=PROFILES[wave],preboss=elapsedMs>=PREBOSS_STOP_MS;
 const low=population.visible===0&&population.nearby===0;
 const interval=low?480:1150;
 const jitter=hash(d.seed^Math.imul(++d.ordinal,0x9e3779b9))%(low?180:351);
 d.nextMs=elapsedMs+interval-(low?90:175)+jitter;
 // Preboss: do not replace survivors; after handoff, boss owns all spawning.
 if(preboss)return {due:true,spawn:false,reason:'boss-handoff'};
 if(population.living>=p.cap)return {due:true,spawn:false,reason:'hard-cap'};
 if(population.living>=p.target&&!introPending&&!(low&&population.living<p.cap))return {due:true,spawn:false,reason:'soft-target'};
 d.attempts++;
 return {due:true,spawn:true,low};
}
