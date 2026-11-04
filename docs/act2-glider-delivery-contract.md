# PR63 — Hang-glider delivery asset and behavior contract

Act II uses an **empty** vehicle layer plus existing approved enemy sheets. No binary artwork is required for PR63.

## Source assets and visual hierarchy

- Vehicle: `public/assets/vehicles/hang-glider.png`. **Transparent empty flying wing/frame only**, with no permanently painted pilot or passenger. Its source dimensions are **not fixed** until art is approved.
- Pilot: existing `public/assets/enemies/zubrokryptyda.png` (eight 192 × 192 frames, 1536 × 192 sheet).
- Passenger: existing `public/assets/enemies/bobrozombi.png` (eight 96 × 96 frames, 768 × 96 sheet), or `public/assets/enemies/bocianolak.png` (eight 128 × 160 frames, 1024 × 160 sheet).
- Art is displayed behind the pilot and passenger. Each is a separate child of the same short-lived aircraft container. Provisional vehicle on-screen display envelope is 176 × 94 **logical** pixels, centered at the aircraft origin, with wing image anchor (0,−15). The PNG's own pixel dimensions are not specified.
- Provisional pilot local anchor: (0,−21), parent scale 0.48. One passenger local anchor: (0,+47), parent scale 0.68. Individual character renderers retain their usual eight-direction sheets, NEAREST filtering and procedural fallback. Tune visual composition after the empty wing art is approved.
- Missing vehicle PNG: procedural brown wing silhouette, frame lines and braces. Optional image is fetched once per scene (using the existing Vite `BASE_URL` helper) and reused for both flights. No new textures are generated each frame. Existing approved enemy PNGs are never modified.
- Flight group depth 23; a separate descending passenger is above the deck at depth 14; ground sprites use their existing renderer depth. Cloud/deck physics are unaffected.

## Demo timeline and safety

- Two bounded scheduled deliveries, not a spawn director: Bobrozombi at 1.2 s targeting `port-aft`, Bocianołak at 6.1 s targeting `starboard-fore`.
- Each flight: 1.8 s approach → up to 0.5 s dropping phase → 1.9 s departure. Flight states: `approaching`, `dropping`, `departing`, `finished`.
- One passenger is detached into an independent 0.7 s descent. The aircraft leaves independently. After touchdown the **same logical delivery ID** is transferred to an existing enemy renderer; the airborne copy is destroyed.
- Landing centers/alternatives come from PR62's `AIRSHIP_LANDING_ZONES`, tested against the walkable deck, a safe separation from Aloes and currently descending/landed occupants. If unavailable, the glider leaves without a drop rather than placing a passenger outside the deck.
- Phaser's scene update controls the clock, so pause/hidden/portrait automatically suspend movement. All live groups and per-scene renderer-owned containers are destroyed at shutdown.

## Operational scope

After touchdown: real Bobrozombi/Bocianołak visual contract (including directional frames, approved PNGs or procedural fallback), one identity and one stationary deck position. **No AI chasing, attacks, damage, kill credit, loot, combat clock, wave progression or victory state** exists in PR63. PR64 will integrate the ground encounter and any necessary collision/damage rules. The demo remains navigable via MENU and WZNÓW.
