# KŁUSOCZŁEK — PR54 Act I boss and cinematic contract

## Source of truth
Base `main` at `15e3feffa88661908a214a93af02e3ef51c996f0` includes PR51 continuous encounters, PR52 floating HUD and PR53 reactive barks. This PR does not alter those systems.

## Summon
- The usual deadline remains 260,000 ms **active gameplay**.
- At or after 240,000 ms, the boss can be claimed once if there are zero living ordinary enemies and no essential active/pending portrait boundary.
- A camera-empty frame is not evidence of an empty world.
- Unfulfilled optional PR51 introduction evidence does not block the ending indefinitely.
- The ordinary Bobrozombi caller is a separate herald. Reuse a visible living one or create one in a collision-checked camera point. Repeated retries cannot create duplicates; actor remains unchanged while the portrait pauses physics.

## Boss roster
- Target twelve ordinary allies, counted against living ordinary survivors at completed Marcin landing. Only the shortfall is scheduled, one actor per boss scheduler turn, with collision/navigation validation.
- Existing PR48 finite two escorts and twelve reinforcements are preserved; they are distinct from initial twelve ordinary allies. No duplicate encounter ID is permitted.
- Narratively designated herald and final witness do not consume the twelve-ordinary-ally target.
- All non-Marcin actors count toward hard **16-live** cap; Marcin is additional. Existing seven-live limit was superseded explicitly for this finale. This upper bound is not a guarantee of twelve visually simultaneous allies on compact devices.
- Ordinary ally spawns use authoritative `recordSpawn`, and natural kills use `recordDeath`. Scripted cleanup increments neither kills nor death counters.
- Failed safe placements defer rather than overlap actors or spin endlessly.

## Scripted finale
1. Marcin's player-earned fatal hit records exactly once; his red VFX is created once.
2. Incoming projectiles and all later spawns are cancelled. One visible living Żubrokryptyda is selected or staged; other minions receive red cleanup bursts without new kill credit.
3. After death bursts settle: Marcin says his **existing** last line; the user presses DALEJ.
4. The living witness says its **existing** farewell and the user presses DALEJ.
5. The witness receives a red pixel explosion. Aloes does not speak while its burst remains.
6. Aloes speaks the exact approved `*chlip* Żegnajcie… przyjaciele…` line and awaits DALEJ.
7. Brief camera fade to black; camera FX resets before standalone victory Menu opens. No missing Act II scene, wig award or Captain transition is invoked.

## Merge gate
Full Node/build/real Chromium GREEN at exact final HEAD, independent read-only re-audit and screenshot review required. Do not merge/deploy while any legacy test still fails. Physical Android performance and aesthetic acceptance remain user-owned.
