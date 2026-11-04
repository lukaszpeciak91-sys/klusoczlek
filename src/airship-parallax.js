// Horizontal adaptation of Justimania's two-composition/smoothstep background.
// Both images cover the viewport throughout travel; they are never tiled or joined.
export const CLOUD_TRAVEL_PX=200;
export const CLOUD_FADE_START=0.61;
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
export function backgroundCoverScale(sourceWidth,sourceHeight,viewportWidth,viewportHeight,moving){
  // Unlike a bare TileSprite, every horizontally moving image has enough overscan
  // for its *entire* travel, including the incoming image at its rightmost point.
  const extra=moving?2*(CLOUD_TRAVEL_PX+CLOUD_OVERSCAN_PX):0;
  return Math.max((viewportWidth+extra)/sourceWidth,
    (viewportHeight+2*CLOUD_OVERSCAN_PX)/sourceHeight);
}
export function createHorizontalParallaxLayer(scene,def,initialKey){
  const moving=def.speed!==0;
  const count=moving?2:1;
  const images=Array.from({length:count},()=>scene.add.image(0,0,initialKey)
    .setOrigin(.5).setScrollFactor(0).setDepth(def.depth));
  let key=initialKey,w=scene.scale.width,h=scene.scale.height,disposed=false;
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
      const source=scene.textures.get(key).getSourceImage();
      const scale=backgroundCoverScale(source.width,source.height,w,h,moving);
      images.forEach(image=>image.setScale(scale).setPosition(w/2,h/2));
      this.update();
      return this;
    },
    update(){
      if(disposed)return;
      if(!moving){
        images[0].setPosition(Math.round(w/2),Math.round(h/2)).setAlpha(1);
        return;
      }
      const states=horizontalCloudState(this.tilePositionX,def.id);
      // The same two Phaser Images are recycled forever; no per-frame allocation.
      // Stable alternation avoids a one-frame swap when one composition expires.
      for(let i=0;i<2;i++){
        const state=states[i],image=images[state.composition%2];
        image.setPosition(Math.round(w/2+state.xOffset),Math.round(h/2))
          .setAlpha(state.alpha);
      }
    },
    destroy(){if(disposed)return;disposed=true;images.forEach(image=>image.destroy());}
  };
  layer.setSize(w,h);
  return layer;
}
