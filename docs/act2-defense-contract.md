# PR64 — Act II opening and 03:00 airship defense

## Narrative and camera
- Reuses PR60's `ActTitle` and PR62's stationary Airship scene; no new cutscene engine.
- Full ship overview uses a temporary responsive zoom below 1 (never stretches the deck); after 650 ms, smooth 1.05 s zoom to normal 1:1. The camera then resumes following Aloes.
- Captain Marian stands at (595,208) with the already prepared Act I spritesheet, frame and 0.75 scale; he is noncombat and has no collision.
- Existing `createDialoguePanel` and `DIALOGUES['act2-opening']`: 21 exactly approved lines, one DALEJ per line. The single 200 ms shake fires at index 16 (between Captain's word and his alarm). Physics and controls remain locked until the last DALEJ.
- Portrait and optional environment art failures preserve their respective procedural fallbacks.

## Three-minute active-time defense
- Uses the existing monotonic `createGameplayClock / advanceGameplayClock`, not a second independent timer.
- Starts only after the final DALEJ, invalidates its clock anchor on MENU, blur, visibility, portrait and unsupported orientation. Gameplay/UI remain motionless when inactive. Timer display: `WYTRZYMAJ 03:00`, progressively decreasing.
- At 180,000 ms, ends once, cancels pending gliders, disarms weapons, neutralizes active ground enemies using the existing pixel-death visuals **without kill credit**, and stores an Act II provisional result. Does **not** mark Act II complete or transition to Act III.
- Zero HP triggers defeat, mutually exclusive with survival. MENU remains visible above the result overlay.

| Elapsed time | Delivery cadence | Ground cap | Glider cap |
|---|---|---|---|
| 0–60 s | ~6.1 s | 7 | 2 |
| 60–120 s | ~4.7 s | 7 | 2 |
| 120–180 s | ~3.65 s | 7 | 2 |

All flying actors are created through `createGliderDelivery.request`; the old PR63 two-item demo is disabled in normal gameplay. Initial delivery is Bobrozombi, then further Bobrozombi and gradual Bocianołaki. Landing positions retain the PR62 polygon margins and safe player distances. The 300 ms landing ring telegraphs a drop before the existing descent and 900 ms ground activation grace period.

## Reused combat and campaign behavior
- `src/airship-combat.js` is a focused adapter using the existing player shooting and muzzle helpers, existing blunderbuss/rifle/flamethrower tuning and pressure, enemy hit footprint detection, HP/invulnerability rules, movement functions, pixel-death effect and renderer-owned sprites.
- Enemies walk only within the deck polygon and can pursue/damage Aloes after activation. Kills increment exactly once; dead enemies no longer count toward the population cap.
- Preserves selected weapon including null, max/current HP, all unlocked weapon IDs and artifacts from PR61. If unequipped, an optional visible blunderbuss pickup appears near Aloes; weapon switching remains user-triggered.
- `stats.byAct.act2` has `provisional:true`; the narrative act-completion handoff remains pending. No Bogdan horn, upgrades, boss, Act III story or final PNG work.

## Deferred
Approved Act II closing scene/dialogue, story completion, final deck/cloud/glider imagery and final mobile art composition remain outside PR64.
