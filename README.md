# KŁUSOCZŁEK

Mała, humorystyczna gra survival shooter 2D, działająca w przeglądarce na telefonie i PC. Projekt-prezent.

**Status:** dokumentacja / preprodukcja. Kod gry jeszcze nie istnieje.

## Wizja MVP
- Menu: tytuł + START.
- Arena 2D z góry, kamera śledząca bohatera.
- Jeden wirtualny joystick; WASD/strzałki na PC.
- Automatyczny atak najbliższego wroga w zasięgu.
- Jedna aktywna broń; kontakt z pickupem natychmiast ją zastępuje.
- Trzy typy przeciwników, kolejne fale; krótka zamknięta sesja.
- HP i portret bohatera zależny od stanu zdrowia.
- Koniec rundy: zwycięstwo lub śmierć; restart.
- Deploy statyczny na GitHub Pages, adres względny /klusoczlek/.

## Dokumenty źródłowe
- [AGENTS.md](AGENTS.md) — zasady pracy agentów.
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — projekt mechaniki i kryteria MVP.
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — proces, zakres PR, testy.
- [docs/DECISIONS.md](docs/DECISIONS.md) — decyzje oraz otwarte kwestie.
- [docs/PROGRESS.md](docs/PROGRESS.md) — stan i kolejność.
- [docs/ASSETS.md](docs/ASSETS.md) — kontrakt grafik/audio.

## Granice
Nie implementujemy na starcie: kont, backendu, zapisu, sklepu, levelowania, drzewka umiejętności, ręcznego celowania, przeładowania, ekwipunku, kampanii wielopoziomowej.

Prawa do materiałów: korzystamy z własnej grafiki i audio; nie kopiujemy sprite'ów DOOM-a ani nagrań Krzysztofa Krawczyka.

Repository: https://github.com/lukaszpeciak91-sys/klusoczlek
