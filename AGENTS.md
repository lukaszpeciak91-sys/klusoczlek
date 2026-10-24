# AGENTS — KŁUSOCZŁEK

## Single source of truth
Przed pracą przeczytaj README.md, docs/GAME_DESIGN.md, docs/DECISIONS.md, docs/WORKFLOW.md i docs/PROGRESS.md. Traktuj te pliki jako źródło prawdy, a nie historię czatu. Jeśli występuje konflikt, zatrzymaj rozszerzanie zakresu i zgłoś problem orkiestratorce.

## Role
1. **Orkiestratorka (chat główny):** planowanie, decyzje, priorytety, audyt PR; zatwierdza zmiany zakresu.
2. **Implementatorka (osobny chat):** kod, testy, GitHub Pages; tworzy małe PR-y i nie scala ich bez zgody użytkownika.
3. **Art Director (osobny chat):** spójność wyglądu, portrety, przeciwnicy, pickupy, kontrakt eksportu; dostarcza zasoby bez przepisywania logiki.

## Reguły bez wyjątków
- MVP first; minimalna liczba systemów i zależności.
- Jeden PR = jeden spójny etap, nie jeden obiekt.
- Przed zmianą: sprawdź najnowszy main i istniejące zasoby.
- Nie zakładaj automatycznie, że PR jest scalony, Pages aktywne lub testy przeszły.
- Nie merguj, nie publikuj i nie dodawaj zależności bez wyraźnej autoryzacji.
- Nie edytuj plików innych ról równolegle; assety są przekazywane przez kontrakt docs/ASSETS.md.
- Przy błędzie: odtwórz → znajdź przyczynę → minimalna poprawka → test regresji.
- Unikaj wielkiej architektury, rozbudowanych abstrakcji i niepotrzebnych frameworków.
- Każdy PR: cel, zakres, lista plików, testy, ryzyko, screenshot/wideo jeśli UI, wpływ na GitHub Pages.
- Aktualizuj docs/PROGRESS.md w PR-ach implementacyjnych; docs/DECISIONS.md tylko przy nowej zaakceptowanej decyzji.
- Nie publikuj realnych zdjęć, twarzy ani prywatnych danych bez zatwierdzenia użytkownika. Repo jest publiczne.

## Komendy dla agenta
**START TASK:** sprawdź main, przeczytaj dokumenty, wypisz krótki plan i pliki.
**FINISH TASK:** raport: co zrobiono, jak przetestowano, ograniczenia, PR, następny logiczny krok.
**AUDIT:** read-only; sprawdź diff, ryzyko regresji, zgodność z MVP; decyzja PASS / FIX / BLOCK.

## Binary asset policy — mandatory
- Implementing agents MUST NOT create, generate, modify, commit or upload binary asset files (PNG/JPG/WebP/GIF/audio/fonts/archives etc.) to GitHub, PRs or repository branches.
- They may create textual code, configuration, asset manifests, paths, and placeholder drawing rendered from code (Canvas/CSS/SVG source text), but not output binary files.
- For missing assets, declare expected repository-relative paths and specifications; the USER uploads actual binaries manually. Missing assets must not break startup or tests: use code-drawn fallback until the user uploads them.
- Art Director may prepare visual concepts in its own chat for review, but never push binary assets to GitHub. Asset delivery and manual upload remain with the user.
