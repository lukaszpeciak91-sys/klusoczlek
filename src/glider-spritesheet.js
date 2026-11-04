// Approved hang-glider.png: one horizontal row of eight 320x320 RGBA frames.
// Visual order, left to right: W, SW, S, SE, E, NE, N, NW.
// These are painted directional views; do not rotate the sprites.
export const GLIDER_FRAME_SIZE=320;
export const GLIDER_SHEET_WIDTH=2560;
export const GLIDER_SHEET_HEIGHT=320;
export const GLIDER_DIRECTION_ORDER=Object.freeze(['w','sw','s','se','e','ne','n','nw']);

export function flightDirectionFrame(from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<1e-6)return 4;
  // Clockwise from east: E, SE, S, SW, W, NW, N, NE.
  const octant=((Math.round(Math.atan2(dy,dx)/(Math.PI/4))%8)+8)%8;
  return [4,3,2,1,0,7,6,5][octant];
}
