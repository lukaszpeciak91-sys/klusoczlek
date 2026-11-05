# Act II airship environment — provisional implementation contract (PR62)

This document is a technical *layout proposal*, not final artwork approval or an instruction to resample the artist's originals.

## Geometry and registration

- Logical Phaser world: **960 × 540** for this initial prototype (smaller than Act I's 1800 × 1200); the eventual image resolution is undecided.
- Walkable eight-corner beveled deck: points `(142,78) → (818,78) → (882,140) → (882,400) → (818,462) → (142,462) → (78,400) → (78,140)`; it is symmetric about `(480,270)`.
- Collision projection keeps the player's radius plus 8 px inside the rail outline. Rails are clearly drawn even when PNG assets are absent.
- Art position: image centered at world `(480,270)`, currently *displayed* within an approximate **804 × 384 logical-pixel** footprint and clipped to the deck polygon. These are renderer layout values, **not required source PNG dimensions**. Revisit after the approved ship's footprint, pixel density and transparent margins are established.
- Reserved landing-zone centers (not active): `port-aft (240,270)`, `starboard-fore (730,270)` with conceptual radius 45. No glider/enemy logic.
- Player starts centered at `(480,270)`. Physics and deck remain fixed in world coordinates. The camera follows Aloes at zoom 1; this keeps HUD and mobile joystick pixels readable rather than shrinking the entire game UI.

## Optional layers / future artwork

All paths are under `public/assets/`; runtime asset URLs derive from Vite `BASE_URL` via `assetUrl` to work on GitHub Pages:

| Layer (back to front) | Relative PNG path | Depth | Drift (logical px/s) |
|---|---|---:|---:|
| Sky | `backgrounds/act2-sky.png` | -40 | 0 |
| Far clouds | `backgrounds/act2-clouds-far.png` | -30 | 5 |
| Middle clouds | `backgrounds/act2-clouds-mid.png` | -20 | 12 |
| Near clouds | `backgrounds/act2-clouds-near.png` | -10 | 23 |
| Fixed deck | `arenas/airship-deck.png` | 1 | 0 |

Sky and cloud PNGs are rendered in screen space below the deck using Phaser Images (not tiled). The static sky is fitted to cover the viewport. Each moving cloud layer uses two bounded, oversized images with Justimania-style smoothstep crossfades and controlled horizontal offset; logical speeds remain 0/5/12/23 px/s. This avoids directly joining non-seamless artwork edges, preserves the existing filenames and alpha, and allocates no new textures during scrolling. To avoid unnecessary cloud magnification, horizontal overscan is asymmetric: the outgoing cloud needs room for the full 200px leftward travel, whereas the incoming cloud only needs room for its visible fade-in from 82% of the cycle. The blend uses smoothstep during the final 18% of each cycle, rather than the previous 39%, reducing how long two displaced silhouettes appear together. Both visible images still cover the viewport at every zoom; there are no new objects or textures. On narrow screens some cloud imagery remains cropped by the coverage requirement. Pixel-art uses NEAREST. Texture revisions, if wanted, are a separate artwork decision.

When an optional PNG is missing, an inexpensive generated-once 512 × 256 fallback texture or the drawn deck remains visible. Image loading is aborted on shutdown, and optional missing assets cannot prevent entering the scene. The deck art is not used as collision geometry; align the provisional polygon to the approved illustration in a later visual-integration PR.

The empty glider path is reserved as `public/assets/vehicles/hang-glider.png`; glider pilots, passenger composition, landing and combat are out of scope for PR62.
