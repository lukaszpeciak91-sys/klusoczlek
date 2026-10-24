# DECISIONS — log decyzji

Status: ACCEPTED / PROVISIONAL / OPEN / SUPERSEDED. Daty ISO.

| ID | Status | Decyzja | Powód |
|---|---|---|---|
| D001 | ACCEPTED | Tytuł KŁUSOCZŁEK; repo klusoczlek | Nazwa świata i prezentu |
| D002 | ACCEPTED | Statyczna gra na GitHub Pages | Jeden link bez instalacji |
| D003 | ACCEPTED | Widok 2D z góry zamiast raycastingu | Szybkość realizacji i mobile |
| D004 | ACCEPTED | Jeden joystick + WASD; ostrzał automatyczny | Sterowanie jednym palcem |
| D005 | ACCEPTED | Pickup broni natychmiast zastępuje broń aktywną | Brak ekwipunku i przełączania |
| D006 | ACCEPTED | 3 typy przeciwników | Zamknięty zakres MVP |
| D007 | ACCEPTED | Proste menu: tytuł i START | Niskie tarcie |
| D008 | ACCEPTED | HUD z twarzą bohatera zależną od HP | Personalizacja i retro klimat |
| D009 | ACCEPTED | Oddzielny chat implementacji i grafik; orkiestratorka | Brak konfliktów odpowiedzialności |
| D010 | PROVISIONAL | 3 bronie, jedna arena, zamknięta sesja | Mała produkcja, łatwa do ukończenia |
| D011 | PROVISIONAL | 3 portrety HP; progi >60 / 30–60 / <30 | Mało assetów, czytelność |
| D012 | PROVISIONAL | Zero backendu, kont i trwałych zapisów | Minimalizacja ryzyka |


| D013 | ACCEPTED | Weapons are horizontal alternatives, not ordered upgrades; picking one up forces a swap even if undesirable | Intentional retro arcade tradeoff inspired by Contra |
| D014 | ACCEPTED | Implementation agents never create/commit binary files; user manually uploads assets to declared paths | Clean repo and explicit asset ownership |

## Otwarte, bez blokowania startu
- O001: nazwa i wygląd trzeciego wroga.
- O002: szczegółowa lista broni i ich tempo.
- O003: liczba fal i czas docelowy po testach.
- O004: końcowy gag i audio mariachi inspirowane stylem (oryginalne, bez kopiowania utworów).
- O005: czy publikować fotograficzną twarz kumpla w publicznym repo/Pages. Do decyzji przed integracją grafiki.
- O006: konkretny lekki stos JS / Canvas / ewentualny Phaser — implementatorka ma przedstawić krótką rekomendację przed PR01.

Nowe decyzje: dopisz kolejny ID, zapisując konsekwencje; nie przepisuj historii.
