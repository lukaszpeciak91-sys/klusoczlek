// Three 10-second eruption chapters. Individual impulses are deliberately short;
// quiet gaps between them preserve mobile steering and terrain readability.
export const ERUPTION_SEQUENCES=Object.freeze([
 Object.freeze({id:'rupture',duration:2500,tint:0xffd1a4,beats:Object.freeze([
  Object.freeze({at:0,duration:300,intensity:.0052,glow:.62}),
  Object.freeze({at:730,duration:230,intensity:.0036,glow:.48}),
  Object.freeze({at:1540,duration:270,intensity:.0042,glow:.54})
 ])}),
 Object.freeze({id:'collapse',duration:3500,tint:0xffc797,beats:Object.freeze([
  Object.freeze({at:0,duration:300,intensity:.0055,glow:.68}),
  Object.freeze({at:790,duration:330,intensity:.0062,glow:.75}),
  Object.freeze({at:1610,duration:310,intensity:.0060,glow:.72}),
  Object.freeze({at:2440,duration:360,intensity:.0071,glow:.82})
 ])}),
 Object.freeze({id:'critical',duration:4000,tint:0xffe1b0,beats:Object.freeze([
  Object.freeze({at:0,duration:370,intensity:.0076,glow:.82}),
  Object.freeze({at:860,duration:410,intensity:.0085,glow:.90}),
  Object.freeze({at:1720,duration:430,intensity:.0095,glow:1}),
  Object.freeze({at:2690,duration:390,intensity:.0084,glow:.91})
 ])})
]);
export const ERUPTION_CYCLE_MS=ERUPTION_SEQUENCES.reduce((sum,s)=>sum+s.duration,0);
export const ERUPTION_GLOW_MS=720;
export function eruptionFrame(elapsedMs){
 if(!Number.isFinite(elapsedMs)||elapsedMs<0)return null;
 const cycle=Math.floor(elapsedMs/ERUPTION_CYCLE_MS);
 let within=elapsedMs%ERUPTION_CYCLE_MS,phase=0;
 while(phase<ERUPTION_SEQUENCES.length-1&&within>=ERUPTION_SEQUENCES[phase].duration){
  within-=ERUPTION_SEQUENCES[phase].duration;phase++;
 }
 const sequence=ERUPTION_SEQUENCES[phase];
 let beatIndex=-1;
 for(let i=0;i<sequence.beats.length;i++)if(sequence.beats[i].at<=within)beatIndex=i;
 const beat=sequence.beats[beatIndex],age=beat?within-beat.at:Infinity;
 const pulse=beat&&age<ERUPTION_GLOW_MS
  ?Math.sin(Math.PI*age/ERUPTION_GLOW_MS)*beat.glow:0;
 const shake=beat&&age<beat.duration
  ?{id:cycle*100+phase*10+beatIndex,duration:beat.duration,intensity:beat.intensity}:null;
 return {sequence:sequence.id,cycle,phaseElapsed:within,pulse,
  lavaAlpha:.86+.14*pulse,lavaTint:pulse>.18?sequence.tint:null,shake};
}
