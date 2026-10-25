// Contract-only pure functions; no combat entities or fire loops in this PR.
export const FACINGS = Object.freeze(['e','se','s','sw','w','nw','n','ne']);
export const STATES = Object.freeze(['idle','walk','fire']);
export function unitVector(x,y,deadzone=0) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return {x:0,y:0};
  const magnitude=Math.hypot(x,y);
  if (magnitude<=deadzone) return {x:0,y:0};
  return {x:x/magnitude,y:y/magnitude};
}
export function facingOf(x,y,fallback='s') {
  if (!x && !y) return fallback;
  const index=((Math.round(Math.atan2(y,x)/(Math.PI/4))%8)+8)%8;
  return FACINGS[index];
}
export function resolvePose({movement={x:0,y:0},aim={x:0,y:0},aimActive=false,lastFacing='s'}={}) {
  const move=unitVector(movement.x,movement.y);
  const shot=aimActive?unitVector(aim.x,aim.y):{x:0,y:0};
  const shooting=aimActive && (shot.x!==0 || shot.y!==0);
  const facing=shooting?facingOf(shot.x,shot.y,lastFacing):facingOf(move.x,move.y,lastFacing);
  const moving=move.x!==0||move.y!==0;
  return {movement:move,aim:shot,shooting,facing,animation:`${shooting?'fire':moving?'walk':'idle'}_${facing}`};
}
export const PLAYER_FRAME_SIZE=64;
export const PLAYER_FRAMES_PER_DIRECTION=4;
export function playerFrame(state,facing,phase=0) {
  const stateIndex=STATES.indexOf(state),directionIndex=FACINGS.indexOf(facing);
  if(stateIndex<0||directionIndex<0||!Number.isInteger(phase)||phase<0||phase>=PLAYER_FRAMES_PER_DIRECTION) throw new RangeError('Invalid player frame');
  return stateIndex*32+directionIndex*4+phase;
}
