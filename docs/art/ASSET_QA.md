# Art production acceptance and QA — Art Bible v1.0

See [Art Bible](ART_BIBLE.md), [characters](CHARACTER_SPEC.md), [environment](ENVIRONMENT_SPEC.md), [technical contract](../ASSETS.md). Evaluate an artifact against its **approved current manifest entry**, not hypothetical draft dimensions. Record reviewer, date, source revision, intended screen scale, evidence and remaining risks.

## Quality gates
| Stage | Required evidence | Must NOT be claimed |
|---|---|---|
| Master concept | Identity, silhouettes, materials, palette and art direction approved | Correct sprite frames, alpha or engine integration |
| 8-way panel | E/SE/S/SW/W/NW/N/NE labeled, consistent anatomy, perspective, lighting | Extracted per-cell production files |
| Extracted frames | Individual alpha-clean cells; consistent anchors, feet, unobstructed complete silhouette | Valid final combined sheet |
| Sheet | Exact manifest dimensions / indexed cells, real transparency for characters, no gutters or bleed | In-game visual approval |
| Runtime | Actual Phaser-loaded sheet, correct frame mapping, fallback, camera and physics continuity, mobile screenshots | Physical Android verified without real-device test |

## Reusable checklist
Mark each **PASS / WARN / BLOCKED / N/A**, attach evidence.
- [ ] **Identity:** recognizably the approved Aloes or specified species; no face/age/species drift; written likeness/publication consent where relevant.
- [ ] **Silhouette:** recognizable in grayscale and reduced size; monsters retain distinctive beaver incisors/tail, bison hump/horns or separately approved traits.
- [ ] **Perspective:** consistent elevated top-down, same apparent elevation across octants; no isometric or side perspective drift.
- [ ] **Proportions:** species-appropriate and consistent across eight directions, no human template imposed on beasts.
- [ ] **Palette:** coherent rustic world colors with enough creature-specific variation; terrain stays subordinate.
- [ ] **Outlines:** strong exterior and restrained interior edge, matched warmth and thickness.
- [ ] **Lighting/shading:** controlled value grouping and same implied overhead illumination, no baked cinematic rim/glow.
- [ ] **Materials:** grouped fur/feathers, legible cloth, leather, wood, metal and horns, not plastic/photographic textures.
- [ ] **Readability:** intended screen size, bright AND dark approved-ground patches, standing/moving views, nearby enemies/effects; silhouette survives mobile landscape.
- [ ] **Directions:** eight distinct whole-body facings in precisely E,SE,S,SW,W,NW,N,NE; no swapped/mirrored inconsistent poses.
- [ ] **Transparency:** genuine alpha channel and clean boundaries, no paper/checkerboard baked in; ground deliberately opaque.
- [ ] **Frame grid:** exact approved per-cell size and sheet dimensions, correct indexing, no gutters/uneven scaling.
- [ ] **Pivot:** stable center and feet baseline per contract, no unapproved physics/camera changes.
- [ ] **Integrity:** full silhouette, no cutoff hat/tail/weapon, no neighboring-sprite contamination, no stray floating pixels or halos.
- [ ] **Environment:** character legible over actual terrain, no fake collisions from painted details; repeating ground no visible seams X/Y.
- [ ] **Runtime:** checked actual load, facing swap, nearest vs linear filtering chosen by material, optional missing-asset fallback, real scene layering and screenshot evidence.
- [ ] **Rights/approval:** original/licensed art, authorization for real-person likeness, explicitly marked provisional approvals.

## Small-scale acceptance protocol
Render at intended Phaser world scale in landscape viewport, over **at least one bright and one dark** terrain region. Review all eight facings; add one nearby enemy, one obstacle, a projectile/effect and HUD where available. Repeat during motion, camera scroll and after fullscreen enter/exit, verifying focal hierarchy and clipping. Review on a physical Android device before calling mobile acceptance **PASS**; Chromium is a separate evidence level. If approved ground file is missing, use a clearly labeled provisional comparison and mark final environment compatibility **unverified**.

## Verdicts
- **PASS:** all applicable artistic + technical checks have direct evidence; if runtime integration is not in scope, explicitly say “art-stage PASS only”.
- **WARN:** usable for experiment/mockup with named, bounded risks and follow-up; no promotion to final production.
- **BLOCKED:** critical identity drift, invalid frame contract/alpha, missing necessary evidence or unauthorized likeness; repair and repeat QA before production integration.

Technical PASS is **not** artistic PASS. A physically present PNG is **not** automatically inspected or approved. Human artist approval and runtime verification are separate gates.

## Contract disputes and approval queue
- **Historical 96 frames:** formally **SUPERSEDED by D030** (not a live alternative). Current eight static directional poses per sheet and sizes per manifest; do not edit code or restore old standard.
- **Four Aloes equipment variants:** artistic concepts approved; only one eight-frame player sheet path is technically established; names/layout for other variants require product/technical approval.
- **Bocianołak:** artistic proposal only; cannot rename `enemy_fast` or assign sprite contract without explicit approval.
- **Bigger creatures:** alternative pixel dimensions require revised technical contract.
- **Approved ground:** target agreed and manifest entry present, but image not yet in inspected repo; visual and runtime acceptance pending.
- **Portraits:** manifest reservations do not authorize producing additional narrators or real faces.
