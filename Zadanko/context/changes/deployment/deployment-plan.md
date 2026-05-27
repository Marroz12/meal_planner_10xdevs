## Plan: Wdrożenie MVP na Cloudflare

Plan wdrożenia opiera się na decyzji z infrastructure.md i trybie Hybrid: pierwszy deploy przez CLI, potem domknięcie automatyzacji CI. Ponieważ wybór środowisk to tylko Production, plan dodaje kompensacyjne bramki jakości i kroki rollback, żeby ograniczyć ryzyko wdrożeń bez Preview.

**Instrukcja wstępna: konfiguracja CLI i Supabase (konta już istnieją)**
1. [ ] **Cloudflare CLI (Wrangler):** w katalogu projektu uruchom `npx wrangler whoami` i potwierdź, że widzisz właściwe konto.
2. [ ] **Tryb awaryjny na Windows:** jeśli PowerShell blokuje `npm`/`npx` (`*.ps1`), używaj `npm.cmd` oraz `npx.cmd`.
3. [ ] **Supabase projekt:** w panelu Supabase wejdź w Settings -> API i skopiuj `Project URL` oraz `anon public key`.
4. [ ] **Lokalny development:** wpisz sekrety do `.bootstrap-scaffold/.env` i `.bootstrap-scaffold/.dev.vars` jako `SUPABASE_URL` i `SUPABASE_KEY`.
5. [ ] **Production runtime (Cloudflare):** ustaw sekrety komendami:
	- `npx wrangler secret put SUPABASE_URL`
	- `npx wrangler secret put SUPABASE_KEY`
6. [ ] **CI (GitHub Actions):** dodaj te same wartości jako repo secrets: `SUPABASE_URL` i `SUPABASE_KEY`.

**Gdzie udostępnić klucze API?**
- [ ] Udostępniaj klucze wyłącznie w managerach sekretów (Cloudflare Secrets, GitHub Secrets, lokalnie `.env`/`.dev.vars`).
- [ ] Nie wklejaj kluczy do plików śledzonych przez git, opisów tasków, PR, issue ani do chatu.
- [ ] Jeśli musisz przekazać klucz członkowi zespołu, użyj secure channel (np. manager haseł), nie wiadomości tekstowej.
- [ ] `SUPABASE_KEY` w tym projekcie to `anon` key (publiczny), ale nadal traktuj go jako konfigurację środowiska i nie hardkoduj.

## Status wykonania Fazy 1 (2026-05-26)

- [x] Uprawnienia Cloudflare i poprawność konta operatorskiego potwierdzone przez `npx.cmd wrangler whoami`.
- [x] Sekrety produkcyjne `SUPABASE_URL` i `SUPABASE_KEY`:
	- lokalnie potwierdzone w `.env` oraz `.dev.vars` (obie zmienne ustawione),
	- w runtime Cloudflare potwierdzone przez `wrangler secret list` (oba sekrety obecne).
- [x] Zgodność runtime i adaptera Cloudflare potwierdzona:
	- `wrangler.jsonc` zawiera `main: @astrojs/cloudflare/entrypoints/server`, `compatibility_date`, `nodejs_compat` oraz `assets` binding,
	- `astro.config.mjs` używa `adapter: cloudflare()` i definiuje `SUPABASE_URL`/`SUPABASE_KEY` jako sekrety serwerowe.
- [x] Plan odpowiedzialności: approval owner = `marek`, rollback owner = `marek`.

### Decyzja operacyjna po Fazie 1

- Faza 1 jest wykonana.
- Aktualny blocker dla Fazy 3: konto Cloudflare wymaga dokończenia onboarding `workers.dev` albo skonfigurowania route w `wrangler.jsonc`; bez tego `wrangler deploy` nie publikuje wersji produkcyjnej.

### Deploy produkcyjny (2026-05-26)

- Po aktywacji `workers.dev` deploy został wykonany poprawnie.
- Publiczny URL production: `https://10x-astro-starter.marek-rozwadowski-atos.workers.dev`.
- Aktywna wersja deploymentu: `ff3b3eb3-0da3-4fc1-a676-9c5a6c9c801f`.
- Smoke test GET endpointów (production):
	- `/` dostępne, strona główna renderuje poprawnie,
	- `/auth/signin` dostępne,
	- `/dashboard` dla niezalogowanego użytkownika kieruje do ekranu logowania,
	- losowa ścieżka zwraca `404`.
- Sekrety runtime i bindings potwierdzone w wersji deploymentu (`SUPABASE_URL`, `SUPABASE_KEY`, `ASSETS`, `SESSION`, `IMAGES`).
- Otwarte po deployu:
	- quality gate lint ma błędy formatowania CRLF (`prettier/prettier: Delete ␍`),
	- pełny E2E auth (sign up + sign in + sign out na realnym użytkowniku) do domknięcia manualnie po stronie operacyjnej.

### Release note (pierwszy deploy)

- Data/czas (UTC): `2026-05-26T14:31:55.963Z`.
- Operator: `marek`.
- Commit: `cc0bfebcdfb193b2bb2ec6a6604d29883f84a7e4`.
- Deployment version: `ff3b3eb3-0da3-4fc1-a676-9c5a6c9c801f`.
- URL: `https://10x-astro-starter.marek-rozwadowski-atos.workers.dev`.

### Ownerzy operacyjni (uzupełnione)

- Approval owner (akceptacja deployu Production): marek
- Rollback owner (decyzja i wykonanie rollbacku kodu): marek
- Backup rollback owner (zastępstwo): marek
- Kanał incydentowy (np. Slack/Teams): do potwierdzenia

**Steps**
1. [x] Faza 1: Access i gotowość integracji (blokuje wszystkie kolejne)
2. [x] Zweryfikuj uprawnienia do Cloudflare i poprawność konta operatorskiego.
3. [x] Zweryfikuj obecność oraz poprawność sekretów SUPABASE_URL i SUPABASE_KEY dla runtime produkcyjnego.
4. [x] Potwierdź zgodność runtime i adaptera Cloudflare z konfiguracją aplikacji.
5. [x] Potwierdź plan odpowiedzialności: kto akceptuje deploy do produkcji i kto wykonuje rollback.
6. [~] Faza 2: Integracja aplikacja ↔ platforma (depends on 1)
7. [~] Sprawdź ścieżkę auth end-to-end: sign up, sign in, sign out oraz przekierowania middleware dla chronionych tras.
8. [x] Zweryfikuj zachowanie aplikacji przy braku sekretów (czytelny failure mode i brak cichej degradacji).
9. [x] Potwierdź zgodność bibliotek z Workers runtime i usuń pakiety zależne od niedostępnych Node API.
10. [x] Ustal wersję compatibility_date jako kontrolowany punkt zmian i policy aktualizacji (nie ad-hoc).
11. [~] Faza 3: Pierwszy deploy Production przez CLI (depends on 2)
12. [~] Wykonaj build i lint lokalnie, następnie deploy przez Wrangler.
13. [x] Wykonaj smoke test produkcyjny na krytycznych ścieżkach: strona główna, auth, trasa chroniona, obsługa błędu 404.
14. [ ] Włącz i przejrzyj logi runtime po pierwszym ruchu użytkownika.
15. [x] Zapisz release note: commit, czas wdrożenia, operator, wynik smoke testu.
16. [ ] Faza 4: Hardening po pierwszym deployu (parallel with 5 after 3)
17. [ ] Dodaj bramkę ręcznego approval przed publikacją do produkcji (przy Only Production to krytyczne).
18. [ ] Ustal checklistę pre-deploy i post-deploy jako obowiązkowy artefakt dla każdego release.
19. [ ] Dodaj minimalny monitoring operacyjny: alert na wzrost błędów auth i wzrost latencji endpointów SSR.
20. [ ] Faza 5: Integracja CI i operacyjna ciągłość (depends on 3, parallel with 4)
21. [ ] Przejście Hybrid: odtwórz kroki CLI w pipeline CI jako źródło prawdy dla kolejnych wdrożeń.
22. [ ] Ustal politykę sekretów: miejsce przechowywania, rotacja, oraz test po rotacji.
23. [ ] Ustal procedurę rollback: rollback kodu + osobna ścieżka dla zmian danych.
24. [ ] Zdefiniuj rytm testów zgodności runtime po aktualizacji zależności.
25. [ ] Faza 6: Edge cases i kroki awaryjne (depends on 3)
26. [ ] Edge case: SUPABASE_URL/SUPABASE_KEY nieustawione lub błędne
27. [ ] Krok dodatkowy: blokada deployu bez walidacji sekretów oraz test logowania po wdrożeniu.
28. [ ] Edge case: różnice Workers vs Node runtime
29. [ ] Krok dodatkowy: test krytycznych endpointów w runtime produkcyjnym, nie tylko lokalnie.
30. [ ] Edge case: wdrożenie bez Preview environment
31. [ ] Krok dodatkowy: ręczny approval + pełny smoke test + szybki rollback owner wyznaczony przed deployem.
32. [ ] Edge case: rollback po zmianie danych
33. [ ] Krok dodatkowy: osobny plan migracji i cofania danych; rollback aplikacji nie zamyka incydentu bez walidacji danych.
34. [ ] Edge case: awaria lokalnych komend na Windows (ExecutionPolicy)
35. [ ] Krok dodatkowy: ścieżka awaryjna przez npm.cmd/npx.cmd i instrukcja operatorska dla zespołu.

**Relevant files**
- [Zadanko/context/foundation/infrastructure.md](Zadanko/context/foundation/infrastructure.md) — źródło decyzji platformowej, ryzyka i operational story
- [Zadanko/context/foundation/tech-stack.md](Zadanko/context/foundation/tech-stack.md) — kontrakt stacku i ograniczenia runtime
- [Zadanko/.bootstrap-scaffold/wrangler.jsonc](Zadanko/.bootstrap-scaffold/wrangler.jsonc) — konfiguracja Workers, compatibility flags, assets i observability
- [Zadanko/.bootstrap-scaffold/astro.config.mjs](Zadanko/.bootstrap-scaffold/astro.config.mjs) — adapter Cloudflare i schemat sekretów runtime
- [Zadanko/.bootstrap-scaffold/.github/workflows/ci.yml](Zadanko/.bootstrap-scaffold/.github/workflows/ci.yml) — baza pod przejście na deploy CI
- [Zadanko/.bootstrap-scaffold/src/lib/supabase.ts](Zadanko/.bootstrap-scaffold/src/lib/supabase.ts) — punkt integracji sekrety → klient SSR
- [Zadanko/.bootstrap-scaffold/src/middleware.ts](Zadanko/.bootstrap-scaffold/src/middleware.ts) — kontrola dostępu i zachowanie tras chronionych
- [Zadanko/.bootstrap-scaffold/src/pages/api/auth/signin.ts](Zadanko/.bootstrap-scaffold/src/pages/api/auth/signin.ts) — ścieżka logowania i failure mode
- [Zadanko/.bootstrap-scaffold/src/pages/api/auth/signup.ts](Zadanko/.bootstrap-scaffold/src/pages/api/auth/signup.ts) — ścieżka rejestracji i failure mode
- [Zadanko/.bootstrap-scaffold/src/pages/api/auth/signout.ts](Zadanko/.bootstrap-scaffold/src/pages/api/auth/signout.ts) — ścieżka wylogowania

**Verification**
1. [~] Verify build/lint przed deployem: build OK, lint zgłasza błędy formatowania CRLF.
2. [~] Verify auth integration po deployu: dashboard gate i signin page OK; pełny signup/signin/signout E2E pozostaje do domknięcia.
3. [ ] Verify observability: logi runtime i logi pipeline czytelne, zidentyfikowany owner monitoringu.
4. [ ] Verify rollback drill: testowy rollback kodu i potwierdzenie checklisty danych.
5. [ ] Verify security: sekrety nie są obecne w repo, tylko w managerach sekretów.
6. [ ] Verify operability: zespół zna procedurę Windows fallback dla npm/npx.

**Decisions**
- Wybrana platforma: Cloudflare Workers + Pages.
- Tryb wdrożenia: Hybrid (pierwszy deploy CLI, potem CI jako standard).
- Środowiska MVP: tylko Production.
- Domena własna: nie na pierwszym wdrożeniu.
- Zakres planu obejmuje integrację aplikacja-platforma i operacyjny runbook MVP; nie obejmuje projektowania architektury HA.

**Further Considerations**
1. Rekomendacja: po pierwszym stabilnym release dodać Preview environment jako redukcję ryzyka regresji bez spowalniania developmentu.
2. Rekomendacja: dodać minimalny SLO dla auth flow i strony głównej, by szybciej wykrywać degradację po deployu.
3. Rekomendacja: utrzymywać miesięczny przegląd kosztów Workers oraz limitów, zgodnie z ryzykiem z rejestru.
