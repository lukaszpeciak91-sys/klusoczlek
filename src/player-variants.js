import {assetManifest} from './asset-manifest.js';
export const DEFAULT_PLAYER_VARIANT='unarmed';
export const PLAYER_VARIANTS=Object.freeze({
 unarmed:Object.freeze({path:'player/player-unarmed.png',key:'aloes-unarmed'}),
 blunderbuss:Object.freeze({path:'player/player-blunderbuss.png',key:'aloes-blunderbuss'}),
 rifle:Object.freeze({path:'player/player-rifle.png',key:'aloes-rifle'}),
 flamethrower:Object.freeze({path:'player/player-flamethrower.png',key:'aloes-flamethrower'})
});
export const LEGACY_PLAYER=Object.freeze({path:'player/player.png',key:'aloes-eight-directions'});
export const PLAYER_SHEET=assetManifest.find(a=>a.id==='player');
export function playerVariant(id){if(!Object.hasOwn(PLAYER_VARIANTS,id))throw new RangeError('Unknown player visual variant');return PLAYER_VARIANTS[id];}
