# KŁUSOCZŁEK — ART BIBLE v1.0

**Status:** approved artistic direction; NOT a new runtime or asset manifest. **Philosophy:** **shared visual language, distinct character personalities**.

## Authority and evidence
- Artistic style and production quality: **this file** and [character](CHARACTER_SPEC.md), [environment](ENVIRONMENT_SPEC.md), [QA](ASSET_QA.md).
- Technical dimensions, paths, spritesheet order: [ASSETS](../ASSETS.md) and [asset-manifest](../../src/asset-manifest.js). Gameplay and narrative: [GAME_DESIGN](../GAME_DESIGN.md). Historical approvals: [DECISIONS](../DECISIONS.md).
- If these disagree, **do not rewrite production contracts**; raise a question for orchestration approval.
- As checked against latest main on 2026-10-25, `public/assets/player/player.png` exists, but existence alone does **not** constitute visual, direction-order, likeness, or artistic acceptance. `public/assets/terrain/arena-ground.png` is absent. Arena underlay, obstacles and Bobrozombi currently render procedurally; the approved artwork is not automatically integrated.
- **D030 is ACCEPTED:** the former 96-frame character sheet is **SUPERSEDED**, not active. Current player 8×64² = 512×64 and planned enemy 8×48² = 384×48. The 8-direction *rendering contract* is implemented for the optional player; original art on all platforms and weapon variants remain separate acceptance steps.

## Visual world
**Stylized Hand-Painted Retro Survival:** original illustrated 2D, slightly stylized realism, warm rural supernatural setting, painterly controlled light, dark but moderate outlines, bold silhouette, restrained grotesque exaggeration. The story's absurdity is depicted seriously; humor comes from personalities, anatomy, implausible rustic tools and situation—not cartoon effects.

Shared language, **not** shared anatomy: consistent perspective, brush/edge logic, tonal hierarchy, material treatment and approximate overhead illumination; different species may have radically different body plans, faces and secondary palettes.

## Visual priority (highest to lowest)
1. Gameplay-critical effects and pickups: distinct, intentional contrast.
2. Player and enemies: instantly recognized during movement at mobile scale.
3. Interactive obstacles: clearly separate from painted ground.
4. Decorative props: subdued; never masquerade as interactive elements.
5. Ground: lowest competing contrast, without erasing its approved texture detail.

**Color guidance (not fixed RGB):** soil browns, muted olives, straw gold, aged copper, weathered gray, desaturated navy, warm charcoal. Creature-specific secondary colors allowed. Reserve extreme contrast for gameplay feedback; avoid neon except explicitly authorized.

## Rendering rules
- Clear material-tinted or warm dark contour: exterior silhouette stronger than internal marks; no thick comic-book black borders.
- Soft hand-painted transitions in a few readable value groups; consistent implied overhead light; no baked theatrical rim light or incompatible lighting between facing frames.
- Fur grouped by masses, feather groups rather than individual strands, clear horns/teeth, simplified clothing folds, aged wood/leather, subdued metallic glints.
- Avoid photorealism, plastic 3D shading, anime expressions, copyrighted lookalikes, inconsistent camera elevation, uncontrolled saturation and tiny illegible ornaments.

## AI artist handoff
Supply this bible with [CHARACTER_SPEC](CHARACTER_SPEC.md), [ENVIRONMENT_SPEC](ENVIRONMENT_SPEC.md) and [ASSET_QA](ASSET_QA.md); specify target species, intended gameplay footprint, eight facing labels, and approved reference artwork **only when actually supplied**. Request silhouette/palette check and a gameplay-scale contact sheet **before** extraction. Never treat an AI directional panel as a compliant spritesheet without human/technical QA. Do not infer art approval from file presence.

**Stop conditions:** identity drift, incompatible painting technique, uncontrolled lighting, wrong camera, unreadable silhouettes, nontransparent sprite backgrounds, frame clipping, unauthorized likeness or use of copyrighted character elements. Mark these BLOCKED rather than proposing a silent technical workaround.

See [QA criteria](ASSET_QA.md) for PASS / WARN / BLOCKED.
