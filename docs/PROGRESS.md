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
