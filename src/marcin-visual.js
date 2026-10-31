// Approved source:256x256 frames E,SE,S,SW,W,NW,N,NE. Image is never edited.
export const MARCIN_ASSET=Object.freeze({path:'enemies/marcin.png',key:'enemy-marcin-v1',width:2048,height:256,frameWidth:256,frameHeight:256});
export const MARCIN_VISUAL_SCALE=0.68;
// Source feet baseline y240, relative to image center128.
export const MARCIN_FEET_OFFSET=-76.16;
export const MARCIN_VISUAL_BOUNDS=Object.freeze({top:152,side:84,bottom:44});
// Main opaque head/chest/belly, excluding remote tail/paw tips and mohawk.
// Small bounded pose configuration, not a pixel collider or frame-sized box.
export const MARCIN_ART_BODY=Object.freeze([
 [[165,98,50],[154,143,63],[151,175,45],[213,113,12]],
 [[147,96,52],[134,153,63],[135,173,45]],
 [[127,94,50],[128,151,74],[128,173,47]],
 [[100,99,50],[120,153,67],[124,171,45],[53,117,13]],
 [[86,95,49],[104,147,63],[105,174,47],[35,110,12]],
 [[97,85,45],[124,142,65],[120,185,54]],
 [[128,82,44],[128,137,74],[128,182,59]],
 [[163,92,40],[143,148,66],[132,177,48],[190,98,16]]
].map(parts=>Object.freeze(parts.map(([x,y,radius])=>Object.freeze({x:x-128,y:y-128,radius})))));
