# GAME DESIGN — MVP v0.1

## Cel
Przeglądarkowa, krótka (orientacyjnie 3–5 minut) zabawna strzelanka survival z góry. Gra powinna być zrozumiała bez instrukcji i grywalna na telefonie jednym palcem.

## Przebieg
1. Ekran tytułowy: KŁUSOCZŁEK i przycisk START; opcjonalnie ikona dźwięku dopiero gdy audio istnieje.
2. Gracz pojawia się w ograniczonej arenie; kamera go śledzi.
3. Wrogowie pojawiają się poza bezpośrednim kontaktem z graczem, rosną w liczbie i różnorodności falami.
4. Gracz unika kontaktu, automatycznie atakuje, zbiera leżące bronie i ewentualne leczenie.
5. Po zdefiniowanej liczbie fal: ekran zwycięstwa; przy HP 0: ekran porażki. Oba mają RESTART.

## Sterowanie
- Mobile: pojedynczy, duży joystick dotykowy. Brak obowiązkowego drugiego palca.
- Desktop: WASD lub strzałki.
- Brak ręcznego strzelania, celowania, przeładowania i skoku.
- Kamera podąża płynnie; ekran nie przewija całej strony podczas sterowania.
- Gdy gra jest wstrzymana/utraci fokus, nie może generować niekontrolowanych obrażeń.

## Combat
- Celowanie automatycznie w najbliższego żywego wroga w zasięgu broni; częstotliwość wg broni.
- Jedna broń aktywna w danej chwili, zawsze widoczna w HUD.
- Trzy różniące się zachowaniem bronie w MVP, dokładne parametry stroimy po grywalnym prototypie: szybkostrzelna, mocna wolna, obszarowa/przebijająca (trzecia do potwierdzenia).
- Broń z ziemi po dotknięciu natychmiast zastępuje aktualną; krótki cooldown pickupów zapobiega mimowolnym seriom wymian.
- Ograniczaj liczbę obiektów i efektów dla średnich telefonów.
- HP spada wskutek ataków/kontaktu, nie co klatkę; obowiązuje krótka nietykalność po trafieniu.
- Leczenie jako pickup: decyzja do zatwierdzenia po pierwszych testach.

## Przeciwnicy (3 zachowania)
1. Bobrozombi: wolny, liczny, podąża za graczem.
2. Żubrokryptyda: ciężka, wytrzymała, okresowa szarża (jeśli prosta implementacja).
3. Typ roboczy: szybki, słabszy przeciwnik — design i nazwa do decyzji w toku prac.
Brak zaawansowanego pathfindingu. Przeszkody nie mogą blokować hord w nieskończoność.

## Arena i fale
- Jedna czytelna ograniczona mapa, początkowo pusta lub z minimalnymi przeszkodami.
- Kolejne fale zwiększają napięcie i wprowadzają typy wrogów.
- Zwycięstwo osiągalne; nie endless-only.
- Dokładny czas, liczba fal, tempo spawnu, balans i finał — do decyzji na bazie prototypu; nie dodawać bossa jako czwartego typu bez zgody.

## HUD
- Czytelny licznik HP, aktualna broń, numer fali / postęp.
- Portret inspirowany mimiką HUD DOOM: minimum 3 stany (>60%, 30–60%, <30% HP); nie kopiować oryginalnej grafiki.
- Portret na podstawie prywatnego zdjęcia kolegi tylko po zatwierdzeniu publikacji.

## Definition of Done MVP
- Start → sterowanie → walka → pickup broni → 3 typy wrogów → fale → zwycięstwo/porażka → restart.
- Telefon w poziomie i desktop bez przewijania dokumentu; bez widocznego spadku płynności w standardowym starciu.
- Zasoby i linki działają spod podścieżki GitHub Pages.
- Gra uruchamia się bez instalacji, logowania i serwera.

## Weapon pickup contract — clarified
- Three weapons are alternative playstyles, **not** an upgrade ladder. Balance them to be comparably viable against different threats, with meaningful differences in range, area, cadence or projectile behavior.
- Contra-style forced tradeoff is intentional: collecting any weapon instantly replaces the current weapon even if the player prefers the old one. No confirmation, selection menu, inventory, discard button or protection from unwanted weapon choices.
- Pickups should be visually distinguishable, allowing tactical avoidance; spawn them accessibly. A short technical anti-double-trigger cooldown may prevent one pickup from firing repeatedly but must not prevent deliberate changes.

## Landscape and fullscreen contract
- Gameplay i panele projektowane wyłącznie poziomo; portretowy viewport wyświetla komunikat „Obróć telefon poziomo”, bez rozciągania lub obracania samej gry CSS-em.
- Gdy podczas walki ekran przejdzie do pionu, symulacja jest pauzowana; po powrocie do poziomu wznawiana bez dodatkowych obrażeń lub skoków czasu.
- Ekran START: dyskretny przycisk fullscreen w prawym dolnym rogu, etykieta dostępności; jest opcjonalny.
- Wywołanie fullscreen wyłącznie po interakcji użytkownika; można opcjonalnie spróbować screen.orientation.lock('landscape') po przejściu do fullscreen, wyłącznie gdy API jest dostępne. Nie polegać na powodzeniu tego wywołania.
- START działa także bez fullscreen, także po odmowie uprawnień lub w nieobsługiwanej przeglądarce. Nie próbować agresywnie ponawiać fullscreen.
- Dopasowanie do viewportu z zachowaniem proporcji, bez obcinania krytycznej treści; dotykowe elementy poza obszarami safe-area; bez przypadkowego przewijania/zoomowania gry.
- Test: Android Chrome fullscreen tak/nie, zmiana orientacji w czasie gry, mały ekran landscape, desktop, niewspierane API — bez crashy.
