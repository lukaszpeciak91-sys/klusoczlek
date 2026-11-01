// Logical pixels equal safe-area CSS pixels under Phaser Scale.RESIZE.
const within = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function menuLayout(width, height = 540) {
  const h = Math.max(height, 1);
  const centerX = width / 2;
  const unit = Math.min(1, h / 540);
  return {
    centerX, titleY: h * 0.26, subtitleY: h * 0.385, startY: h * 0.69,
    titleSize: Math.round(66 * unit),
    subtitleSize: Math.round(21 * unit),
    startWidth: Math.min(270, width * 0.55),
    startHeight: Math.min(82, h * 0.17),
  };
}
export function arenaHudLayout(height,width=960){
 const tiny=width<390, compact=width<650;
 const margin=tiny?4:compact?8:12;
 const menuWidth=tiny?45:compact?76:94, menuHeight=tiny?30:compact?38:44;
 const tokenSize=tiny?20:compact?31:39;
 const skullSize=tiny?12:compact?18:23;
 const portraitSize=tiny?39:compact?59:76;
 const countFont=tiny?10:compact?14:18;
 const waveFont=tiny?9:compact?12:15;
 const timerFont=tiny?9:compact?11:13;
 const hpFont=tiny?9:compact?11:13;
 const gap=tiny?3:compact?6:10;
 const hudY=margin+Math.max(menuHeight,tokenSize,portraitSize)/2;
 const menuX=margin+menuWidth/2;
 const weaponX=menuX+menuWidth/2+gap+tokenSize/2;
 const skullX=weaponX+tokenSize/2+gap+skullSize/2;
 const killsX=skullX+skullSize/2+2;
 // Reserve sufficient width for the longest displayed killed/total string.
 // The count is dynamic; renderer should use the same max-width reservation.
 const countReserve=tiny?42:compact?64:85;
 const waveX=killsX+countReserve+gap;
 const waveReserve=tiny?27:compact?43:55;
 const timerX=waveX+waveReserve+gap;
 const portraitX=width-margin-portraitSize/2;
 const portraitY=margin+portraitSize/2;
 const hpY=portraitY+portraitSize/2+1;
 const countRight=waveX-gap;
 const timerRight=portraitX-portraitSize/2-gap;
 // Native 92px sticks on normal Android landscape. Smaller viewports shrink
 // the physical circles as needed, without extending outside the screen.
 const radius=Math.min(46,Math.max(28,Math.floor(Math.min(height*0.175,width*0.13))));
 const sideInset=Math.max(radius+10,Math.min(94,Math.floor(width*0.15)));
 const bottomInset=Math.max(radius+8,Math.min(82,Math.floor(height*0.24)));
 return {
  // Legacy measurements are retained for downstream tests; no panel is drawn.
  panelX:margin,panelY:margin,panelWidth:width-2*margin,panelHeight:portraitSize+12,
  menuX,menuY:hudY,menuWidth,menuHeight,menuFont:tiny?12:compact?16:19,
  weaponX,weaponY:hudY,tokenSize,
  skullX,skullY:hudY,skullSize,
  killsX,killsY:hudY,countFont,countRight,
  waveX,waveY:hudY,waveFont,
  timerX,timerY:hudY,timerFont,timerRight,
  portraitX,portraitY,portraitSize,hpX:portraitX,hpY,hpFont,
  joystickX:sideInset,joystickY:height-bottomInset,
  joystickRadius:radius,aimX:width-sideInset,aimY:height-bottomInset,
  joystickActivationRadius:radius*1.45
 };
}
export function pauseLayout(width, height = 540) {
  const h = Math.max(height, 1);
  return {
    centerX: width / 2,
    titleY: h * 0.19,
    resumeY: h * 0.49,
    exitY: h * 0.75,
    titleSize: Math.round(46 * Math.min(1, h / 540)),
    buttonHeight: within(h * 0.16, 44, 70),
    resumeWidth: Math.min(270, width * 0.75),
    exitWidth: Math.min(300, width * 0.82),
  };
}
