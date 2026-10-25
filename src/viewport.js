// Orientation is enforced both on window changes and immediately when a scene starts.
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// With Scale.RESIZE logical pixels match CSS pixels inside the safe-area parent.
export function logicalViewport(width, height) {
  if (!(width > 0 && height > 0)) return { width: GAME_WIDTH, height: GAME_HEIGHT };
  return { width, height };
}

export function viewportMapping(logicalWidth, logicalHeight, displayWidth, displayHeight) {
  return {
    scaleX: displayWidth / logicalWidth,
    scaleY: displayHeight / logicalHeight,
    x: logicalWidth / 2,
    y: logicalHeight / 2,
  };
}

export function isPortrait(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > width;
}

export function fitWithin(width, height, baseWidth = GAME_WIDTH, baseHeight = GAME_HEIGHT) {
  if (!(width > 0 && height > 0 && baseWidth > 0 && baseHeight > 0)) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(width / baseWidth, height / baseHeight);
  return { width: baseWidth * scale, height: baseHeight * scale };
}

export function createOrientationController({ portrait, activeScenes, isPaused, pause, resume }) {
  const owned = new Set();
  function sync(scene) {
    if (portrait()) {
      const scenes = scene ? [scene] : activeScenes();
      for (const item of scenes) {
        if (!isPaused(item)) {
          owned.add(item);
          pause(item);
        }
      }
    } else {
      for (const item of owned) {
        if (isPaused(item)) resume(item);
      }
      owned.clear();
    }
  }
  return { sync };
}

let sceneStarted = scene => {
  if (isPortrait(window.innerWidth, window.innerHeight)) scene.scene.pause();
};

export function enforceOrientationOnSceneStart(scene) {
  sceneStarted(scene);
}

export function setupViewport(game) {
  const rotateMessage = document.getElementById('rotate-message');
  const gameBox = document.getElementById('game');
  const portrait = () => isPortrait(window.innerWidth, window.innerHeight);
  const controller = createOrientationController({
    portrait,
    activeScenes: () => game.scene.getScenes(true),
    isPaused: scene => scene.scene.isPaused(),
    pause: scene => scene.scene.pause(),
    resume: scene => scene.scene.resume(),
  });
  const update = () => {
    const rotated = portrait();
    rotateMessage.hidden = !rotated;
    document.body.classList.toggle('portrait', rotated);
    controller.sync();
    // Phaser RESIZE owns both canvas backing size and input mapping.
    // Never resize the logical canvas independently of its CSS box.
    game.scale.refresh();
  };
  sceneStarted = scene => {
    controller.sync(scene);
    // Phaser's scene lifecycle may start a scene after initial viewport synchronization.
    // This check happens during create, before the first scene update tick.
  };
  // Android browser chrome may restore its layout viewport after fullscreenchange.
  // Observe the actual safe-area game box instead of guessing a delay.
  const boxObserver = new ResizeObserver(() => update());
  boxObserver.observe(gameBox);
  window.addEventListener('resize', update);
  document.addEventListener('fullscreenchange', update);
  window.addEventListener('orientationchange', update);
  document.addEventListener('visibilitychange', update);
  game.events.once('destroy', () => {
    boxObserver.disconnect();
    window.removeEventListener('resize', update);
    document.removeEventListener('fullscreenchange', update);
    window.removeEventListener('orientationchange', update);
    document.removeEventListener('visibilitychange', update);
    sceneStarted = () => {};
  });
  update();
  return update;
}
