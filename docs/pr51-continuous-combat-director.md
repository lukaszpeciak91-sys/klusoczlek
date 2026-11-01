# PR51 — Continuous Combat Director (implementation under review)

Supersedes PR49/PR50 finite ordinary-wave budgets. The six *active gameplay time* boundaries remain 35/75/120/170/225 seconds; Marcin introduction is 260 seconds. Old survivors persist. Ordinary spawns are no longer constrained by a per-wave lifetime quota.

## Architecture
- `src/encounter-director.js` is a pure deterministic module: no Phaser timers, listeners, textures or physics bodies. Given current elapsed gameplay time, wave and bounded population sample, it emits at most one opportunity. Repeated paused updates have no effect; after a large time jump no catch-up loop runs.
- Profiles (target/cap) are 4/6, 5/7, 6/8, 7/9, 7/9, 8/10. Weight profiles are respectively 100/0/0, 70/30/0, 55/35/10, 45/40/15, 40/45/15, 35/45/20 percent (Bobrozombi/Bocianołak/Żubrokryptyda).
- Deterministic weighted deficits consider counts of **successful** spawns during the active wave. Unique ordinary heavy exclusion remains in the scene. Priority introduction candidates preserve the existing visible living actor requirements.
- Normal scheduling ~975–1325 ms; zero visible/nearby pressure ~390–569 ms. Soft target can temporarily exceed by one under no-visible-pressure; hard cap never bypassed. Camera-aware placement and defer continue through PR50 selector.
- 235-second taper reduces soft replenishment above seven; 242-second handoff stops replenishment to permit natural decline before Marcin; regular spawns are disabled entirely once the 260-second introduction is claimed. Special scheduler dispatches only two escorts and 12 reinforcements; existing seven-nonboss cap and landing conditions persist.
- Kill HUD is a raw earned-kill count, no fictitious finite denominator. PR48 scripted victory effects must not award neutralization kills.

## Review gates / remaining work
This branch was modified through the GitHub connector because the local checkout could not reach github.com (DNS). The code and test additions are **not yet validated by local npm/node/Chromium**; do not merge until CI and independent audit identify and resolve stale finite-budget test expectations, including browser fixture assumptions. In particular existing PR49/50 tests still encode finite totals and 275ms cadence and must be superseded with equivalent continuous-duration regressions, not simply disabled. Extended 3-seed × 3-viewport real Chromium measurements and physical Android are still outstanding. No deployment.

## R1 — causal narrative gates (2026-11-01)

- Bocianołak remains an ordinary independently spawned, mortal enemy. Its existing three-line introduction is claimed only with a currently visible living Bocianołak and a player-earned Bobrozombi kill recorded in **wave 2 or later** within the preceding 5000ms of the same existing gameplay clock. Death can occur before or after the enemy appears.
- Żubrokryptyda introduction follows the claimed Bocianołak introduction, needs a living visible heavy and two eligible ordinary kills in the preceding 8000ms, with at least one kill during wave 3 or later. Death history stores at most 32 recent ordinary kill records, ignoring PR48 scripted neutralization and special encounter entities.
- Eligible context (event ID, claim time and kill timestamps) is sealed before freezing gameplay. Dialogue/MENU/blur/orientation stop the existing gameplay clock; wall-clock time does not age this history.
- The ordinary director no longer raises spawn targets for unclaimed introductions or forces a priority species/spawn. Pending narrative stays optional, does not gate timed waves, and never alters combat population caps.
- **Boss handoff precedence:** At the 260,000ms claim, Marcin's narrative takes precedence. Any unclaimed Bocianołak/Żubrokryptyda introduction boundary or candidate is dropped without creating any artificial death or dialogue; a previously claimed introduction can complete before the active clock reaches boss time. PR43 first-hit remains independently eligible. Nothing postpones the boss for missing ordinary introductions.
- R1 changes are on the existing draft PR51 branch. Browser fixtures written under PR36/49 assume automatic introductions and may need their evidence setup migrated. Neither PR nor release is approved until full CI and independent audit.
