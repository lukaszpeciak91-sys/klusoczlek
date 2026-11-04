import {createGameplayClock,advanceGameplayClock} from './gameplay-clock.js';

export const AIRSHIP_SURVIVAL_MS=180000;
export const AIRSHIP_GROUND_CAP=7;
export const AIRSHIP_GLIDER_CAP=2;
export const AIRSHIP_PHASES=Object.freeze([
  Object.freeze({from:0,to:60000,interval:6100}),
  Object.freeze({from:60000,to:120000,interval:4700}),
  Object.freeze({from:120000,to:180000,interval:3650}),
]);
export function createAirshipDefense(){
 return {clock:createGameplayClock(),elapsedMs:0,nextDeliveryMs:1250,deliveryOrdinal:0,
  state:'ready',kills:0,ended:false,result:null};
}
export function currentDefensePhase(ms){
 return AIRSHIP_PHASES.findIndex(phase=>ms<phase.to);
}
export function nextDeliverySpec(ordinal){
 const type=ordinal===0?'bobrozombi':ordinal%3===2?'bocianolak':'bobrozombi';
 const reverse=ordinal%2===1;
 return {id:'act2-delivery-'+ordinal,type,zoneId:reverse?'starboard-fore':'port-aft',
   from:reverse?{x:835,y:370}:{x:125,y:166},
   exit:reverse?{x:30,y:390}:{x:940,y:115}};
}
export function tickAirshipDefense(defense,now,{active,ground,airborne,pending}){
 if(defense.state!=='active'){advanceGameplayClock(defense.clock,0,false);return null;}
 defense.elapsedMs=advanceGameplayClock(defense.clock,now,active);
 if(!active)return null;
 if(defense.elapsedMs>=AIRSHIP_SURVIVAL_MS)return {outcome:'survived'};
 if(defense.elapsedMs<defense.nextDeliveryMs)return null;
 if(ground+pending>=AIRSHIP_GROUND_CAP||airborne>=AIRSHIP_GLIDER_CAP)return null;
 const ordinal=defense.deliveryOrdinal++;
 const spec=nextDeliverySpec(ordinal);
 const phase=AIRSHIP_PHASES[currentDefensePhase(defense.elapsedMs)];
 defense.nextDeliveryMs=defense.elapsedMs+phase.interval;
 return {delivery:spec};
}
export function finishAirshipDefense(defense,outcome){
 if(defense.ended||defense.state!=='active'||!['survived','defeat'].includes(outcome))return false;
 defense.ended=true;defense.state=outcome;defense.result={kills:defense.kills,activeCombatMs:Math.min(AIRSHIP_SURVIVAL_MS,defense.elapsedMs),outcome};
 advanceGameplayClock(defense.clock,0,false);
 return true;
}
