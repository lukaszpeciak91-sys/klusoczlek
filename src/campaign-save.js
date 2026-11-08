import {createCampaignRun,MARCIN_MOHAWK_ID,snapshotCampaignRun,WATER_FLAMETHROWER_ID} from './campaign-run.js';
import {FIRST_ACT_ID,getAct,sceneForAct} from './campaign.js';
import {HORN_ID} from './volcano-finale.js';
import {ENCOUNTER} from './bobrozombi.js';
import {WEAPON_ORDER,availableWeapons} from './weapon-progression.js';

// Backwards-compatible v1: only stable act-entry checkpoints are persisted.
// Runtime HP, live combat, DEBUG and the temporary Act III water selection
// are never fabricated by the loader.
export const CAMPAIGN_SAVE_KEY='klusoczlek-campaign-v1';
export const CAMPAIGN_SAVE_VERSION=1;
const STAGES=Object.freeze(['act1','act2','act3','act4']);
const MAX_SAFE=Number.MAX_SAFE_INTEGER;
const validInteger=(n,max=MAX_SAFE)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const validList=items=>Array.isArray(items)&&items.every(x=>typeof x==='string'&&x.length>0&&x.length<=100)&&new Set(items).size===items.length;

function parseCheckpoint(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==CAMPAIGN_SAVE_VERSION)return null;
  const act=getAct(raw.actId),stage=STAGES.indexOf(raw.actId);
  if(!act||!sceneForAct(raw.actId)||stage<0)return null;
  if(raw.maxHp!==ENCOUNTER.playerMaxHp||raw.hp!==raw.maxHp)return null;
  const lists=['unlockedWeapons','artifacts','completedActs','upgrades'];
  if(!lists.every(key=>validList(raw[key])))return null;
  const owned=new Set(raw.unlockedWeapons),completed=new Set(raw.completedActs),artifacts=new Set(raw.artifacts);
  if(!owned.has('blunderbuss')||[...owned].some(id=>![...WEAPON_ORDER,WATER_FLAMETHROWER_ID].includes(id)))return null;
  if(raw.upgrades.length!==0)return null;
  if(raw.selectedWeapon!==null&&
    (typeof raw.selectedWeapon!=='string'||!availableWeapons(owned,act.id).includes(raw.selectedWeapon)))return null;
  // The water gun is awarded only *inside* Act III, not in an Act III entry save.
  if(stage<3&&owned.has(WATER_FLAMETHROWER_ID))return null;
  if(stage===0&&(raw.unlockedWeapons.length!==1||raw.selectedWeapon!==null))return null;
  const requiredCompleted=STAGES.slice(0,stage);
  if(completed.size!==requiredCompleted.length||requiredCompleted.some(id=>!completed.has(id)))return null;
  const requiredArtifacts=stage>=3?[MARCIN_MOHAWK_ID,HORN_ID]:stage>=1?[MARCIN_MOHAWK_ID]:[];
  if(artifacts.size!==requiredArtifacts.length||requiredArtifacts.some(id=>!artifacts.has(id)))return null;
  const s=raw.stats;
  if(!s||typeof s!=='object'||Array.isArray(s)||!validInteger(s.kills)||!validNumber(s.activeCombatMs)||
    !s.byAct||typeof s.byAct!=='object'||Array.isArray(s.byAct))return null;
  const entries=Object.entries(s.byAct);
  if(entries.length!==completed.size||
    entries.some(([id,v])=>!completed.has(id)||!v||!validInteger(v.kills)||!validNumber(v.activeCombatMs)))return null;
  const sumKills=entries.reduce((n,[,v])=>n+v.kills,0);
  const sumMs=entries.reduce((n,[,v])=>n+v.activeCombatMs,0);
  if(sumKills!==s.kills||Math.abs(sumMs-s.activeCombatMs)>0.01)return null;
  if(stage===0&&(s.kills!==0||s.activeCombatMs!==0))return null;
  const run=createCampaignRun();
  run.actId=raw.actId;run.hp=raw.hp;run.maxHp=raw.maxHp;
  run.unlockedWeapons=owned;run.selectedWeapon=raw.selectedWeapon;
  run.artifacts=artifacts;run.completedActs=completed;run.upgrades=new Set(raw.upgrades);
  run.stats={kills:s.kills,activeCombatMs:s.activeCombatMs,
    byAct:Object.fromEntries(entries.map(([id,v])=>[id,{kills:v.kills,activeCombatMs:v.activeCombatMs}]))};
  return run;
}

export function serializeCampaignCheckpoint(run,actId=run?.actId){
  if(!run||run.isDebugRun||!getAct(actId)||!sceneForAct(actId))return null;
  const snap=snapshotCampaignRun(run);
  const raw={version:CAMPAIGN_SAVE_VERSION,actId,hp:snap.maxHp,maxHp:snap.maxHp,
    unlockedWeapons:[...snap.unlockedWeapons],selectedWeapon:snap.selectedWeapon,
    artifacts:[...snap.artifacts],completedActs:[...snap.completedActs],
    upgrades:[...snap.upgrades],stats:snap.stats};
  return parseCheckpoint(raw)?JSON.stringify(raw):null;
}
export function readCampaignCheckpoint(storage){
  try{
    const store=storage===undefined?globalThis.localStorage:storage;
    const value=store?.getItem(CAMPAIGN_SAVE_KEY);
    return typeof value==='string'?parseCheckpoint(JSON.parse(value)):null;
  }catch{return null;}
}
export function writeCampaignCheckpoint(run,actId=run?.actId,storage){
  const payload=serializeCampaignCheckpoint(run,actId);
  if(!payload)return false;
  try{
    const store=storage===undefined?globalThis.localStorage:storage;
    if(!store||typeof store.setItem!=='function')return false;
    store.setItem(CAMPAIGN_SAVE_KEY,payload);
    return true;
  }catch{return false;}
}
