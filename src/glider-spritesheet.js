// Approved hang-glider.png: one horizontal row of eight 320x320 RGBA frames.
// Actual painted order, left to right: E, SE, S, SW, W, NW, N, NE.
// These are painted directional views; do not rotate the sprites.
export const GLIDER_FRAME_SIZE=320;
export const GLIDER_SHEET_WIDTH=2560;
export const GLIDER_SHEET_HEIGHT=320;
export const GLIDER_DIRECTION_ORDER=Object.freeze(['e','se','s','sw','w','nw','n','ne']);

export function flightDirectionFrame(from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<1e-6)return 0;
  // Clockwise from east: E, SE, S, SW, W, NW, N, NE.
  const octant=((Math.round(Math.atan2(dy,dx)/(Math.PI/4))%8)+8)%8;
  return octant;
}
