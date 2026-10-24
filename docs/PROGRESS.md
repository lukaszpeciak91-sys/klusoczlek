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
