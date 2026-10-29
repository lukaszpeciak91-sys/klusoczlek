// Pure, visual-only enemy gait. Phase is accumulated from *resolved* travel distance.
const TAU=Math.PI*2;
const DEG=Math.PI/180;
export const ENEMY_MOTION=Object.freeze({
 bobrozombi:Object.freeze({hz:1.8,rotation:3,bob:1.8,speed:65,blend:9,asymmetry:0.17}),
 bocianolak:Object.freeze({hz:2.7,rotation:2,bob:2.8,speed:85,blend:11,asymmetry:0.1}),
 zubrokryptyda:Object.freeze({hz:1.1,rotation:1.5,bob:1.2,speed:42,blend:6,asymmetry:0.06})
});
export function phaseForSeed(seed=0){return (((Math.imul((seed|0)+1,2654435761)>>>0)/4294967296)*TAU);}
export function createEnemyGait(type,seed=0){
 if(!ENEMY_MOTION[type])throw RangeError('unknown enemy gait '+type);
 return {phase:phaseForSeed(seed),intensity:0,rotation:0,bob:0};
}
// State is owned by visual renderer, not enemy physics or pursuit.
export function advanceEnemyGait(state,type,distance,seconds){
 const p=ENEMY_MOTION[type];
 const dt=Math.max(0,Math.min(Number.isFinite(seconds)?seconds:0,0.1));
 const traveled=Math.max(0,Number.isFinite(distance)?distance:0);
 // A suspended tab can never introduce a whole gait cycle in a single frame.
 state.phase=(state.phase+TAU*p.hz*Math.min(traveled,p.speed*dt*1.2)/p.speed)%TAU;
 const moving=dt>0&&traveled/dt>p.speed*0.025;
 const target=moving?1:0;
 const k=1-Math.exp(-p.blend*dt);
 state.intensity+=(target-state.intensity)*k;
 const sway=Math.sin(state.phase)+p.asymmetry*Math.sin(state.phase*0.5+0.8);
 const rotationGoal=p.rotation*DEG*Math.max(-1,Math.min(1,sway))*state.intensity;
 const bobGoal=-p.bob*0.5*(1-Math.cos(state.phase*2))*state.intensity;
 state.rotation+=(rotationGoal-state.rotation)*k;
 state.bob+=(bobGoal-state.bob)*k;
 state.rotation=Math.max(-p.rotation*DEG,Math.min(p.rotation*DEG,state.rotation));
 state.bob=Math.max(-p.bob,Math.min(0,state.bob));
 return state;
}
