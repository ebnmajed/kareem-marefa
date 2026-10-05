# Wave 27 — the untouched-suite ledger, PR C

One line per changed assertion or fixture in a file that existed before the wave. `designer`'s lines are as it handed them
over in writing; the lead's are marked.

## ★ `SCR-083`, deleted — what it did and where each behaviour went (`DEC-254` §3.5, `DEC-208`'s discipline)

The platform library screen, built in M8 and rebuilt on the console frame in wave 26 PR C. **Deleted, not rebuilt.**

| Behaviour of `SCR-083` | Where it lives now | Why |
|---|---|---|
| List the platform's templates as rows of a composition, certificates in both orientations (`REQ-DSG-026`) | **Each org's own library, `SCR-055`** — the same eleven compositions, seeded per org (`0205` – `0207`) | `REQ-DSG-035`: one library level |
| Badge a row «أساسي» (baseline) | nowhere — a seeded template is the org's own and editable; nothing is «baseline» to an org | `REQ-DSG-035` |
| Retire / un-retire a platform template, refused below the floor | **an org retires its own on `SCR-055`**, refused for its last live one of four families (`design_templates_keep_one_live`, `0206`) | the floor moved from the platform to each org |
| Set a platform default per purpose and family | **an org sets its own default on `SCR-055`** | `REQ-CRT-015` unchanged |
| Promote an org's published version into the platform library (`promote_template_to_platform()`) | **nowhere — withdrawn** | `DEC-254`: there is no library to promote into; no function crosses orgs |
| The «promotable versions» table, per org | nowhere — withdrawn with promotion | as above |
| No document and no preview on the page (the no-data-plane rule, `REQ-ADM-002`) | still true of the platform console: **it now reads no template at all** | stricter than before |
| The rail's «مكتبة القوالب» item | removed — four items | — |

The five SQL functions behind it (`platform_template_library`, `platform_promotable_versions`, `promote_template_to_platform`,
`retire_platform_template`, `set_platform_template_default`) and `tests/rls/platform-library.test.ts` stand until PR D's removal
migration drops them: with the screen gone nothing calls them, and they remain refused to everyone but a platform admin.

## The lines

| # | File | What changed | Selector or expectation | Why |
|---|---|---|---|---|
| L1 (lead) | `tests/components/platform/platform-nav.test.tsx` | the rail's items: five → four, «مكتبة القوالب» gone | **expectation** | `SCR-083` withdrawn |
| L2 (lead) | `tests/components/platform/library-table.test.tsx` | **deleted** with the component it tested | — | as L1 |
| L3 (lead) | `tests/e2e/platform-console.spec.ts` | the `SCR-083` roster case deleted; `/ar/app/platform/templates` leaves the a11y path list and two capture walks (`wave8-platform-templates-baseline`, `templates-default`) | **expectation** (a route that no longer exists) | as L1 |
| L4 (lead) | `tests/e2e/wave11-lead-a11y-sweep.spec.ts` | `/ar/app/platform/templates` leaves the platform admin's route list | selector | as L1 |
| L5 (lead) | `tests/unit/platform-messages.test.ts` | `platform.templates.version` leaves the bidi list with its string | selector | the string is deleted |
| L6 (lead) | `scripts/ui-reach.mjs` | the route's row removed | selector | as L1 |
| C-1 | `tests/unit/designer-library.test.ts:506-520` | the seed-file list gains the org seed as its newest file; the deep-equal is unchanged | selector | the generator now emits a function |
| C-5 | `tests/rls/certificates-designs.test.ts` | `platform()` → `seeded(tx, orgId, family, orientation)` at 13 call sites; `family_matches_kind` uses the org's poster; `no_design_is_default_light` no longer retires every org certificate template — it expects the org's seeded attendance landscape, light | selector ×2, **expectation** ×1 | issuance resolves the org's own; retiring the last is refused (`0206`) |
| C-7 | `tests/unit/certificates-effective.test.ts` | the platform candidates and the two platform cases removed; the order asserted is default, then version, then id | **expectation** | no platform candidate exists |
| C-8 | `tests/components/templates/template-menu.test.tsx` | «a platform card offers only انسخ لتعدّل» → the module exports the org menu alone, and copying one's own calls `duplicate()`; the mock renamed; a new case for the last-template refusal's toast | **expectation** | one library level |
| C-9 | `tests/e2e/wave23-console-screens.spec.ts` | «قوالب المنصة» and «انسخ لتعدّل» asserted absent; the strip names the org's seeded defaults; «a platform template is read-only until copied» → «an admin copies one of the org's own templates» | **expectation** | as C-8 |
| C-10 | `tests/e2e/wave8-designer-templates.spec.ts:226-262` | starts from the org's seeded «جلسة»; «افتح في المصمّم» absent-check removed; the menu item and submit are «انسخ»; the toast is «نُسخ القالب.»; `duplicated_from` is the seeded row | selector ×4, **expectation** ×3 | as C-8 |
| C-11 | `tests/e2e/wave8-designer-templates.spec.ts:378-383` | the 390 copy dialog opens from the org card with «انسخ» | selector | as C-8 |
| C-12 | `tests/e2e/wave8-designer-templates.spec.ts:394-401` | «an org with no templates of its own is told what to do next» → «a fresh org holds its own library from the start — five posters, one list»; capture renamed `posters-empty-org` → `posters-fresh-org` | **expectation** | every org is seeded at insert; the empty state is unreachable through the product |
| C-13 | `tests/e2e/wave8-designer-certificates.spec.ts:249-253` | `templateId(name)` selects by the spec's org instead of `scope = 'platform'` | selector | as C-8 |
| C-14 … C-17 | `tests/rls/{designer-schema,designer-render,designer-baseline-supersede,templates-roster}.test.ts` | each shared setup disables `design_templates_keep_one_live` for its own rolled-back transaction before it wipes both orgs' libraries | neither — setup only | the setups empty a whole library, which nothing in production does but an org's deletion; the guard is right to refuse it and stays as written |
