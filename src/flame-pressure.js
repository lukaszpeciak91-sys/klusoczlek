// Pure, frame-rate-independent flamethrower resource. Values are percentages.
export const PRESSURE=Object.freeze({max:100,drainMs:3000,regenMs:2000,igniteAt:20,maxStepMs:50});
export function createPressure(){return {value:100,locked:false,wasHeld:false,active:false};}
export function stepPressure(state,held,deltaMs){
 const ms=Math.max(0,Math.min(PRESSURE.maxStepMs,Number.isFinite(deltaMs)?deltaMs:0));
 if(!held){state.wasHeld=false;state.locked=false;state.active=false;state.value=Math.min(100,state.value+100*ms/PRESSURE.regenMs);return false;}
 if(!state.wasHeld){
  state.wasHeld=true;
  state.active=!state.locked&&state.value>=PRESSURE.igniteAt;
 }
 if(state.locked||!state.active){state.active=false;state.value=Math.min(100,state.value+100*ms/PRESSURE.regenMs);return false;}
 // The frame that exhausts the resource may perform its last damage tick;
 // the next frame is blocked until a genuine release.
 state.value=Math.max(0,state.value-100*ms/PRESSURE.drainMs);
 if(state.value===0){state.locked=true;state.active=false;return false;}
 return true;
}
export function cancelPressureTrigger(state){state.wasHeld=false;state.active=false;state.locked=true;}
