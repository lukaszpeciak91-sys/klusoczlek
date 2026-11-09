// Błażej-only visual jump. Logical ground coordinates are linear, collision is
// validated for the entire swept segment before launch; visual lift is separate.
export const BLAZEJ_JUMP_DURATION_MS=360;
export const BLAZEJ_JUMP_LIFT_PX=55;
export function blazejJumpFrame(start,end,elapsed,duration=BLAZEJ_JUMP_DURATION_MS){
 const t=Math.max(0,Math.min(1,elapsed/Math.max(1,duration)));
 const arc=Math.sin(Math.PI*t);
 return {x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,
  lift:arc*BLAZEJ_JUMP_LIFT_PX,shadowScale:1-arc*.38,complete:t===1};
}
