# PR46 — ambient combat barks V1

Base main: `b9097fc819755bc2844b2f6907e485548f9b13b0`, after merged PR44/PR45 and the user's atlas upload. Branch: `feat/pr46-ambient-combat-barks`. No assets, dependencies, combat tuning or narrative text changes.

## Contract

One cosmetic scheduler per Arena session uses its own seeded RNG (`arenaSeed XOR 0x46babc`), independent of layout and combat randomness. It consumes the existing active gameplay clock only while normal combat is eligible. First opportunity: inclusive 12000–20000ms; subsequent opportunities: 15000–25000ms from the current opportunity; lifetime: 1800–2300ms. At most one bubble. Missing suitable speakers skip the opportunity. No catch-up loop or per-enemy timer. Uniform bounded selection excludes the previous phrase without retries.

The shared immutable pool is exactly:

- Na niego!
- Bić! Zabić!
- Aaaaaaaa
- Umrzyj!
- Cośmy Ci zrobili?!
- Atak!
- Kruca dosyć tego!

Only living, visible ordinary Bobrozombi, Bocianołak and Żubrokryptyda with a suitable rendered anchor qualify. Marcin, dead/dying/spawning/landing/offscreen entities do not. The renderer exposes read-only world bounds of the actual visible sprite or procedural parts, including the current frame transform, scale, gait and visual offsets. Their upper-center anchors follow the speaker; no gameplay collider is consulted or changed. Transparent frame padding can leave some headroom; this is deliberately not per-pixel silhouette analysis.

## Presentation and lifecycle

One reused container/Graphics/Text (three GameObjects), no physics, pointer listeners or Phaser timers. Dark semi-opaque rounded panel, light 12px/13px monospace text, border and small pointer. Screen-space placement compensates for camera movement/zoom, clamps horizontal edges and reserves the complete top HUD plus both joystick capture radii (1.4× visual radius, with margin). If it cannot fit above its speaker, it is skipped/removed. On very short viewports some or all opportunities may be suppressed intentionally. No new HUD element or production diagnostic overlay.

Loading, narrative dialogue/loading, MENU/paused Arena, focus loss, portrait orientation, intermission, defeat/victory/finale and Marcin's pending introduction/entrance suppress and clear bubbles. Ordinary enemies may speak during the active boss fight. The scheduler retains its remaining delay and previous phrase through MENU/WZNÓW and other interruptions, without counting paused time or replaying messages. NOWA GRA creates new state. A speaker's death removes its bubble immediately; shutdown destroys the display objects and removes listeners.

PR43's once-per-session standard Bocianołak portrait dialogue remains independent and unchanged. This system never reacts to damage or emits narrative events. No restored PR42 first-hit floating text. The only scene hooks observe combat state, clear cosmetics at existing boundaries and tick after combat updates.

## Verification and evidence

RED: `node --test tests/pr46-ambient-barks.test.js` exited 1 before implementation (missing new module). GREEN: four focused Node tests cover exact phrases, bounded timing/RNG, no repeats/backlog, reset/skip/eligibility and HUD/joystick exclusion. Existing assertions remain in place.

Real headless Chromium uses the current Phaser Arena, approved PNGs and CDP touch input at 568×320/seed1 and 800×360/seed41, plus a 320×240 resize. The first seed waits through a real initial interval (focused run: 15414ms active gameplay, 1992ms selected lifetime); other opportunities are accelerated by changing cosmetic test state. Assertions cover actual text/anchor association for all three species, single pooled objects, noninteractive UI, both joysticks, full lifetime, MENU delay/history preservation, offscreen skip, camera/resize, fatal cleanup, actual PR43 panel, pending boss suppression through two-line introduction and landing, active boss eligibility, blur, final dialogue/victory and NEW GAME/shutdown. All retained six-wave, boss, optional-pickup and other browser regressions still run.

Screenshots are generated outside Git at `dist/pr46-bobrozombi-568x320.png` and `dist/pr46-bocianolak-800x360.png`; review with the external QA package. Fixtures isolate the cosmetic behavior using controlled actors/session state; they are not a manual full-length playthrough. A fixture originally centered the camera before resize completed and correctly caused a no-room skip; waiting for the resize before camera centering corrected that test setup.

Required commands: `npm ci`, `npm test`, `npm run build`, `npm run test:browser`. Exact final exit codes, counts, commit and GitHub Actions link belong to the PR and external QA report. No arbitrary performance threshold: constant three cosmetic objects, no per-frame text allocation, candidate scan only on a scheduled attempt and one anchor/placement update while visible. Small transient geometry objects remain bounded. Physical Android Chrome is NOT RUN and remains a separate acceptance gate for readability/performance, especially short screens. Independent read-only audit is required before merge; no merge or deployment authorized by this work.
