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
