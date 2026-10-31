# PR45 — Forest Obstacles Production Art Integration

Base main `ccfe5da4ec14509df6e683f4bc44c44ca2a1dfb5`; PR40–44 verified merged. Branch `feat/pr45-forest-obstacle-art`. No merge/deploy/image generation.

## Handoff and exact approved source

Source is the actual attached `Klusoczlek_Forest_Obstacles_V1_POBIERZ.zip`. Production path: **public/assets/obstacles/forest-obstacles.png**. Approved atlas:1024×768 RGBA8,4 columns×3 rows,256px cells, zero spacing/trimming. SHA256 `937912656422d9f549f707396228f34d595f88365c53faf896a320d5b0bc49b0`,656412 bytes. All12 cells match the individual PNG pixels; alpha bounds match supplied JSON exactly; frame borders are transparent.513658 fully transparent pixels/39200 partial-alpha pixels.

Direct binary Git commit succeeded locally, but two terminal pushes failed with exit128: `fatal: could not read Username for 'https://github.com': No such device or address`. User then explicitly changed delivery to code/paths only and manual PNG upload. The binary checkpoint is excluded from this PR history. Local PNG is used unchanged for real QA, not published by a text API. Supplied forest-obstacles.json is included unchanged; artwork is never repainted, regenerated or serialized into source.

**Manual installation:** on this feature branch upload only the unchanged atlas as `public/assets/obstacles/forest-obstacles.png`. JSON is already included in this PR. Individual PNGs/checkerboard/ZIP are not required for runtime. After upload, rerun Node/browser checks and request independent audit before merge. Until uploaded, visible procedural fallback is expected.

## Renderer and frame contract

`forest-obstacle-art.js` is immutable metadata derived from the supplied JSON. `obstacle-renderer.js` creates a depth4 container at the existing footprint position/angle immediately, with a visible existing procedural fallback. One optional async atlas request per scene (cached texture reused across NEW GAME), Vite BASE_URL, strict PNG header/decode validation, NEAREST,256px spritesheet frames. Images share the same texture; no per-frame texture creation or navigation rebuild.

Each image uses supplied normalized anchor_px, uniform scale and the listed local Y correction. Corrections for tall props bring the lowest painted contact edge close to the existing footprint's lower bound instead of leaving an invisible ground margin. PNG pixels and metadata remain unchanged. Logs/vegetation/rocks/new rubble rotate rigidly around footprint center. Barrel and toi-toi counter-rotate the image and its Y correction to stay visually upright; their existing circle/nearly square rotated box remains authoritative. The toi-toi's single-view drawing cannot exactly portray every rotated52×46 ground box.

| Frame | Source ID | Type/variant | Source anchor | Scale | Local Y correction | World footprint |
|---:|---|---|---|---:|---:|---|
|0|rock-small|rock/small|128,128|.435|0|circle r23|
|1|rock-medium|rock/medium|128,128|.396|0|circle r31|
|2|rock-large|rock/large|128,128|.419|0|circle r43|
|3|stump|stump/default|128,128|.300|0|circle r24|
|4|fallen-log-short|fallen_log/short|128,128|.360|0|capsule84/r19|
|5|fallen-log-medium|fallen_log/medium|128,128|.530|0|capsule126/r21|
|6|bush-round|bush/default|128,128|.320|0|circle r30|
|7|bush-wide|bush/wide|128,128|.440|0|capsule78/r24|
|8|toxic-barrel|toxic_barrel/default|128,222|.380|16|circle r23,3HP|
|9|toi-toi|toi_toi/default|128,222|.400|15.2|box52×46|
|10|tire-pile|tire_pile/default|128,208|.375|18|capsule78/r24|
|11|broken-wheelbarrow|broken_wheelbarrow/default|128,204|.440|13.4|capsule90/r20|

Painted rock widths approximately53/71/99px preserve visible relative size; short/medium logs84/125px. Source vegetation fringes, stump roots and wheelbarrow handles may overhang the main ground collider. Tall props use ground footprints, not full-height PNG hitboxes. This is **not pixel-perfect collision**. Source QA describes approximate GrabCut alpha extraction from a flattened painting; faint edge contamination/earth traces may survive. Artwork is kept unchanged; screenshot/physical Android acceptance remains important.

## Two additional families / preserved behavior

Immutable tire_pile and broken_wheelbarrow catalog entries are solid, Infinity HP/non-destructible, default variants, semantic frame10/11 mappings. Conservative capsules fit the broad three-tire mass and elongated wheelbarrow basin; small handles/foliage may overhang. Existing PR40 primitives/resolver/first-hit/flame obstruction/spawn/pickup clearance apply without a second geometry system.

Targets0–1 each appended to existing layout limits; inherit middle/outer zones,250px start clearance,140px object separation, bounded100 attempts and safe omissions. Old six-family RNG placements remain identical for the tested seeds; new families consume RNG only after original placements. Connectivity cleanup can omit new clutter. All original ten footprints unchanged. No geometry-engine, player/enemy stat, weapon, wave, dialogue, boss, ground, HUD, steering or input changes.

If load fails or is delayed, fallback is always visible. Late attachment skips destroyed containers (including exploded barrel). Scene shutdown aborts pending fetch and discards renderer state; failed decode catches errors/revokes temporary URLs. Texture persists at game scope for reuse; scene objects are bounded and cleaned up. Barrel container alpha/hit flash/destruction uses existing combat paths and exactly-once explosion.

## Verification and performance

RED3 initial mapping/new-family contracts → GREEN Node166/166, build exit0, full real Chromium55 PASS groups/exit0 with actual approved atlas. Exact final HEAD/CI results are in the PR and external QA package. Local tests include approved PNG SHA/header integrity; when manually managed PNG is absent (e.g. code-only CI), that one integrity test explicitly skips. Browser never substitutes synthetic obstacle artwork: missing PNG skips positive visual QA explicitly but executes missing/header/decode/shutdown fallback tests. Install PNG or set FOREST_QA_PNG to an approved local atlas to run positive checks.

Real Chromium uses actual approved atlas: all12 frames/origins/uniform scales/angles, cached reuse across sessions, gallery/three seeds at320×240/568×320/800×360, barrel removal, fallback and delayed shutdown. Complete existing six-wave141-kill/boss/optional-pickup/narrative/MENU/orientation regressions remain. Node checks all actor grids including r40 boss, actual local pursuit around rotated new capsules, player sliding, within-range flame occlusion and swept projectile hits. Old10 shapes and protected gameplay files compared to base.

Existing benchmarks: tests/bench-pr41.mjs (20 deterministic seeds) and tests/bench-pr40.mjs (15/50/150 objects,4 navigation builds/500 segment queries). Raw measurements are external evidence, not CI thresholds. Representative observed geometry totals:15 objects84.36ms grid/13.16ms segments;50 objects131.63/16.60ms;150 objects287.90/38.85ms;30000 typed-array bytes per15000-cell grid. Process heap snapshots include all Node overhead, not isolated texture memory. Decoded atlas pixel storage is about3MiB; all images share one game texture.

Physical Android Chrome NOT RUN. Automated screenshots/fixtures do not establish every possible seed's human playability or sustained device performance. Independent read-only audit requested before merge; user decides merge. Future artwork replacements must preserve dimensions/order/anchors or update supplied JSON and immutable mapping plus visual QA; never modify collision geometry solely to fit art.

A retained PR44 projectile-only fixture initially attributed valid boss contact to a blocked shot at320×240. Diagnostic source trace confirmed projectile damage at distance65.8px then Marcin contact at56.6px. Fixture now holds the boss stationary after the verified volley while checking isolated projectile/invulnerability/rock behavior; assertions and production boss mechanics are unchanged.
