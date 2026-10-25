# ASSETS — executable contract / Art Director handoff

All files below are **planned, not present**. Art Director can create original art independently to these exact dimensions and names; USER uploads PNG manually after approval. Agents must not commit or generate binaries. `src/asset-manifest.js` is the machine-readable mirrored manifest and currently has status `pending` for every asset. Do not preload a missing URL as a required game resource.

## Universal export rules
PNG, 8-bit RGBA (except ground tile which may be opaque), sRGB; no padding between frames, no atlas trimming, no rotated frames, no extruded borders. Pixel art: nearest-neighbor only; image origin center (0.5,0.5), world feet contact rendered at center-bottom of art via transparent padding. Every sheet is a regular **horizontal 8 columns** grid. Canvas units are logical Phaser pixels under Scale.RESIZE. Use target on-screen scale **1.0** for 64px player frames, 1.0 for 48px enemies; tune visual scale later without changing physics. Image pixel dimensions are not collision sizes. All paths below are relative to `public/assets/`; URL constructed using `import.meta.env.BASE_URL + 'assets/' + path`, never absolute `/assets/`.

## Frame directions / animation mapping
Direction row index: 0 e, 1 se, 2 s, 3 sw, 4 w, 5 nw, 6 n, 7 ne. Each row contains 8 animation-phase columns.
For both player and enemies: 24 rows = 3 animation blocks × 8 direction rows; row = `stateIndex*8 + directionIndex`, where stateIndex idle=0, walk=1, fire=2; direction index e=0,se=1,s=2,sw=3,w=4,nw=5,n=6,ne=7. Column = phase 0..7, linear frame = row*8+phase. `idle`: frames 0–7 hold/breathe; `walk`: 0–7 loop; `fire`: 0–7 fire cycle. Animation names exactly `idle_e` etc. Weapon muzzle alignment must stay at a stable hand/weapon position for each direction; see offsets below. Entire silhouette rotates by authored 8-way animation, no upper/lower sprite split. Enemy `fire` rows are reserved for attack/contact anticipation, not projectiles.

## Manifest (all status PENDING, originals, no rights assumed)
| Path under public/assets/ | Pixel size | Grid | Alpha | Usage |
|---|---:|---|---|---|
| player/player.png | 512×1536 | 8×24 of 64×64 | yes | main character, 192 frames |
| enemies/bobrozombi.png | 384×1152 | 8×24 of 48×48 | yes | slow enemy |
| enemies/zubrokryptyda.png | 384×1152 | 8×24 of 48×48 | yes | heavy enemy |
| enemies/enemy_fast.png | 384×1152 | 8×24 of 48×48 | yes | fast enemy, name provisional |
| weapons/rapid.png | 96×32 | 3×1 of 32×32 | yes | ground pickup / HUD / fired indicator |
| weapons/heavy.png | 96×32 | 3×1 of 32×32 | yes | ground pickup / HUD / fired indicator |
| weapons/spread.png | 96×32 | 3×1 of 32×32 | yes | ground pickup / HUD / fired indicator |
| pickups/health_beer.png | 32×32 | single frame | yes | health pickup |
| portraits/hp_high.png | 128×128 | single frame | yes | HP >60% |
| portraits/hp_medium.png | 128×128 | single frame | yes | HP 30–60% |
| portraits/hp_low.png | 128×128 | single frame | yes | HP <30% |
| terrain/ground.png | 64×64 | tile | no | seamless repeatable arena |
| terrain/obstacle.png | 64×64 | single frame | yes | optional obstacle visual |
| dialogue/player.png | 192×192 | single frame | yes | dialogue speaker |
| dialogue/aloes.png | 192×192 | single frame | yes | finale speaker |
| dialogue/narrator.png | 192×192 | single frame | yes | optional narration |

All weapons: frame 0 ground pickup; 1 HUD; 2 side-projection/icon (not directional world-held render); player sheet includes visible held weapon silhouette in authored frames or generic hands for all weapons, and final weapon-specific graphics must not require layered animation. Weapon identifiers are provisional art-neutral tags; weapon behaviors tuned later.

## Pivot / muzzle / projectile contract
Player frame local coordinates 0..63; origin (32,32) matches world position. Feet baseline near pixel y=54; reserve at least 3px transparent inset on edges to prevent clipping. Collision remains **circle radius 17 world px**, centered at physics position, independent of art bounds. Projectile direction is aim unit vector from actual pointer/stick, not octant direction. Muzzle world position = player physics world center + aim unit vector × 24 world px; normalize first; no sprite-sheet dependent collision or projectile origin. This provides 360° accuracy and is consistent across all poses and all three weapon classes; visual muzzle should be placed approximately 24px from center along facing direction in each fire row. When aim zero, no projectile spawn. Weapon pickup visuals do not alter muzzle position. Enemy bodies to be assigned separately on gameplay integration, never derived automatically from 48px sheet width.

## Missing files / status and production order
Retain current code-drawn circle player, grid ground, and procedural shapes for future enemies/projectiles; no loading crash or sprite reference until an asset is known loaded. Loader: on missing PNG, log once and draw/create deterministic placeholder with same physics entity; game simulation and camera continue. Never create an invisible physics body from missing image. Art Director should first submit **one player eight-direction idle/walk/fire sample** and a mobile preview; confirm feet contact, visual legibility, hand alignment and pixel scale before making the full set. Obtain explicit consent for any recognizable private face before a public GitHub upload. Do not copy third-party sprites.

## Validation / handoff
Verify transparent PNG exact image size and tile grid, correct row/column ordering, identical character identity across octants, original licensed artwork and platform-readable silhouette. Source of truth for filenames/dimensions: `src/asset-manifest.js`, checked by `tests/combat-contract.test.js`. This PR only validates the manifest schema and frame references; no PNG is produced or loaded.
