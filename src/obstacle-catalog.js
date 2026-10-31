import {validateFootprint} from './obstacle-validation.js';
// Authoring catalog: pixel geometry stays independent of future PNG artwork.
const freeze=o=>Object.freeze(o);
export const OBSTACLE_CATALOG=freeze({
 rock:freeze({id:'rock',gameplayClass:'solid',variants:freeze({small:freeze({shape:'circle',radius:23}),medium:freeze({shape:'circle',radius:31}),large:freeze({shape:'circle',radius:43})}),render:freeze({asset:'obstacle-rock',fallback:'circle'})}),
 stump:freeze({id:'stump',gameplayClass:'solid',variants:freeze({default:freeze({shape:'circle',radius:24})}),render:freeze({asset:'obstacle-stump',fallback:'circle'})}),
 fallen_log:freeze({id:'fallen_log',gameplayClass:'solid',variants:freeze({short:freeze({shape:'capsule',length:84,radius:19}),medium:freeze({shape:'capsule',length:126,radius:21})}),render:freeze({asset:'obstacle-fallen-log',fallback:'capsule'})}),
 bush:freeze({id:'bush',gameplayClass:'solid',variants:freeze({default:freeze({shape:'circle',radius:30}),wide:freeze({shape:'capsule',length:78,radius:24})}),render:freeze({asset:'obstacle-bush',fallback:'capsule'})}),
 toxic_barrel:freeze({id:'toxic_barrel',gameplayClass:'destructible',hp:3,variants:freeze({default:freeze({shape:'circle',radius:23})}),render:freeze({asset:'obstacle-toxic-barrel',fallback:'circle'})}),
 toi_toi:freeze({id:'toi_toi',gameplayClass:'solid',variants:freeze({default:freeze({shape:'box',width:52,height:46})}),render:freeze({asset:'obstacle-toi-toi',fallback:'box'})})
});
export function createObstacle(definition,{id,x,y,angle=0,variant}){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(angle))throw new TypeError('Invalid placement coordinates');
 const def=OBSTACLE_CATALOG[definition];
 if(!def)throw new RangeError('Unknown obstacle type: '+definition);
 const variantId=variant||Object.keys(def.variants)[0],geometry=def.variants[variantId];
 if(!geometry)throw new RangeError('Unknown obstacle variant: '+definition+'/'+variantId);
 if(!id||typeof id!=='string')throw new TypeError('Instance ID required');
 const footprint=freeze(validateFootprint({...geometry,x,y,angle}));
 return {id,type:def.id,variant:variantId,gameplayClass:def.gameplayClass,footprint,x,y,angle,hp:def.hp??Infinity,alive:true,render:def.render};
}
export function createAuthoredObstacles(placements){
 const seen=new Set();
 return placements.map(p=>{
  if(seen.has(p.id))throw new Error('Duplicate obstacle ID: '+p.id);
  seen.add(p.id);
  return createObstacle(p.type,p);
 });
}
