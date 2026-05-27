---
project: meal-plan
version: 1
status: draft
created: 2026-05-27
updated: 2026-05-27
prd_version: 1
main_goal: speed
top_blocker: capacity
---

# Roadmap: meal-plan

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Produkt ma skracać cotygodniowe planowanie żywienia rodziny: od decyzji o posiłkach do gotowej listy zakupów. Wartość odróżniająca polega na połączeniu trzech efektów w jednym przebiegu: rotacji dań z własnej bazy, podziału zakupów na świeże i trwałe oraz sugestii nowych przepisów rozwijających umiejętności użytkownika. Roadmapa faworyzuje kolejność, która jak najszybciej dowozi pełny, użyteczny przepływ dla użytkownika.

## North star

**S-02: Użytkownik generuje kompletny plan 7 dni x 3 posiłki oraz listę zakupów podzieloną na świeże i trwałe** — to najwcześniejszy punkt walidacji, bo bezpośrednio realizuje główne kryteria sukcesu produktu.

> North star w tym dokumencie oznacza najmniejszy przepływ end-to-end, który po dostarczeniu potwierdza główną hipotezę produktu, dlatego jest ustawiony najwcześniej, jak pozwalają zależności.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | data-ownership-and-recipe-domain-base | (foundation) Wspólny model danych przepisów i izolacja danych per użytkownik są gotowe do użycia w funkcjach planowania | — | FR-001, FR-002, FR-003, FR-004, Access Control, NFR-02 | ready |
| F-02 | deploy-and-generation-timing-baseline | (foundation) Minimalna ścieżka wdrożenia i pomiar czasu generacji planu są dostępne do weryfikacji NFR | — | NFR-01 | ready |
| S-01 | personal-recipe-base-management | Użytkownik może dodawać i zarządzać własną bazą przepisów z listą składników | F-01 | FR-001 | proposed |
| S-02 | weekly-plan-and-split-shopping-list | Użytkownik może wygenerować pełny plan 7 dni x 3 i listę zakupów świeże/trwałe | F-01, S-01 | US-01, FR-002, FR-003 | proposed |
| S-03 | related-recipe-suggestions | Użytkownik może otrzymać sugestie nowych przepisów na bazie własnej bazy | F-01, S-01 | FR-004 | proposed |

## Streams

Navigation aid - groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Rdzeń planowania tygodnia | `F-01` -> `S-01` -> `S-02` | Najkrótsza ścieżka do dowiezienia wartości głównej przy celu speed. |
| B | Rozszerzanie repertuaru dań | `S-03` | Dołącza do strumienia A po spełnieniu wspólnych zależności `F-01` i `S-01`. |
| C | Gotowość operacyjna | `F-02` | Może być realizowany równolegle, aby szybko domknąć weryfikację NFR-01. |

## Baseline

What's already in place in the codebase as of 2026-05-27 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present - gotowy szkielet aplikacji web i routing.
- **Backend / API:** partial - dostępny szkielet API, brak endpointów logiki domenowej meal-plan.
- **Data:** partial - konfiguracja warstwy danych jest obecna, brak domenowego modelu i migracji pod produkt.
- **Auth:** partial - baza uwierzytelniania i ochrona tras istnieją, wymagają domknięcia pod zasady dostępu produktu.
- **Deploy / infra:** partial - podstawowy szkielet CI i konfiguracja wdrożenia istnieją, brak pełnego automatu deploy/rollback.
- **Observability:** partial - obecna obserwowalność platformowa, brak metryk i logowania na poziomie logiki aplikacyjnej.

## Foundations

### F-01: Model domenowy przepisów i izolacja danych użytkownika

- **Outcome:** (foundation) Spójny model danych przepisów i reguły izolacji per użytkownik są gotowe i stanowią bazę dla funkcji planowania, zakupów i sugestii.
- **Change ID:** data-ownership-and-recipe-domain-base
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, Access Control, NFR-02
- **Unlocks:** S-01, S-02, S-03, ścieżka weryfikacji izolacji danych między użytkownikami
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Bez tego fundamentu kolejne slice'y grożą przebudową modelu i regresją bezpieczeństwa danych.
- **Status:** ready

### F-02: Minimum wdrożeniowe i pomiar czasu generacji

- **Outcome:** (foundation) Dostępna jest minimalna ścieżka wdrożenia oraz pomiar czasu generacji planu potrzebny do oceny NFR wydajności.
- **Change ID:** deploy-and-generation-timing-baseline
- **PRD refs:** NFR-01
- **Unlocks:** S-02, ścieżka weryfikacji czasu generacji planu poniżej 5 sekund
- **Prerequisites:** —
- **Parallel with:** F-01, S-01
- **Blockers:** —
- **Unknowns:**
  - Jaki minimalny próg i sposób raportowania czasu generacji traktujemy jako akceptowalny sygnał do MVP? — Owner: user. Block: no.
- **Risk:** Odkładanie tego kroku grozi późnym wykryciem, że rdzeń produktu nie spełnia wymogu wydajnościowego.
- **Status:** ready

## Slices

### S-01: Zarządzanie bazą własnych przepisów

- **Outcome:** Użytkownik może dodawać i zarządzać własną bazą przepisów z listą składników.
- **Change ID:** personal-recipe-base-management
- **PRD refs:** FR-001
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zbyt ubogie zarządzanie bazą przepisów osłabi jakość wyniku dla kolejnych funkcji planowania i sugestii.
- **Status:** proposed

### S-02: Generowanie planu tygodnia i podział zakupów

- **Outcome:** Użytkownik może wygenerować pełny plan 7 dni x 3 posiłki oraz listę zakupów rozdzieloną na produkty świeże i trwałe.
- **Change ID:** weekly-plan-and-split-shopping-list
- **PRD refs:** US-01, FR-002, FR-003
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Jaki poziom dopuszczalnej powtarzalności dań przy małej bazie przepisów uznajemy w MVP za akceptowalny? — Owner: user. Block: no.
- **Risk:** To krytyczny punkt walidacji; opóźnienie obniża szansę szybkiego potwierdzenia wartości produktu.
- **Status:** proposed

### S-03: Sugestie nowych przepisów

- **Outcome:** Użytkownik może zobaczyć propozycje nowych przepisów powiązanych z jego aktualną bazą.
- **Change ID:** related-recipe-suggestions
- **PRD refs:** FR-004
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Jaką prostą definicję "powiązania" przepisów przyjmujemy na start MVP, aby nie przeciążyć zakresu? — Owner: user. Block: no.
- **Risk:** Nadmierna złożoność logiki sugestii może skonsumować pojemność i spowolnić domknięcie pełnego MVP.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | data-ownership-and-recipe-domain-base | Foundation: model domenowy i izolacja danych użytkownika | yes | Odblokowuje wszystkie slice'y użytkownika. |
| F-02 | deploy-and-generation-timing-baseline | Foundation: minimum wdrożeniowe i pomiar czasu generacji | yes | Może iść równolegle do F-01/S-01. |
| S-01 | personal-recipe-base-management | Slice: użytkownik zarządza własną bazą przepisów | no | Wymaga domknięcia F-01. |
| S-02 | weekly-plan-and-split-shopping-list | Slice: pełny plan 7x3 i lista świeże/trwałe | no | North star; wymaga F-01 i S-01. |
| S-03 | related-recipe-suggestions | Slice: sugestie nowych przepisów na bazie historii użytkownika | no | Wymaga F-01 i S-01; może iść równolegle do S-02. |

## Open Roadmap Questions

1. Brak pytań przekrojowych na poziomie roadmapy na ten moment. — Owner: user. Block: roadmap-wide.

## Parked

- **Osobne plany posiłków dla różnych członków rodziny** — Why parked: PRD Non-Goals, poza zakresem MVP.
- **Import przepisów z plików (PDF, DOCX i podobne)** — Why parked: PRD Non-Goals, MVP zakłada wprowadzanie przez formularz.
- **Zarządzanie wartościami odżywczymi i kalorycznością** — Why parked: PRD Non-Goals, nie jest wymagane do pierwszej walidacji.
- **Aplikacja mobilna** — Why parked: PRD Non-Goals, MVP ograniczone do web.
- **Współpraca wielu użytkowników nad jednym planem** — Why parked: PRD Non-Goals, model jednoosobowego planowania.

## Done

(Empty on first generation. `/10x-archive` appends an entry here - and flips that item's `Status` to `done` - when a change whose `Change ID` matches the item is archived. Do NOT pre-populate. Format:)

- **<Slice ID>: <Outcome>** - Archived <YYYY-MM-DD> -> `context/archive/<YYYY-MM-DD-change-id>/`. Lesson: <pointer to lessons.md if any, or `-`>.
