# PR43 — first Bocianołak hit: standard session dialogue

Base: merged PR42 main `5415f1db3f6c47ddd2c357c594d1f0ccd5e82d53`.

## Design correction

PR42 interpreted the line as non-pausing floating text once per specimen. The corrected approved contract is a standard portrait dialogue, once per entire new Arena session:

- Portrait key: `bocianolak`, existing asset.
- Speaker: **BOCIANOŁAK**.
- Exactly one line: **Tylko nie po nogach!**

The existing `createDialoguePanel`, DALEJ handling, portrait loading, combat pause, pointer/joystick isolation, timer and scene-shutdown behavior are reused unchanged. The four original dialogue arrays remain unchanged; this is a fifth independent narrative event, not a replacement for the introduction.

## Ownership and safe ordering

`firstBocianolakHit` is initialized to false by Arena.create. `queueBocianolakHitDialogue()` receives the actual before/after HP values from the existing `damageEnemy()` path. Only a finite, positive HP reduction on a previously living Bocianołak claims the session flag and adds `after-first-bocianolak-hit` to the existing narrativeEvents Set. It does not open UI, emit a synchronous presentation event, retain a specimen or change damage/death handling.

All existing sources still use damageEnemy: Pukawka, rifle, flame and barrel explosion. Multiple hits/specimens in one frame collapse into one Set entry and one claimed session flag. MENU/WZNÓW preserves it; NOWA GRA reinitializes it. Zero reduction, misses, blockers, dead enemies and subsequent specimens do not queue again.

The new boundary is drained at an existing safe update entry or a checkpoint after the complete flame/barrel/projectile batch and projectile cleanup, before enemy movement. If a first hit also clears the finale, `markNarrativeBoundary()` defers its synchronous UI attempt while the hit boundary is pending. The original event notification is retained. The hit dialogue has priority over the finale; both play through the existing state machine. Dead enemies are filtered before showing the hit dialogue; actual HP, sprite destruction, death count, rewards, final-pending state and pixel-death effect creation have already been processed. No enemy is revived or made immortal. Existing game defeat precedence is unchanged.

The new event emits its one-shot presentation notification when the queued dialogue actually begins. The existing game-step death VFX updater continues independently of frozen combat, so bursts complete while the panel is visible. DALEJ restores normal existing input/time/physics synchronization.

## Removed code

`src/enemy-hit-barks.js` was exclusive to the abandoned PR42 presentation. Its runtime import, manager initialization, per-specimen flag, text pool/listener and two obsolete Node tests were removed. No remaining runtime/test consumer exists. The PR42 heavy-geometry Node and Chromium tests remain; obsolete bark-only browser assertions were replaced with standard-dialogue assertions. No second dialogue UI, floating-text framework, timer or asset was added.

## Executed local verification — 2026-10-31

Ubuntu24.04, Node24.22.1, npm11.9.0, external Chromium153.0.8010.0, Canvas/CDP. Final local commands:

| Command | Result |
| --- | --- |
| npm ci | PASS, exit0 |
| node --test tests/pr43-dialogue.test.js before implementation | expected RED, exit1, 3 failures: absent line/queue contract |
| node --test tests/pr43-dialogue.test.js after implementation | PASS, 3/3, exit0 |
| npm test | PASS, 152/152, exit0, no skipped/cancelled tests |
| npm run build | PASS, exit0, 45 modules; existing bundle-size warning |
| npm run test:browser | PASS, exit0, 44 PASS groups, zero uncaught exceptions |
| git diff --check | PASS |

Critical Chromium checks run real projectile stepping for Pukawka/rifle; real flame and explosive-barrel damage; misses and rock-blocked shots; two simultaneous projectiles; multi-Bocianołak fatal explosions; exact HP/death accounting before UI; once-only event notification; portrait and one DALEJ; projectile/enemy/timer freeze; joystick-region touches; active-dialogue MENU/WZNÓW and focus events; fresh-session reset; no repeat on later specimens. Screenshots cover568×320 and800×360.

A separate final-enemy fixture starts at137 kills, accepts fatal first Bocianołak damage, verifies death138 and both queued boundaries with no active UI inside death processing, then confirms the pixel burst expires, the new one-line dialogue precedes the original three-line finale and victory follows. Existing full regression retains six waves/138 kills, optional pickups, all introductions, timer, input, Arena V2 seeds1/41/104729, local steering, rotated collision and PR42 heavy geometry/missing-PNG behavior.

An independent preservation comparison confirms all four original dialogue arrays and the restricted geometry/layout/steering/stat/balance/pickup/timer/panel/asset/dependency files are unchanged. Earlier focused test failures were corrected test instrumentation assumptions: standard panel text is nested (therefore no root-level floating Text), and fixture event listeners must be removed on scene shutdown to avoid counting a later session twice. No production assertion was relaxed to mask duplication.

GitHub Actions is checked on the actual published PR head; the final status/link is recorded in the PR description and external QA packet. Physical Android Chrome touch/fullscreen/browser-toolbar behavior remains NOT RUN and requires user acceptance. No merge, deployment, binary commits or artwork. Stop for a separate independent audit before merge.
