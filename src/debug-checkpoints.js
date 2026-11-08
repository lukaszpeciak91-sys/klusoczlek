import {createCampaignRun,MARCIN_MOHAWK_ID,nextActHandoff} from './campaign-run.js';
import {ENCOUNTER} from './bobrozombi.js';

// Temporary development-only destinations. Never expose the unimplemented acts.
export const DEBUG_CHECKPOINTS=Object.freeze([
  Object.freeze({id:'act1-opening',actId:'act1',scene:'Arena',label:'AKT I — POCZĄTEK'}),
  Object.freeze({id:'act1-marcin',actId:'act1',scene:'Arena',label:'AKT I — MARCIN'}),
  Object.freeze({id:'act1-ending',actId:'act1',scene:'Arena',label:'AKT I — DIALOG KOŃCOWY'}),
  Object.freeze({id:'act1-results',actId:'act1',scene:'Arena',label:'AKT I — WYNIKI'}),
  Object.freeze({id:'act2-opening',actId:'act2',scene:'Airship',label:'AKT II — POCZĄTEK'}),
  Object.freeze({id:'act2-defense',actId:'act2',scene:'Airship',label:'AKT II — OBRONA'}),
  Object.freeze({id:'act2-last15',actId:'act2',scene:'Airship',label:'AKT II — OSTATNIE 15 S'}),
  Object.freeze({id:'act2-results',actId:'act2',scene:'Airship',label:'AKT II — ZAKOŃCZENIE'}),
  Object.freeze({id:'act3-opening',actId:'act3',scene:'Volcano',label:'AKT III — POCZĄTEK'}),
  Object.freeze({id:'act3-lawos',actId:'act3',scene:'Volcano',label:'AKT III — KRZYŚ / ANDRZEJEK'}),
  Object.freeze({id:'act3-fairy',actId:'act3',scene:'Volcano',label:'AKT III — ŚWINIA-WRÓŻKA'}),
  Object.freeze({id:'act3-apartment',actId:'act3',scene:'Volcano',label:'AKT III — MARLENA / BOGDAN'}),
  Object.freeze({id:'act3-boss',actId:'act3',scene:'Volcano',label:'AKT III — WALKA Z BOGDANEM'}),
  Object.freeze({id:'act3-escape',actId:'act3',scene:'Volcano',label:'AKT III — UCIECZKA'}),
]);
export const DEBUG_IDS=new Set(DEBUG_CHECKPOINTS.map(item=>item.id));

export function createDebugFixture(id){
  const checkpoint=DEBUG_CHECKPOINTS.find(item=>item.id===id);
  if(!checkpoint)return null;
  const run=createCampaignRun();
  if(checkpoint.actId==='act1'){
    if(id!=='act1-opening'){
      run.unlockedWeapons=new Set(['blunderbuss','rifle','flamethrower']);
      run.selectedWeapon='rifle';
      run.hp=ENCOUNTER.playerMaxHp;
    }
    if(id==='act1-ending'||id==='act1-results')run.artifacts.add(MARCIN_MOHAWK_ID);
    return {checkpoint,run,handoff:null};
  }
  // A valid Act I predecessor, without replaying its combat or changing gameplay rules.
  run.completedActs.add('act1');
  run.artifacts.add(MARCIN_MOHAWK_ID);
  run.unlockedWeapons=new Set(['blunderbuss','rifle','flamethrower']);
  run.selectedWeapon='rifle';
  run.stats.byAct.act1={kills:42,activeCombatMs:240000};
  run.stats.kills=42;run.stats.activeCombatMs=240000;
  if(checkpoint.actId==='act3'){
    run.completedActs.add('act2');
    run.stats.byAct.act2={kills:0,activeCombatMs:180000};
    run.stats.activeCombatMs+=180000;
    run.actId='act2';
  }
  const handoff=nextActHandoff(run,new Set(['Arena','Airship','Volcano']));
  return handoff?{checkpoint,run,handoff}:null;
}
