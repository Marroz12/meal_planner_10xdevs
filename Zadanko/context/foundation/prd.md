---
project: "meal-plan"
version: 1
status: draft
created: 2026-05-20
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Rodzic lub opiekun odpowiedzialny za żywienie rodziny co tydzień staje przed koniecznością ułożenia kompletnego jadłospisu (śniadanie, obiad, kolacja) na 7 dni, skoordynowania zakupów i uniknięcia powtarzalności dań — przy jednoczesnym uwzględnieniu preferencji domowników. To proces czasochłonny, kreatywnie wyczerpujący i podatny na „blokadę decyzyjną".

Istniejące planery posiłków nie łączą trzech rzeczy naraz — rotacji dań opartej na znanych przepisach użytkownika, automatycznego podziału zakupów na świeże i trwałe oraz sugestii nowych przepisów budujących umiejętności kulinarne na bazie tego, co użytkownik już potrafi.

## User & Persona

Primary persona: rodzic/opiekun odpowiedzialny za planowanie posiłków dla gospodarstwa domowego.

Moment użycia: cotygodniowe planowanie jadłospisu i zakupów — zazwyczaj w weekend przed następnym tygodniem.

Koszt dziś: duży nakład czasu i energii decyzyjnej, ryzyko powtarzalności, brak narzędzia spinającego plan posiłków z podzieloną listą zakupów.

## Success Criteria

### Primary
- Użytkownik jest w stanie wygenerować kompletny plan posiłków (śniadanie + obiad + kolacja) na 7 dni na podstawie własnej bazy przepisów.
- Użytkownik otrzymuje tygodniową listę zakupów rozdzieloną na produkty świeże i trwałe.

### Secondary
- Sugestie nowych przepisów pomagają użytkownikowi rozwinąć warsztat kulinarny.

### Guardrails
- Plan musi być kompletny: 7 dni × 3 posiłki.
- Lista zakupów nie może mieszać produktów świeżych i trwałych — zawsze rozdzielona na dwie sekcje.

## User Stories

### US-01: Generowanie tygodniowego planu i listy zakupów

- **Given** zalogowany użytkownik ma co najmniej jeden zapisany przepis
- **When** uruchamia generowanie planu tygodniowego
- **Then** otrzymuje kompletny plan 7 dni × 3 posiłki oraz listę zakupów z podziałem na produkty świeże i trwałe

#### Acceptance Criteria
- Wynik zawiera wszystkie 21 pozycji posiłków dla 7 dni
- Każda pozycja planu odnosi się do przepisu z bazy użytkownika
- Lista zakupów jest rozdzielona na sekcję produktów świeżych i trwałych

## Functional Requirements

- FR-001: User can add and manage a personal recipe base. Priority: must-have
  > Socrates: Counter-argument considered: "manual recipe entry may be too
  > time-consuming for onboarding — user gives up before reaching plan generation."
  > Resolution: kept; personal recipe base is required for personalization baseline.
- FR-002: User can generate a 7-day meal plan with breakfast, lunch, and dinner. Priority: must-have
  > Socrates: Counter-argument considered: "7 full days may reduce output quality
  > when recipe base is still small." Resolution: kept; this is core value and
  > naturally improves as user adds more recipes.
- FR-003: User can generate a weekly shopping list split into fresh and durable products. Priority: must-have
  > Socrates: Counter-argument considered: "a single unsplit shopping list would
  > suffice for MVP; the split is nice-to-have." Resolution: kept; fresh-vs-durable
  > split is a defining value proposition per the original idea notes.
- FR-004: User can view suggestions for new recipes based on the current recipe base. Priority: must-have
  > Socrates: Counter-argument considered: "this is the most expensive piece of logic
  > and may delay delivery of the core flow (plan + shopping list)." Resolution: kept
  > as must-have; user explicitly identified this as a key product differentiator.

## Non-Functional Requirements

- Generowanie planu tygodniowego jest dostępne dla użytkownika w czasie poniżej 5 sekund dla typowej bazy przepisów.
- Użytkownik ma dostęp wyłącznie do własnych przepisów, planów i list zakupów; dane innych użytkowników nie są widoczne ani dostępne.

## Business Logic

Aplikacja układa 7-dniowy plan 3 posiłków rotując znane przepisy i minimalizując powtarzalność, dzieli zakupy na świeże i trwałe, oraz sugeruje nowe przepisy rozwijające umiejętności kulinarne użytkownika.

Reguła opiera się na przepisach dodanych przez użytkownika. Wejście: baza osobistych przepisów z listą składników. Wyjście: tygodniowy harmonogram posiłków z minimalną powtarzalnością, zagregowana lista zakupów z podziałem na produkty świeże i trwałe, oraz propozycje nowych przepisów pokrewnych do tych, które użytkownik już zna.

Użytkownik spotyka wynik reguły po kliknięciu „Generuj plan" — otrzymuje gotowy jadłospis i listę zakupów, a w sekcji sugestii widzi propozycje nowych dań rozszerzających jego repertuar.

## Access Control

Model dostępu: logowanie użytkownika (email+hasło / OAuth / passwordless).

Płaski model ról: każdy zalogowany użytkownik zarządza własną bazą przepisów, planem tygodnia i listami zakupów. Brak podziału na role typu admin/member/guest w MVP.

## Non-Goals

- Brak osobnych planów posiłków dla różnych członków rodziny w ramach jednego slotu posiłku — wszyscy jedzą to samo.
- Brak importu przepisów z plików (PDF, DOCX itp.) — przepisy dodawane wyłącznie przez formularz.
- Brak zarządzania wartościami odżywczymi i kalorycznością.
- Brak aplikacji mobilnej w MVP — zakres to wyłącznie web.
- Brak współpracy wielu użytkowników nad jednym planem — każdy użytkownik planuje osobno.

## Open Questions

Brak otwartych pytań na tym etapie — wszystkie elementy zostały wypełnione podczas sesji /10x-shape.
