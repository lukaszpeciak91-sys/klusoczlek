// PR51 R1: active-gameplay-time-only, bounded kill context for living visible introductions.
export const BOCIAN_WINDOW_MS=5000;
export const HEAVY_WINDOW_MS=8000;
export const MAX_DEATHS=32;
export function createIntroEvidence(){return {deaths:[],claims:new Set(),contexts:new Map()};}
export function rememberOrdinaryDeath(e,{type,wave,at,playerEarned=true,special=false}){
 if(!playerEarned||special||!Number.isFinite(at)||!['bobrozombi','bocianolak','zubrokryptyda'].includes(type))return false;
 e.deaths=e.deaths.filter(d=>at-d.at<=HEAVY_WINDOW_MS&&at>=d.at);
 e.deaths.push({type,wave,at});
 if(e.deaths.length>MAX_DEATHS)e.deaths.splice(0,e.deaths.length-MAX_DEATHS);
 return true;
}
export function introductionEvidence(e,id,{wave,at,visible,previousIntroduced=false,boss=false}){
 if(e.claims.has(id)||boss||!visible||!Number.isFinite(at))return null;
 if(id==='before-first-bocianolak'){
  if(wave<1)return null;
  const kills=e.deaths.filter(d=>d.type==='bobrozombi'&&d.wave>=1&&d.at<=at&&at-d.at<=BOCIAN_WINDOW_MS);
  return kills.length?{id,at,killTimes:[kills.at(-1).at]}:null;
 }
 if(id==='before-first-zubrokryptyda'){
  if(wave<2||!previousIntroduced)return null;
  const kills=e.deaths.filter(d=>d.at<=at&&at-d.at<=HEAVY_WINDOW_MS);
  if(kills.length<2||!kills.some(d=>d.wave>=2))return null;
  return {id,at,killTimes:kills.slice(-2).map(d=>d.at)};
 }
 return null;
}
export function claimIntroduction(e,context){
 if(!context||e.claims.has(context.id))return false;
 e.claims.add(context.id);e.contexts.set(context.id,Object.freeze({...context,killTimes:Object.freeze([...context.killTimes])}));
 return true;
}
