// Pure deterministic final boss director. Rendering, projectiles and hitboxes
// are owned by CatacombsScene; this module defines the finite-state contract.
export const FINAL_BOSS=Object.freeze({
 hp:62,speed:64,projectileSpeed:245,projectileDamage:1,
 projectileRadius:4,maxProjectiles:38,
 maxSummons:3,maxSummonPhases:3,summonAt:Object.freeze([.72,.38,.16]),
 summonTimeoutMs:14000,transitionMs:1100,
 burstIntervalMs:215,burstCount:13,sweepRadians:Math.PI*1.55,
 cooldownMs:1850,telegraphMs:450,transformationMs:2250,
 invulnerabilityOnHitMs:95,contactRadius:31,contactCooldownMs:1400
});
export function createFinalBossState(){
 return {phase:'staging',hp:FINAL_BOSS.hp,maxHp:FINAL_BOSS.hp,
  defeated:false,summons:[],summonIndex:0,elapsed:0,shotClock:0,
  shotCount:0,telegraph:0,transitionClock:0,damageTaken:0,
  nextVolley:0,hitAt:-Infinity,defeatEvents:0};
}
export function finalBossVulnerable(state){
 return state.phase==='gun'&&!state.defeated;
}
export function finalBossDamage(state,amount,now=0){
 if(!finalBossVulnerable(state)||!Number.isFinite(amount)||amount<=0||
 now-state.hitAt<FINAL_BOSS.invulnerabilityOnHitMs)return false;
 state.hitAt=now;state.hp=Math.max(0,state.hp-amount);
 state.damageTaken+=amount;
 if(state.hp===0){state.defeated=true;state.phase='defeated';state.defeatEvents++;state.summons.length=0;}
 return true;
}
export function finalBossStart(state){if(state.phase!=='staging')return false;state.phase='gun';return true;}
export function finalBossBeginSummon(state){
 if(state.phase!=='gun'||state.defeated||state.summonIndex>=FINAL_BOSS.maxSummonPhases)return false;
 const threshold=FINAL_BOSS.summonAt[state.summonIndex];
 if(state.hp/state.maxHp>threshold)return false;
 state.summonIndex++;state.phase='summon';
 state.elapsed=0;state.shotCount=0;state.telegraph=0;
 return true;
}
export function finalBossAddSummon(state,enemy){
 if(state.phase!=='summon'||state.summons.length>=FINAL_BOSS.maxSummons)return false;
 state.summons.push(enemy);return true;
}
export function finalBossClearSummon(state,id){
 const at=state.summons.findIndex(e=>e.id===id);
 if(at<0)return false;
 state.summons.splice(at,1);
 if(!state.summons.length&&state.phase==='summon'){state.phase='gun';state.elapsed=0;state.telegraph=FINAL_BOSS.telegraphMs;}
 return true;
}
export function finalBossStep(state,delta){
 if(state.defeated)return {shots:[],summonTimeout:false};
 const dt=Math.max(0,Math.min(50,Number.isFinite(delta)?delta:0));
 if(state.phase==='summon'){
  state.elapsed+=dt;
  if(state.elapsed>=FINAL_BOSS.summonTimeoutMs){state.summons.length=0;state.phase='gun';state.elapsed=0;state.telegraph=FINAL_BOSS.telegraphMs;return {shots:[],summonTimeout:true};}
  if(!state.summons.length&&state.elapsed>=FINAL_BOSS.transitionMs){state.phase='gun';state.elapsed=0;}
  return {shots:[],summonTimeout:false};
 }
 if(state.phase!=='gun')return {shots:[],summonTimeout:false};
 if(state.telegraph>0){state.telegraph=Math.max(0,state.telegraph-dt);return {shots:[],summonTimeout:false};}
 state.elapsed+=dt;
 if(state.elapsed<FINAL_BOSS.cooldownMs)return {shots:[],summonTimeout:false};
 state.shotClock+=dt;
 if(state.shotClock<FINAL_BOSS.burstIntervalMs)return {shots:[],summonTimeout:false};
 state.shotClock=0;
 const index=state.shotCount++;
 const angleOffset=(index/(FINAL_BOSS.burstCount-1)-.5)*FINAL_BOSS.sweepRadians;
 if(state.shotCount>=FINAL_BOSS.burstCount){
  state.shotCount=0;state.elapsed=0;state.telegraph=FINAL_BOSS.telegraphMs;
 }
 return {shots:[angleOffset],summonTimeout:false};
}
