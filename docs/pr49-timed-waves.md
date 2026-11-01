# PR49 — timed overlapping waves and controlled species mix

Verified base main: `a2da35c1c939ea52eb13629e463cc3e495cfac8b` (merged PR48, head `af4ee2130d25b4052f32ae419b7c7a3374b59944`). Branch `feat/pr49-timed-mixed-waves`. No merge/deployment/delegation/binary or dependency changes.

## Authoritative episode schedule

`src/episode.js` exports immutable `WAVE_TIMING`, derived from durations35/40/45/50/55 seconds and an unbounded sixth wave. Only the existing `gameplayClock.elapsedMs` drives progression; no competing timer or new HUD clock.

| Wave | Active time | Bobrozombi | Bocianołak | Żubrokryptyda | Live ordinary cap |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:35 | 12 | 0 | 0 | 4 |
| 2 | 0:35–1:15 | 11 | 5 | 0 | 5 |
| 3 | 1:15–2:00 | 11 | 8 | 1 | 6 |
| 4 | 2:00–2:50 | 11 | 11 | 3 | 7 |
| 5 | 2:50–3:45 | 12 | 14 | 4 | 8 |
| 6 | 3:45 onward | 12 | 17 | 6 | 9 before boss |

Immutable budgets remain138 regulars. PR48's Marcin, two escorts and8+4 reinforcements remain unchanged:153 planned maximum. The HUD denominator describes that planned budget, **not required kills**. Only player-earned deaths increase the numerator; cancellations and the boss's scripted minion resolution do not.

Dialogue/loading, MENU, pause, focus loss, portrait orientation, boss landing and terminal states do not advance active time. `advanceTimedWaves` crosses each boundary once, including multiple boundaries after a slow active frame. There is no kill-based intermission or cleanup requirement.

## Overlap and bookkeeping

Living actors retain object identity, world positions, HP, movement/ignition state and `waveIndex` across boundaries. Death bookkeeping credits the actor's original wave, while all live nonboss actors count toward the current cap. Ordinary deaths never advance a wave or award boundary rewards.

At expiry, discard only that wave's unspawned `spawnQueue`; `cancelledByWave` records skipped population separately from `spawnedByWave`/`defeatedByWave` and earned kills. Activate a fresh current-wave queue. No old unspawned schedules accumulate. At boss death, cancel the remaining current-wave queue too. Possible regular population obeys spawned + cancelled + current/future budgets =138; spawned survivors may later die normally or via PR48's uncredited resolution.

The scene preserves the existing initial three Bobrozombi and380ms ordinary spawn pacing. A boundary schedules one next opportunity rather than filling the entire cap in one frame. Capacity and blocked placement defer attempts; kills free slots for the **current** wave. Safe spawn distance220px, obstacle clearance/navigation and movement radii are unchanged.

## Deterministic controlled mixing and introductions

`mixedWaveOrder(seed,wave)` builds each session's frozen planned order from unchanged budgets. It owns a salted, fresh seeded RNG instance; it never consumes arena-layout, effects or ambient-bark RNG state. Heavy entries occupy evenly spaced jittered buckets in waves4–6 (early/middle/late); wave3's first heavy is first. Weighted deficit selection spreads the two common species with bounded tie jitter and avoids a third consecutive identical common entry while alternatives remain. Wave1 is all Bobrozombi; wave2's first entry is Bocianołak.

At dispatch, an already living ordinary heavy blocks another ordinary heavy, not all available common species. Deferred heavy entries remain in the current budget until a slot is safe or that wave expires. Actual heavy appearances therefore depend on player kills and the preserved one-ordinary-heavy rule; planned heavy distribution is not a guarantee to spawn every budgeted specimen.

Introductions become owed at wave2/3 and remain pending across discarded queues. An owed species with no living specimen has priority at the next safe free slot, drawing from the current budget, without extra or immortal actors. Full caps defer it. Existing live/visible selection and replacement-after-death behavior remain; Bocianołak introduction precedes the heavy introduction. At568px width, additional bounded samples at the actual visible-body edges enable safe220px introduction placement where the old32% samples were too close. All candidates still pass existing visibility/distance/navigation checks. At320×240, no safe fully visible point may exist; use the existing offscreen spawn and wait for a living specimen to enter view, without teleporting or shortening the safety distance.

PR43's standard first-hit portrait remains one-shot and pausing. PR46 ambient barks remain independent/non-pausing and retain cinematic suppression. Dialogue text, layouts, physics and input contracts are unchanged.

## Rewards and timed Marcin handoff

Crossed boundaries offer rifle+heart at1:15, flamethrower+heart at2:50 and a heart at3:45, once each. A multi-boundary jump issues every earned reward once. Existing placement retries, optional collection and uncollected pickup persistence remain. No collection gates progression.

`BOSS_INTRO_MS=260000`: claim the existing two-line Bobrozombi call once at4:20 active time, regardless of kills, remaining budget or arena emptiness. Keep the current wave6 queue as optional regular work for PR48's fair boss scheduler; older queues have already expired. Existing Marcin landing/attacks/tuning, two escorts and twelve reinforcements are retained.

**Crowded handoff:** timed wave6 can contain8–9 survivors, while PR48 permits7 nonboss actors during the boss encounter. Preserve them all: show the timed introduction, then keep landing pending until at most7 remain. Combat/input continues while waiting; new ordinary spawns already obey cap7. No forced despawn/damage/teleport or over-cap landing. Once safe capacity and landing geometry exist, the original cinematic runs. Actual landing may thus occur later than4:20; the introduction trigger remains time-based.

Marcin's death retains the PR48 terminal state, mass pixel deaths, cancelled future spawns, settled VFX, three-line Marcin→Żubrokryptyda→Aloes epilogue and victory after final DALEJ. No seventh wave or alternate victory path.

## Verification, tuning and limits

Focused RED tests preceded implementation. Unit regressions cover all boundaries, large jumps/exactly-once crossings, cancellation/accounting, no death advancement, fixed budgets, repeated/varied seeds, bounded species runs/heavy spread, current-budget introduction priority, blocked-heavy bypass, sole-clock pause exclusion and reset. Additional RED→GREEN tests cover safe568px introduction edges. Obsolete kill-gated assertions are explicitly replaced by timed progression assertions; combat/geometry/balance/optional-art tests remain.

Executed npm ci/build exit0, full Node183/183 and complete real Chromium70 PASS groups exit0; reviewed9 screenshots. Final CI link belongs to the PR and external evidence. Independent1024-seed/6144-schedule audit passed (12288 generations263.8ms total; transient heap delta~0.85MiB, GC-sensitive/no threshold). Complete real Phaser/Chromium coverage is retained. New scenarios use seeds1/41/104729 at568×320,800×360 and320×240: natural clock intervals, blur/dialogue/MENU freeze, actual35/75s introductions, retained actors,120/170/225s jump rewards, all9 survivors retained at260s, cap7 landing handoff,14 finite special arrivals and PR48 victory with49 earned kills of153 planned. Long scenarios use deterministic fixtures on the existing clock; native-scale mixed-species screenshot positions are staged QA actors, not production teleportation. PNG dimensions are asserted; screenshots stay outside Git.

Physical Android Chrome is NOT RUN and remains a separate acceptance gate. Proposed timings/mix are initial tuning, not final balance approval. Short-screen introductions may wait for natural approach; boss landing can wait for capacity. Automated evidence is not a manual full-length playthrough or device performance benchmark. Independent external read-only audit is requested before merge. No merge or deploy.
