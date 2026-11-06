# Akt III — kontrakt produkcyjny (fundament)

Nazwa: **PRZYTULNE M4 W CENTRUM WULKANU**. Świat: **1800 × 1200** (jak Akt I). Scena: `Volcano`.

| Plik | Rozmiar | Format | Zastosowanie |
|---|---:|---|---|
| `public/assets/arenas/act3-volcano.png` | 1800 × 1200 | PNG RGBA 8-bit, przezroczyste obszary lawy | Zatwierdzona statyczna skała, platformy, dekoracje i mieszkanie |
| `public/assets/backgrounds/act3-lava.png` | 512 × 512 | PNG RGB lub RGBA 8-bit, seamless X/Y | Powtarzalna animowana wizualnie lawa pod skałą |

**Status: PENDING.** Scena obecnie renderuje proceduralne zastępniki, nie wczytuje powyższych PNG. Kontrakt to plan, a nie twierdzenie, że finalne warstwy są gotowe.

**Tymczasowa nawigacja:** prostokąt (190,155)–(1610,1045), start (900,600). To wyłącznie techniczna blokada wejścia do lawy; nie odpowiada zatwierdzonej kompozycji platform. Przed finalnym wdrożeniem należy przygotować z artystą osobną, ręcznie zatwierdzoną maskę/regiony ruchu i dopiero wtedy zastąpić `VOLCANO_TEMP_BOUNDS`. Nigdy nie generować automatycznie fizyki z alfakanału ilustracji. Docelowa lawa ma poruszać się niezależnie od nieruchomej skały.

**Zakres tego fundamentu:** rejestracja sceny, przejście kampanii, DEBUG, postać, joysticki, kamera, tymczasowa kolizja. Bez przeciwników, fabuły, bossów, pickupów i finalnej grafiki.

**QA do wykonania przed merge:** `npm test`, `npm run build`, realny Chromium w Android landscape: DEBUG → Akt III, ruch po czterech granicach, MENU/WZNÓW, odświeżenie checkpointu, płynność i brak błędów w konsoli.
