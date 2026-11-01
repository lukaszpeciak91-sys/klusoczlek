# PR50 — ordinary combat pacing and camera-edge entry

Verified main/merged PR49: `cc7c3b3f9cd091447b43e170f4133bc0d8363589`. Branch `feat/pr50-combat-pacing`. No merge, deployment, delegation, binary, dependency or balance changes outside the approved ordinary pacing contract.

## Scope

Ordinary live caps become **5/6/7/8/8/9**. All living survivors from earlier waves consume current capacity. Budgets remain12/16/20/25/30/35 with unchanged species counts/mixing,138 normals and153 total planned. Timed starts35/75/120/170/225 seconds and260-second Marcin call are unchanged. One ordinary heavy remains the maximum. Boss cap stays seven nonboss actors.

`ORDINARY_SPAWN_INTERVAL_MS=275` in `src/enemy-spawn.js` owns ordinary opportunities/retries. Keep the original three pre-dialogue Bobrozombi; after final opening DALEJ, schedule paced refill toward the current cap. No full-cap batch, pause backlog, extra population or new player invulnerability. The existing clock/dialogue/input contract freezes contact and movement during narrative.

## Placement

The old `safeEnemySpawn` samples world edges, about1018px from the initial player. New `selectOrdinarySpawn` is a small pure bounded selector, using the actual camera view, arena seed and ordinary spawn ordinal without consuming another subsystem's RNG. During create, Phaser's public bounds-clamped `camera.getScroll(player.x,player.y)` supplies the future follow view before its first render; it does not move the camera or existing actors.

Try an inset perimeter, the edge, then a shallow exterior band,20 candidates each. Choose the nearest safe candidate within the first usable band; seeded tie order and small tangential offsets vary entries. Minimum player distance remains220px. Existing `clearPoint` enforces world bounds, radius+4 obstacle clearance and conservative navigation reachability. Live actors additionally retain radius-sum+12 spacing. No center pop-in or overlapping enemy placement. If camera candidates fail, try the existing finite world policy; if nothing is safe, defer without consuming the budget. Diagnostic counters record camera/fallback/deferred selections, without HUD additions.

The first-species visible/living introduction candidate policy retains priority, then uses the new ordinary fallback. Short-screen introductions still await a genuinely eligible specimen; no teleport, immortal actor or safety-distance reduction.

**Controlled boss encounter is excluded from the new placement/cadence policy:** Marcin landing and escort/reinforcement placements remain unchanged; ordinary wave-six work dispatched by PR48's shared scheduler retains its old world fallback too. Its380ms scheduler and seven-slot cap are untouched, avoiding an unnecessary finale density increase. Waves5/6 retain their prior live caps. Preboss ordinary opportunities use275ms as requested.

## Evidence and limitations

Baseline real Chromium measured all nine seed/viewport combinations: seeds1/41/104729 ×568×320/800×360/320×240. Initial three at world corners were1018px away; many cases had zero visible enemies within10s, and no actor reached160px threatening range in that observation window. Such null measurements mean **not observed within10s**, not infinite delay.

Seven focused regressions were RED before their respective fixes: early cap/cadence/camera safety and a subsequent568px side-entry visual correction. Retain old tests; replace only obsolete cap values and blocked-world-only spawn fixtures with the new approved contract. Node190 tests pass. A focused real Phaser run passed all three viewports, actual275ms-paced arrivals, current capacities with an old-wave survivor, ordinary-heavy uniqueness and MENU/focus/orientation safety. Complete Chromium72 PASS groups exited0. Nine-case before/after: first enemy in first active frame, two visible by233ms;4–5 visible at1s versus0 before,160px threatening range1.15–1.52s, max live5. Opening attempts:42 camera,3 safe world fallback,0 deferred. Final CI and full metrics/screenshots belong to the PR and external evidence.

Browser measurements define visible as at least8×8px intersection of rendered sprite bounds with the real camera; screenshots provide the visual check. Threatening range means160px logical distance (diagnostic only, not contact reach). Stationary10s density measurement uses test-only invulnerability after proving dialogue freezes unchanged HP and positions. No production protection is introduced. Legacy UI fixtures may isolate actors; real contact/invulnerability/defeat regressions remain.

At320×240 the220px safety radius is larger than the viewport's half-diagonal: fully visible safe births cannot be guaranteed. Shallow corner entry, partial silhouettes and eventual world fallback are intentional; existing joystick/HUD overlays may cover part of entering artwork. Never shorten safety distance to force visibility. Camera-only preference is not a guarantee if obstacles/navigation deny all local candidates. No new grid or pathfinding, no per-frame world search or texture work. Physical Android Chrome remains NOT RUN, requiring user acceptance of pressure/readability and initial pacing tuning.

Independent read-only audit required before merge. PR48 fatal-boss terminal safety, pixel VFX, cancelled queues, truthful kills, final portraits/DALEJ and victory remain authoritative.
