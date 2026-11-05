// Horizontal adaptation of Justimania's two-composition/smoothstep background.
// Both images cover the viewport throughout travel; they are never tiled or joined.
export const CLOUD_TRAVEL_PX=200;
// Narrow the overlap: displaced duplicate clouds were visible for 39% of each cycle.
export const CLOUD_FADE_START=0.82;
export const CLOUD_OVERSCAN_PX=24;
const PHASE_OFFSETS=Object.freeze({far:0.08,mid:0.34,near:0.18});

export function smoothstep01(value){
  const t=Math.max(0,Math.min(1,value));
  return t*t*(3-2*t);
}
export function horizontalCloudState(distance,layerId){
  const progressDistance=Math.max(0,distance)+(PHASE_OFFSETS[layerId]??0)*CLOUD_TRAVEL_PX;
  const cycle=Math.floor(progressDistance/CLOUD_TRAVEL_PX);
  const progress=(progressDistance%CLOUD_TRAVEL_PX)/CLOUD_TRAVEL_PX;
  const blend=smoothstep01((progress-CLOUD_FADE_START)/(1-CLOUD_FADE_START));
  return [
    {composition:cycle,alpha:1-blend,xOffset:-progress*CLOUD_TRAVEL_PX},
    {composition:cycle+1,alpha:blend,xOffset:(1-progress)*CLOUD_TRAVEL_PX},
  ];
}
export function cloudHorizontalMargins(){
  // A cloud image is visible only while outgoing (-travel..0), or while
  // incoming (+(1-fadeStart)*travel..0). These unequal limits let us retain
  // full coverage without enlarging the art for two *invisible* extremes.
  return {left:(1-CLOUD_FADE_START)*CLOUD_TRAVEL_PX+CLOUD_OVERSCAN_PX,
    right:CLOUD_TRAVEL_PX+CLOUD_OVERSCAN_PX};
}
export function backgroundCoverScale(sourceWidth,sourceHeight,viewportWidth,viewportHeight,moving){
  const margins=moving?cloudHorizontalMargins():{left:0,right:0};
  return Math.max((viewportWidth+margins.left+margins.right)/sourceWidth,
    (viewportHeight+2*CLOUD_OVERSCAN_PX)/sourceHeight);
}
export function createHorizontalParallaxLayer(scene,def,initialKey){
  const moving=def.speed!==0;
  const count=moving?2:1;
  const images=Array.from({length:count},()=>scene.add.image(0,0,initialKey)
    .setOrigin(.5).setScrollFactor(0).setDepth(def.depth));
  let key=initialKey,w=scene.scale.width,h=scene.scale.height,disposed=false,lastZoom=null;
  const zoom=()=>Math.max(.1,scene.cameras?.main?.zoom??1);
  const applyScale=()=>{
    const source=scene.textures.get(key).getSourceImage();
    const effectiveZoom=zoom();
    const scale=backgroundCoverScale(source.width,source.height,w,h,moving)/effectiveZoom;
    images.forEach(image=>image.setScale(scale));
    lastZoom=effectiveZoom;
  };
  const layer={
    layerId:def.id,speed:def.speed,tilePositionX:0,images,
    setTexture(nextKey){
      key=nextKey;
      images.forEach(image=>image.setTexture(nextKey));
      this.setSize(w,h);
      return this;
    },
    setSize(width,height){
      w=width;h=height;
      lastZoom=null;
      this.update();
      return this;
    },
    update(){
      if(disposed)return;
      if(lastZoom!==zoom())applyScale();
      if(!moving){
        images[0].setPosition(Math.round(w/2),Math.round(h/2)).setAlpha(1);
        return;
      }
      const states=horizontalCloudState(this.tilePositionX,def.id);
      // The same two Phaser Images are recycled forever; no per-frame allocation.
      // Stable alternation avoids a one-frame swap when one composition expires.
      for(let i=0;i<2;i++){
        const state=states[i],image=images[state.composition%2];
        const margins=cloudHorizontalMargins();
        const centerBias=(margins.right-margins.left)/2;
        image.setPosition(Math.round(w/2+(centerBias+state.xOffset)/zoom()),Math.round(h/2))
          .setAlpha(state.alpha);
      }
    },
    destroy(){if(disposed)return;disposed=true;images.forEach(image=>image.destroy());}
  };
  layer.setSize(w,h);
  return layer;
}
