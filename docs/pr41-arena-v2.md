# PR41 — Arena V2 forest clearing

## Contract

The 1800×1200 world, camera, approved seamless ground and all character assets remain unchanged. Six obstacle families come directly from the PR40 catalog. No final obstacle images are loaded or assumed. Three shooting dummies, their projectile response, the four fixed layouts and their inaccurate circular Arcade proxies were removed.

`generateArenaLayout(uint32Seed, config)` is Phaser-independent. Mulberry32 supplies deterministic candidates. Config can override `limits`, rectangular `zones` (world pixels) and `attempts` (1–200, default 100 per object). Defaults target rock 4–7, stump 2–4, fallen_log 1–2, bush 3–6, toxic_barrel 1–3, toi_toi 0–1, using catalog variants and radians. Catalog dimensions remain authoritative.

Default zones weight the middle/outer clearing. Every footprint is at least 96px from world edges, more than 250px from the center, and separated from another footprint's circumscribed circle by 140px. Circumscribed radii are only conservative placement bounds, never gameplay colliders. This leaves broad passages and a large open combat center. Bush instances use ordinary catalog authoring; there is no corridor/maze generator.

Generation has finite attempts and reports `attempted`, `rejected`, `omitted`, `removedForConnectivity`, `fallback`, and per-family `counts`. Counts are targets, not safety overrides. A failed placement is omitted. A disconnected conservative snapshot removes the most recently accepted object and rechecks at most the original object count plus one; the empty clearing is the final safe fallback. No unbounded regeneration.

## Geometry and Arcade adapter

PR40 `footprintDistance`, `footprintOverlap`, `firstFootprintHit`, `segmentFootprintHit` and `reachableCells` are reused. No alternate circle proxy system exists. The custom swept/sliding adapter derives contact normals from the PR40 signed distance and handles rotated capsules/boxes for both player and enemies.

The original player, 17px Arcade body, world bounds and camera target remain. A single `worldstep` adapter resolves Arcade displacement and updates body center. There are no static obstacle bodies or native obstacle colliders. Its shutdown listener captures the world object because Phaser clears `scene.physics.world` before scene shutdown completes.

Projectiles choose the earliest actual obstacle/enemy surface; flame occlusion uses actual surface hit points. Barrel HP=3, explosion radius=110, enemy damage=2, player damage=1 and the existing invulnerability path remain. Destruction immediately sets `alive=false`, destroys the graphic once and excludes the obstacle from movement/shooting/flame queries. There is no poison DoT.

## Why local steering is included

A baseline movement trial left a heavy enemy at x=639 behind a rock centered x=700 after 120 simulated seconds, still 361px from its target. Connectivity cannot fix that direct-pursuit deadlock.

The minimal adapter keeps one obstacle ID and a stable clockwise/counterclockwise side on each blocked enemy. It follows the signed-distance boundary until its radius-inflated line to the target clears, then restores the existing species movement. Travel per step is bounded by the unchanged desired species displacement; no A*, navigation graph or speed tuning was added. Panic still uses its existing finite retreat and the same collision adapter. The generator's large spacing makes isolated convex-obstacle steering sufficient for this clearing. This is not a guarantee of navigation through future overlapping obstacles or authored mazes.

## Spawns, rewards and diagnostic access

Four conservative grids (radii 17,18,21,30; cell 20) are built at initialization; every free cell must belong to the center-connected component. Only the radius-30 snapshot is retained. Spawns, visible introduction candidates and pickups additionally test the current footprints. Enemy spawn distance remains at least 220px. Finite candidates return null and retain existing retry/reward bookkeeping rather than consuming a scheduled enemy or gating a wave.

The snapshot is never rebuilt during normal movement or firing. After a barrel disappears it remains conservative, so its formerly occupied cells may still be rejected for placement. Nearby clear cells and the finite lazy reward fallback remain available. Normal rewards return from the nearby search ring without allocating a whole-world candidate array.

For QA use `?arenaSeed=41` (uint32), or scene start data `{seed:41}`. With no valid override, one crypto-generated seed is selected per new run; the generator itself has no uncontrolled randomness. `ArenaScene.arenaSeed`, `layoutDiagnostics`, and `layoutGenerationMs` expose diagnostics without HUD clutter. Invalid URL overrides fall back to a fresh valid seed.

## Future PNG handoff — pending art approval

| Family | Catalog key | Authoritative world footprint |
| --- | --- | --- |
| rock | obstacle-rock | circles r=23/31/43 |
| stump | obstacle-stump | circle r=24 |
| fallen_log | obstacle-fallen-log | capsules total length 84/r19 or 126/r21 |
| bush | obstacle-bush | circle r30 or capsule length78/r24 |
| toxic_barrel | obstacle-toxic-barrel | circle r23 |
| toi_toi | obstacle-toi-toi | box52×46 |

The placeholder graphics use local (0,0) at the footprint center, radians rotation and depth4 above ground and below actors. Their filled dimensions match the footprints; decorative detail is contained within them apart from a 1px outline. `render.asset` is attached as graphic metadata. Final filenames, image sizes, frame/variant organization, alpha silhouette, image origin, ground anchor and render scale require user/art approval. Do not infer them from these world dimensions. A future image must map its approved contact anchor to (0,0), retain this geometry and use a code fallback if absent. User supplies/commits all binaries manually. No binary assets, generated images or dependency changes are part of PR41.

## Executed QA — 2026-10-31

Base main `0ff98846e9f97f64fc6ca1509b3272624e924364`; PR40 merge confirmed. Ubuntu24.04, Node24.22.1, npm11.9.0, Chromium153.0.8010.0, Canvas/CDP. Browser engine is external to repository dependencies.

| Command | Result |
| --- | --- |
| npm ci | PASS, exit0 |
| node --test tests/pr41-arena.test.js | initial RED: missing new module; final 8/8 PASS |
| npm test | PASS, exit0, 146/146; no skipped/cancelled tests |
| npm run build | PASS, exit0, 44 modules; existing bundle-size warning |
| npm run test:browser | PASS, exit0, 34 PASS groups, zero uncaught exceptions |
| node tests/bench-pr41.mjs | PASS, exit0, 20 deterministic seeds |
| git diff --check | PASS |

Node coverage includes reproducibility, count targets, bounded impossible-zone fallback, bounds/spacing/start zone, all actor radii, actual movement of all species around representative families, 48 generated heavy spawn-to-center routes plus varied species/off-center destinations, spawn recovery, reachable rewards, rotated collisions, flame/projectile blocking, destruction, repeated bushes and dummy removal. Existing unit fixtures were migrated to PR40 constructors; the old 31px-rock panic test explicitly keeps the medium variant.

The full browser harness preserves existing controls, menus, six-wave 138-enemy progression, optional rewards, introductions, flame panic/pressure, HP, death effects and resizing. Obsolete fixed-layout assumptions were replaced with seeded layout and zero-native-collider assertions. Synthetic texture fixtures are discarded by a clean page reload before PR41 visual evidence.

Browser seeds 1/41/104729 each passed actual live heavy pursuit around a generated rock (66px detour), Arcade player movement at a rotated log, MENU/resume, portrait pause/frozen clock and landscape recovery. Nine screenshots: full world overview, 800×360 and 568×320 per seed. They are supplied outside Git, not committed binaries.

Final Node generation+validation benchmark (20 seeds): min16.35ms / median23.67ms / max40.36ms; 12–22 accepted objects. Seeds with partial omission: 2 (toi_toi-0); 3735928559 (bush-4, toxic_barrel-1); 104 (toi_toi-0); 109 (toxic_barrel-2, toi_toi-0). None required connectivity removals. Full rejected-attempt counts are in benchmark JSONL. No machine-dependent CI limits.

| Browser seed | Generation+validation | Observed frame delta mean | JS heap snapshot |
| --- | ---: | ---: | ---: |
| 1 | 46.8ms | 16.666ms | 39.6MB |
| 41 | 36.8ms | 16.666ms | 39.6MB |
| 104729 | 30.3ms | 16.666ms | 39.6MB |

Frame deltas are Chromium/Phaser scheduler observations during one-heavy QA, not CPU execution cost, a nine-enemy stress benchmark or Android performance. Browser heap is coarse process/page telemetry including Phaser/assets, not incremental layout memory. Cached navigation typed arrays total10800 bytes (90×60×2), excluding closures/objects. Node and browser timing samples are informational on a shared Xeon host.

Recovered failures are retained in the QA evidence: restored a stale crashing Chromium binary from the already downloaded package; fixed shutdown listener lifecycle; corrected a test-only dynamic-import base URL; one interrupted run was invalidated by a Vite reload during editing. The final complete run executed on frozen sources and passed.

NOT RUN: physical Android, mobile WebGL/GPU profiling, actual Android browser-toolbar recovery. BLOCKED: no essential automated gate remains blocked. No merge or deploy. **Request a separate independent audit of PR41 before merge**, especially local steering/Arcade lifecycle and representative layouts.
