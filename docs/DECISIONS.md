# DECISIONS — log decyzji

Status: ACCEPTED / PROVISIONAL / OPEN / SUPERSEDED. Daty ISO.

| ID | Status | Decyzja | Powód |
|---|---|---|---|
| D001 | ACCEPTED | Tytuł KŁUSOCZŁEK; repo klusoczlek | Nazwa świata i prezentu |
| D002 | ACCEPTED | Statyczna gra na GitHub Pages | Jeden link bez instalacji |
| D003 | ACCEPTED | Widok 2D z góry zamiast raycastingu | Szybkość realizacji i mobile |
| D004 | SUPERSEDED | Jeden joystick + WASD; ostrzał automatyczny | Sterowanie jednym palcem |
| D005 | ACCEPTED | Pickup broni natychmiast zastępuje broń aktywną | Brak ekwipunku i przełączania |
| D006 | ACCEPTED | 3 typy przeciwników | Zamknięty zakres MVP |
| D007 | SUPERSEDED | Proste menu: tytuł i START | Niskie tarcie |
| D008 | ACCEPTED | HUD z twarzą bohatera zależną od HP | Personalizacja i retro klimat |
| D009 | ACCEPTED | Oddzielny chat implementacji i grafik; orkiestratorka | Brak konfliktów odpowiedzialności |
| D010 | PROVISIONAL | 3 bronie, jedna arena, zamknięta sesja | Mała produkcja, łatwa do ukończenia |
| D011 | PROVISIONAL | 3 portrety HP; progi >60 / 30–60 / <30 | Mało assetów, czytelność |
| D012 | PROVISIONAL | Zero backendu, kont i trwałych zapisów | Minimalizacja ryzyka |


| D013 | ACCEPTED | Weapons are horizontal alternatives, not ordered upgrades; picking one up forces a swap even if undesirable | Celowa konsekwencja podniesienia innej broni |
| D014 | ACCEPTED | Implementation agents never create/commit binary files; user manually uploads assets to declared paths | Clean repo and explicit asset ownership |

| D015 | ACCEPTED | Klasyczne, oddzielone przerwami fale; kolejna fala dopiero po pokonaniu poprzedniej | Czytelny postęp i satysfakcja z etapów |

| D016 | PROVISIONAL | Lekka fabuła opowiadana tekstem na starcie, między falami i w finale, bez cutscenek/systemu dialogów | Klimat bez rozbudowy kodu |
| D017 | SUPERSEDED | Dawna propozycja piwa jako pickupu HP | Zastąpiona neutralnym symbolem serca w Epizodzie 1 Part A |

| D018 | ACCEPTED | Finałowa kwestia Aloesa: „Żegnajcie... Przyjaciele...” | Celowo absurdalna, niewyjaśniona puenta |
| D019 | ACCEPTED | Trzy czaty: orkiestracja i audyt, implementacja, grafika; osobny audyt tylko w razie potrzeby | Minimalne koszty koordynacji |
| D020 | ACCEPTED | Przed mechaniką fal tworzymy mały fundament: ekran, ruch, kontrakt assetów/spritesheetów, placeholdery, panele dialogowe/HUD | Równoległe prace bez marnowania grafik |

| D021 | ACCEPTED | Gra landscape-only, z ekranem obrotu w pionie; fullscreen opcjonalny, dostępny z ikony w prawym dolnym rogu menu | Spójne sterowanie mobilne i zgodność z ograniczeniami przeglądarek |


| D022 | SUPERSEDED | Dynamiczna szerokość logicznego viewportu przy stałej wysokości 540; więcej widocznego świata na szerszych ekranach zamiast rozciągania sceny | Bez deformacji proporcji oraz ograniczeń do 16:9 |
| D023 | SUPERSEDED | MENU otwiera pauzę sceny Arena; WZNÓW przywraca tę samą sesję; MENU GŁÓWNE ją kończy | Zatrzymanie update/Phaser scene timers i bezpieczne przejścia |

| D024 | ACCEPTED | Phaser Scale.RESIZE is the sole canvas sizing mechanism inside the safe-area parent; no independent logical resize plus FIT or CSS max dimensions | Correct aspect ratio and full mobile screen use |

D022 pozostaje w historii; jego sztywna wysokość 540 została zastąpiona przez D024 (Phaser RESIZE — logiczne jednostki odpowiadają aktualnemu bezpiecznemu obszarowi CSS).
\n| D025 | SUPERSEDED | MENU in Arena pauses its existing session and opens Main Menu; WZNÓW resumes that Arena; START appears only when no session exists | One navigation surface, no intermediate PauseScene or duplicate transition ownership |

| D026 | ACCEPTED | Main Menu always offers NOWA GRA, adds WZNÓW for a paused Arena; fullscreen HTML toggles enter/exit only in Main Menu | Explicit new versus existing session and reversible fullscreen |

| D027 | ACCEPTED | Mobile twin-stick: left movement, right independent manual aim + held fire; desktop WASD/arrows, mouse aim and held left-click fire; no auto-fire/auto-target | Explicit approved combat control supersedes D004 |
| D028 | ACCEPTED | Eight-direction whole-body sprite facing; projectile heading remains continuous 360°; no facing change when stationary | Small original sheet contract without body layering |
| D029 | ACCEPTED | Sheet/player/muzzle specification, manual binary upload, missing-asset code placeholders and physics/camera independence per ASSETS.md | Art and implementation can proceed in parallel |

### D030 — ACCEPTED (PR16)
Eight single-pose directional frames per character (player 512×64, enemies 384×48), with optional visual-only sway/bob, supersede the historical 96-frame character sheet specification. Rationale: smaller original art production while physics and camera remain independent.

D029 remains ACCEPTED for path/manual upload/physics separation, but its historical 96-frame sheet specification is SUPERSEDED by D030. D028 remains ACCEPTED for facing order and 360-degree shots.

D004 is SUPERSEDED by D027; D007 is SUPERSEDED by D026. D025 remains SUPERSEDED. Historical entries retained unaltered.

D022 remains superseded by D024 (Phaser RESIZE instead of fixed logical height). D004 superseded by D027; D007 superseded by D026; D025 remains superseded. Historical decision descriptions and reasons retained.

## Otwarte, bez blokowania startu
- O001: nazwa i wygląd trzeciego wroga.
- O002: szczegółowa lista broni i ich tempo.
- O003: liczba fal i czas docelowy po testach.
- O004: szczegóły finałowego żartu i oryginalnej muzyki.
- O005: czy publikować fotograficzną twarz kumpla w publicznym repo/Pages. Do decyzji przed integracją grafiki.
- O006: konkretny lekki stos JS / Canvas / ewentualny Phaser — implementatorka ma przedstawić krótką rekomendację przed PR01.

Nowe decyzje: dopisz kolejny ID, zapisując konsekwencje; nie przepisuj historii.

### D031 — ACCEPTED (PR42, 2026-10-31)
Żubrokryptyda has an artwork-aligned damage footprint for projectiles/flame separate from its unchanged radius30 movement/spawn/navigation/contact circle. Simple supported-shape composition only; no headshots, damage multipliers, pixel collision or explosion tuning changes. Other enemies' damage circles remain unchanged.

### D032 — ACCEPTED (PR42, 2026-10-31)
The first accepted damaging hit to each Bocianołak shows “Tylko nie po nogach!” as short bounded noninteractive floating text, including a deterministic detached lifetime after fatal first damage. It is not a narrative boundary or pause and cannot gate wave progression.

### D033 — ACCEPTED (PR43, 2026-10-31; supersedes D032)
The corrected approved intent is one standard portrait dialogue per entire NEW GAME session, after the first accepted damaging hit to any Bocianołak: speaker “BOCIANOŁAK”, exactly “Tylko nie po nogach!”. Reuse the existing dialogue panel/DALEJ/pause/isolation; queue presentation until damage and fatal-hit bookkeeping complete. MENU/WZNÓW preserves consumption, NOWA GRA resets it. Remove the per-specimen floating-bark implementation. The original introduction and other four-scene texts remain independent and unchanged; PR42 heavy damage geometry remains approved. D032 above is retained as historical context, not the current contract.


### D034 — ACCEPTED design / PROVISIONAL tuning (PR44, 2026-10-31)
Episode1 adds Marcin during wave6 when only six scheduled normal enemies remain, counting living and queued. Preserve all138 normals; add one distinct boss and two ordinary heavy escorts (141 total, derived roster accounting). Standard two-line Bobrozombi call precedes a safe non-damaging landing; final victory waits for every enemy and uses the original finale unchanged. Marcin has separated contact/movement and body damage geometry, code-drawn massive beaver placeholder, telegraphed eight-way volley and compact temporary HP bar. HP36/speed38/r40,6s→4s cooldown,900ms warning and180px/s projectiles are provisional initial tuning. Existing weapons/obstacles/layouts and PR43 narrative stay intact. Approved PNG and physical Android acceptance remain separate; no production sprite stretching or binary commits.

### D035 — ACCEPTED (PR44 Marcin V1 approved artwork,2026-10-31)
User approved the unchanged2048×256 RGBA8 horizontal eight-direction Marcin sheet at `public/assets/enemies/marcin.png`,256px frames E/SE/S/SW/W/NW/N/NE, NEAREST/no spacing/trimming/baked shadow. Runtime visual QA selects scale0.68 and source feet baseline240; dedicated optional loader retains procedural fallback. Pose-specific bounded PR40 circle unions follow visible main body through the existing PR42 damage API; movement/contact remains r40 and boss/weapon tuning unchanged. User alone uploads PNG; implementation commits only text. This completes D034's previously pending art contract without rewriting its history.

### D036 — ACCEPTED (PR45,2026-10-31)
Approved twelve-cell forest atlas replaces obstacle placeholders through immutable art metadata while the ten existing footprints stay authoritative. Add rare0–1 tire pile (capsule78/r24) and broken wheelbarrow (capsule90/r20), both solid/non-destructible, using PR40/41 placement/collision/navigation. Preserve visible procedural fallback on load failure. Source alpha/anchors are approximations; render corrections do not alter PNG or geometry. User revised this task to code-only PR/manual atlas upload after terminal Git write authentication failed; no binary is published by a text API. Ground/combat/waves/boss/dialogue/input unchanged.

### D037 — ACCEPTED (PR46,2026-10-31)
Rare non-pausing ambient speech is separate from narrative and damage reactions: one cosmetic Arena-session scheduler, exact shared seven-phrase approved pool, first12–20s/subsequent15–25s of eligible combat, lifetime1800–2300ms, maximum1/no immediate phrase repeat. Visible living ordinary enemies only, bounded seeded selection and pooled noninteractive screen-safe bubble following the actual visual body. No eligible speaker/room means skip; no backlog. Suppress all narrative/pause/focus/orientation/terminal states and pending Marcin introduction through landing. MENU/WZNÓW preserves remaining delay/history; NOWA GRA resets. D033's standard once-per-session first-hit portrait dialogue stays unchanged; D032's superseded per-specimen behavior is not restored. No combat, input, clock, AI, geometry or encounter changes.

### D038 — ACCEPTED (PR47,2026-10-31)
Episode 1's twelve approved forest artwork variants retain their canonical authored orientation: the layout generator creates every obstacle with angle0, including its authoritative footprint. Rendering, bounds, projectile/flame occlusion and navigation therefore consume the same orientation. Preserve the legacy RNG draw slot to avoid needless sequence changes; bounds/validation may still change accepted placements deterministically. No PNG/metadata, dimensions, count targets or gameplay-policy changes. Generic PR40 geometry/catalog and explicitly authored rotated test fixtures retain full rotation support.

## D039 — Boss victory is Marcin fatal hit (PR48 draft)
Maintain original six regular waves. During Marcin encounter, enforce seven live nonboss enemies across regular, escort and reinforcement sources. Marcin death cancels pending spawns, neutralizes living entities without player kill credit, settles visible pixel-death effects then runs exactly three final portrait lines and victory after DALEJ. Existing user-supplied Marcin PNG stays optional at runtime. Draft implementation awaits CI/independent audit.

## D040 — ACCEPTED PR49: active-time overlapping waves and bounded seeded mix (2026-11-01)
Six unchanged species budgets advance at35/75/120/170/225 seconds of the existing active gameplay clock; Marcin intro triggers once at260s. Retain living actors and origin-wave death accounting; discard only expired unspawned queues, recording cancellations separately. Seeded deficit mixing and distributed heavy slots preserve counts without shared RNG consumption, with owed introductions prioritized and the ordinary heavy gate retained. Rewards occur once on timed boundaries and stay optional. Preserve PR48 boss mechanics/finale; if8–9 actors survive at intro, defer landing until at most7 remain, allowing combat without forced cleanup.153 remains planned population, not a victory requirement. See `docs/pr49-timed-waves.md` for contract, tests and initial tuning limits; historical decisions remain intact.

## D041 — ACCEPTED PR50: camera-aware ordinary pressure (2026-11-01)
Preserve PR49 clocks/budgets/mix and PR48 finale. Raise only early ordinary caps to5/6/7/8, retain8/9 late and7 during boss combat. Keep initial three Bobrozombi, prefer safe camera-perimeter candidates with unchanged220px distance and authoritative footprint/navigation checks, finite legacy fallback/defer, and275ms paced ordinary refill. No production invulnerability or new AI. Preserve controlled boss scheduler/placement, including ordinary work under its shared cap. Short viewports may require partial entry; safety wins over density. See `docs/pr50-combat-pacing.md`.
