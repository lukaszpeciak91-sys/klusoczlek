# PROGRESS

**Ostatnia aktualizacja:** 2026-10-24
**Faza:** PR01 web foundation — weryfikacja przed merge
**Stan produkcji:** źródła minimalnej aplikacji web na gałęzi PR01; brak publikacji.
**Wersja:** 0.1.0 (projekt package.json; nie jest wydaniem)

## Ukończone wcześniej
- Uzgodniono nazwę, platformę i minimalny scope MVP.
- Zapisano dokumentację i kontrakt assetów.

## PR01 — zgłoszony do audytu (NIE scalony)
- Vite + Phaser 3, dwie sceny: menu i statyczna arena z markerem.
- UI w poziomie, ekran obrotu w pionie, pauza aktywnej sceny i powrót.
- Opcjonalny fullscreen wywoływany przyciskiem HTML, bez zależności START od uprawnień.
- Responsywne FIT 960×540, safe-area CSS i konfiguracja bazowej ścieżki /klusoczlek/.
- Testy logiki orientacji i proporcji.

**Weryfikacja:** nie uruchomiono tutaj instalacji npm, builda ani interaktywnych testów przeglądarkowych (brak dostępu sieciowego do npm/GitHub w środowisku wykonawczym). PR wymaga potwierdzenia w CI oraz manualnego smoke na Android Chrome i desktopie; nie oznaczać jako GREEN bez tych wyników.

## PR01 audit fix — 2026-10-24
- Dodano zabezpieczenie uruchomienia każdej sceny w pionie, również przy pierwszym boot i przejściu między scenami.
- Dodano regresje dla startu w pionie, wznowienia w poziomie oraz pauzy scen podczas przejścia.
- Dodano `.github/workflows/ci.yml` (npm ci, npm test, npm run build) i przygotowano `.github/workflows/pages.yml` z wyłączonym jobem publikacji (`if: false`).
- **BLOCKER:** brak zweryfikowanego `package-lock.json`. Lokalny npm registry zwrócił `EAI_AGAIN`. GitHub CI dla commita `5f5f044` zwrócił `action_required`, nie wykonał testów. Tymczasowy bootstrap lockfile usunięto, by nie zostawić workflow z automatycznym zapisem po późniejszym zatwierdzeniu.
- **Weryfikacja:** CI NIE JEST GREEN, `npm ci` bez lockfile nie przejdzie. Do zamknięcia: wygenerować i zatwierdzić lockfile z `npm install --package-lock-only --ignore-scripts`, uruchomić CI i zweryfikować Android Chrome/Desktop.

## PR02 — arena i movement (NIE scalony)
- Dodano arenę 1800×1200 rysowaną kodem, marker bohatera na oddzielnej warstwie i śledzącą kamerę.
- Phaser Arcade Physics: sterowanie WASD/strzałkami, 8 kierunków bez przyspieszenia po przekątnej; ograniczenie fizyczne do areny.
- Joystick dotykowy (jednym palcem), z resetem na puszczeniu; MENU powraca do sceny głównej.
- Utrata fokusu, zmiana widoczności i orientacji: zerowanie prędkości i wejścia, pauza/wznowienie fizyki. Zachowano PR01 fullscreen/landscape i /klusoczlek/.
- Dodano regresje obliczeń ruchu i ograniczenia pozycji w `tests/movement.test.js`.
- **Weryfikacja do wykonania:** CI `npm ci`, `npm test`, `npm run build` oraz manualny smoke Android Chrome i desktop. Bez wyników nie oznaczać jako GREEN.
- **Poza zakresem:** wrogowie, bronie, fale, HP, assety binarne, kontrakt spritesheetów.

## Pages deployment patch — oczekuje na niezależny audyt (NIE scalony)
- Przygotowano automatyczną publikację `dist/` po `push` do `main`: Node 22, `npm ci`, `npm test`, `npm run build`, oficjalne Pages Actions.
- Wdrożenie jest zależne od sukcesu weryfikacji; PR nie ma uprawnień do publikacji w tym workflow.
- Dodano `concurrency` z `cancel-in-progress: false` dla bezpieczeństwa wdrożeń.
- Dotychczasowy CI i base `/klusoczlek/` bez zmian; brak assetów i zmian w grze.
- **Weryfikacja:** uruchomienie nowego deploy workflow na PR nie nastąpi z założenia. Potwierdzenie produkcyjnego deploy wymaga osobnej autoryzacji merge i poprawnych ustawień GitHub Pages (Source: GitHub Actions).
- **Ograniczenie:** nowy workflow może działać dopiero po scaleniu; weryfikacja rzeczywistego wdrożenia z gałęzi PR byłaby sprzeczna z zakazem publikacji.


## Mobile viewport & pause repair — PR oczekuje na audyt (NIE scalony)
- Dynamiczny logiczny viewport według rozmiaru kontenera, stała wysokość świata na ekranie; przy szerszym ekranie widać większy wycinek areny, bez rozciągania.
- Dodatkowy update geometrii po resize i fullscreen, zachowano safe area, ekran obrotu i /klusoczlek/.
- HUD: MENU bez strzałki, wyśrodkowane; pauza z WZNÓW i MENU GŁÓWNE, bez resetowania sesji podczas WZNÓW.
- Wykorzystano Phaser Scene pause / resume i blokadę duplikatów przejść. Reset joysticka, klawiatury i velocity, automatyczne odzyskanie fokusu nie może wznowić fizyki podczas celowej pauzy.
- Dodano testy viewportu i przejść pauzy; testy nie zastępują realnego smoke Android landscape/fullscreen.
- Manual smoke: Android Chrome i desktop: rozdzielczości 16:9 / 20:9 / 21:9, fullscreen przed i po START, safe area, wyśrodkowanie HUD, MENU→WZNÓW zachowuje pozycję, MENU GŁÓWNE resetuje sesję, szybkie dwukliki, obrót w pion, przejście aplikacji w tło, powrót i ponowne sterowanie.
- Nie dodano przeciwników, broni, drugiego joysticka, ani binarnych assetów.

## PR04 audit fix — responsive UI after resize (pending re-audit)
- Menu title, subtitle and START reposition to current logical center after Phaser Scale resize.
- Pause heading, WZNÓW and MENU GŁÓWNE similarly move without scene restart.
- MENU HUD and mobile joystick are repositioned with viewport height. Joystick pointer origin changes together with visible graphics and clears captured input on resize.
- Added `src/ui-layout.js` and focused `tests/ui-layout.test.js`; no added assets/dependencies/gameplay.
- Verify in Android Chrome: start landscape, rotate, enter/exit fullscreen, resize desktop, pause then resize, confirm UI remains aligned; verify camera/player state is preserved.
- Verification: npm ci / npm test / npm run build require actual execution results from CI, not inferred success.

## Mobile viewport regression repair — pending independent audit (2026-10-25)
- Root cause: Phaser FIT + manual logical resize + CSS canvas maximum bounds competed; the three sizing mechanisms could misalign the canvas and produce unequal visual X/Y scaling.
- Change: Phaser Scale.RESIZE owns canvas and pointer coordinate mapping; #game fills the safe-area box and CSS no longer caps canvas dimensions.
- Portrait/fullscreen/resize continue to invoke Scale Manager refresh; no scene recreation and no camera/movement/pause gameplay changes.
- Updated tests for 16:9, 20:9, 21:9, wider displays, safe area sizing, mapping and transient zero-size fallback.
- Remaining: verify Android Chrome portrait/landscape, fullscreen, address bar collapse, circle geometry and UI/camera continuity. Actual CI status must be confirmed from workflow runs.

## PR06 — mobile pause & controls repair (2026-10-25, pending audit)
- Evidence from main: fixed Menu y=148/211/330 and Pause y=150/285/383, with 70px-high bottom button extending beyond 375px height. The WZNÓW callback used a shared Arcade world resume while Arena also independently paused/resumed that world on focus and resize. Missed pointer taps were not proven.
- Responsive Menu/Pause coordinates and element sizes now depend on measured Phaser Scale.RESIZE width and height; no scene recreation.
- Joystick diameter 92 logical/CSS px, origin inside safe-area parent; original single-finger tracking preserved.
- On intentional Pause, Arena scene pauses natively; on WZNÓW the scene resumes first and the existing focus/orientation guard decides whether physics may resume. No unconditional physics resume in WZNÓW.
- Added 320/360/375/420/540 landscape regression tests for control bounds and joystick geometry.
- Browser-level real-device interaction and WZNÓW behavior are still required; pure geometry tests do not prove touch delivery.
- No binaries, weapons, enemies or second joystick.

## PR06 final audit fix
- Root cause: WZNÓW called scene.resume('Arena') then arena.onFocus() while SceneManager may still report the scene as paused; the pauseGate state was already cleared, potentially leaving physics paused.
- Changed to wait for actual Phaser Scene RESUME event to clear the user's intentional pause and synchronize Arcade Physics. Blocked WZNÓW leaves the Pause scene and gate intact. Focus alone never clears pauseGate.
- Added `tests/pause-lifecycle.test.js` simulating SceneManager RESUME notifications, blocked/recoverable resume, player-coordinate continuity, focus/visibility/orientation conditions.
- Removed literal escaped `\\n` in DECISIONS.md. CI and on-device touch smoke required.

## PR06 cross-project follow-up — real Phaser browser integration (2026-10-25)
- Read existing scene/viewport/gate code and inspected GitHub Actions failure logs before adjusting test infrastructure.
- Added `tests/browser-lifecycle.html` exercising the actual Phaser 3 Game, SceneManager, Arena scene, Pause overlay and button event, including a blocked resume and a successful resume retaining exact player coordinates/object and camera identity.
- Added `tests/run-browser.mjs` with headless Chrome and Vite, and CI `npm run test:browser` following build. Browser test is not a synthetic RESUME event or mocked gate.
- First browser CI failed because Vite uses base `/klusoczlek/`; corrected harness URL. Follow-up runner also launches Vite directly to avoid orphan npm child process.
- Verified failure categories and scope: no evidence justifying viewport settling. No runtime gameplay change required by currently exercised integration path.
- Limitations: Chrome headless browser event emission is not a true physical Android touchscreen; orientation/focus and overlay pointer hit-testing across rapid resizes still need real-device smoke. No merge/deploy/binary assets.

## Main Menu session-navigation simplification (unmerged PR, 2026-10-25)
- Evidence: prior Arena MENU launched PauseScene; PauseScene contained both WZNÓW and MENU GŁÓWNE, with a separate gate and physics synchronization. Existing browser test manually emitted pointerdown instead of dispatching pointer coordinates, so it did not verify touch delivery or hit areas.
- Arena MENU now pauses the Arena instance and opens MenuScene directly. MenuScene shows START if no Arena is paused, WZNÓW otherwise; WZNÓW resumes the existing scene/player/camera, not start().
- Removed PauseScene from game configuration and scene source; browser test now uses real Chromium DevTools pointer coordinates across ten navigation cycles and responsive heights 320/360/375/420.
- Browser focus cannot release user pause; existing world pause/resume stays guarded by actual browser state and Phaser scene status. Scale.RESIZE, safe area and 92px joystick unchanged.
- PR verification must include live CI and real Android Chrome smoke. Main-menu-only approach supersedes D023 with D025.

## PR09 — recovery after merged PR08 (2026-10-25; pending independent audit)
- Based on latest main, compared against fix/pr08-menu-freeze-navigation. Ported only the three post-merge runtime additions to src/scenes.js: bring Menu to top after launch, hide fullscreen in Arena.create, hide fullscreen on Arena RESUME.
- Imported the focused Chromium browser test changes: actual CDP touch events, 20 MENU/WZNÓW cycles, scene order, computed fullscreen visibility, camera/player identity, 320/360/375/420 landscape geometry. No extra runtime systems/assets.
- RED attempt: browser CI Chromium DevTools bootstrap failed before Phaser loaded (not a verified behavioral RED). Earlier Android evidence confirms the user-visible menu freeze. Treat remaining Android real-device smoke and CI evidence separately.

## Main Menu dual actions and fullscreen toggle — pending audit (2026-10-25)
- Main Menu now always offers NOWA GRA; WZNÓW appears additionally when Arena is paused. NOWA GRA stops old Arena and starts a fresh one; WZNÓW resumes same session.
- Fullscreen HTML toggle enters/exits fullscreen with optional landscape lock on entry, and calls Phaser ScaleManager.refresh after transitions. No independent scaling or timers.
- Browser test uses DevTools real touch coordinates for 20 MENU/WZNÓW cycles, validates dual buttons and fresh session, fullscreen HTML visibility, joystick-safe viewport sizes.
- Actual full-screen enter/exit automated coverage limited by headless browser restrictions. Android Chrome manual smoke required.

## PR11 — fullscreen exit layout recovery (2026-10-25; audit pending)
- Real Android Chrome evidence: after exiting fullscreen, Main Menu buttons and canvas appear clipped/displaced despite working toggle.
- Root-cause candidate: fullscreen promise and fullscreenchange can precede the Android browser toolbar restoring the safe-area game container size. The existing single ScaleManager refresh misses subsequent container-only layout changes.
- Minimal fix: observe the actual #game safe-area element with ResizeObserver and call the already established viewport update/Phaser Scale.refresh when its box changes. The observer is disconnected at game destroy. No extra viewport manager, manual scaling, fixed timeouts or CSS transforms.
- Browser regression now asserts Phaser logical scale, canvas rect and parent box re-align after each native fullscreen toggle and that menu hitboxes remain within the recovered viewport.
- Remaining: real Android Chrome after address-bar restoration, fullscreen entry/exit multiple times, Arena HUD/joystick and menu hit areas. Chrome headless cannot replicate the mobile browser's address bar perfectly.

## Dalej
- Audyt PR01 → testy → autoryzacja merge.
- Następny etap po akceptacji: PR02 — wejście i ruch.

## PR tracker
| Etap | Status | Uwagi |
|---|---|---|
| Dokumentacja | Gotowe | Źródło prawdy w docs |
| PR01 | Do audytu/testów | Nie scalać / nie publikować |
| PR02–PR12 | Nie rozpoczęte | Zależne od przejścia PR01 |

## Sposób aktualizacji
Po każdym scalonym PR: data, numer PR, dokładnie co działa, co nie działa, największe ryzyko oraz kolejny krok. Nigdy nie oznaczaj jako zakończone bez dowodu wykonania.

## Combat/spritesheet contract foundation — 2026-10-25 (PR pending audit)
- Approved twin-stick and mouse held-fire contract documented; no combat runtime implemented.
- Original-art filename/grid/pivot/muzzle contract in ASSETS and machine-readable source; all assets PENDING.
- Pure octant and vector/pose helpers plus manifest verification tests; current marker physics/camera and scene runtime unchanged.
- No binaries, artwork, packages, deploy or merge. CI and npm commands must be verified externally; no local npm run claimed.

## PR12 audit fix — 2026-10-25
- Reduced character spritesheets from 8 to 4 animation phases per direction/state (192 → 96 frames); weapon sheets remain separate 3×1.
- Clarified provisional dialogue portrait identities and repaired DECISIONS markdown decision table/statuses.
- Contract tests updated; runtime physics, camera, input and fallback untouched. Pending independent re-audit and CI verification.

## Twin-stick vertical slice — 2026-10-25 (PR pending audit)
- Two visible 92px independent touch controls; held right fire, mouse hold firing, procedural shots and training targets; no art assets or combat systems.
- Maintains Arcade player/camera radius and Scale.RESIZE; pure cadence tests. Browser CI and Android Chrome two-touch acceptance required before merge.

## PR14 Bobrozombi first enemy vertical slice — 2026-10-25 (pending audit)
- Three deterministic Arena-edge spawns; Bobrozombi pursue player at 65 world px/s, take 3 projectile hits and disappear.
- Provisional player HP 5, contact damage 1, 800ms invulnerability; defeat uses existing Main Menu with only NOWA GRA. No new PauseScene.
- 17px player circle/physics/camera, twin-stick, manual 360-degree fire, Scale.RESIZE preserved.
- Procedural graphics only; no final waves, enemies, pickups or binaries.
- Automated unit and real Chromium gameplay checks added; actual Android Chrome smoke and independent audit gate still required.

## PR15 — procedural obstacles and explosive barrel (pending audit)
- Four fixed safe layouts rotate by new session; independent rock/log/barrel foreground graphics over untouched ground and grid. Separate placeholder visuals replaceable without background changes.
- Phaser static collision for player, circle blocking for Bobrozombi, projectile segment hit against all intact obstacles. Barrel prototype: 3 HP, 110px explosion, enemy 2 damage, player 1 damage, one-shot destruction.
- No binary assets, new dependencies, final arena illustration, extra enemies or wave system. Independent audit and Android Chrome acceptance required.

## PR16 — 8-direction Aloes visual contract (pending independent audit)
- D030 supersedes 96-frame character sheets: player 512×64 and three enemy sheets 384×48, eight single-pose frames in E/SE/S/SW/W/NW/N/NE order. All other asset specifications retained.
- Optional original Aloes Podpalacz PNG manually uploaded by user only; code-driven fallback when missing/invalid. Separate Phaser visual sprite follows existing physics circle without changing game systems; subtle sway/bob purely visual.
- Real artwork not yet provided/visually inspected; Android Chrome manual acceptance pending. No binary or deploy.

## Asset directory scaffold (pending independent audit)
- All seven directory categories from the approved asset manifest tracked via `.gitkeep` under `public/assets/`.
- `.gitignore` excludes disposable artwork scratch/backup files and OS metadata but allows all approved production PNGs.
- Vite retains its existing `publicDir` default and `/klusoczlek/` base; no gameplay, assets, packages, workflow, merge or deploy changes.

## PR17 audit repair — arena art contract (pending re-audit)
- Added tracked `public/assets/obstacles/.gitkeep` (eight canonical asset upload directories).
- Replaced obsolete 64×64 `terrain/ground.png` with one canonical pending 1024×1024 `terrain/arena-ground.png` manifest contract; removed the legacy unapproved generic `terrain/obstacle.png` placeholder contract.
- Future independent obstacle PNG names/dimensions await explicit approval; no binary assets, changes to procedural Arena runtime, gameplay, Vite or deploy.

## Art Bible v1.0 — documentation only, pending independent audit
- Added docs/art/ART_BIBLE.md, CHARACTER_SPEC.md, ENVIRONMENT_SPEC.md, ASSET_QA.md; linked from technical ASSETS.md.
- Artistic approvals separated from D030 eight-frame runtime contract and pending graphics. Verified user-uploaded player PNG path exists; approved ground PNG still absent, procedural ground remains active.
- No binary, gameplay, manifest, dependency or deployment changes. Art review and physical Android validation remain separate acceptance gates.

## Arena approved texture rendering (pending independent audit)
- Runtime validates pending 1024×1024 `public/assets/terrain/arena-ground.png` using Vite BASE_URL and creates a world-space Phaser TileSprite under gameplay objects. Procedural ground/grid remains a fallback for missing or invalid PNG and is destroyed after successful texture load.
- World size, physics/camera, obstacles, combat, player, HUD and fullscreen unchanged. No binary artwork changed. QA: unit + actual Chromium full browser tests and Android device check remain distinct.

## Weapon pickup prototype — 2026-10-27, pending verification
- Unarmed session start, procedural blunderbuss/rifle/flamethrower tokens, 18 Bobrozombi capped at 3 concurrent, milestones #5/#10, unified enemy deaths, compact HUD, completion text.
- User supplies all four PNG sheets manually. No binaries or deployment in this branch.
- Browser QA, npm commands, GitHub CI and independent audit still required; do not treat unverified code as GREEN.

## PR22 — distinct firing modes, pending independent audit
- Centralized pure combat tuning and burst scheduler for PUKAWKA / KARABIN / MIOTACZ; no ammo or added binaries.
- Visual-only rifle recoil, continuous bounded code-drawn flame particles with deterministic cone damage and obstacle occlusion; barrel explosion continues using existing shared death path.
- Extended unit and real Chromium regressions; physical Android Chrome / Canvas fallback performance and audio acceptance remain separate.

## Bobrozombi V2 production sprite integration — PR awaiting audit

- Optional 768×96 RGBA, eight 96×96 direction frames; nearest-neighbor texture, independent 0.75 art scale.
- Shared enemy renderer handles both initial and replacement spawns, missing/invalid image fallback and shutdown cleanup.
- Existing combat and Arena mechanics deliberately unchanged. Binary artwork supplied manually by user; real artwork QA remains pending until uploaded.

## PR24 — ALOES HP face HUD V1 / layout collision repair (awaiting audit)
- One responsive HUD layout: MENU touch area left, weapon and kills separate, Aloes HP portrait and numeric HP right, twin sticks unchanged. All positions update on Phaser resize.
- Five user-approved optional 128×128 RGBA portraits hp_5.png through hp_1.png at public/assets/portraits/, user manual upload only; no binaries. Previous three-band active contract superseded.
- Strict PNG validation, stale async selection guard, fallback procedural numeric face; 0 HP subdued. Real HP losses trigger 160 ms pulse, not invulnerability overlap.
- Unit tests, real Chromium Canvas tests, and screenshot-based layout acceptance required; physical Android Chrome and real approved portrait art remain manual acceptance. No merge/deploy before audit.

## Bocianołak V1 — mixed 28-enemy Arena (PR25, pending independent audit)
- Authoritative ordered schedule: 18 Bobrozombi, 10 Bocianołak, three living at once. New type appears after initial Bobrozombi onboarding, shared reward milestones #5 and #10, completion at #28.
- New type registry and deterministic lateral weaving, preserving Bobrozombi's existing 65 px/s direct pursuit.
- Shared optional renderer supports user-provided `public/assets/enemies/bocianolak.png` (1024×160 RGBA, 8 frames 128×160) and distinctive procedural fallback; production PNG must be uploaded manually.
- Type-specific HP/radius/speed used in movement, obstacles, flame, projectiles and player contact. Physical Android and approved-real-art QA remain pending. No binary art, deploy, merge or Żubrokryptyda.

## HUD V2 — compact retro status ribbon (PR27; independent audit pending)
- One translucent warm-rustic top panel: existing MENU on left, procedural equipped-weapon token (uses exact WEAPONS symbols/colors), compact skull and X/28 counter, five-state Aloes face on right with numeric HP below.
- No legacy weapon-name or ZABÓJSTWA label. Responsive layout is applied at Arena creation and each Phaser resize; real Phaser GameObject bounds are tested at compact landscape sizes.
- No binary art, player physics, aim, enemy or weapon-rule changes. Physical Android screenshot acceptance remains pending.

## PR28 — Żubrokryptyda V2 (audit gate)
- Third optional shared-renderer enemy at `public/assets/enemies/zubrokryptyda.png`, 1536×192 8-bit RGBA; eight 192×192 E,SE,S,SW,W,NW,N,NE frames, transparent outside silhouette; manual upload, no binary commits.
- Experimental render scale 0.55, grounded baseline offset -48.4, unique horned heavy procedural fallback.
- Heavy 8HP, 42 px/s, radius 30, damage 1, direct pursuit; prior two enemy balances untouched.
- 18+10+4 = 32 scheduled enemies, heavy spawn ordinals 13/20/27/32, max three living and one heavy, blocked spawns retry without consumption. Existing weapon milestones 5 and 10 remain.
- Original approved art and physical Android testing remain pending until manually available; no merge/deploy.

## Enemy procedural locomotion V1 — independent audit pending
- Visual-only distance-driven procedural gait uses resolved distance after existing obstacle collision, with deterministic seed phase and framerate-independent idle blending. The gameplay position, enemy types, collision radii and encounter 18+10+4 remain unchanged.
- Bobrozombi: 1.8 Hz, ±3° sway, 1.8 px vertical shuffle; Bocianołak: 2.7 Hz, ±2°, 2.8 px; Żubrokryptyda: 1.1 Hz, ±1.5°, 1.2 px. Sprite scales and feet offsets retained. Counter-offset keeps rotating image feet anchored to enemy container.
- Motion applies to loaded PNG sprites only; procedural fallbacks remain static. No authored animation frames: directional 8-frame poses retain inherent silhouette constraints. No per-enemy tweens/timers/assets.
- User-approved PNG appearance on physical Android requires manual visual acceptance. No merge or deploy.

## Episode 1 — Part A, six-wave foundation (independent audit pending)
- Six deterministic waves of 8/10/12/12/12/12 (66 total), max alive 3/3/4/4/4/5, species Bobrozombi then Bocianołak then Żubrokryptyda, preserving existing type stats. Wave scheduler is pure and lives in src/episode.js.
- A wave only clears after its quota spawned and died; 3000ms Phaser-game-time intermissions. The pause state freezes time. FALA X/6 announcement.
- Neutral procedural ♥ health token (+2 HP, capped at 5, not consumed at full HP) awarded after waves 2, 4 and 5, with retry for unavailable safe placement and no beer assets.
- Mutually exclusive episode states: active, intermission, final-pending, victory or defeat. Victory from final-pending after final enemy death, allowing Part B dialogue before terminal outcome. Defeat wins if simultaneous.
- One-shot narrative boundary names: before-wave-1, before-first-bocianolak, before-first-zubrokryptyda, after-final-enemy; `Arena.consumeNarrativeBoundary(id)` consumes exactly once. The native Scene `episode-boundary` event notifies listeners; Part B may call `holdFinalOutcome()` from the final-enemy event, then `releaseFinalOutcome()` after final dialogue so victory is not shown early. No cutscene content now.
- Existing HUD V2.1, player visuals, combat, enemy balancing and approved assets retained; no binary changes.


## Flamethrower V2 — proposed PR (2026-10-29; pending independent audit)
- Fire stream uses reusable Phaser graphics in three layers plus existing bounded particles. No PNG or extra dependencies.
- Living enemies hit by the obstacle-aware damage cone can enter a species-specific panic (Bobrozombi 2500 ms / 75 px/s, Bocianołak 1800 ms / 110 px/s, Żubrokryptyda 1200 ms / 35 px/s), followed by 2000 ms immunity.
- Damage cadence and cone unchanged; no burning DoT. Retreat uses existing obstacle resolver and resolved-distance procedural gait.
- Enemy fire VFX is one reusable Graphics instance per ignited enemy; cleared at expiry, death, scene shutdown.
- Episode definitions, health drops, weapon milestones and narrative boundaries unchanged.
- Automated pure contract tests and a real Chromium harness extension were added, but execution and visual QA must be verified from actual CI/browser evidence before merge. Physical Android QA remains outstanding.


## Episode 1 Part B — dialogue cutscenes (2026-10-29, pending independent audit)
- Four approved, fixed text sequences use Part A one-shot boundaries and final hold/release.
- Single Phaser bottom dialogue UI, 192x192 optional RGB/RGBA portraits, square procedural fallback and no binary uploads.
- Combat update and Phaser Arena clock pause during dialogues; button input remains active. MENU and WZNÓW must not bypass the freeze.
- Opening starts before any combat update, including while optional portrait loading is pending; pre-spawned wave-one enemies cannot move or damage Aloes.
- No wave definitions or gameplay balance modified. Browser harness now advances the opening via actual touch events to preserve existing progression tests.
- IMPORTANT: CI, real Chromium visual and responsiveness checks, and Android manual smoke remain required; no claim of completed execution.
