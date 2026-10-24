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
