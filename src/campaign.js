// Narrative order and public-facing strings live here; unbuilt acts are not scenes.
export const CAMPAIGN_ACTS=Object.freeze([
  Object.freeze({id:'act1',number:1,label:'AKT I',title:'POBUDKA',scene:'Arena',nextActId:'act2'}),
  Object.freeze({id:'act2',number:2,label:'AKT II',title:'W PRZESTWORZACH',scene:'Airship',nextActId:'act3'}),
  Object.freeze({id:'act3',number:3,label:'AKT III',title:'PRZYTULNE M4 W CENTRUM WULKANU',scene:'Volcano',nextActId:'act4'}),
  Object.freeze({id:'act4',number:4,label:'AKT IV',title:'ROWER BŁAŻEJA',scene:'School',nextActId:'act5'}),
  Object.freeze({id:'act5',number:5,label:'AKT V',title:'TOŻSAMOŚĆ MARIANA',scene:'Catacombs',nextActId:null}),
]);
export const FIRST_ACT_ID=CAMPAIGN_ACTS[0].id;
export const FUTURE_ACT_ASSETS=Object.freeze([
  'arenas/airship-deck.png',
  'backgrounds/act2-sky.png',
  'backgrounds/act2-clouds-far.png',
  'backgrounds/act2-clouds-mid.png',
  'backgrounds/act2-clouds-near.png',
  'vehicles/hang-glider.png',
]);
export function getAct(id=FIRST_ACT_ID){return CAMPAIGN_ACTS.find(act=>act.id===id)??null;}
export function nextAct(id){const nextId=getAct(id)?.nextActId;return nextId?getAct(nextId):null;}
export function nextAvailableAct(id){const next=nextAct(id);return next?.scene?next:null;}
export function sceneForAct(id){return getAct(id)?.scene??null;}
// PR60 transition seam: results may eventually offer an upgrade and next act.
// Until an actual next scene exists, callers keep the existing victory/menu flow.
export function completionDestination(id){return nextAvailableAct(id)?.scene??null;}
