import {createGameplayClock,advanceGameplayClock} from './gameplay-clock.js';

export const AIRSHIP_SURVIVAL_MS=180000;
export const AIRSHIP_GROUND_CAP=7;
export const AIRSHIP_GLIDER_CAP=2;
// Phase configuration is deterministic. A group target is a number of
// *sequential* deliveries, never a simultaneous-spawn order.
export const AIRSHIP_PHASES=Object.freeze([
  Object.freeze({from:0,to:60000,groupMin:2,groupMax:3,launchMs:1800,groupMs:10800}),
  Object.freeze({from:60000,to:120000,groupMin:3,groupMax:4,launchMs:1450,groupMs:8500}),
  Object.freeze({from:120000,to:180000,groupMin:4,groupMax:5,launchMs:1150,groupMs:6600}),
]);
const SIDE_PATTERN=Object.freeze([0,1,1,0,1,0,0,1]);
const GROUP_LIMIT=2;
const FIRST_DELIVERY_MS=1250;

export function currentDefensePhase(ms){
 return ms>=AIRSHIP_SURVIVAL_MS?-1:AIRSHIP_PHASES.findIndex(phase=>ms<phase.to);
}
export function nextDeliverySpec(ordinal,phase=0,groupOrdinal=0,groupSlot=0){
 const side=SIDE_PATTERN[ordinal%SIDE_PATTERN.length];
 // Each phase has a growing but bounded Bocianołak proportion. The first
 // boarding party remains recognizable as primarily Bobrozombi.
 const bocianolak=phase===0?(groupSlot===2&&groupOrdinal%2===0):
   phase===1?((groupSlot+groupOrdinal)%3===2):
     ((groupSlot+groupOrdinal)%5===1||(groupSlot+groupOrdinal)%5===3);
 return {id:'act2-delivery-'+ordinal,type:bocianolak?'bocianolak':'bobrozombi',
   zoneId:side?'starboard-fore':'port-aft',
   from:side?{x:835,y:370}:{x:125,y:166},
   exit:side?{x:30,y:390}:{x:940,y:115}};
}
export function createAirshipDefense(){
 return {clock:createGameplayClock(),elapsedMs:0,nextDeliveryMs:FIRST_DELIVERY_MS,
  nextGroupMs:800,groupOrdinal:0,deliveryOrdinal:0,groups:[],plannedCount:0,
  state:'ready',kills:0,ended:false,result:null};
}
function planGroup(defense,elapsedMs){
 if(elapsedMs<defense.nextGroupMs||defense.groups.length>=GROUP_LIMIT)return;
 const phase=currentDefensePhase(elapsedMs);
 if(phase<0)return;
 const tune=AIRSHIP_PHASES[phase],ordinal=defense.groupOrdinal++;
 const size=tune.groupMin+((ordinal+phase)%2);
 defense.groups.push({id:ordinal,phase,size,launched:0});
 defense.plannedCount+=size;
 defense.nextGroupMs=elapsedMs+tune.groupMs;
}
export function tickAirshipDefense(defense,now,{active,ground,airborne,pending}){
 if(defense.state!=='active'){advanceGameplayClock(defense.clock,0,false);return null;}
 defense.elapsedMs=advanceGameplayClock(defense.clock,now,active);
 if(!active)return null;
 const elapsed=defense.elapsedMs;
 if(elapsed>=AIRSHIP_SURVIVAL_MS)return {outcome:'survived'};
 planGroup(defense,elapsed);
 if(elapsed<defense.nextDeliveryMs||!defense.groups.length)return null;
 // 'pending' is the sum of passengers still on occupied gliders and
 // descending passengers. Departing empty gliders consume only 'airborne'.
 if(ground+pending>=AIRSHIP_GROUND_CAP||airborne>=AIRSHIP_GLIDER_CAP){
  return null; // no speculative queue growth or expensive landing search
 }
 const group=defense.groups[0];
 const spec=nextDeliverySpec(defense.deliveryOrdinal++,group.phase,group.id,group.launched++);
 spec.groupId=group.id;
 if(group.launched>=group.size)defense.groups.shift();
 defense.nextDeliveryMs=elapsed+AIRSHIP_PHASES[group.phase].launchMs;
 // A deferred delivery can launch at most once in a tick; no catch-up burst.
 return {delivery:spec};
}
export function finishAirshipDefense(defense,outcome){
 if(defense.ended||defense.state!=='active'||!['survived','defeat'].includes(outcome))return false;
 defense.ended=true;defense.state=outcome;
 defense.result={kills:defense.kills,activeCombatMs:Math.min(AIRSHIP_SURVIVAL_MS,defense.elapsedMs),outcome};
 defense.groups.length=0;
 advanceGameplayClock(defense.clock,0,false);
 return true;
}
