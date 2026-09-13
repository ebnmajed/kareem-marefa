# 13 — Testing and Quality

**Status:** `draft` · **Serves:** `REQ-NFR-007`, `REQ-NFR-008`, `REQ-NFR-018`, `REQ-DSG-015`
**Cites:** `03-permissions-rls.md`, `06-visual-designer.md`, `11-background-jobs.md`

---

## 1. Where we start from

| Tool | Status |
|---|---|
| **Vitest 4.1.10** | Installed, `environment: "node"` only |
| `scripts/qa.mjs` | Exists and guards the frozen public contract — but is **stale and failing on `main`**; see below |
| **jsdom, `@testing-library/*`** | **Not installed** |
| **Playwright** | **Not installed** |
| GitHub Actions | **Not configured** |
| Supabase projects | **One. It is production.** |

**`scripts/qa.mjs` is stale.** It asserts `[role="status"] a[href^="https://wa.me"]`, an element
commit `e748642` (*"Replace WhatsApp invite link with native share sheet"*) removed from
`src/components/registration-form.tsx`. It also writes screenshots to a hard-coded path from an
expired session. Everything before the assertion passes; the script then throws. **Fixing it is the
first task in M0**, because the `qa` gate below cannot be turned on while it fails — and a green
gate that nobody can run is worse than no gate.

A23 assumed all of this existed. **It does not**, and the gap is on the critical path: M1
retrofits auth and RLS onto a live database whose only policy is `anon`-insert, and doing that
without a staging copy is the riskiest activity in the plan. Building this out is **M0 work**
(`REQ-NFR-017`, `REQ-NFR-018`).

---

## 2. Strategy per layer

| Layer | Tool | What it proves | Weight |
|---|---|---|---|
| **RLS policies** | Vitest + a real Postgres | Isolation and authority | ★ **highest value** |
| Database constraints | Vitest + Postgres | The invariants the schema encodes | ★ high |
| Pure logic | Vitest, node | Scoring maths, date handling, normalisation | medium |
| Server actions / DAL | Vitest + Postgres | Validation, authority, DTO shape | high |
| Components | Vitest + jsdom + Testing Library | RTL behaviour, states, accessibility | medium |
| **Shaping parity** | Playwright + the worker image | D66 | ★ **highest value** |
| E2E | Playwright | The critical paths | high |
| Visual regression | Playwright screenshots | The frozen public contract; key screens | medium |
| Performance | Lighthouse CI | Budgets per screen | medium |
| Accessibility | axe + manual | WCAG 2.2 AA | high |

**Two suites carry disproportionate weight**, and they are the two the product's core promises rest
on: the RLS suite (D3 — cross-org reads impossible) and the parity suite (D66 — Arabic renders
correctly in exports). If time is short, these are the last to be cut, not the first.

---

## 3. The RLS test plan

`REQ-NFR-001` makes a policy without a test a review failure, so this is a gate, not a goal.

### 3.1 The fixture

**Two orgs.** Every isolation test is meaningless with one.

```
org A "كريم معرفة"          org B "مؤسسة أخرى"
  admin_a, mod_a              admin_b, mod_b
  member_a1, member_a2        member_b1
  presenter_a                 presenter_b
  session_published_a         session_published_b
  session_completed_a         (content on both)
  comments, photos, ratings, ledger rows, certificates
```

Reset per suite with a transaction rollback, not a truncate — an order of magnitude faster, and it
keeps the suite usable in a pre-commit hook.

### 3.2 The isolation sweep — generated, not written

```ts
// Generated over the entity list in 02-domain-model.md.
// A new table is covered the day it is created; a table someone forgot to
// protect fails immediately.
for (const table of ENTITIES) {
  test(`${table}: org A cannot see org B`, async () => {
    const client = await asMember(member_a1)
    const { data } = await client.from(table).select('*')   // no org predicate
    expect(data.every(r => r.org_id === ORG_A)).toBe(true)
    expect(data.some(r => r.org_id === ORG_B)).toBe(false)
  })
}
```

**This single generated suite is the highest-value test in the product.** It is the executable form
of D3.

### 3.3 Per-policy cases

`03-permissions-rls.md` §8.2 holds the table — roughly 86 named cases, one per policy. They are not
duplicated here; that document owns them, and duplicating them would guarantee the two lists
diverge.

### 3.4 The cases most likely to be got wrong

Worth calling out, because each is a place where a plausible implementation is wrong:

| Case | The trap |
|---|---|
| `POL-ratings.select.presenter` | A policy that hides `member_id` still leaks through `count(*)`, ordering and realtime payloads. The test asserts **zero rows**, not redacted rows. |
| `POL-photos.insert.checked_in` | Must be tested with a member who **has an RSVP and no check-in** — the case that passes if the gate keys off the wrong thing. |
| `POL-check_in_codes.select.member` | Must be tested with a member who has **already checked in**. |
| `POL-members.select.member` | Selecting `email` must **error on the column grant**, not return null. |
| `POL-sessions.update.presenter` | A presenter setting `starts_at` must be rejected **by the grant**, not by the form. |
| `POL-super_admin.no_data_plane` | A super admin must get **zero rows** from `sessions`, `members`, `points_ledger`, `certificates`. Run this first after any policy change. |
| `POL-realtime.channel_private` | Must be tested by **subscribing anonymously**. A public channel needs no credentials at all, so a test that authenticates first cannot detect one. |
| `POL-realtime.messages.select` | Must be tested **cross-org** — the sweep in §3.2 covers tables, not channel topics, so Realtime is not protected by it. |
| `POL-realtime.host_topic` | Must be tested as a member who **has already checked in** (OQ-013). |
| `POL-points_ledger.update` | Must be tested **as `service_role`**, not only as `authenticated`. |

### 3.5 The policy-vs-migration diff

`scripts/policy-diff.mjs` extracts every `create policy` from the migrations and diffs it against
`03-permissions-rls.md`, failing CI on a policy present in one and absent from the other.

**This is the highest-value automation in the plan.** That document is only true if it matches the
database, and nothing else checks that it does.

---

## 4. The shaping parity suite

`REQ-DSG-014`, `REQ-DSG-015`, D66, DEC-017. Specified in `06` §9; the harness is here.

### 4.1 The three tiers

| Tier | What | Where | Blocking |
|---|---|---|---|
| **A** | Text identity — same glyph sequence, line breaks, fitted size | **Every production export** | **Yes** — a mismatch fails the export |
| **B** | Pixel parity, both paths **inside the worker image** | Every CI run | **Yes** |
| **C** | Cross-browser (Safari, Firefox, Chrome vs worker) | Nightly | Advisory |

**Tier B runs both paths inside the worker image on purpose.** Comparing the worker's Chromium
against a CI runner's browser would measure the difference between two Chromium builds, which is
expected and uninteresting. Comparing two renders of the same document inside one image measures
what we actually care about.

### 4.2 The seven cases × four export paths

Cases (`06` §9.2): lam-alef · stacked tashkeel · mixed script and digits · mirrored punctuation ·
long word forcing a break · both numeral systems · auto-fit limit.

Paths: **poster PNG · poster PDF · certificate PDF · slide page images**.

**28 assertions**, and the suite runs against **each path separately** (`REQ-DSG-015`) — a suite
that runs once "globally" proves nothing about the path that is broken.

### 4.3 Tolerance

- **Tier A:** exact. A string comparison of the shaped glyph run, line-break positions and fitted
  size. Not a tolerance.
- **Tier B:** ≤ **0.1 %** of pixels differing by > **2/255** per channel — enough to absorb
  antialiasing between runs, not enough to hide a substituted font.
- **Tier C:** reported. Cross-browser difference is expected; a **growing** one is the signal.

### 4.4 Goldens are never auto-refreshed

`REQ-DSG-015`. A changed golden is a reviewed change, with a human looking at before and after.

**An auto-refreshing golden suite tests that the code equals itself** — the most reassuring way to
test nothing at all. Doubly important now that org admins can add fonts (`06` §7.2): every newly
materialised font runs all seven cases before becoming selectable, and a font that "fixes" a golden
has broken something.

### 4.5 Font manifest drift

CI asserts the editor's, the worker Chromium's and the worker LibreOffice's font sets are
**identical by SHA-256**. A font in one and not another is a **build failure**.

Font drift is the likeliest silent Arabic killer: different font files produce different line
breaks, which produce different text, which fails Tier A on every export afterwards.

---

## 5. End-to-end scenarios

Playwright, against staging, in **Arabic**.

### 5.1 The critical path

```
E2E-01  proposal → publish → RSVP → check-in → points → certificate
```

| Step | Assert |
|---|---|
| Member submits a topic | No date/time/venue field **exists** in the form |
| Admin approves | Proposer notified; presenter points not yet awarded |
| Admin schedules and publishes | Poster auto-generates **every A12 variant**; publish blocked while anything is missing |
| Members RSVP past capacity | Exactly `capacity` confirmed; the rest waitlisted in order |
| One cancels before the cutoff | First waitlisted promoted **immediately**; notified; calendar event created |
| Session starts | State moves on the clock; the first code issues |
| Attendee checks in | **«تم تسجيل حضورك»**; 20 points on the ledger |
| Attendee with an RSVP and no check-in | **Cannot** rate, **cannot** upload a photo |
| Session completes | Presenter points; no-shows evaluated; certificates issued |
| Certificate | PDF downloads; **serial printed**; QR resolves at `/verify` |
| `/verify` with the **serial** | **Not found** |

**That last pair is the test that proves DEC-010.** If a serial ever resolves at `/verify`, the
recipient list is enumerable and A13's privacy promise is void.

### 5.2 The other eleven

| ID | Scenario | The assertion that matters |
|---|---|---|
| E2E-02 | Walk-in check-in | No RSVP; full attendance rights (`REQ-CHK-010`) |
| E2E-03 | Leaked code burned | Revoke; next attempt fails; prior check-ins stand |
| E2E-04 | Rate limiting | 11th attempt in 10 min fails; **the attempt is still recorded** |
| E2E-05 | Overlapping sessions | Second check-in rejected, naming the conflict |
| E2E-06 | Manual attendance | Reason mandatory; audited; **flagged in the CSV export** |
| E2E-07 | Session rescheduled | Old and new values in the notification; calendars updated; reminders **moved, not duplicated** |
| E2E-08 | Session cancelled | Page stays with the banner; materials retained; calendar events removed |
| E2E-09 | Photo takedown | Hides **instantly**, before review; uploader notified; requester not named |
| E2E-10 | Rating anonymity | Presenter sees nothing at 2 ratings, an aggregate at 3, **never a rater** |
| E2E-11 | Points recompute | Rebuild the rollup; every balance identical |
| E2E-12 | Poster live→detached | Edit detaches; a later data change **prompts** instead of overwriting |

### 5.3 Accessibility scenarios

| ID | Scenario |
|---|---|
| A11Y-01 | Reserve a seat using **keyboard only**, in Arabic |
| A11Y-02 | Navigate the **viewer** by keyboard — arrows follow the reading direction |
| A11Y-03 | Check in with a screen reader; the code field is labelled in Arabic |
| A11Y-04 | Star rating by keyboard — **fills from the right** in RTL |
| A11Y-05 | Every image has alt text; the poster's is meaningful, not "poster" |

---

## 6. RTL and Arabic test cases

The ones that break silently, gathered so they are not rediscovered one at a time:

| # | Case | Failure it catches |
|---|---|---|
| 1 | **Viewer arrows** follow the reading direction | An LTR-first viewer advances the wrong way (`07` §5) |
| 2 | **Star ratings fill from the right** | 5 stars recorded as 1 — a silent, systematic data error |
| 3 | **The check-in code field is `dir="ltr"` inside an RTL page** | Characters appear in the wrong boxes at the worst moment |
| 4 | **ICS folds at 75 octets, not 75 characters** | Arabic is 2 octets in UTF-8; folding by character produces mojibake in Outlook |
| 5 | **Mixed-script titles are `<bdi>`-isolated** | «جلسة عن Next.js 16» renders with the digits displaced |
| 6 | **Numerals are consistent within a screen** | Mixed Western and Arabic-Indic reads as a rendering bug |
| 7 | **Dates render identically on `ar-EG`, `ar-SA`, `ar-MA`** | Maghrebi month names; `ar-SA` silently using the Hijri calendar |
| 8 | **No `rtl:` variant paired with a physical utility** | Tailwind v4's `:where()` means the physical one always wins |
| 9 | **No text line has `overflow: hidden`** | Clipped stacked tashkeel |
| 10 | **No Arabic text has non-zero letter-spacing** | Broken cursive joining |
| 11 | **Arabic plurals use all six ICU forms** | English-shaped plurals produce wrong Arabic at 2 and at 3–10 |
| 12 | **Subsetting preserves `rlig`, `mark`, `mkmk`** | Latin passes; lam-alef and tashkeel break |

Cases 8–10 are **lint rules**, not tests — they are cheaper to catch at write time.

---

## 7. Performance budgets

`REQ-NFR-008`. Per screen, enforced by Lighthouse CI on a **throttled mid-range mobile profile**,
because that is what members are actually holding.

| Screen | LCP | INP | CLS | JS (gz) |
|---|---|---|---|---|
| Marketing landing **[FROZEN]** | ≤ 2.0 s | ≤ 200 ms | ≤ 0.05 | current — **must not regress** |
| Event page (SCR-012) | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ 180 KB |
| Session list (SCR-011) | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ 150 KB |
| **Check-in (SCR-014)** | **≤ 1.5 s** | **≤ 100 ms** | ≤ 0.05 | **≤ 80 KB** |
| Viewer (SCR-013) | ≤ 2.5 s to page 1 | ≤ 200 ms | ≤ 0.1 | ≤ 200 KB |
| Leaderboard (SCR-027) | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ 150 KB |
| Admin dashboard (SCR-040) | ≤ 3.0 s | ≤ 300 ms | ≤ 0.1 | ≤ 250 KB |
| Designer (SCR-057) | ≤ 4.0 s | ≤ 300 ms | ≤ 0.1 | not budgeted — a desktop tool |

**The check-in budget is the strictest, and deliberately so.** It is used in a room, on
conference-centre wifi, by someone standing while forty people wait. The Arabic font is already
loaded by then, so the page can be nearly nothing: one field, one button.

**The marketing landing must not regress.** It is live, it was measured, and `scripts/qa.mjs`
already guards it (`REQ-NFR-019`).

---

## 8. Real-device matrix

§6 of the brief requires real-device testing before every release. Chosen from what this
organization actually carries:

| Device | Why |
|---|---|
| **iPhone SE (small) — Safari** | The smallest viewport in real use; catches thumb-zone and 44 px failures |
| **iPhone 15 — Safari** | The most common device; iOS Arabic rendering differs from Chrome's |
| **Samsung Galaxy mid-range — Chrome** | Android Arabic font fallback differs again |
| **iPad — Safari, landscape** | The host view is often shown on a tablet |
| **MacBook — Safari, Chrome** | Admin console and designer |
| **Windows — Edge, Chrome** | Corporate desktop; **the Outlook ICS test lives here** |

**Per release, on real hardware:** the check-in flow, the viewer's RTL navigation, the host view's
legibility at 3 metres, and one certificate PDF opened on a phone.

---

## 9. CI pipeline

```yaml
on: [pull_request, push]

jobs:
  lint:        # tsc --noEmit · eslint · RTL lint rules (§6 cases 8–10)
  unit:        # vitest — pure logic, scoring maths, Arabic normalisation
  db:          # ephemeral Postgres → migrations → RLS suite + constraint tests
  policy-diff: # scripts/policy-diff.mjs — migrations vs 03   ← blocking
  parity:      # Tier B, inside the worker image              ← blocking
  qa:          # scripts/qa.mjs — the frozen public contract  ← blocking
  trace:       # scripts/traceability.mjs                     ← blocking
  build:       # next build
  e2e:         # Playwright against a preview deployment
  lighthouse:  # budgets per screen
  a11y:        # axe on every key screen
```

### 9.1 The four blocking gates

| Gate | Fails when | Why it blocks |
|---|---|---|
| `qa` | A frozen public route changed | A live site serving real visitors (`REQ-NFR-019`) |
| `policy-diff` | Migrations and `03` disagree | The security document is only true if it matches the database |
| `parity` | Tier B regresses | D66 is a hard requirement, and the failure is otherwise silent |
| `trace` | An orphan requirement or a broken citation | The document set rots without it |

### 9.2 Nightly

Tier C cross-browser parity · full E2E on staging · `JOB-audit_balances` verification ·
the storage-prefix assertion · dependency audit.

---

## 10. The traceability gate

`scripts/traceability.mjs` regenerates `TRACEABILITY.md` between markers and **exits non-zero** on
four gap reports:

1. A requirement with **no story**.
2. A requirement with **neither a screen nor a job**.
3. An artifact citing a **nonexistent** requirement.
4. A requirement with **no milestone**.

A CI gate on `docs/plan/**` is the only mechanism here that actually holds. **Everything else in
this plan's cross-session protocol is etiquette**, and etiquette decays; a machine that fails the
build does not.

---

## 11. Definition of done

A change is done when:

- [ ] It cites a `REQ-*` ID.
- [ ] Every new table has an org key, a policy set, **and a test** (`REQ-NFR-001`).
- [ ] Every new policy appears in `03` **and** in the migrations — `policy-diff` is green.
- [ ] Every new action and handler validates with **Zod**, and re-derives authority server-side.
- [ ] Every new string is **externalised**, and the **Arabic is written**, not translated.
- [ ] Every new screen has **mobile, desktop and RTL** notes in `09`.
- [ ] Every new job is **idempotent** and has a `job_key`.
- [ ] Any export path change passes the **parity suite**.
- [ ] `scripts/qa.mjs` is still green.
- [ ] Performance budgets hold for any screen touched.
- [ ] `STATUS.md` is updated, and any decision is in `DECISIONS.md`.
