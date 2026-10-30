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
