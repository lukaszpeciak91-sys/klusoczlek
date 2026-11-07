export const HORN_ID='bogdan-hunting-horn';
export const ESCAPE_MS=60000;
export const FINALE_STATES=Object.freeze(['BOGDAN_ACTIVE','BOGDAN_DEFEATED','FINAL_DIALOGUE','ARTIFACT_REWARD','BOGDAN_EXPLOSION','ALOES_WARNING','ESCAPE_ACTIVE','ESCAPE_RETRY','CAPTAIN_EXTRACTION','ACT_III_COMPLETE']);
const NEXT={BOGDAN_ACTIVE:'BOGDAN_DEFEATED',BOGDAN_DEFEATED:'FINAL_DIALOGUE',FINAL_DIALOGUE:'ARTIFACT_REWARD',ARTIFACT_REWARD:'BOGDAN_EXPLOSION',BOGDAN_EXPLOSION:'ALOES_WARNING',ALOES_WARNING:'ESCAPE_ACTIVE',ESCAPE_ACTIVE:'CAPTAIN_EXTRACTION',CAPTAIN_EXTRACTION:'ACT_III_COMPLETE'};
export function createVolcanoFinaleState(){
 let state='BOGDAN_ACTIVE',remaining=ESCAPE_MS,checkpoint=false,completed=false;
 return {
  get state(){return state;},get remaining(){return remaining;},get checkpoint(){return checkpoint;},
  advance(expected){if(state!==expected||!NEXT[state])return false;state=NEXT[state];if(state==='ESCAPE_ACTIVE')checkpoint=true;if(state==='ACT_III_COMPLETE')completed=true;return true;},
  tick(delta){if(state!=='ESCAPE_ACTIVE')return false;remaining=Math.max(0,remaining-(Number.isFinite(delta)?Math.max(0,delta):0));if(remaining<0.000001){remaining=0;state='ESCAPE_RETRY';return true;}return false;},
  fail(){if(state!=='ESCAPE_ACTIVE')return false;state='ESCAPE_RETRY';return true;},
  retry(){if(state!=='ESCAPE_RETRY'||!checkpoint)return false;remaining=ESCAPE_MS;state='ESCAPE_ACTIVE';return true;},
  get completed(){return completed;}
 };
}
export function formatEscape(ms){const seconds=Math.ceil(Math.max(0,ms)/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
