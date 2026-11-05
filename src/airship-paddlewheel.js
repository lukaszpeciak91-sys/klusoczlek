// Act II's approved stern wheel is a single centered Image, not an animation atlas.
// Keep the existing hull mounting point and preserve the source PNG's aspect ratio.
export const PADDLEWHEEL_MOUNT=Object.freeze({x:879,y:268,diameter:136,depth:3});
export const PADDLEWHEEL_DEGREES_PER_SECOND=25;
export const PADDLEWHEEL_RADIANS_PER_SECOND=PADDLEWHEEL_DEGREES_PER_SECOND*Math.PI/180;

export function paddlewheelDisplaySize(width,height,diameter=PADDLEWHEEL_MOUNT.diameter){
  if(!(width>0&&height>0))throw new RangeError('Invalid paddlewheel texture size');
  const scale=diameter/Math.max(width,height);
  return {width:width*scale,height:height*scale};
}
export function advancePaddlewheelAngle(angle,deltaMs){
  // The scene update stops while paused/unfocused. Bound a resume-frame spike,
  // but preserve real-time angular speed at frame rates down to 10fps.
  const elapsed=Math.max(0,Math.min(100,Number.isFinite(deltaMs)?deltaMs:0));
  return (angle+elapsed*PADDLEWHEEL_RADIANS_PER_SECOND/1000)%(Math.PI*2);
}
