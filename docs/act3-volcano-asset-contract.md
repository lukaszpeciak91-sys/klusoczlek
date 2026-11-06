# KŁUSOCZŁEK — Akt III: PRZYTULNE M4 W CENTRUM WULKANU

## Produkcyjny kontrakt grafika → Phaser 3

Świat ma **1800 × 1200 pikseli** (jak Akt I), współrzędne świata zaczynają się w lewym górnym rogu (0,0). Nie skalować grafiki do rozmiaru ekranu. Kamera śledzi Aloesa po świecie.

| Plik w repo | Wymiary | Kodowanie | Wymagania |
|---|---|---|---|
| `public/assets/arenas/act3-volcano.png` | **1800 × 1200** | PNG **8-bit RGBA** (color type 6) | Pełnoświatowa statyczna warstwa skał, platform i mieszkania. **Alpha 0** w miejscach odsłaniających lawę. Piksele na krawędziach mogą mieć częściową alfę. Początek obrazu (0,0) pokrywa się z początkiem świata. |
| `public/assets/backgrounds/act3-lava.png` | **512 × 512** | PNG **8-bit RGB lub RGBA** (color type 2/6) | Powtarzalna tekstura bez widocznych szwów **na obu osiach**. Lewa krawędź musi łączyć się z prawą, górna z dolną. |

### Kolejność renderowania

1. **Lawa** — pojedynczy, utrzymywany `TileSprite`, pozycja świata (0,0), rozmiar 1800×1200, depth −20.
2. **Skała i mieszkanie** — pojedynczy `Image` 1800×1200, origin (0,0), depth −10. Przezroczystość PNG odsłania poruszającą się lawę.
3. **Aloes i obiekty gameplayu** — nad skałą (sprite Aloesa depth 11).
4. **Joysticki i HUD** — `scrollFactor(0)`, ponad światem.

Lawa płynie **wizualnie z góry na dół** przez zwiększanie `tilePositionY` z prędkością **24 px/s**. Jest to efekt graficzny, nie symulacja fizyki ani podnoszący się poziom lawy. Aktualizacja jest ograniczona do maksymalnie 50 ms na klatkę i zatrzymuje się przy pauzie/utracie aktywności. Nie animować skały ani całej sceny.

### Integracja i awarie

Scena startuje **bez jakichkolwiek PNG**: wyświetla proceduralną lawę i prostokątny, wyraźnie tymczasowy teren. Każdy plik ładuje się **niezależnie** z `assetUrl(import.meta.env.BASE_URL, path)`. Gdy plik przejdzie walidację i dekodowanie, zastępuje tylko własną warstwę. Błąd HTTP, niepoprawny nagłówek PNG, złe wymiary, głębia bitowa lub format, błąd dekodowania i zamknięcie sceny w trakcie pobierania pozostawiają bezpieczny fallback. Nie trzeba zmieniać architektury renderowania po dostarczeniu plików.

Walidacja: sygnatura PNG, chunk IHDR, dokładne wymiary, 8 bitów na kanał, dozwolony color type oraz standardowa kompresja/filtr/przeplot bez interlace. Dekoder przeglądarki sprawdza samą zawartość obrazu. Nie przyjmujemy paletowych, grayscale ani 16-bitowych PNG.

### Kolizje — celowo odroczone

`VOLCANO_TEMP_BOUNDS` = (190,155)–(1610,1045), start Aloesa (900,600). To **wyłącznie prowizoryczna blokada**, nie maska finalnych platform i nie gwarancja zgodności z ilustracją. W przyszłym zadaniu zatwierdzimy osobno regiony przechodnie, przewężenia i krawędzie lawy na podstawie ukończonej ilustracji. **Nigdy nie generować kolizji z kanału alpha ani kolorów PNG.**

### Lista kontrolna dla grafika

- [ ] Dostarczyć oba PNG dokładnie pod podanymi ścieżkami i nazwami.
- [ ] Potwierdzić 1800×1200 RGBA z prawdziwą przezroczystością odsłaniającą lawę.
- [ ] Potwierdzić origin (0,0), brak przesunięcia, obcięcia lub skalowania warstwy skał.
- [ ] Sprawdzić teksturę lawy 512×512 w układzie 3×3: brak szwów X/Y.
- [ ] Upewnić się, że tekstura nadaje się do pionowego przesuwu 24 px/s.
- [ ] Zweryfikować wizualnie teren w Android Chrome landscape.
- [ ] Dostarczyć osobno szkic **autorskich** granic przechodnich do kolejnego zadania; bez automatycznej detekcji kolizji.

**Poza zakresem R1:** finalne nieregularne kolizje, walka, boss, broń wodna, dialogi, artefakty i finalny layout przeszkód.
