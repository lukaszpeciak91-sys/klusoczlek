# PR53 — Reactive Combat Barks V2

Base main: `349efd05866bd6b20350b4ae9c06888f88e38fe7`. PR51/PR52 changes are present in this main.

- All seven previously approved spontaneous texts are preserved exactly.
- Cosmetic-only irregular spontaneous opportunities at 3–6 s, independent of damage.
- Two pooled Phaser bubble containers. Distinct speakers, no same-enemy duplicates.
- Successful nonfatal HP damage can emit species-dependent reaction; initial 35% probability, 4.5 s enemy cooldown, 400 ms global spacing; 1.2–1.9 s reactive lifetime.
- Short-lived hits do not create detached death bubbles; damage is not invented.
- Avoid joystick bounds and top HUD; suppress rather than force impossible placement.
- Pauses, dialogue, MENU, cinematic and terminal states clear bubbles with no backlog.
- Cosmetic RNG isolated from arena/combat RNG.
- Existing PR46 browser assertions for a single `state.active` object and first 12–20-second bark schedule are obsolete and require replacement with equivalent two-bubble regression assertions. Do not merge until full Chromium CI is green and screenshots reviewed.
