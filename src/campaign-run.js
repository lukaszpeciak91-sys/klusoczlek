import {FIRST_ACT_ID,getAct,nextAct,sceneForAct} from './campaign.js';
import {ENCOUNTER} from './bobrozombi.js';
import {WEAPON_ORDER} from './weapon-progression.js';

export const CAMPAIGN_RUN_KEY='campaign-run';
export const MARCIN_MOHAWK_ID='marcin-mohawk';
const STARTING_WEAPON_ID=WEAPON_ORDER[0];

// Game registry owns this volatile run across Phaser scene shutdown/restart.
// Arena combat state remains authoritative until an explicit sync or completion.
export function createCampaignRun(){
  return {
    actId:FIRST_ACT_ID,
    hp:ENCOUNTER.playerMaxHp,maxHp:ENCOUNTER.playerMaxHp,
    unlockedWeapons:new Set([STARTING_WEAPON_ID]),selectedWeapon:STARTING_WEAPON_ID,
    artifacts:new Set(),completedActs:new Set(),
    stats:{kills:0,activeCombatMs:0,byAct:{}},
    upgrades:new Set(),
  };
}
export function beginCampaignRun(game){
  const run=createCampaignRun();
  game.registry.set(CAMPAIGN_RUN_KEY,run);
  return run;
}
export function currentCampaignRun(game){
  return game.registry.get(CAMPAIGN_RUN_KEY)??beginCampaignRun(game);
}
export function updateRunHealth(run,hp,maxHp=run.maxHp){
  if(!Number.isFinite(maxHp)||maxHp<1||!Number.isFinite(hp))return false;
  run.maxHp=Math.floor(maxHp);
  run.hp=Math.max(0,Math.min(run.maxHp,Math.floor(hp)));
  return true;
}
export function updateRunEquipment(run,unlocked,selected){
  const owned=new Set([...unlocked].filter(id=>typeof id==='string'&&id.length));
  // Future act weapons are accepted as IDs; only known starting IDs are defined here.
  if(!owned.size)return false;
  if(selected!==null&&selected!==undefined&&!owned.has(selected))return false;
  run.unlockedWeapons=owned;
  if(selected)run.selectedWeapon=selected;
  return true;
}
export function awardRunArtifact(run,id){
  if(typeof id!=='string'||!id)return false;
  const before=run.artifacts.size;
  run.artifacts.add(id);
  return run.artifacts.size!==before;
}
export function completeCampaignAct(run,actId,{hp,maxHp,unlockedWeapons,selectedWeapon,kills,activeCombatMs}){
  if(!getAct(actId)||run.actId!==actId||run.completedActs.has(actId))return false;
  if(!Number.isSafeInteger(kills)||kills<0||!Number.isFinite(activeCombatMs)||activeCombatMs<0)return false;
  if(!updateRunHealth(run,hp,maxHp))return false;
  if(!updateRunEquipment(run,unlockedWeapons,selectedWeapon))return false;
  const result={kills,activeCombatMs:Math.floor(activeCombatMs)};
  run.completedActs.add(actId);
  run.stats.byAct[actId]=result;
  run.stats.kills+=result.kills;
  run.stats.activeCombatMs+=result.activeCombatMs;
  return true;
}
export function snapshotCampaignRun(run){
  return {actId:run.actId,hp:run.hp,maxHp:run.maxHp,
    unlockedWeapons:new Set(run.unlockedWeapons),selectedWeapon:run.selectedWeapon,
    artifacts:new Set(run.artifacts),completedActs:new Set(run.completedActs),
    upgrades:new Set(run.upgrades),
    stats:{kills:run.stats.kills,activeCombatMs:run.stats.activeCombatMs,
      byAct:Object.fromEntries(Object.entries(run.stats.byAct).map(([id,result])=>[id,{...result}]))}};
}
export function nextActHandoff(run,registeredScenes){
  if(!getAct(run.actId)||!run.completedActs.has(run.actId))return null;
  const next=nextAct(run.actId);
  if(!next||!sceneForAct(next.id)||!registeredScenes.has(sceneForAct(next.id)))return null;
  return {actId:next.id,scene:sceneForAct(next.id),hp:run.hp,maxHp:run.maxHp,
    unlockedWeapons:new Set(run.unlockedWeapons),selectedWeapon:run.selectedWeapon,
    artifacts:new Set(run.artifacts),completedActs:new Set(run.completedActs),
    upgrades:new Set(run.upgrades),stats:{kills:run.stats.kills,activeCombatMs:run.stats.activeCombatMs}};
}
export function prepareActStart(run,handoff,registeredScenes){
  if(!handoff||!getAct(handoff.actId)||nextAct(run.actId)?.id!==handoff.actId||
      !run.completedActs.has(run.actId)||sceneForAct(handoff.actId)!==handoff.scene||
      !registeredScenes.has(handoff.scene))return false;
  run.actId=handoff.actId;
  return true;
}
