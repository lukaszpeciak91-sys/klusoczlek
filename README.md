# KŁUSOCZŁEK

Mała, humorystyczna gra survival shooter 2D, działająca w przeglądarce na telefonie i PC. Projekt-prezent.

**Status:** PR01 — minimalny fundament web w trakcie audytu, bez wdrożenia.

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

Prawa do materiałów: wykorzystujemy wyłącznie własne lub prawidłowo licencjonowane grafiki i dźwięki.

Repository: https://github.com/lukaszpeciak91-sys/klusoczlek

## Lokalne uruchomienie PR01

Wymagane Node.js 20.19+ lub 22.12+ oraz npm.

```sh
npm install
npm test
npm run build
npm run dev
```

Aby sprawdzić wynik builda: `npm run preview`. Vite buduje pod bazą `/klusoczlek/`; w podglądzie użyj ścieżki `/klusoczlek/`. W repo przygotowano workflow Pages uruchamiany po autoryzowanym merge do `main`.

### Manualny smoke przed merge

1. Desktop landscape: START → arena i żółty marker → MENU.
2. Telefon Android Chrome: poziomo menu, START i MENU; palcem oraz myszą na komputerze.
3. Telefon w pionie: komunikat „Obróć telefon poziomo”; po powrocie do poziomu scena bez resetu.
4. Obróć urządzenie w arenie i wróć: scena zostaje, nie ma postępu symulacji w pionie.
5. Menu: ikona fullscreen prawy dolny róg (uwzględnia safe-area); odmów fullscreen lub użyj przeglądarki bez API — START wciąż działa.
6. Sprawdź brak przewijania i przypadkowego zoomowania; brak błędów w konsoli lub brakujących assetów.

**Ograniczenia:** brak sterowania, przeciwników i rozgrywki; orientacja może nie dać się zablokować przez ograniczenia przeglądarki/OS; ekran fullscreen może być niedostępny. Dla małych ekranów poza proporcją 16:9 występują pasy (bez obcinania gry).

## GitHub Pages (po autoryzowanym merge)

Workflow `.github/workflows/pages.yml` publikuje **wyłącznie po push do `main`**, a nie z pull requestów. Używa Node.js 22 i wymaga sukcesu `npm ci`, `npm test`, `npm run build` oraz obecności `dist/index.html`. Dopiero wtedy oficjalne akcje GitHub Pages publikują zawartość `dist/`. Kolejne wdrożenia nie wykonują się równocześnie. Nie są potrzebne żadne dodatkowe sekrety.

W ustawieniach repo GitHub → Settings → Pages jako źródło wybierz **GitHub Actions**. Wymagana jest autoryzacja merge tego PR; samo otwarcie PR nie publikuje witryny. Base Vite pozostaje `/klusoczlek/`. Dotychczasowy `Web CI` działa osobno i pozostaje niezmieniony.

