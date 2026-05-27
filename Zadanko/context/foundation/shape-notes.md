---
project: "10xCards"
context_type: greenfield
created: 2026-05-20
updated: 2026-05-20
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction + decision paralysis + missing capability"
    - topic: "insight"
      decision: "culinary development through recipe suggestions based on user's known recipes"
    - topic: "primary persona scope"
      decision: "parent/caregiver planning meals for a household"
    - topic: "auth strategy"
      decision: "login-based access (email+password / OAuth / passwordless)"
    - topic: "role model"
      decision: "flat user model — no roles"
    - topic: "mvp flow"
      decision: "login -> add recipes -> generate 7-day plan -> split shopping list -> view recipe suggestions"
    - topic: "mvp timeline"
      decision: "3 weeks after-hours is realistic"
    - topic: "socrates FR round"
      decision: "all 4 FRs retained as must-have"
    - topic: "domain rule shape"
      decision: "prioritization + recommendation + calculation"
    - topic: "product framing"
      decision: "web app, small user base, no deadline, after-hours only"
    - topic: "quality cross-check"
      decision: "all required elements present"
  frs_drafted: 4
  quality_check_status: accepted
---

## Seed Idea

### Główny problem
Cotygodniowe przygotowywanie kompletnej listy posiłków dla całej rodziny (śniadanie, obiad, kolacja) jest czasochłonne i wymaga dużo skupienia i kreatywności. Dodatkowo wymaga optymalnego zarządzania składnikami oraz rotowania dań, tak aby nie popaść w powtarzalność oraz zadowolić wszystkich domowników.

### Najmniejszy zestaw funkcjonalności
- Generowanie zestawów śniadanie + obiad + kolacja na 7 dni do przodu
- Bazowanie na przepisach które użytkownik doda do bazy, zna i potrafi przygotować
- Sugestie nowych przepisów na podstawie tych dodanych aby poprawiać umiejętności kulinarne użytkownika
- Przygotowywanie listy zakupów na cały tydzień z podziałem na produkty świeże które trzeba uzupełniać na bieżąco oraz takie, które można kupić raz
- Interface dla użytkownika, który będzie mógł dodawać swoje przepisy i generować listę na cały tydzień

### Co NIE wchodzi w zakres MVP
- Kilka różnych dań w ramach jednego posiłku (np. osobny zestaw śniadaniowy dla rodziców a osobny dla dzieci)
- Import wielu formatów przepisów z dysku (PDF, DOCX, itp.)
- Zarządzanie wartościami odżywczymi i kalorycznymi
- Aplikacje mobilne (na początek tylko web)

### Kryteria sukcesu
- Kompletna lista posiłków śniadanie + obiad + kolacja na 7 dni
- Lista zakupów na duże zakupy dla produktów które mogą leżeć i małe listy zakupów do uzupełniania produktów świeżych

## Vision & Problem Statement

Rodzic lub opiekun odpowiedzialny za żywienie rodziny co tydzień staje przed koniecznością ułożenia kompletnego jadłospisu (śniadanie, obiad, kolacja) na 7 dni, skoordynowania zakupów i uniknięcia powtarzalności dań — przy jednoczesnym uwzględnieniu preferencji domowników. To proces czasochłonny, kreatywnie wyczerpujący i podatny na „blokadę decyzyjną".

Kluczowy insight: istniejące planery posiłków nie łączą trzech rzeczy naraz — rotacji dań opartej na znanych przepisach użytkownika, automatycznego podziału zakupów na świeże i trwałe oraz sugestii nowych przepisów budujących umiejętności kulinarne na bazie tego, co użytkownik już potrafi.

Skala x100: reguła domenowa pozostaje taka sama; rosną głównie koszty wydajności i operacji.

## User & Persona

Primary persona: rodzic/opiekun odpowiedzialny za planowanie posiłków dla gospodarstwa domowego.

Moment użycia: cotygodniowe planowanie jadłospisu i zakupów — zazwyczaj w weekend przed następnym tygodniem.

Koszt dziś: duży nakład czasu i energii decyzyjnej, ryzyko powtarzalności, brak narzędzia spinającego plan posiłków z podzieloną listą zakupów.

## Access Control

Model dostępu: logowanie użytkownika (email+hasło / OAuth / passwordless).

Płaski model ról: każdy zalogowany użytkownik zarządza własną bazą przepisów, planem tygodnia i listami zakupów. Brak podziału na role typu admin/member/guest w MVP.

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

## Business Logic

Aplikacja układa 7-dniowy plan 3 posiłków rotując znane przepisy i minimalizując powtarzalność, dzieli zakupy na świeże i trwałe, oraz sugeruje nowe przepisy rozwijające umiejętności kulinarne użytkownika.

Reguła opiera się na przepisach dodanych przez użytkownika. Wejście: baza osobistych przepisów z listą składników. Wyjście: tygodniowy harmonogram posiłków z minimalną powtarzalnością, zagregowana lista zakupów z podziałem na produkty świeże i trwałe, oraz propozycje nowych przepisów pokrewnych do tych, które użytkownik już zna.

Użytkownik spotyka wynik reguły po kliknięciu „Generuj plan” — otrzymuje gotowy jadłospis i listę zakupów, a w sekcji sugestii widzi propozycje nowych dań rozszerzających jego repertuar.

## Non-Functional Requirements

- Generowanie planu tygodniowego jest dostępne dla użytkownika w czasie poniżej 5 sekund dla typowej bazy przepisów.
- Użytkownik ma dostęp wyłącznie do własnych przepisów, planów i list zakupów; dane innych użytkowników nie są widoczne ani dostępne.

## Non-Goals

- Brak osobnych planów posiłków dla różnych członków rodziny w ramach jednego slotu posiłku — wszyscy jedzą to samo.
- Brak importu przepisów z plików (PDF, DOCX itp.) — przepisy dodawane wyłącznie przez formularz.
- Brak zarządzania wartościami odżywczymi i kalorycznością.
- Brak aplikacji mobilnej w MVP — zakres to wyłącznie web.
- Brak współpracy wielu użytkowników nad jednym planem — każdy użytkownik planuje osobno.
