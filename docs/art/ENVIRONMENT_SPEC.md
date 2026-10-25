# Environment & obstacle art — Art Bible v1.0

Refer to [core art identity](ART_BIBLE.md), [character perspective](CHARACTER_SPEC.md), [QA](ASSET_QA.md), [technical asset contract](../ASSETS.md).

## Approved first Arena ground
Warm hand-painted almost orthographic top-down rural surface: varied **brown earth**, **olive grass/vegetation**, gravel, small stones, sparse weeds/wildflowers and occasional worn brick fragments. Organic rhythm, controlled painterly detail, no obvious directional composition. No horizon or vanishing point, baked characters, large cast shadows, roads, buildings, strong lighting gradients or visually dominant decorative objects.

**Canonical approved handoff:** `public/assets/terrain/arena-ground.png`, opaque **1024×1024 PNG**, seamless across X and Y. In the inspected latest main, this PNG is **not present**; design and technical handoff are approved, but texture-loading/rendering QA cannot be claimed. Current Arena continues to use the procedural ground and grid. Do **not** create/repaint/replace the approved illustration in a documentation PR.

Ground has near-vertical orthographic projection; volumetric characters use elevated 3/4 top-down. The differing surface versus body perspectives are intentional; they must feel grounded in the same space, not physically identical camera views.

## Tiling and visual hierarchy
Check both boundary axes and four-corner repeats at native scale, plus under an actual scrolling camera. Avoid linear directional seams, visible repeated motifs, artificial stretching, parallax and unapproved color overlays. The ground is lower in contrast than characters, projectiles, pickups, effects and interactive obstacles. Preserve its approved richness while ensuring silhouettes survive both light and dark patches.

## Decorations versus real obstacles
- Fine painted gravel/flowers/brick chips are **visual detail only**, with no implied hitboxes.
- Functional rock, log, explosive barrel and later physical obstacles remain independent world objects, clearly distinct from background; no baked gameplay collision into ground PNG.
- The repository reserves `public/assets/obstacles/` for **future approved obstacle artwork**, but does **not** approve individual obstacle PNG filenames, sizes or delivery grids. Placeholder rock/log/barrel graphics are currently procedural.
- Playful rustic character is welcome in furniture/material wear, not in noisy decorations that mimic bullets, enemies, pickups or interactable props.

## Materials and value
Stone: hard clustered edges with painted facets, not photoreal noise. Timber: restrained grain and aged warm browns. Rust/copper: muted warm specular groups. Dirt/grass: painterly color shifts, avoid neon greens or excessively black pools. Flora: sparing tiny highlights, not a carpet of bright pickup-like dots.

## Handoff requirements
Review full texture and 2×2 repeat grid for seams; inspect relative silhouette contrast against Aloes and monster prototypes, at 1:1 gameplay size on landscape mobile. Do not declare runtime performance, camera continuity, fullscreen recovery or physical phone acceptance from an illustration alone. Follow the [QA checklist](ASSET_QA.md).
