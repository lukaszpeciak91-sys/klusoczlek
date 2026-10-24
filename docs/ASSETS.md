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
- Nie kopiować cudzych postaci, grafik ani nagrań. Wykorzystywać oryginalne lub prawidłowo licencjonowane materiały.

## Handoff
Art Director: gotowe pliki + manifest + preview + wskazówki skali. Implementatorka: integruje i potwierdza rendering w docelowej rozdzielczości. Orkiestratorka: finalny przegląd.

## Hard rule — no binary commits from agents
- No implementing agent may generate, modify, upload, or commit binary files to any branch or PR. The user uploads them manually.
- Asset agent may design visuals in chat, but deliver a proposed manifest, filenames and specs for the user's manual upload. No automated asset writes.
- Code must tolerate missing binary assets with placeholders drawn in code. Text sources (e.g. SVG markup) are permitted as code, not binary asset generation.
