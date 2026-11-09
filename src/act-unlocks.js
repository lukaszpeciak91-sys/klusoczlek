import {CAMPAIGN_ACTS,FIRST_ACT_ID,getAct,sceneForAct} from './campaign.js';
import {createCampaignRun,nextActHandoff,MARCIN_MOHAWK_ID} from './campaign-run.js';
import {CAMPAIGN_SAVE_KEY,readCampaignCheckpoint,serializeCampaignCheckpoint} from './campaign-save.js';
import {HORN_ID} from './volcano-finale.js';
import {BLAZEJ_BICYCLE_ID} from './school-finale.js';
import {WEAPON_ORDER,availableWeapons} from './weapon-progression.js';

export const ACT_UNLOCKS_KEY='klusoczlek-act-unlocks-v1';
const requiredArtifacts=[[],[MARCIN_MOHAWK_ID],[MARCIN_MOHAWK_ID],
 [MARCIN_MOHAWK_ID,HORN_ID],[MARCIN_MOHAWK_ID,HORN_ID,BLAZEJ_BICYCLE_ID]];
const safeStore=storage=>storage===undefined?globalThis.localStorage:storage;
const stageOf=id=>CAMPAIGN_ACTS.findIndex(act=>act.id===id);
const entryFromRaw=raw=>{
 const storage={getItem:key=>key===CAMPAIGN_SAVE_KEY?JSON.stringify(raw):null};
 return readCampaignCheckpoint(storage);
};
const decode=raw=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||
  !Number.isInteger(raw.highest)||raw.highest<1||raw.highest>5||
  !raw.entries||typeof raw.entries!=='object'||Array.isArray(raw.entries))return null;
 const entries={};
 if(Object.keys(raw.entries).some(id=>stageOf(id)<1||stageOf(id)>=raw.highest))return null;
 for(let index=1;index<raw.highest;index++){
  const id=CAMPAIGN_ACTS[index].id,run=entryFromRaw(raw.entries[id]);
  if(!run||run.actId!==id)return null;
  entries[id]=raw.entries[id];
 }
 return {version:1,highest:raw.highest,entries};
};
const readStored=storage=>{
 try{const value=safeStore(storage)?.getItem(ACT_UNLOCKS_KEY);
  return typeof value==='string'?decode(JSON.parse(value)):null;
 }catch{return null;}
};
const persist=(record,storage)=>{
 try{safeStore(storage)?.setItem(ACT_UNLOCKS_KEY,JSON.stringify(record));return true;}
 catch{return false;}
};
// Create an ACT ENTRY only from validated prior completed acts and actual
// inventory. Never use developer fixtures, invent rewards, or fake completions.
function entryFromRun(source,index){
 const act=CAMPAIGN_ACTS[index];
 if(!act||index===0)return null;
 const required=CAMPAIGN_ACTS.slice(0,index).map(a=>a.id);
 if(required.some(id=>!source.completedActs.has(id))||
  requiredArtifacts[index].some(id=>!source.artifacts.has(id)))return null;
 const run=createCampaignRun();
 run.actId=act.id;
 run.completedActs=new Set(required);
 run.artifacts=new Set(requiredArtifacts[index]);
 run.unlockedWeapons=new Set([...source.unlockedWeapons].filter(id=>
  WEAPON_ORDER.includes(id)));
 run.unlockedWeapons.add('blunderbuss');
 // The Act III water weapon is granted inside the Volcano opening, not on
 // entering the act. Historical ownership is not a selectable replay item.
 run.selectedWeapon=availableWeapons(run.unlockedWeapons,act.id).includes(source.selectedWeapon)?
  source.selectedWeapon:(run.unlockedWeapons.has('rifle')?'rifle':'blunderbuss');
 run.stats.byAct={};
 for(const id of required){
  const s=source.stats.byAct[id];
  if(!s||!Number.isSafeInteger(s.kills)||s.kills<0||
    !Number.isFinite(s.activeCombatMs)||s.activeCombatMs<0)return null;
  run.stats.byAct[id]={kills:s.kills,activeCombatMs:s.activeCombatMs};
 }
 run.stats.kills=Object.values(run.stats.byAct).reduce((n,s)=>n+s.kills,0);
 run.stats.activeCombatMs=Object.values(run.stats.byAct).reduce((n,s)=>n+s.activeCombatMs,0);
 const serialized=serializeCampaignCheckpoint(run,act.id);
 return serialized?JSON.parse(serialized):null;
}
function migrate(storage){
 const checkpoint=readCampaignCheckpoint(storage);
 const record={version:1,highest:1,entries:{}};
 if(!checkpoint)return record;
 const highest=stageOf(checkpoint.actId)+1;
 for(let index=1;index<highest;index++){
  const raw=entryFromRun(checkpoint,index);
  if(!raw)return record;
  record.entries[CAMPAIGN_ACTS[index].id]=raw;
 }
 record.highest=highest;
 persist(record,storage);
 return record;
}
export function readActUnlocks(storage){
 return readStored(storage)??migrate(storage);
}
export function actIsUnlocked(id,storage){
 const index=stageOf(id);
 return index>=0&&index<readActUnlocks(storage).highest;
}
export function recordActCompletion(run,actId,storage){
 if(!run||run.isDebugRun||run.isReplayRun||run.actId!==actId||
  !run.completedActs?.has(actId))return false;
 const index=stageOf(actId);
 if(index<0||CAMPAIGN_ACTS.slice(0,index+1).some(a=>!run.completedActs.has(a.id)))return false;
 const next=index+1;
 const record=readActUnlocks(storage);
 if(next<CAMPAIGN_ACTS.length){
  const snapshot=entryFromRun(run,next);
  if(!snapshot)return false;
  record.entries[CAMPAIGN_ACTS[next].id]=snapshot;
  // A completion may follow a fresh NOWA GRA after all acts were unlocked.
  // Preserve previous higher entries and never downgrade the unlock ceiling.
  record.highest=Math.max(record.highest,next+1);
 }
 return persist(record,storage);
}
export function createActReplay(id,storage){
 const index=stageOf(id),record=readActUnlocks(storage);
 if(index<0||index>=record.highest)return null;
 let run;
 if(index===0)run=createCampaignRun();
 else{
  const raw=record.entries[id];
  run=raw?entryFromRaw(raw):null;
  if(!run)return null;
 }
 run.isReplayRun=true;
 if(index===0)return {run,handoff:null};
 const current=CAMPAIGN_ACTS[index],previous=CAMPAIGN_ACTS[index-1];
 run.actId=previous.id;
 const handoff=nextActHandoff(run,new Set(CAMPAIGN_ACTS.map(a=>a.scene)));
 if(!handoff||handoff.actId!==current.id||handoff.scene!==sceneForAct(id))return null;
 return {run,handoff};
}
