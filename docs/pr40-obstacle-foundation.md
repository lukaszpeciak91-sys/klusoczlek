# PR40 R1 — obstacle geometry authoring and validation

PR40 provides a **foundation only**. The live Arena still uses its legacy obstacle implementation; the generated clearing, visuals and integration are deferred to PR41.

- Author obstacles with `createAuthoredObstacles([{id:'bush-1',type:'bush',x:100,y:200}, ...])`. Each instance must have a unique ID.
- Six semantic types: rock, stump, fallen_log, bush, toxic_barrel, toi_toi.
- Geometry: circle (radius), box (width/height), capsule (total length and radius). All units are world pixels; angles are radians.
- `validateFootprint` rejects unknown shapes, nonfinite parameters, zero dimensions, and capsules shorter than twice their radius. Authoring constructors validate at placement; do **not** validate every collision query in hot loops.
- `validateRadius` checks nonnegative actor/projectile radii at appropriate API boundaries.
- Runtime damage/alive state belongs to individual instances, never immutable catalog definitions.
- PNG keys and placeholders are metadata, not evidence of visually approved collision alignment. Artwork handoff must verify scale and anchors.
- `reachableCells` is a conservative 4-neighbor grid flood fill, NOT pathfinding or a promise that direct-pursuit AI will route around obstacles.
- Navigation collision is inflated by actor radius + safety margin + half cell diagonal. This avoids false acceptance through discretized corner gaps, but can reject physically passable corridors. Re-run with a smaller cell size to distinguish discretization rejection from a truly blocked passage; do not treat a single rejected grid as proof of geometric disconnection.
- Navigation snapshot construction is for level creation/validation or occasional reward placement, NOT every gameplay frame. It constructs two typed arrays of approximately `ceil(width/cellSize)*ceil(height/cellSize)` bytes each, plus a bounded flood queue of position objects.
- R1 focused regression tests are in `tests/pr40-r1-hardening.test.js`.
- The benchmark harness is `tests/bench-pr40.mjs`; run via `node tests/bench-pr40.mjs`. Timing is informational and must not be used as a hardware-dependent CI pass threshold.

Deferred to PR41: procedural placement, seeding/zones, replacement of legacy layouts, shooting-target removal, Phaser rendering, image loading, pickup/spawn integration and browser gameplay regressions.

## R1 verification and performance note

The required `node --test`, `npm run build`, and Chromium regression commands were **not runnable** in the current working container: GitHub clone failed with `Could not resolve host: github.com`. No complete repository checkout is available here. No CI/build/Chromium result is claimed.

For targeted checks, current source and the three PR40 test modules were fetched from GitHub, their ESM import/export syntax was adapted in-memory, and 13 assertions were executed in an isolated V8 runtime. They passed after the tangent fix. This is **not** equivalent to Node test-suite GREEN.

Measured in that isolated runtime (coarse millisecond wall clock, one sample, 1800×1200, 12px grid; 3 grid generations and 100 segment queries respectively):
| Obstacles | 3 grid builds | 100 segment queries |
| --- | ---: | ---: |
| 15 | 348ms | 5ms |
| 50 | 871ms | 25ms |
| 150 | 1801ms | 75ms |

These values are environment-specific diagnostics, **not** CI limits or physical Android results. Grid construction scales with obstacles × grid cells; at 150 segments it is too expensive to run on gameplay frames. The cheap segment AABB broad phase reduced the 150-obstacle segment-query measurement from approximately 907ms to 75ms for 100 queries in this runtime. These figures are not a definitive browser benchmark.

Before PR40 acceptance, run `npm test`, `npm run build`, `npm run test:browser`, and `node tests/bench-pr40.mjs` in an actual checkout; review any failures and compare performance on representative devices.

## R2 executed verification — 2026-10-30

The historical R1 environment limitation above was resolved in Work with a full Git clone. Node 24.22.1 / npm 11.9.0: `npm ci`, `npm test` (138/138 after one regression addition), `npm run build`, `npm run test:browser` (Chromium 153.0.8010.0, 31 PASS groups), and the benchmark all exited 0. Browser setup was external to the project; `CHROME_BIN` selected the real engine. The full browser harness was repeated with system fonts and visually inspected HUD/dialogue screenshots.

R2 confirmed and fixed one first-entry bug: if sphere tracing exhausted its iterations during a shallow intersection and the endpoint was inside, the endpoint shortcut returned `t=1`. An interior endpoint proves intersection but does not establish entry order. The existing minimum/bisection fallback now resolves that case. The analytic regression failed before the fix and passes afterward.

Independent Node verification passed 6000 analytic shape-intersection cases and 6000 comparisons with AABB rejection disabled (maximum analytic t error approximately 1e-9). Twelve grid configurations covered all four actor radii and cell sizes 6/10/16, open ground, world edges, rotated barriers, destroyed obstacles and narrow/wide repeated-bush corridors. Three additional Chromium portrait/landscape cycles preserved player/camera identity, froze the gameplay clock in portrait, released inputs and restored the canvas.

Final actual benchmark totals (4 grids / 500 segment queries), 1800×1200 world, cell size 12, actor radius 30:

| Obstacles | Grid total | Segment total | Process heap snapshot |
| --- | ---: | ---: | ---: |
| 15 | 117.65 ms | 9.36 ms | 15935112 B |
| 50 | 144.61 ms | 25.57 ms | 17255936 B |
| 150 | 290.21 ms | 34.71 ms | 11780504 B |

Environment: Ubuntu 24.04 x86_64, Intel Xeon Platinum 8573C, 9 visible vCPUs. These are single-run diagnostics under shared host load; heap snapshots include the entire process and garbage collection effects. Grid typed arrays total 30000 bytes per 15000-cell snapshot, excluding queue/objects. No machine-dependent thresholds or optimization changes were introduced. Physical Android remains unmeasured; headless Chromium does not prove Android browser-toolbar behavior. Ready for independent final audit, without merge or deployment.
