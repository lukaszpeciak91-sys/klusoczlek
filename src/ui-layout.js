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
 const compact=width<620;
 const menuWidth=compact?90:148,menuHeight=compact?44:52;
 const menuX=12+menuWidth/2,menuY=12+menuHeight/2;
 const portraitSize=compact?62:74;
 const portraitX=width-12-portraitSize/2,portraitY=12+portraitSize/2;
 const textX=12+menuWidth+12;
 const weaponFont=compact?14:17;
 const killsFont=compact?13:16;
 return {
  menuX,menuY,menuWidth,menuHeight,menuFont:compact?19:23,
  portraitX,portraitY,portraitSize,
  weaponX:textX,weaponY:compact?18:21,weaponFont,
  killsX:textX,killsY:compact?43:49,killsFont,
  hpX:portraitX,hpY:portraitY+portraitSize/2+4,hpFont:compact?12:14,
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
