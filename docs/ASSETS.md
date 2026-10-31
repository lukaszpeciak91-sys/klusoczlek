# ASSETS — executable contract / Art Director handoff

**Artistic visual direction:** [ART BIBLE v1.0](art/ART_BIBLE.md). Art documents do not override this technical contract or `src/asset-manifest.js`.

All files below are **planned, not present**. Art Director can create original art independently to these exact dimensions and names; USER uploads PNG manually after approval. Agents must not commit or generate binaries. `src/asset-manifest.js` is the machine-readable mirrored manifest and currently has status `pending` for every asset. Do not preload a missing URL as a required game resource.

## Universal export rules
PNG, 8-bit RGBA (except ground tile which may be opaque), sRGB; no padding between frames, no atlas trimming, no rotated frames, no extruded borders. Pixel art: nearest-neighbor only; image origin center (0.5,0.5), world feet contact rendered at center-bottom of art via transparent padding. Character sheets have **8 facing columns × 1 row**; weapon sheets have **3 columns × 1 row**. Other files are single-frame. Canvas units are logical Phaser pixels under Scale.RESIZE. Use target on-screen scale **1.0** for 64px player frames, 1.0 for 48px enemies; tune visual scale later without changing physics. Image pixel dimensions are not collision sizes. All paths below are relative to `public/assets/`; URL constructed using `import.meta.env.BASE_URL + 'assets/' + path`, never absolute `/assets/`.

## Frame directions / single-pose mapping
Character frames are indexed left-to-right: E=0, SE=1, S=2, SW=3, W=4, NW=5, N=6, NE=7. One complete silhouette per frame; no idle/walk/fire rows or authored animation phases. Subtle sway/bob is purely visual and optional. Supersedes the historical 96-frame character contract (D030). Projectiles retain independent continuous 360-degree aim.

## Manifest (all status PENDING, originals, no rights assumed)
| Path under public/assets/ | Pixel size | Grid | Alpha | Usage |
|---|---:|---|---|---|
| player/player.png | 512×64 | 8×1 of 64×64 | yes | Aloes Podpalacz, 8 frames |
| enemies/bobrozombi.png | 768×96 | 8×1 of 96×96 | yes | Bobrozombi V2, approved optional visual; scale 0.75, gameplay radius 21 |
| enemies/bocianolak.png | 1024×160 | 8×1 of 128×160 | yes | Bocianołak V1, second type; optional renderer, manual user upload |
| enemies/zubrokryptyda.png | 1536×192 | 8×1 of 192×192 | yes | heavy enemy |
| enemies/enemy_fast.png | 384×48 | 8×1 of 48×48 | yes | fast enemy, name provisional |
| weapons/rapid.png | 96×32 | 3×1 of 32×32 | yes | ground pickup / HUD / fired indicator |
| weapons/heavy.png | 96×32 | 3×1 of 32×32 | yes | ground pickup / HUD / fired indicator |
| weapons/spread.png | 96×32 | 3×1 of 32×32 | yes | ground pickup / HUD / fired indicator |
| portraits/hp_5.png | 128×128 | single frame | yes | Aloes face for 5 HP |
| portraits/hp_4.png | 128×128 | single frame | yes | Aloes face for 4 HP |
| portraits/hp_3.png | 128×128 | single frame | yes | Aloes face for 3 HP |
| portraits/hp_2.png | 128×128 | single frame | yes | Aloes face for 2 HP |
| portraits/hp_1.png | 128×128 | single frame | yes | Aloes face for 1 HP and 0 HP (subdued) |
| terrain/arena-ground.png | 1024×1024 | seamless tile | no | approved repeating Arena underlay, below obstacles, characters and effects |
| dialogue/player.png | 192×192 | single frame | yes | dialogue speaker |
| dialogue/aloes.png | 192×192 | single frame | yes | finale speaker |
| dialogue/narrator.png | 192×192 | single frame | yes | optional narration |

Weapon sheets use a separate **3×1 grid** with NO facing or animation-state rows, and never use `playerFrame`. All weapons: frame 0 ground pickup; 1 HUD; 2 side-projection/icon (not directional world-held render); player sheet includes a complete authored weapon silhouette (Aloes Podpalacz is cosmetic in PR16), with no layered animation. Weapon identifiers are provisional art-neutral tags; weapon behaviors tuned later.

## Dialogue identities and provisional scope
Only **Aloes** is an approved named story speaker (D018). `dialogue/aloes.png` is the only named dialogue portrait authorized by the story contract, but the portrait itself is optional until art approval. `dialogue/player.png` represents the protagonist without introducing a new story character; provisional need, do not produce until dialogue script is accepted. `dialogue/narrator.png` is a **PROVISIONAL optional narrator illustration**, not an approved story character: do not produce unless explicitly approved. All three paths are reserved to keep integration deterministic. Asset status remains `pending`; additional `approval` values in manifest distinguish `approved_identity` vs `provisional_identity` (not permission to publish a real face).

## Pivot / muzzle / projectile contract
Player frame local coordinates 0..63; origin (32,32) matches world position. Feet baseline near pixel y=54; reserve at least 3px transparent inset on edges to prevent clipping. Collision remains **circle radius 17 world px**, centered at physics position, independent of art bounds. Projectile direction is aim unit vector from actual pointer/stick, not octant direction. Muzzle world position = player physics world center + aim unit vector × 24 world px; normalize first; no sprite-sheet dependent collision or projectile origin. This provides 360° accuracy and is consistent across all poses and all three weapon classes; visual muzzle should be placed approximately 24px from center along facing direction in each facing frame. When aim zero, no projectile spawn. Weapon pickup visuals do not alter muzzle position. Enemy bodies to be assigned separately on gameplay integration, never derived automatically from 48px sheet width.

## Missing files / status and production order
Retain current code-drawn circle player, grid ground, and procedural shapes for future enemies/projectiles; no loading crash or sprite reference until an asset is known loaded. Loader: on missing PNG, log once and draw/create deterministic placeholder with same physics entity; game simulation and camera continue. Never create an invisible physics body from missing image. Art Director should first submit **one eight-direction single-pose sample** and a mobile preview; confirm feet contact, visual legibility, hand alignment and pixel scale before making the full set. Obtain explicit consent for any recognizable private face before a public GitHub upload. Do not copy third-party sprites.

## Validation / handoff
Verify transparent PNG exact image size and tile grid, correct row/column ordering, identical character identity across octants, original licensed artwork and platform-readable silhouette. Source of truth for filenames/dimensions: `src/asset-manifest.js`, checked by `tests/combat-contract.test.js`. This PR only validates the manifest schema and frame references; no PNG is produced or loaded.

## PR16 runtime illustration and validation
Manually upload only approved `public/assets/player/player.png`: 512×64 8-bit RGBA, transparent, eight contiguous 64×64 facing cells. Runtime resolves `BASE_URL + assets/player/player.png`, checks PNG metadata (exact width/height and RGBA color type), loads a Phaser spritesheet with nearest-neighbor sampling, and keeps the existing 17px Arcade circle as physics/camera owner. Missing/invalid resource retains marker and facing indicator. Actual visual direction/silhouette/alpha inspection remains user acceptance, not inferred from dimensions. Neither optional PNG nor enemy PNG is committed by implementers. D030 supersedes prior character-only grids; weapons, pickups, portraits, terrain remain unchanged.

## Arena ground and obstacle art handoff (PR17)
The approved canonical Arena texture is `public/assets/terrain/arena-ground.png` (1024×1024 opaque PNG, seamless in both axes), replacing the legacy `terrain/ground.png` 64×64 contract. There is **one** canonical ground filename, not two. This PR reserves the asset path only: the procedural Arena renderer remains in use until a separate texture-integration PR after manual upload.

Future independent obstacle images belong under `public/assets/obstacles/`, above the ground visually. Exact obstacle filenames, dimensions and sprites are **not yet approved**; no speculative obstacle entries are added to the manifest. The former generic `terrain/obstacle.png` placeholder is withdrawn from the active manifest. The directories contain only tracked `.gitkeep` files until manual user uploads.

## PR21 — Aloes equipment visual variants (pending artwork)
Four optional **512×64, 8-bit RGBA** horizontal spritesheets, eight contiguous **64×64** transparent cells with no padding: `public/assets/player/player-unarmed.png`, `public/assets/player/player-blunderbuss.png`, `public/assets/player/player-rifle.png`, and `public/assets/player/player-flamethrower.png`. Facing indices: **0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE**. Same centered origin (32,32), consistent feet alignment near y54, no baked ground shadow. Existing `player/player.png` remains immutable legacy fallback. Runtime initial request = `unarmed`; absent/invalid variants fall back to legacy, then procedural marker if legacy unavailable. `setVariant(id)` changes illustration only; it does not select or configure a gameplay weapon. URLs use Vite BASE_URL. All new images are supplied manually by user; no binary generated by implementers. The stable variant IDs are `unarmed`, `blunderbuss`, `rifle`, `flamethrower`; the former provisional `firearm` identifier and path are no longer approved. These paths are supplementary pending variant contracts, not replacements for the existing player entry.

## Bobrozombi V2 — optional runtime visual integration

User-supplied `public/assets/enemies/bobrozombi.png`: exact 768×96 8-bit RGBA PNG, horizontal 8×96×96 frames E, SE, S, SW, W, NW, N, NE. Transparent background and no baked ground shadow. Runtime validates PNG metadata, decodes once per Arena startup, shares one Phaser texture, and renders at initial scale 0.75 with a feet-baseline offset; procedural enemy fallback remains fully playable if missing or invalid. Source frame is not a physics body: HP 3, speed 65, collision radius 21 remain unchanged. Visual final approval on physical Android requires the manually uploaded approved PNG. Other enemy sheet contracts remain 384×48.

## HP face HUD V1 — authoritative five-state contract

The historical three-band `hp_high.png` / `hp_medium.png` / `hp_low.png` proposal is superseded and **not active**. User manually uploads five original, approved 128×128 RGBA PNGs to `public/assets/portraits/hp_5.png`, `hp_4.png`, `hp_3.png`, `hp_2.png`, and `hp_1.png`; all paths below `public/assets/portraits/` use those exact names. Each has transparent pixels outside its circular art and its own background inside. Current HP 5/4/3/2/1 uses corresponding exact file; 0 reuses `hp_1.png` subdued. All artwork is optional at runtime: missing/invalid art falls back to a procedural numeric HUD face; no binaries are committed. The HUD uses Vite BASE_URL, validates PNG byte header and 128×128 RGBA dimensions, and ignores stale async responses after HP changes.

## Bocianołak V1 (second enemy; 28-enemy arena)
Approved optional `public/assets/enemies/bocianolak.png`: 1024×160, eight consecutive 128×160 8-bit RGBA frames (E, SE, S, SW, W, NW, N, NE), transparent exterior, no spacing. Source feet near y153. Visual scale is a named independent constant, not physics-derived; creature uses 2 HP, 85 px/s, radius 18 with bounded lateral weaving. Arena schedules 18 Bobrozombi and 10 Bocianołak, max three living, rewards at total kills 5 and 10. User uploads PNG manually; absent/invalid binary has code-drawn fallback.

## Marcin V1 — visually approved production sheet (PR44 asset handoff,2026-10-31)
Canonical `public/assets/enemies/marcin.png`:2048×256,8-bit RGBA,8 horizontal256×256 frames, E/SE/S/SW/W/NW/N/NE, zero spacing/trimming, NEAREST, no baked ground shadow or extra animation frames. User uploads the unchanged approved PNG manually. No repaint/recolor/regeneration or changes to existing enemy sheets.

Runtime `enemy-marcin-v1`: scale0.68, source feet baseline y240, centered origin, local Y−76.16. The visible alpha bounds across8 poses render roughly126–156px wide and138–150px high, larger than Żubrokryptyda. Main head/chest/belly damage circles are pose-specific in `src/marcin-visual.js`; logical r40 movement/contact remains unchanged. Tail tips, mohawk and alpha margins do not become a frame-sized collider. Missing/wrong-size/non-RGBA/undecodable PNG retains the existing procedural fallback. Landing, warning, projectiles and pixel death remain code effects.
