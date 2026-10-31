# PR44 — Marcin: Episode 1 final encounter contract

Base: `02460512b12304a6d7e126019b2cd81f9593d23f`, merged PR43. No merge/deploy/assets/dependencies in this PR. Independent audit required before merge.

## Accounting and narrative

The six `WAVES` arrays retain all 138 original normal specimens and their limits. `NORMAL_ENEMIES` derives from those arrays; `FINAL_ENCOUNTER` owns three unique IDs: marcin, escort-1, escort-2. `TOTAL_ENEMIES` derives from both (141); HUD uses that same export. Normal spawn/death indices never include the special roster. Spawned/defeated ID sets reject repeated special bookkeeping; scene `dead` guards reject duplicate effects and kills.

On wave6, remaining normal enemies = scheduled35 minus confirmed normal deaths, including both living and not-yet-spawned specimens. At six remaining, claim one session event and queue `before-marcin`. Drain at a safe update checkpoint after the entire combat damage batch. Existing introductions and PR43 hit dialogue retain priority. Menu/other dialogue retains the event; NEW GAME recreates it. No immortal speaker specimen.

Standard Bobrozombi portrait panel, exactly two lines:
1. BOBROZOMBI — Taki jesteś?! Czekaj aż zawołam Marcina
2. BOBROZOMBI — Marcin! Maaaarciiin!

The existing panel owns DALEJ, physics/time/input freeze, loading and shutdown. All five earlier narrative scenes and original three-line finale remain verbatim.

## Entrance state machine

Second DALEJ → finite viewport-local safe-point search → preparation500ms → descent650ms → impact/dust/shake300ms → active. Preparation/landing suspend combat, player physics, both sticks and gameplay clock. Progress uses capped simulation deltas only while focused, landscape and active; MENU pauses it, WZNÓW preserves elapsed time. Unlanded visual can reselect a safe point after a smaller landscape resize, without moving camera or any live combat entity.

Safe point: entire visual fits current viewport, at least105px from Aloes, at least48px footprint clearance and reachable in the boss navigation snapshot. One extra r40 grid is created at scene initialization, never during movement/firing. If no point is available, retain pending entrance and retry a bounded scan every500ms while normal combat/player movement continues. No recursive regeneration or forced overlap. Tested36 landing queries across three seeds, four world positions and three viewports: no missing point. Arbitrarily crowded future authored layouts may still defer entrance until player moves.

Boss visual is allocated once during descent and enters the target/kill roster only at impact. No landing damage. Shake300ms at intensity0.006; no camera jump or permanent scale change. Escorts use finite existing safe-spawn candidates, first250ms after landing, second700ms later; failed safe placements remain pending for500ms retries. Exactly two IDs, no reinforcement loop. Normal heavy gate counts ordinary heavies separately; escorts may coexist. All normal queued enemies still spawn.

## Entity, geometry, weapons

`marcin` has provisional HP36, speed38 world px/s, contact damage1, movement/navigation/contact circle r40. These values live in `MARCIN` and feed the enemy registry. Existing player/enemy stats are unchanged.

Procedural massive beaver body: two broad shoulders, belly, head/ears, teeth and red eyes. It is wider/taller than the heavy placeholder/art, without stretching a96px texture. Four PR40-supported damage circles relative to logical feet:

| Part | X | Y | Radius |
|---|---:|---:|---:|
| Head | 0 | -87 | 31 |
| Left shoulder | -25 | -48 | 43 |
| Right shoulder | 25 | -48 | 43 |
| Belly | 0 | -20 | 44 |

Projectile first-hit and flame predicates reuse PR42 composition and PR40 geometry/occlusion. No Arcade damage bodies or rectangular frame collider. Existing PR41 position resolution/local steering handles r40. No changes to heavy damage footprints, original hitboxes, obstacles or layout generation. Explosion damage still uses original logical-position/radius rules. No new damage multipliers. Flame retains damage/cadence/pressure and shares the existing heavy ignition/panic profile; Marcin stops for warning/recovery even while burning. No new burn damage-over-time.

## Attack and bounded effects

Chase cooldown6000ms → stopped flashing warning900ms → eight simultaneous projectiles spaced45° → stopped recovery450ms → chase. HP<=12 shortens only chase cooldown to4000ms. Projectile speed180, radius6, damage1, lifetime9000ms, world-bound expiry, hard live cap24. A volley uses logical feet as origin and is independent of facing. Full warning is the reaction window; there is no annular spawn offset that skips nearby player/obstacles.

Each projectile sweeps PR40 geometry against solids and the existing Aloes r17 circle; earliest impact wins, obstacle wins ties. One consumed projectile cannot hit twice. Existing player invulnerability handles simultaneous impacts. Shots never target enemies or damage barrels. Simulation freezes under existing dialogue/menu/focus/orientation gates. Boss death clears all boss shots immediately; terminal outcome and shutdown also clear them.

Compact MARCIN bar sits below existing top HUD; repositions with current viewport, no normal HUD composition changes. Hidden during narrative, entrance, death and terminal states. Red pixel-death uses existing scene-independent burst lifecycle with bounded88 fragments/650ms, so it finishes while dialogue freezes combat.

## Completion and art handoff

Final-pending requires all138 normal deaths and all three special deaths, with no living enemies. Either boss/escort death order is valid. Defeat retains precedence. Existing finale then releases victory; no wave7. Boss references/projectiles are inactive after death/victory.

Approved production artwork (D035): canonical `public/assets/enemies/marcin.png`,2048×256 RGBA8,8×256px E/SE/S/SW/W/NW/N/NE, no spacing/trimming/baked shadow, NEAREST. Dedicated loader validates header and decode, attaches to existing/future boss containers, guards shutdown and retains unchanged procedural fallback on failure. Scale0.68/source feet baseline240 gives localY−76.16. No artwork altered or committed; user uploads PNG manually. Current source used for QA: approved `marcin(1).png`, SHA256 `ddb2c500a3e01df2c4cc605f9c302c2aea176825283eddf181a30cf0eab06bf7`.

`src/marcin-visual.js` contains3–4 head/chest/belly circles per direction in source coordinates relative to frame center128. Same PR42 API transforms those by actual rendered pose/scale; fallback keeps the original world-space union listed above. Source alpha bounds were inspected for all8 frames; circle centers are opaque. Circle approximation includes1.8–6.2% transparent area, not pixel-perfect collision; remote tail tips/mohawk are excluded. No per-frame texture sampling. r40 movement/contact and heavy footprints unchanged. Landing envelope152px above/84px sideways/44px below covers both art/fallback, with inclusive scan endpoints for320×240. Cached navigation filters candidates without rebuilding grids.

## Executed verification and limits

- RED: three new contract tests failed before implementation; focused GREEN subsequently passed. Node final159/159, no skips.
- Real focused Phaser/Chromium: seeds1/41/104729 at568×320,800×360,320×240; actual standard dialogue, MENU/portrait landing pause, r40 connected snapshots, exactly two escorts, warning/stationary boss, eight actual velocity vectors, real Pukawka/rifle/flame impacts, blocked boss projectile, player invulnerability, lowHP timing, active volley death cleanup. One live generated-obstacle detour76px reached target/contact range; all generated representative blockers also checked by repeated numerical movement.
- Full required final command results and GitHub CI are recorded in PR44 and the external evidence package for its exact published tree; do not treat a queued CI run as PASS.
- Representative Node measurements (Linux x64, Node24.22.1): layout23–50ms, extra boss grid5.2–5.6ms;12 landing searches3.1–5.3ms per seed;124200–127200 projectile sweeps230–246ms. Heap snapshots9.8–11.9MiB include the entire Node process, not incremental boss allocation. No machine-dependent CI thresholds.
- Physical Android Chrome NOT RUN. Mobile acceptance must assess thumb occlusion, landing/volley clarity, camera-shake comfort and sustained performance. Tuning/art remain provisional; headless Chromium timing is not device performance. No full pathfinding or randomized new arena generation added.
