// Validate authoring inputs once, before geometry is used in hot loops.
export function validateRadius(radius,name='radius'){
 if(!Number.isFinite(radius)||radius<0)throw new RangeError(name+' must be a finite nonnegative number');
 return radius;
}
export function validateFootprint(shape){
 if(!shape||typeof shape!=='object')throw new TypeError('Footprint must be an object');
 if(!['circle','box','capsule'].includes(shape.shape))throw new RangeError('Unknown obstacle shape: '+shape.shape);
 for(const key of ['x','y','angle']){
  if(!Number.isFinite(shape[key]))throw new RangeError('Footprint '+key+' must be finite');
 }
 if(shape.shape==='circle'||shape.shape==='capsule'){
  if(!Number.isFinite(shape.radius)||shape.radius<=0)throw new RangeError('Footprint radius must be positive and finite');
 }
 if(shape.shape==='box'){
  for(const key of ['width','height']){
   if(!Number.isFinite(shape[key])||shape[key]<=0)throw new RangeError('Footprint '+key+' must be positive and finite');
  }
 }
 if(shape.shape==='capsule'&&(!Number.isFinite(shape.length)||shape.length<2*shape.radius)){
  throw new RangeError('Capsule length must be finite and at least twice its radius');
 }
 return shape;
}
