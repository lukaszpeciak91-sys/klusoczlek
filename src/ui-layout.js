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
 const radius=46,padding=14;
 // One connected ribbon, with the portrait anchored to its right end.
 const compact=width<600,tiny=width<390;
 const margin=tiny?4:10, gap=tiny?3:compact?7:11;
 const menuWidth=tiny?56:compact?82:104;
 const menuHeight=tiny?34:compact?44:46;
 const tokenSize=tiny?23:compact?36:42;
 const skullSize=tiny?13:compact?20:24;
 const portraitSize=tiny?48:compact?68:82;
 const countFont=tiny?10:compact?15:20;
 const hpFont=tiny?9:compact?12:13;
 const barHeight=Math.max(menuHeight+12,portraitSize+24);
 const panelX=margin,panelY=margin,panelWidth=width-2*margin;
 const centerY=panelY+barHeight/2-5;
 const menuX=panelX+7+menuWidth/2;
 const weaponX=menuX+menuWidth/2+gap+tokenSize/2;
 const portraitX=panelX+panelWidth-7-portraitSize/2;
 const portraitY=panelY+7+portraitSize/2;
 const hpY=portraitY+portraitSize/2+1;
 const countX=weaponX+tokenSize/2+gap;
 const countRight=portraitX-portraitSize/2-gap;
 const waveFont=tiny?9:compact?12:16;
 const timerFont=tiny?9:compact?11:13;
 // One baseline: MENU → weapon → skull/kills → wave → clock → portrait.
 // Space is reserved for the full 138/138 counter, not its starting "0/138" value.
 const killsX=countX+skullSize+gap/2;
 const waveX=killsX+Math.ceil(7*countFont*0.61)+(tiny?3:compact?8:15);
 const timerX=waveX+Math.ceil(5*waveFont*0.62)+(tiny?3:compact?8:16);
 const timerY=centerY;
 return {
  panelX,panelY,panelWidth,panelHeight:barHeight,
  menuX,menuY:centerY,menuWidth,menuHeight,menuFont:tiny?15:compact?18:20,
  weaponX,weaponY:centerY,tokenSize,
  skullX:countX+skullSize/2,skullY:centerY,skullSize,
  killsX,killsY:centerY,countFont,
  countRight,
  waveX,waveY:centerY,waveFont,
  timerX,timerY,timerFont,
  portraitX,portraitY,portraitSize,
  hpX:portraitX,hpY,hpFont,
  joystickX:radius+padding,
  joystickY:Math.max(radius+padding,height-radius-padding),
  joystickRadius:radius,
  aimX:Math.max(radius+padding,width-radius-padding),
  aimY:Math.max(radius+padding,height-radius-padding)
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
