# PR42 — heavy damage geometry and first-hit bark

Base: merged PR41 main `2619038e8894bc6e9e35ef418b160ac2f9509002`. No world geometry, layout, steering, enemy stats, weapon tuning, waves, dialogues, art or dependency changes.

## Żubrokryptyda geometry

Previously bullets and flame used a circle centered on logical feet with radius30. That remains exactly the movement/spawn/navigation/contact contract, but no longer describes damage to the displayed body. Explosion damage still uses the existing logical-position radial test.

`enemy-damage.js` composes three PR40 circles for the main PNG body. Source coordinates are relative to the 192×192 frame center (96,96):

| Part | Local x/y | Source radius | Neutral world x/y relative to feet | World radius |
| --- | --- | ---: | --- | ---: |
| Head | 0,−41 | 36 | 0,−70.95 | 19.8 |
| Shoulders | 0,0 | 65 | 0,−48.4 | 35.75 |
| Torso | 0,39 | 43 | 0,−26.95 | 23.65 |

World values use the approved scale0.55 and Y offset−48.4. Every query reads the actual displayed sprite center, rotation and scale through `damagePoseOf()`, including counter-rotation of the gait center, bob, recoil and attack tilt. It does not resize bodies or sample alpha. Circles are transformed around the actual sprite center, so they follow the currently displayed pose, including the async transition from fallback to loaded PNG.

The original `public/assets/enemies/zubrokryptyda.png` was audited in all eight directions. File SHA256: `568b25dc6f87398d167f47622a665dec7cef7993856758d4917746e9aa3a27df`. Test-only RGBA decoding confirms opaque head, both shoulders and torso witnesses in every frame; transparent frame corners miss. All poses support the common small configuration, so no directional table is needed. It is deliberately an approximation of main mass, not an exact alpha mask: narrow horns/claws, individual leg gaps and some edge fur are not modeled. The full frame and transparent margins are not damage boxes. Diagnostic eight-frame overlay is provided outside Git.

Missing-PNG rendering uses three world-pixel circles matching the procedural main body: `(−15,−27,r34)`, `(15,−27,r34)`, `(0,−51,r24)`, shifted by current fallback feedback. This is explicitly separate from both the PNG profile and movement circle. No invisible full-image box is used if loading fails.

Projectile hits use the minimum `segmentFootprintHit()` entry among components. The existing obstacle/enemy first-surface comparison remains, including obstacle precedence on ties. Flames call the existing `flameTargetVisible()` predicate for each component and accept one boolean result per enemy, so range145, cone50°, damage1 and 250ms cadence remain unchanged and the union never multiplies damage. Bobrozombi/Bocianołak still use their exact existing logical circles r21/r18; their visual transform is ignored for damage.

## Bocianołak text

All three existing accepted damage paths (projectile, flame, barrel) call the small `damageEnemy()` adapter, preserving damage math and nonfatal feedback. Only an actual HP decrease on a previously living specimen can claim its own `firstHitBark` flag. Misses, blocked shots and later flame ticks cannot claim it again. This does not create any dialogue or narrative boundary.

Exact text: **Tylko nie po nogach!**

Scene-owned noninteractive Phaser Text is shown for1700ms, follows a living specimen, then stays at its last position if the first hit kills it. This deterministic detached lifetime does not retain an enemy in the encounter, delay death bookkeeping or block spawns/waves. Like existing death presentation it ages on the game-step clock and can expire while combat is paused. Scene shutdown destroys all texts and removes the step listener. Global maximum is3; a 240px-high screen displays at most1, preventing crowding. Accepting a new reaction evicts the oldest at capacity but permanently consumes the correct specimen's flag. Text is below HUD depth, bounded below its occupied top area, spaced in22px slots, noninteractive, and reclamped/trimmed after resize. No sound, portrait, input capture or new timers.

## Executed local verification — 2026-10-31

Environment: Ubuntu24.04, Node24.22.1/npm11.9.0, external Chromium153.0.8010.0 Canvas/CDP. Project dependencies and lockfile unchanged.

| Command | Result |
| --- | --- |
| npm ci | PASS, exit0 |
| node ../pr42-evidence/visible-shoulder-red.mjs | expected RED, exit1: radius30 misses a visible shoulder rifle ray at feet−55 |
| node --test tests/pr42-enemy-damage.test.js | PASS, 5/5, exit0 |
| npm test | PASS, 151/151, exit0; no skipped/cancelled tests |
| npm run build | PASS, exit0; 46 modules, existing large-bundle warning |
| npm run test:browser | PASS, exit0; 38 PASS groups, zero uncaught exceptions |
| git diff --check | PASS |

The exact browser command uses external `CHROME_BIN` and `FONTCONFIG_PATH`; no browser package was added to this project. The complete existing Arena V2 regression is retained, including seeds1/41/104729, real heavy detours, player sliding, barrel explosions, six waves/138 kills, optional pickups, introductions, joystick isolation, timer, menus and orientation.

PR42 adds real projectile stepping for Pukawka/rifle at shoulders, a flame case where the old feet circle misses, rock/capsule occlusion, unchanged radius30, miss/blocked/first/subsequent/fatal-source bark cases, bounded text objects, HUD bounds at320×240,568×320,800×360, actual HTTP404 heavy fallback, and active-text shutdown cleanup. Test harness reload synchronization was hardened to wait for a new page context rather than accidentally accepting the old menu just before reload. No gameplay assertion was relaxed.

Informational Node diagnostic, 20000 queries each: old-circle101ms, three-circle projectiles48.14ms, flame union6.85ms; heap snapshot10.18MB. These workloads have different hit/tangent rates and are **not** evidence of a speedup. The relevant bound is at most3 PR40 queries for a heavy target, unchanged single circles for other species, no alpha sampling, new bodies or navigation grids. Text allocation occurs only once per accepted first hit, with bounded active count. No machine-dependent thresholds.

GitHub Actions CI must be checked on the actual PR head; its final status/link is recorded in the PR description and external QA packet rather than preclaimed here. Physical Android, mobile WebGL/performance and subjective shoulder alignment acceptance remain NOT RUN/user acceptance gates. Separate independent audit is required before merge. No merge/deploy/binary commits.
