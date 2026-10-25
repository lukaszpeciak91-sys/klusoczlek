import Phaser from 'phaser';
import { ArenaScene, MenuScene, PauseScene } from './scenes.js';
import { GAME_WIDTH, GAME_HEIGHT, setupViewport } from './viewport.js';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e101a',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { pixelArt: true, antialias: false },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MenuScene, ArenaScene, PauseScene],
});

setupViewport(game);

async function requestFullscreen() {
  const element = document.getElementById('game-shell');
  if (!element.requestFullscreen || document.fullscreenElement) return;
  try {
    await element.requestFullscreen();
  } catch {
    return; // Fullscreen is optional; START remains usable.
  }
  try {
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch {
    // Not supported / denied by browser or OS.
  }
}

document.getElementById('fullscreen-button').addEventListener('click', requestFullscreen);
