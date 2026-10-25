# Character & sprite production — Art Bible v1.0

See [core direction](ART_BIBLE.md), [asset contract](../ASSETS.md), [acceptance](ASSET_QA.md).

## Aloes — identity lock (artistic approval)
Adult recognizable man; compact natural solid human build, full dark beard, distinctive **golden straw hat**, sand-beige collared shirt, dark navy trousers, brown shoes and belt; earthy saturation, dark clean outlines, simplified painterly shading, calm slightly unimpressed face. Maintain this identity, age impression and palette in every variant, facing and portrait. Approved Aloes master concept is the art-style reference for shading, detail density, lighting and edge treatment—not a mandatory monster anatomical template. A user-provided real-person reference or likeness requires explicit permission before public exposure.

### Four approved visual equipment concepts
1. **Unarmed:** established civilian silhouette and clothing.
2. **Bączek:** short, oversized primitive arcade blunderbuss; broad/stubby silhouette.
3. **Szybkostrzał:** long narrow fast-fire retro rifle; do not alter body identity.
4. **Podpalacz:** copper backpack tanks, hose, hand nozzle; humorous absurdity rendered sincerely.

Artistic approval of these concepts **is not** approval of four files, runtime weapon animations, projectile effects or damage changes. Only the optional `player/player.png` 512×64 eight-pose character sheet has a current technical integration contract; **no filenames or runtime integration standards are approved for the other three equipment sheets.**

**Proposed production arithmetic:** four equipment variants × eight directions = **32 directional source poses**, not one approved 32-frame runtime sheet. Begin with one eight-frame test. Do not modify the manifest without a separate decision.

## Monster concepts — shared technique, separate silhouette
- **Bobrozombi:** zombie-like beaver, enlarged distinctive incisors, broad beaver tail, grotesque expressive head, muted fur with restrained undead accents; no clothes by default. Placeholder behavior in game is NOT approval of final monster art.
- **Żubrokryptyda:** massed shoulders and hump, low heavy head, recognizable horns, darker imposing silhouette, folklore/supernatural mood; body scale and proportions must differ from Aloes.
- **Bocianołak — PROVISIONAL:** tall thin eerie bird-like humanoid, long beak and legs; wingless preferred **pending approval**. Not the locked identity of `enemy_fast` in the manifest. No asset name, anatomy details or final spritesheet approved.
- Other species may differ substantially in anatomy and palette; do not copy Aloes's human clothing, proportions or face.

## Camera and facing
- Characters: elevated **three-quarter top-down**, approximately **45–55° downward** as an artistic *starting point*, not a physics/engine camera setting; same apparent elevation, proportions and lighting across all views. No horizon, isometry, side view, perspective jumps or drastic foreshortening.
- World +X right, +Y down; frames: **0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE**. Whole character turns; no separate torso/leg layers.
- **Current accepted D030 technical format:** eight static poses, 1 row; player frames 64×64, sheet **512×64**; three planned enemy sheets 48×48, sheet **384×48**. Do not silently substitute historic 96-frame idle/walk/fire sheets. Bigger monster frames may be proposed after new approval; 64×64 is not a universal creature-size ceiling.
- Aim remains continuous 360°; sprite facing uses octants. Optional small procedural sway/bob belongs to *visual* GameObject only, never collision body or camera. Procedural movement is not a walk-cycle requirement.
- Player art pivot/origin remains per [ASSETS](../ASSETS.md): 64×64 local center (32,32), feet reference near y54, edge clearance; gameplay hit radius 17. No newly specified enemy pivot or collision radius.

## Art pipeline: five distinct gates
1. **Character master concept** — signed-off identity/style, high-detail reference, not playable.
2. **Directional reference panel** — eight labeled coherent 3/4 top-down views; may contain background/gutters; not yet a sheet.
3. **Extracted individual sprites** — one full body per alpha-clean 64×64 (player) or approved size; silhouette not cropped; consistent center/feet.
4. **Final RGBA spritesheet** — 8 contiguous cells, 1 row, exact approved dimensions, no gutters/foreign pixels.
5. **Runtime-integrated asset** — correct texture filtering, frame selection, scale, camera sync, fallback and phone legibility confirmed in the actual game.

AI generations are exploratory. Never assume one generation returns correct indexes, alpha, all eight poses, silhouette boundaries or identity.

## Portrait consistency
The manifest reserves **192×192** `dialogue/player.png` (provisional need), `dialogue/aloes.png` (approved *speaker identity*, not approved finished portrait), and `dialogue/narrator.png` (provisional optional narrator, **not** approved story character). Greater facial detail than gameplay sprite is fine; keep age, features, species, materials, illumination and palette consistent. Confirm readability in a small mobile dialogue box. Do not generate new speakers, unsolicited story characters or portraits merely because a manifest path is reserved.
