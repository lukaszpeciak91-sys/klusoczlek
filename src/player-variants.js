import {assetManifest} from './asset-manifest.js';
export const DEFAULT_PLAYER_VARIANT='flamethrower';
export const PLAYER_VARIANTS=Object.freeze({
 unarmed:Object.freeze({path:'player/player-unarmed.png',key:'aloes-unarmed'}),
 flamethrower:Object.freeze({path:'player/player-flamethrower.png',key:'aloes-flamethrower'}),
 firearm:Object.freeze({path:'player/player-firearm.png',key:'aloes-firearm'})
});
export const LEGACY_PLAYER=Object.freeze({path:'player/player.png',key:'aloes-eight-directions'});
export const PLAYER_SHEET=assetManifest.find(a=>a.id==='player');
export function playerVariant(id){if(!Object.hasOwn(PLAYER_VARIANTS,id))throw new RangeError('Unknown player visual variant');return PLAYER_VARIANTS[id];}
