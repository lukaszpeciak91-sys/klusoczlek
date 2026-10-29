# GAME DESIGN — MVP v0.1

## Approved navigation and gameplay
Landscape-only Phaser 3 survival arena. Main Menu is the single start/return surface: NOWA GRA always available; WZNÓW only for a live paused Arena. NOWA GRA replaces that session; WZNÓW preserves player, physics and camera. Fullscreen is optional and reversible in Main Menu. Simulation must not advance while the menu is visible.

## Controls — ACCEPTED twin-stick contract (replaces auto-aim)
- Mobile left stick: movement, right stick: independent continuous aiming and **fire only while held and deflected** past activation deadzone.
- Two different touch pointer IDs may be captured simultaneously; each stick owns only its captured ID. Pointerup, pointerupoutside, pointercancel, blur, visibility loss, resize, orientation change, scene pause/menu navigation and shutdown release both captures, zero fire intent and motion. No handoff of an active pointer to the other stick; newly touch after cancellation.
- On desktop WASD / arrows move; mouse position relative to player's world position aims, holding primary left mouse button fires. Mouse movement alone never fires. Mouse up/out, blur or leaving Arena stop firing. Touch pointers must not synthesize desktop fire.
- Input must be gated by active unpaused Arena and landscape/focus. No auto-targeting, auto-shooting, reload or jump.
- Twin-stick and held shooting are implemented; this visual-only PR leaves combat controls unchanged.
- Reserve Phaser Input capacity for at least two active simultaneous pointers when implementing; avoid setting identical pointer capture for both controls. Joystick zones must not overlap MENU or each other at supported viewport sizes.

## Facing and animation
- World/canvas coordinates: +X right, +Y down; positive angle clockwise.
- Visual order: `e, se, s, sw, w, nw, n, ne`; octants rounded to nearest 45 degrees, ties clockwise by documented rounding in source.
- Fire direction = raw normalized 360-degree aim vector (never snap projectile heading to sprite octant). Movement uses independent normalized movement vector; diagonal speed capped as existing.
- While right stick actively firing, **whole character** faces aim; when not firing, faces motion; when motion is zero, preserves last visual facing. No separately animated torso/legs.
- Character sheets now have exactly eight single-pose frames, one for each facing; no idle/walk/fire frame rows. Walking appearance is optional ±2–3° sway and ±1–2px bob of a separate visual, never the physics body.
- See `src/combat-contract.js` and `src/character-visual.js`; 8-frame single-pose contract supersedes former 96-frame sheet.

## Combat and pickups (NOT implemented in this PR)
Three equally viable alternative weapons: rapid, heavy, spread (working identifiers, tuning open). One active, no inventory; touching a weapon pickup forces immediate replacement, even if unwanted. No protective choice UX. Short anti-double-trigger allowed. No firing after right release. HP pickup is a neutral procedural red-heart token, restores +2 up to 5 HP, awarded after waves 2, 4 and 5 (Episode 1 Part A). Three enemies: bobrozombi (slow swarm), zubrokryptyda (tanky/charge candidate), enemy_fast (working name pending). Distinct waves separated by clear completion; victory and defeat. Tuning, spawn rules and wave count remain open.

## Physics / camera isolation
Current player is a Phaser Arcade-enabled 17px-radius circle whose **same GameObject** is tracked by the camera. Final sprite work must not replace the camera target or resize the physics hitbox according to sheet size. Attach a visual sprite to player world coordinates or convert the existing physics GameObject with exact preserved x/y, circular body radius 17, world bounds and camera target identity; test first. Current marker remains the deterministic code-drawn fallback. Sprite origins and rendering scale are defined in ASSETS.md.

## HUD / portrait
HUD shows HP, active weapon and wave. Aloes HP portrait states: exact hp_5/hp_4/hp_3/hp_2/hp_1 PNGs for 5/4/3/2/1 HP, and subdued hp_1 at 0 HP; numeric fallback when optional art is missing. Publishing likenesses requires explicit authorization. Narrative text may appear at start, between waves and end, without a cutscene system.

## Out of scope
No full combat, AI, waves, health/pickup implementation, final assets, backend, save system or dependency changes during this contract PR. All URLs must honor Vite base `/klusoczlek/`. Real Android Chrome touch/fullscreen smoke is required before shipping control changes.

## 18-enemy appearance prototype (2026-10-27)
Current prototype starts unarmed, requires collecting a nearby blunderbuss token before firing, drops rifle on confirmed death #5 and flamethrower on death #10; 18 Bobrozombi total, at most three concurrent. Weapon behavior prototype: pukawka shoots 5px bullets every 180 ms at 510 px/s; karabin shoots three 3px rounds spaced 70 ms, with a 300 ms break between bursts, at 750 px/s; miotacz uses an obstacle-aware 145px/50° continuous flame cone, at most 60 short-lived procedural particles and 250 ms per-target damage cadence. This does not replace the future three-weapon balance and wave design.
