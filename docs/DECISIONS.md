# DECISIONS — log decyzji

Status: ACCEPTED / PROVISIONAL / OPEN / SUPERSEDED. Daty ISO.

| ID | Status | Decyzja | Powód |
|---|---|---|---|
| D001 | ACCEPTED | Tytuł KŁUSOCZŁEK; repo klusoczlek | Nazwa świata i prezentu |
| D002 | ACCEPTED | Statyczna gra na GitHub Pages | Jeden link bez instalacji |
| D003 | ACCEPTED | Widok 2D z góry zamiast raycastingu | Szybkość realizacji i mobile |
| D004 | SUPERSEDED | Jeden joystick + WASD; ostrzał automatyczny | Sterowanie jednym palcem |
| D005 | ACCEPTED | Pickup broni natychmiast zastępuje broń aktywną | Brak ekwipunku i przełączania |
| D006 | ACCEPTED | 3 typy przeciwników | Zamknięty zakres MVP |
| D007 | SUPERSEDED | Proste menu: tytuł i START | Niskie tarcie |
| D008 | ACCEPTED | HUD z twarzą bohatera zależną od HP | Personalizacja i retro klimat |
| D009 | ACCEPTED | Oddzielny chat implementacji i grafik; orkiestratorka | Brak konfliktów odpowiedzialności |
| D010 | PROVISIONAL | 3 bronie, jedna arena, zamknięta sesja | Mała produkcja, łatwa do ukończenia |
| D011 | PROVISIONAL | 3 portrety HP; progi >60 / 30–60 / <30 | Mało assetów, czytelność |
| D012 | PROVISIONAL | Zero backendu, kont i trwałych zapisów | Minimalizacja ryzyka |


| D013 | ACCEPTED | Weapons are horizontal alternatives, not ordered upgrades; picking one up forces a swap even if undesirable | Celowa konsekwencja podniesienia innej broni |
| D014 | ACCEPTED | Implementation agents never create/commit binary files; user manually uploads assets to declared paths | Clean repo and explicit asset ownership |

| D015 | ACCEPTED | Klasyczne, oddzielone przerwami fale; kolejna fala dopiero po pokonaniu poprzedniej | Czytelny postęp i satysfakcja z etapów |

| D016 | PROVISIONAL | Lekka fabuła opowiadana tekstem na starcie, między falami i w finale, bez cutscenek/systemu dialogów | Klimat bez rozbudowy kodu |
| D017 | PROVISIONAL | Piwo jako podnoszony pickup przywracający HP zamiast automatycznego leczenia między falami | Prosty wybór gracza; wartości i spawny do ustalenia |

| D018 | ACCEPTED | Finałowa kwestia Aloesa: „Żegnajcie... Przyjaciele...” | Celowo absurdalna, niewyjaśniona puenta |
| D019 | ACCEPTED | Trzy czaty: orkiestracja i audyt, implementacja, grafika; osobny audyt tylko w razie potrzeby | Minimalne koszty koordynacji |
| D020 | ACCEPTED | Przed mechaniką fal tworzymy mały fundament: ekran, ruch, kontrakt assetów/spritesheetów, placeholdery, panele dialogowe/HUD | Równoległe prace bez marnowania grafik |

| D021 | ACCEPTED | Gra landscape-only, z ekranem obrotu w pionie; fullscreen opcjonalny, dostępny z ikony w prawym dolnym rogu menu | Spójne sterowanie mobilne i zgodność z ograniczeniami przeglądarek |


| D022 | SUPERSEDED | Dynamiczna szerokość logicznego viewportu przy stałej wysokości 540; więcej widocznego świata na szerszych ekranach zamiast rozciągania sceny | Bez deformacji proporcji oraz ograniczeń do 16:9 |
| D023 | SUPERSEDED | MENU otwiera pauzę sceny Arena; WZNÓW przywraca tę samą sesję; MENU GŁÓWNE ją kończy | Zatrzymanie update/Phaser scene timers i bezpieczne przejścia |

| D024 | ACCEPTED | Phaser Scale.RESIZE is the sole canvas sizing mechanism inside the safe-area parent; no independent logical resize plus FIT or CSS max dimensions | Correct aspect ratio and full mobile screen use |

D022 pozostaje w historii; jego sztywna wysokość 540 została zastąpiona przez D024 (Phaser RESIZE — logiczne jednostki odpowiadają aktualnemu bezpiecznemu obszarowi CSS).
\n| D025 | SUPERSEDED | MENU in Arena pauses its existing session and opens Main Menu; WZNÓW resumes that Arena; START appears only when no session exists | One navigation surface, no intermediate PauseScene or duplicate transition ownership |

| D026 | ACCEPTED | Main Menu always offers NOWA GRA, adds WZNÓW for a paused Arena; fullscreen HTML toggles enter/exit only in Main Menu | Explicit new versus existing session and reversible fullscreen |

| D027 | ACCEPTED | Mobile twin-stick: left movement, right independent manual aim + held fire; desktop WASD/arrows, mouse aim and held left-click fire; no auto-fire/auto-target | Explicit approved combat control supersedes D004 |
| D028 | ACCEPTED | Eight-direction whole-body sprite facing; projectile heading remains continuous 360°; no facing change when stationary | Small original sheet contract without body layering |
| D029 | ACCEPTED | Sheet/player/muzzle specification, manual binary upload, missing-asset code placeholders and physics/camera independence per ASSETS.md | Art and implementation can proceed in parallel |

### D030 — ACCEPTED (PR16)
Eight single-pose directional frames per character (player 512×64, enemies 384×48), with optional visual-only sway/bob, supersede the historical 96-frame character sheet specification. Rationale: smaller original art production while physics and camera remain independent.

D029 remains ACCEPTED for path/manual upload/physics separation, but its historical 96-frame sheet specification is SUPERSEDED by D030. D028 remains ACCEPTED for facing order and 360-degree shots.

D004 is SUPERSEDED by D027; D007 is SUPERSEDED by D026. D025 remains SUPERSEDED. Historical entries retained unaltered.

D022 remains superseded by D024 (Phaser RESIZE instead of fixed logical height). D004 superseded by D027; D007 superseded by D026; D025 remains superseded. Historical decision descriptions and reasons retained.

## Otwarte, bez blokowania startu
- O001: nazwa i wygląd trzeciego wroga.
- O002: szczegółowa lista broni i ich tempo.
- O003: liczba fal i czas docelowy po testach.
- O004: szczegóły finałowego żartu i oryginalnej muzyki.
- O005: czy publikować fotograficzną twarz kumpla w publicznym repo/Pages. Do decyzji przed integracją grafiki.
- O006: konkretny lekki stos JS / Canvas / ewentualny Phaser — implementatorka ma przedstawić krótką rekomendację przed PR01.

Nowe decyzje: dopisz kolejny ID, zapisując konsekwencje; nie przepisuj historii.

