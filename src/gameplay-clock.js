// One monotonic active-play clock. No frame-delta cap: a slow visible frame still counts.
// Inactive boundaries invalidate the anchor to avoid charging MENU/dialogue/background time.
export function createGameplayClock(){return {elapsedMs:0,lastNow:null};}
export function advanceGameplayClock(clock,now,active){
 if(!active||!Number.isFinite(now)){clock.lastNow=null;return clock.elapsedMs;}
 if(clock.lastNow!==null)clock.elapsedMs+=Math.max(0,now-clock.lastNow);
 clock.lastNow=now;
 return clock.elapsedMs;
}
export function formatGameplayClock(ms){
 const seconds=Math.floor(Math.max(0,ms)/1000);
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
