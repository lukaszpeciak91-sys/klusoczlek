# WORKFLOW

## Zasada
Jeden main i małe PR-y. Orkiestratorka zatwierdza zakres, implementatorka realizuje, Art Director dostarcza zasoby wg kontraktu. Dokumentacja jest aktualizowana wraz z kodem.

## Budżet
Cel: około 10–15 PR. Limit planistyczny 25; absolutny limit projektu poniżej 50 PR. Nie liczba PR decyduje o jakości: nie pomijamy niezbędnych testów dla sztucznego wyniku.

## Proponowane etapy (12 PR, do rekalkulacji)
01. Minimalny projekt web, testowy ekran, bezpieczna konfiguracja subpath Pages.
02. Input mobile/desktop, viewport i kamera, poruszanie.
03. Arena, kolizje, spawny.
04. Automatyczne celowanie i podstawowy atak.
05. System HP, obrażeń i krótkiej nietykalności.
06. Trzy zachowania wrogów.
07. Trzy bronie i pickupy z natychmiastową zamianą.
08. Fale, zakończenia i restart.
09. HUD + portret z trzema stanami (na placeholderach).
10. Integracja zatwierdzonych assetów.
11. Audio, feedback, drobny balans i optymalizacja mobile.
12. E2E smoke, stabilizacja, Pages, final review.

Etapy można łączyć, jeśli redukuje to ryzyko i PR jest audytowalny.

## PR contract
Każdy PR zawiera:
- cel, dokładny zakres i wykluczenia;
- istotne pliki;
- testy (automatyczne lub opis manualnego smoke);
- wpływ na wydajność i używanie jednego palca;
- screenshot lub nagranie, jeśli zmienia UI;
- ryzyka, znane braki i aktualizację PROGRESS.md.

## Merge gates
- Brak mergowania bez decyzji użytkownika.
- Na etapie prototypu nie rób deployu na żywo bez zgody.
- Odrzuć zakres wykraczający poza GAME_DESIGN, chyba że wcześniej zapisano decyzję.
- Sprawdź uruchomienie na telefonie, nie tylko desktop.

## Integracja grafik
Art Director pracuje na osobnym torze. Asset manifest i nazwy uzgadnia się przed integracją. Implementacja działa na placeholderach. Brak nieautoryzowanych zmian logiki przez tor artystyczny.
