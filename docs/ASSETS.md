# ASSETS — kontrakt dla Art Director

## Cel
Spójny, czytelny pixel-art lub styl retro 2D, oglądany z góry, z humorystycznymi stworami. Gra ma być czytelna na ekranie telefonu. Unikaj zbyt szczegółowych assetów, trudnych do rozpoznania w ruchu.

## Potrzebne zasoby MVP
- Bohater inspirowany kumplem: widok z góry (czytelna sylwetka), kilka klatek ruchu jeśli konieczne.
- Portret HUD: 3 osobne obrazy odpowiadające poziomom HP.
- Trzy typy wrogów: Bobrozombi, Żubrokryptyda, trzeci do ustalenia.
- Trzy bronie: małe ikony pickupów oraz stan aktualnej broni w HUD.
- Podłoże areny i ewentualne 2–3 proste przeszkody.
- Efekty strzału, trafienia, śmierci mogą być generowane proceduralnie przez kod.
- Menu: tytuł KŁUSOCZŁEK (tekst w kodzie, osobne logo dopiero gdy warto).

## Kontrakt techniczny
- Format roboczy: PNG z przezroczystością, konsekwentne kierunki / pivoty; rozmiary i klatki ustalić wspólnie z Implementatorką.
- Nazwy: lowercase snake_case, np. enemy_bobrozombi.png, portrait_hp_high.png.
- Assety trzymać w katalogu public/assets/ (ostateczna ścieżka zależna od stacku).
- Manifest: filename, wymiary, klatki, orientacja, pochodzenie, licencja/zgoda, status.
- Najpierw koncept 1 postaci i próbka skali; potem produkcja paczki. Nie generować dziesiątek assetów przed sprawdzeniem widoku na telefonie.
- Publikacja twarzy rzeczywistej osoby w publicznym repo/na Pages wymaga uprzedniej zgody użytkownika i decyzji o sposobie przedstawienia.
- Zakaz kopiowania istniejących postaci, sprite'ów i chronionych nagrań; mariachi/Krawczyk wyłącznie jako inspiracja klimatu dla autorskiej muzyki.

## Handoff
Art Director: gotowe pliki + manifest + preview + wskazówki skali. Implementatorka: integruje i potwierdza rendering w docelowej rozdzielczości. Orkiestratorka: finalny przegląd.
