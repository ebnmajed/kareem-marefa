# designer — M6 (DSG · CRT), wave 3

The `designer` teammate's working note. Plans before code, findings as they are
found. `docs/plan/` is otherwise the lead's; this file is mine.

---

## Wave 24 — as built, PR B `wave-24b/the-baseline` (after the owner's four rulings)

**The owner's rulings, applied:** five TOKEN grounds and the team colour deferred to its own wave · the thumbnails'
omissions **kept** (the org logo, `l_issued`, `l_reason`, `l_kind`) · the re-render is a one-off the owner runs and is
**not** in `0193` · cyan and violet recorded as team colours, so the artboard asks for three colourways and one of them
ships properly.

### What changed, file by file

| file | what |
|---|---|
| `packages/designer-runtime/src/library.ts` | all eleven documents rebuilt; `DISPLAY = 'Baloo Bhaijaan 2'`; five colourways; the stadium pill; version 1 on every row |
| `packages/designer-runtime/src/model.ts` · `validate.ts` | `FontSpec.weight` widened to `700 | 800`, additive |
| `packages/designer-runtime/scripts/seed-sql.mjs` | emits eleven NEW rows plus the supersede loop (granted to me this wave) |
| `supabase/proposed/designer/0005_playground_library.sql` | generated, 3,362 lines |
| `supabase/proposed/designer/0006_supersede_baseline.sql` | `supersede_baseline_template()` |
| `scripts/parity/backgrounds.mjs` | a `solid-rtl` case; the mirror on a harness-owned fixture |
| `tests/unit/designer-library.test.ts` | five expectations moved, each with a ledger comment |
| `tests/unit/designer-render.test.ts` | two palette literals replaced by palette reads (a PR-A gap, §A4) |
| `tests/rls/templates-roster.test.ts` | the new seed in `buildLibrary()`; two expectations moved; one case added |
| new `tests/rls/designer-baseline-supersede.test.ts` | 8 cases, both branches |
| new `tests/unit/designer-reissue-pinned.test.ts` | 5 cases |

### A1 · ★★ The defect the roster suite caught, and the plan's §6 was wrong about it

My plan said the seed stays «idempotent on `(scope, purpose, family)` exactly as `0061` is», with `retired_at is null`
added as a third condition. **That is not sufficient and the test proved it in one run.** `0061` and `0098` ADD A
VERSION to an existing row, so «the live default of this (purpose, family)» is exactly the row to seed into. Wave 24
REPLACES the row, and that key cannot tell the row being replaced from the row replacing it: on the first run it matched
the **superseded** row, found version 1 already present, inserted nothing, and the documents never changed —
**11 templates, 19 versions, the old design still live.**

★ The key is now **the document itself**: the row carrying this exact `jsonb`. Structural equality, key-order
independent, the literal declared once into `v_doc` so it is not written twice, and a re-run finds the row it created.
★ A second bug fell out of the same change and the suite caught that too: I had replaced `returning id into v_template`
with a `select` by `(family, name)`, which matched the **superseded** row — still carrying that family and that name
until the supersede step runs — and then inserted version 1 on a row that already had one. `RETURNING`, always.

### A2 · ★ `0098` re-applied AFTER this wave would silently restore the old design

Found while fixing `roster.idempotent`. Re-running `0098` after the new seed adds **its own version 2** — the old
documents — to the eleven NEW rows, because they are the live defaults it looks for: 11 templates, 19 versions. And
since `certificate_template_latest_version()` takes the highest **published** version, issuance would resolve the old
design again. **Not reachable**: migrations run once, in order, and `0098` precedes `0193` in every environment for
ever. But a future «reseed the library» script that replays `0061`/`0098` **would** do it. Written here and in the
test's own comment rather than in a commit message.

### A3 · Measured, not asserted

- **11 rows, 11 distinct documents, 0 brand violations, 0 validation issues, and `allSafeAreaViolations()` empty over
  all seven poster presets and both certificate compositions** — first run, no frame adjusted after the fact.
- `tests/rls/{designer,templates,certificates}*`: **161 cases, 13 files, all green**, including the six that are
  evidence and were not edited.
- `designer-derive-untouched`: **41 of 48 hashes move, the 7 `uploaded/*` do not.** The seam assertion passes
  untouched, which is the assertion that proves the engine was not touched. The table is computed and handed over;
  **I did not refresh it.**
- `npx tsc --noEmit` clean. `npm run lint` **0 errors**, 31 warnings, all pre-existing.

### A4 · ★ A PR-A gap found here and fixed by the lead — see §A8

`tests/unit/designer-render.test.ts` asserted the literals `#0b1220` and `#ffffff` — the light and dark `fgHeading`
**as they stood before `0192`**. The palette moved in PR A and these two cases were left on the old navy; they fail on
`main` independently of anything in PR B. ★ **I fixed them and then dropped the fix**: the lead had already made the same
change the same way in PR #63. **§A8 is what happened**; the file is `main`'s in this branch.

### A5 · ★ My own process failure, recorded because it cost two false signals

I started an RLS run while the full unit run was still going, against the single-runner rule. Two consequences, both
misleading: the background output files came back **empty** (one reported exit 0 with no content, which reads as
«green»), and `tests/components/templates/template-menu.test.tsx` — `console`'s file, which I must not edit —
**failed**. It passes alone. **A concurrent runner produces failures that look like yours and are not.** One runner,
checked with `pgrep` first, every time.

### A7 · ★★ The poster QR was 11.9 mm on both print presets, and the comment had been wrong since M6

Measured while checking the four formats derive sensibly, which is the only reason it surfaced: **`scale: 'fixed'`
holds the frame's PIXELS at the master's dpi**, and the poster master is 72 dpi while A4 and A3 are 300 dpi. So 140 px
was 49.4 mm on every screen preset and **11.9 mm on both printed ones** — a 4.2× physical shrink on exactly the two
variants that go on a wall. The certificate's QR was never affected: its master is already 300 dpi and it derives to one
preset, so 320 px is 27.1 mm wherever it lands.

★ **The comment that stood above it since M6 said `fixed` keeps «the same physical size on every variant», which is the
opposite of what `fixed` does across a dpi change.** Nobody caught it because nobody printed an A3 poster; **this wave
is the first whose acceptance is a printed artefact**, which is why it is the first that could.

★ I measured it, did not act, and reported it — and **the lead overruled the hesitation, not the reasoning**: a wave
accepted on a printed poster that ships a knowingly unscannable code is the wave failing its own acceptance, and an
older defect is older, not smaller. `scale: 'proportional'` on the **poster** QR alone:

| preset | dpi | `fixed` (was) | `proportional` (now) |
|---|---|---|---|
| master · story | 72 | 49.4 mm | 49.4 mm |
| square | 72 | 49.4 mm | 38.1 mm |
| landscape (16:9) | 72 | 49.4 mm | 36.7 mm |
| og (link card) | 72 | 49.4 mm | 20.1 mm |
| **A4** | 300 | **11.9 mm** | **30.4 mm** |
| **A3** | 300 | **11.9 mm** | **43.7 mm** |

Both comments are corrected to say what `fixed` actually means and why the two purposes legitimately differ — the
masters differ, not the judgement. ★ And the anti-drift test earned its keep immediately: changing the layer's `presets`
drifted the generated seed from the library and `designer-library.test.ts` failed until it was regenerated. The pinned
derive table moved a second time with it, and the lead has the regenerated 41.

### A8 · `designer-render.test.ts` reverted to `main`'s — the lead had already fixed it in PR #63

I found PR A's two stale palette literals and fixed them to read `platformBrand()`. **The lead had fixed the same two
cases the same way in #63**, which is open. Both of us arriving at «read the palette, never the literal» is the right
answer twice; two commits doing it is a conflict for no gain. The file is `main`'s again here and rebases when #63 lands;
the ledger lines live in the lead's commit. ★ And my instinct to look further was right: **`TRACEABILITY.md` was stale by
two rows**, caught by CI's currency check rather than by the local `--check`, and that is in #63 too.

### A9 · Still open, and NOT done by me

- The parity `--update` diff and `designer-derive-untouched`'s 41 hashes: **handed to the lead**, who opens and commits.
- The four owner questions are settled; **the team colour is a deferred wave**, recorded in `library.ts`'s header as a
  real loss rather than a tidy-up.
- The one-off re-render is the owner's script, not `0193`.
- ★ **The editor's weight control still offers 400/500/600 only** (`inspector.tsx:247`, `editor.tsx:682`). The studio's
  chrome is frozen this wave, so an admin editing a rebuilt document sees no weight selected on the title and cannot
  set 800 from the UI. The document renders correctly; the control cannot express it. ★ **The lead has recorded it as a
  carry for the wave that unfreezes the chrome** — «the document rendering correctly while the control cannot express it
  is exactly the kind of thing that disappears if it is not written down».

---

## Wave 24 — 2026-10-04 — the plan, PR B `wave-24b/the-baseline` (planning only; no document and no SQL until the lead posts «the palette is in» and «the plans are approved»)

**The goal in one line, the owner's:** a poster an admin exports and a certificate a member holds look like the
product they came from — today they wear M6's Reem Kufi on navy while every screen has worn «ساحة اللعب» since wave 17.
**The second line, which is the floor:** a certificate somebody is already holding does not change, which is why the
database refuses to delete its version and why nothing here forces it.

Read: `STATUS.md`'s wave-24 block · `CLAUDE.md`'s wave-24 map · `DEC-242` in full · `notes/wave-24-lead.md` ·
`AdminTemplates.dc.html` and `AdminTemplatesCerts.dc.html` (the seven card thumbnails, inline styles extracted) ·
`01-tokens.md`. Measured, not assumed: `0055`, `0057`, `0061`, `0063`, `0065`, `0066`, `0094`, `0096`, `0098`, `0099`,
`0127`, `0191`, `0192`; `library.ts`, `model.ts`, `presets.ts`, `bindings.ts`, `session-bindings.ts`, `brand.ts`,
`render.ts`, `qr.ts`, `fingerprint.ts`; `worker/src/tasks/regenerate_poster.ts`, `issue_certificates.ts`;
`scripts/parity/{harness,backgrounds,paths,cases}.mjs`; `templates.ts`, `certificates.ts`, `designer.ts`, `posters.ts`.

★ **Two hard constraints I derived before anything else, because they bound every other choice.**

1. ★★ **The eleven new documents stay at `BASE_SCHEMA_VERSION` (1).** `SCHEMA_VERSION` is 2 and `main`'s worker
   refuses a document whose version it does not know (`schema_version_future`, `DEC-178` D2b). The owner pushes the
   migration **before** merging, so `main`'s worker runs `0193`'s rows with `main`'s code for the whole window — a
   bumped document would fail **every** poster render in that window. **Therefore no new model field that changes a
   rendered byte**: no `radius`, no `dir`, nothing the old runtime would draw differently. See §9.6 and §9.8.
2. ★★ **Every colour is `{{brand.<token>}}` and nothing else.** `0094`'s guard (`:103`) is an **allowlist of the
   binding shape**: `^\{\{\s*brand\.[A-Za-z]+\s*\}\}$`. Not «no hex» — **no anything else**. `brandViolations()` and
   `tests/rls/templates-roster.test.ts`'s `roster.variants` hold the same shape in TypeScript. So a team colour
   cannot reach a template as a binding either. §9.2 is the question that follows.

---

### 0 · ★★ Sync 1 — what the lead ruled, what the owner holds, and the production read

**Approved as framed**, so the plan below stands except where this section amends it:

- `BASE_SCHEMA_VERSION` stays 1 and **no new model field that changes a rendered byte** (§9.6, §9.8).
- The category pill carries the **family literal**, not a `session.category` binding — the deciding argument is that
  byte-identical documents fail `designer-library.test.ts:48-50` (§9.1).
- **`l_kind` is kept**: «a certificate that cannot tell attendance from presenting is not a simplification» (§9.5).
- The pill is the **three-shape stadium** (§9.6).
- `FontSpec.weight` widened to **700 | 800**, additive, with **Baloo 700** for the small bold lines (§9.7).
- `backgrounds.mjs` gains a **`solid-rtl`** case and keeps a **harness-owned gradient fixture** for the `360 − angle`
  mirror (§5).
- `designer-derive-untouched`'s 41-of-48 table: **I compute it and hand it over; the LEAD refreshes it, not me**, and
  the **7 `uploaded/*` hashes not moving is the assertion that proves the seam** (§5).
- ★ **`packages/designer-runtime/scripts/seed-sql.mjs` is mine for this wave** — granted; the lead is adding it to the
  map and the agent file (§9.13a).

**The lead is fixing two requirement gaps, and I work around neither** — they will be correct before I build:
`REQ-DSG-026`'s gradient / tasks strip / formal Naskh / Knowledge Network is being amended in `01-prd.md` (§9.9), and
`REQ-DSG-034`'s first acceptance bullet is being rewritten to name the surfaces a teammate can actually reach rather
than `platform_template_library()`, which returns retired rows on purpose for SCR-083 (§9.10).

★★ **Four questions are the OWNER's and I do not resolve any of them myself:**

1. **The team colourway** — (a) the migration-and-new-scope route, or (b) five token grounds (§9.2).
2. **The org logo leaving every baseline artefact** (§9.11).
3. **Dropping the certificate's issue date and the achievement's reason** (§9.5's second half).
4. **The one-off re-render fan-out** (§9.12).

★ The lead is taking §9.3 to the owner in my own words — cyan and violet are `--color-team-cyan` and
`--color-team-violet`, so the artboard's «لقاء» and «إعلان» cards are **the same colourway as card 1**, which changes
what the design is asking for.

★★ **HOLD.** Nothing is deleted, no document is written and `0193` is not touched until the lead posts the owner's four
answers **and** the path for `../kareem-marefa-wave24b`. ★ A concurrent session is writing `DEC-243` / `REQ-TEN-009`
into `DECISIONS.md` and `01-prd.md` in this checkout: **stage only my own paths, never `git add -A`**, and re-read any
file I did not write in this session from disk before editing it.

★ **The production read is in §2**, where it corrects the «production» column for all six certificate rows.

---

### 1 · The current eleven rows, and what each draws that the thumbnails do not

Source of truth: `packages/designer-runtime/src/library.ts` (the library IS the source; `0061`/`0098` are generated
copies, deep-equalled by `tests/unit/designer-library.test.ts`). **19 version rows across 11 template rows.**

| # | purpose · family · orientation | name | versions | current | `is_default` |
|---|---|---|---|---|---|
| 1 | poster · `talk` | جلسة | 1 (`0061`), 2 (`0098`) | **2** | true |
| 2 | poster · `workshop` | ورشة | 1, 2 | **2** | true |
| 3 | poster · `panel` | حوار | 1, 2 | **2** | true |
| 4 | poster · `meetup` | لقاء | 1, 2 | **2** | true |
| 5 | poster · `announcement` | إعلان | 1, 2 | **2** | true |
| 6 | certificate · `attendance` · landscape | شهادة حضور أفقية | 1 (as «شهادة حضور»), 2 | **2** | true |
| 7 | certificate · `attendance` · portrait | شهادة حضور عمودية | 1 (`0098`) | **1** | false |
| 8 | certificate · `presenter` · landscape | شهادة تقديم أفقية | 1, 2 | **2** | true |
| 9 | certificate · `presenter` · portrait | شهادة تقديم عمودية | 1 | **1** | false |
| 10 | certificate · `achievement` · landscape | شهادة إنجاز أفقية | 1, 2 | **2** | true |
| 11 | certificate · `achievement` · portrait | شهادة إنجاز عمودية | 1 | **1** | false |

**What the five posters draw today and the thumbnails do not** — all of it goes:

- `l_logo` — an image layer bound to `brand.logoAssetId`, 160 × 160 at the block-start. The thumbnails draw **no logo
  lockup** (§9.11 names the consequence).
- `l_rule` + `l_rule-node-1..3` — the Knowledge Network: a 920 × 2 rule on `{{brand.edgeStrong}}` with three 10 px
  lime ellipses. **Nothing of it is on any thumbnail.**
- `l_where` — the venue line (`session.venueName`, `hideAt: ['og']`). **No venue row** on any thumbnail.
- `l_tasks` — the workshop family's preparatory-tasks strip (`hideAt: ['og','square']`). **No task list.**
- The **gradient** background — `DEC-127`'s `140deg`, `{{brand.surface}}` → `{{brand.canvasRaise}}`. The thumbnails
  draw **a flat ground** (and `REQ-DSG-033` says so in words). §9.9.
- **Reem Kufi 600** on the title at 96 px / lineHeight 1.4, and **IBM Plex Sans Arabic** on everything else. The
  thumbnails set the title in **Baloo Bhaijaan 2 800 at lineHeight 1.12**.
- `l_kicker` as a plain muted line («نوع الجلسة», body face 40/1.4) rather than **a pill in the ground's colour on ink**.
- The QR at the **inline-start** of the foot (`x: 80`) with the presenter and date **above** it. The thumbnails put the
  presenter and date **bottom-start** and the QR **bottom-end**, side by side.

**What survives on a poster:** the title, the presenters, the date, the QR. Four things.

**What the six certificates draw today and the thumbnails do not:**

- `l_logo` (the bound image), `l_rule` + three nodes on `{{brand.spine}}`, `l_signature` (a locked 600 × 2 rule on
  `{{brand.edgeStrong}}`), `l_reason` (`session.title` / `certificate.achievementName`), `l_issued`
  (`certificate.issuedAt`).
- **Amiri** (formal Naskh) on the kind line at 128 px and the recipient at 150 px. The thumbnails use **the display
  face** for both.
- The org name as a **centred** body-face dynamic field at 56 px. The thumbnail draws a **wordmark at the top-start in
  the display face at a small size**.
- **Everything centred.** The thumbnail is a corner composition: wordmark top-start, name large, serial bottom-start,
  QR bottom-end.

**What survives on a certificate:** the recipient's name, the serial, the verification code (`REQ-CRT-010` keeps it
even though the thumbnail omits it — a requirement over an artboard, not a disagreement), the QR. Plus `l_kind`, which
I keep for the reason in §9.5.

---

### 2 · ★★ The delete-or-retire table — read from the FKs and the issuance functions, not from memory

**The five paths that can hold a reference**, each read at its line:

| id | reference | action | who writes it |
|---|---|---|---|
| R1 | `design_documents.template_version_id` | **restrict** (`0055:135`) | `regenerate_poster.ts:160` from `poster_render_context()` (`0063:113-121` — **`t.family = 'talk'` only**, `retired_at is null`); `record_certificate_document()` (`0065:303`, `0099:332`) from `certificates.template_version_id` |
| R2 | `certificates.template_version_id` | **restrict**, `not null` (`0055:288`) | `issue_certificate()` (latest `0127:263-271`: family `presenter` else `attendance`, `retired_at is null`, `published_at is not null`, `is_default desc`); `issue_achievement_certificate()` (`0066:84`: **family `achievement`**); `set_certificate_design()`'s pin via `certificate_template_latest_version()` |
| R3 | `session_certificate_designs.template_id` | **restrict** (`0099:63`) | `set_certificate_design()` — any non-retired certificate template of the family, this org's **or the platform's**, landscape **or portrait**; `kind in ('attendance','presenter')` by check constraint |
| R4 | `design_documents.draft_for_template_id` | cascade (`0057:36`) | `createTemplateDraft()` — **refuses a non-`org` template** (`templates.ts:331-334`), so a platform row **cannot** have a draft. Expected: none, anywhere |
| R5 | `design_templates.duplicated_from` | set null (`0055:84`) | duplication. **Never an obstacle**: a duplicate is a copy, not a reference. `0096` computes `is_baseline` from `platform_audit_log` rather than this column precisely so a nulled provenance does not turn an org's copy into a baseline row |

Plus `design_template_versions.template_id` → **cascade** (`0055:111`): deleting a template row takes its versions,
which is how R1/R2 come to refuse the parent delete.

**Expected outcome per row.** «Production» means a database where the product has been used; «empty» means a fresh
database and the world `tests/rls/templates-roster.test.ts`'s `buildLibrary()` builds (it clears `certificates`,
`export_artifacts`, `session_posters`, `design_documents`, `design_assets` and both template tables first).

★★ **CORRECTED AT SYNC 1 BY THE PRODUCTION READ — the «production» column below was wrong for all six certificate
rows, in the wave's favour.** The owner ran the read for the lead. **Platform scope, production: `certs = 0` on every
one of the eleven rows**, and `docs = 0` on everything except **`poster/talk`, which has `docs = 2`**. So **R2 and R3
do not fire at all**, and the production outcome is **ten deleted and `poster/talk` retired** — `talk` for exactly the
reason derived below from `0063:113-121` without the data. The «production» column is therefore read as **«in any
database where the product has been used as the code allows»**, which is what the function must survive, not what
production holds today: a certificate can be issued between the read and the push, and local, CI and future
environments differ. **The function stays defensive and the per-row notice stays**, which is also the lead's ruling.

| # | row | empty | production as the code allows (★ production TODAY: see above) | refused by, and why |
|---|---|---|---|---|
| 1 | poster `talk` | **deleted** | **RETIRED** (★ and retired on production, `docs = 2`) | **R1.** `poster_render_context()` resolves the `talk` family **and only `talk`**; `regenerate_poster` then inserts a `design_documents` row carrying that version. `REQ-DSG-001` means every published session has a poster, so in production every org without its own poster template holds one |
| 2–5 | poster `workshop`, `panel`, `meetup`, `announcement` | **deleted** | **deleted** | **Nothing.** No code path binds their versions to anything: `poster_render_context()` reads `family='talk'`, and there is no other writer of a poster's `template_version_id`. Duplication is R5 |
| 6 | cert `attendance@landscape` | **deleted** | **RETIRED** | **R2** (every attendance certificate an org issued with no template of its own — the `is_default desc` ordering picks the landscape row), then **R1** through `record_certificate_document()`, and **R3** if an admin chose it on `045` |
| 7 | cert `attendance@portrait` | **deleted** | **deleted unless chosen** | **R3 then R2** — only if an admin picked «شهادة حضور عمودية» on `045`. Issuance never reaches it on its own: `is_default desc … limit 1` prefers the landscape row |
| 8 | cert `presenter@landscape` | **deleted** | **RETIRED** | as 6 |
| 9 | cert `presenter@portrait` | **deleted** | **deleted unless chosen** | as 7 |
| 10 | cert `achievement@landscape` | **deleted** | **RETIRED** | **R2** via `issue_achievement_certificate()` (`0066:84`), which **does** resolve `family = 'achievement'` — a badge with `issues_certificate`, or a final leaderboard snapshot. Then **R1** |
| 11 | cert `achievement@portrait` | **deleted** | **deleted** | **Nothing.** `session_certificate_designs` forbids `kind='achievement'` (`0099:62`), so R3 cannot reach it, and `0066:84`'s `is_default desc` never prefers it while the landscape row stands |

★ **I cannot query production** (`supabase db query --linked` is on the deny list), so every row above was an
expectation when it was written and **the migration decides at runtime** — that is the design, not a gap. ★ The owner's
read at sync 1 confirmed the mechanism and narrowed the outcome to **ten deleted, `talk` retired**; it does not change
a line of the function, because the next environment is not this one.

**How it decides and reports.** One function in `supabase/proposed/designer/0006_supersede_baseline.sql`:

`public.supersede_baseline_template(p_template uuid) returns table (outcome text, refused_by text)` —
`security definer`, `set search_path = ''`, **no grant to anyone** (`revoke execute … from public, anon,
authenticated, service_role`, so `tests/rls/definer-exposure.test.ts` stays green). Body: a subtransaction that
attempts `delete from public.design_templates where id = p_template`; `exception when foreign_key_violation then` it
`update`s `retired_at = now(), is_default = false` and returns `('retired', sqlerrm)` — `restrict` raises `23503`
immediately and the subtransaction's rollback undoes only the failed delete, so nothing else in the migration is at
risk (and no write-then-`raise` is involved, so `DEC-043` is not in play).

`0193` then, **in this order**:
1. inserts the eleven new rows and their version 1 (idempotent — §6);
2. loops the eleven **superseded** rows, calling the function and `raise notice '%'`-ing `(purpose, family,
   orientation, name, outcome, refused_by)` per row;
3. leaves the function in place so `tests/rls/designer-baseline-supersede.test.ts` can drive **both** branches on
   fixtures. ★ If the lead would rather it not survive, `0193` drops it at the end and the RLS test applies the
   proposed file instead — the lead's call.

★ **The order matters and is free to get right.** Inserting the new default first makes
`design_templates_single_default` (`0057`) clear the **old** row's `is_default` in the same statement, so by the time
the supersede step runs the old rows are already non-default — which means issuance and
`poster_render_context()` prefer the new row even before `retired_at` is set, and `0096`'s `retirable` is already
true for the old ones. Reversing the order would leave a window with no non-retired default.

**Where the report surfaces:** the notices are in the promotion run's output, which the lead pastes into
`STATUS.md`'s per-row table (`DEC-242` §3). ★ **Nothing is forced:** no `cascade`, no `null`ing
`template_version_id`, no touching `recipient_name_snapshot` or a pinned `font_hashes`, and **no `design_document` is
deleted to clear the way** — R4 says none can exist on a platform row anyway.

---

### 3 · ★★ The colour table — every colour, the token it arrives as, the value it renders

A poster is always rendered `dark` (`DEC-125`, every call site passes it explicitly). A certificate's scheme is pinned
per certificate (`certificates.scheme`, `0099`), default `light`. Values are `0192`'s and `brand.ts`'s, which are now
one palette in two places.

**Poster — colourway A, «ink» (the artboard's «ليلي» card):**

| element | thumbnail | token | renders (dark) |
|---|---|---|---|
| ground | `#0B0C12` | `{{brand.canvas}}` | `#0b0c12` ✓ exact |
| title | `#F4F1EA` | `{{brand.fgHeading}}` | `#f4f1ea` ✓ exact |
| presenter · date | `#F4F1EA` | `{{brand.fgBody}}` | `#f4f1ea` ✓ exact |
| category pill fill | `#C6FF3D` | `{{brand.node}}` | `#c6ff3d` ✓ exact — **this is the one way lime reaches a poster** |
| category pill text | `#0B0C12` | `{{brand.canvas}}` | `#0b0c12` ✓ exact |

**Poster — colourway B, «paper» (the «ورقي» card). A deliberate inversion of the dark palette, and the artboard's own
hexes are the proof:**

| element | thumbnail | token | renders (dark) |
|---|---|---|---|
| ground | `#F4F1EA` | `{{brand.fgHeading}}` | `#f4f1ea` ✓ exact |
| text | `#0B0C12` | `{{brand.canvas}}` | `#0b0c12` ✓ exact |
| pill fill | `#0B0C12` | `{{brand.canvas}}` | `#0b0c12` ✓ |
| pill text | `#F4F1EA` | `{{brand.fgHeading}}` | `#f4f1ea` ✓ |

The thumbnail paints this card in `#F4F1EA` on `#0B0C12` — which is the **dark** leg's bone and ink, not the light
leg's paper and paper-ink. So «a paper poster» is the dark kit read the other way round, needs no new token and no
literal, and renders exactly the artboard's hexes. Under the light scheme it inverts to dark-on-light, which is
readable and never rendered (posters are always dark); `roster.variants` resolves it in both.

**Poster — colourway C, «the team colour» (the «ساحة اللعب — لون الفريق» card, and the two platform cards):**

| element | thumbnail | token |
|---|---|---|
| ground | `#FF9A2E` / `#35D0FF` / `#9B7CFF` | ★★ **none — I cannot express this. §9.2** |
| text · pill fill | `#0B0C12` | `{{brand.canvas}}` |
| pill text | the ground again | ★★ **none — §9.2** |

**The QR, both purposes:** black on white, **by the renderer** — `render.ts:189-193` passes no colours on purpose
(«a tinted QR is a QR with less contrast, and contrast is the whole of whether it scans»), and `QrLayer` has no
colour field. The thumbnail's solid 31 px square is a glyph, not a specification. §9.6 covers its 4 px radius.

**Certificate — all three families, both orientations (light; dark flips every row):**

| element | thumbnail | token | renders (light) | renders (dark) |
|---|---|---|---|---|
| ground | `#F4F1EA` | `{{brand.canvas}}` | `#f6f3ec` (§9.4) | `#0b0c12` |
| wordmark (`org.name`) | `#0B0C12` | `{{brand.fgHeading}}` | `#12131a` | `#f4f1ea` |
| the kind line | — (§9.5) | `{{brand.fgHeading}}` | `#12131a` | `#f4f1ea` |
| recipient's name | `#0B0C12` | `{{brand.fgHeading}}` | `#12131a` | `#f4f1ea` |
| serial · verification code | `#5B5F73` | `{{brand.fgMuted}}` | `#5b5f73` ✓ **exact** | `#a7abbe` |

**No hex literal appears in any document. Nothing in a document hard-codes the platform's own new values** — every
row above is a binding, so an org that overrode its kit renders in its own colours (contract 6).

---

### 4 · The document model — the real layer vocabulary, and how one structure yields four formats

**Poster.** `master: { width: 1080, height: 1350, dpi: 72 }` (`PRESETS.master`), `direction: 'rtl'`,
`background: { type: 'solid', color: '{{brand.canvas}}' }` (or the colourway's token), `schemaVersion: 1`. Composed
inside `sourceSafeBox()` — the master's 80 px inset, **not** the thumbnail's 4.6 % — so every print preset's 5 mm
safe area holds.

| layer | kind | binding / literal | font | presets |
|---|---|---|---|---|
| `l_category_pill_start` · `_mid` · `_end` | `shape` ellipse + rect + ellipse | — | — | `default: {anchor:'block-start', scale:'proportional'}` |
| `l_category` | `text` | **literal**, the family's Arabic name (§9.1) | Baloo Bhaijaan 2 700 | block-start |
| `l_title` | `text` | `session.title`, fallback «عنوان الجلسة» | Baloo Bhaijaan 2 **800**, 96 / min 56, **lineHeight 1.12** (§9.7), `letterSpacing: 0`, `autoFit: shrink-then-wrap maxLines 3` | block-start |
| `l_presenters` | `dynamic_field` | `session.presenters` | Baloo 700, 44 / min 32, 1.4, `maxLines 2` | `{anchor:'block-end'}` |
| `l_when` | `dynamic_field` | `session.startsAt` | Baloo 700, 40, 1.4 | `{anchor:'block-end'}` |
| `l_qr` | `qr` | `session.eventUrl`, `ecLevel 'M'`, 4 quiet modules, **locked** | — | `{anchor:'block-end', scale:'fixed'}`, at the **inline-end** of the foot |

**All four formats from this one structure, with no admin rebuild** (`presets.ts:derive()`, M6's mechanism):
the four chips the artboard prints are `landscape` (16:9), `a4`, `a3` and `story` (9:16) — four of the seven presets
`POSTER_PRESETS` already derives, and the editor's strip shows all seven with their ratios computed
(`editor.tsx:295-311`). `derive()` takes **one** factor — `min(dst.w/src.w, dst.h/src.h)` over the **safe boxes** —
for size *and* position, so the gap between the title and the foot scales with them; `anchor: 'block-end'` holds the
presenter/date/QR block to the foot by its distance from the source safe box's bottom; `scale: 'fixed'` keeps the QR
the same **physical** size on A3 as on 16:9 (`REQ-CRT-010`'s reasoning); and text re-fits per preset
(`font.size * factor`), so A3's title is genuinely larger rather than an upscaled raster. **Per-format overrides are
`layer.presets[<presetName>]`** — `{anchor, scale, focal}`, resolved field-by-field over `presets.default`
(`behaviourFor()`), which is what wave 23's variant strip writes: an admin correcting one format corrects that format
only and never re-draws the poster. I measure `allSafeAreaViolations()` over all seven before the create and adjust
frames, never `hideAt`, unless a preset genuinely cannot hold a line.

**Certificate.** Two compositions per family, each its own document: `master` is `PRESETS.cert_landscape`
(3508 × 2480 @300) or `cert_portrait` (2480 × 3508 @300); `background: { type:'solid', color:'{{brand.canvas}}' }`.
**Orientation is read from `document->'master'`, never a column** — `width >= height` means landscape, and three
places read those same two numbers: `orientationOf()` (the runtime), the `case` in `platform_template_library()`
(`0096`), and `siblingOrientation()` (`designer.ts:441`). `presetsForDocument()` returns exactly one preset for a
certificate, so a portrait certificate is a composition and never a derivation (`DEC-148`'s measurement: deriving
portrait from landscape left a 157 mm empty band).

| layer | kind | binding / literal | placement |
|---|---|---|---|
| `l_org` | `dynamic_field` | `org.name`, fallback «اسم المؤسسة» | top-start, display face 700, small, `align: 'start'` |
| `l_kind` | `text` | literal «شهادة حضور / تقديم / إنجاز» (§9.5) | under the wordmark, display face 700, small |
| `l_recipient` | `dynamic_field` | `recipient.name` — the frozen snapshot | large, display face **800**, `autoFit maxLines 2`, `align: 'start'` |
| `l_serial` | `dynamic_field` | `certificate.serial`, **locked** | bottom-start, `fgMuted`, `{anchor:'block-end', scale:'fixed'}` |
| `l_code` | `dynamic_field` | `certificate.verificationCode`, **locked** — `REQ-CRT-010` + A29 | beside the serial, same treatment |
| `l_qr` | `qr` | `certificate.verifyUrl`, `ecLevel 'Q'`, 320 × 320 (25 mm at 300 dpi), **locked** | bottom-end, `{anchor:'block-end', scale:'fixed'}` |

Dropped from the certificate: `l_logo`, `l_rule` + three nodes, `l_signature`, `l_reason`, `l_issued` (§9.5, §9.11).
`dynamic_fields` therefore loses `brand.logoAssetId`, `certificate.achievementName`, `certificate.issuedAt`,
`session.title` — wave 23's الحقول panel will list them as **unused**, which is the panel working.

---

### 5 · The goldens — which move, and why each

**I run `node scripts/parity/harness.mjs --update` and hand the diff over. I never commit `scripts/parity/goldens/**`
(contract 4).**

**Moves — `scripts/parity/goldens/backgrounds/gradient-rtl.png` and `record.json`, for two independent reasons:**

1. **The palette moved** (PR A, the lead's): the case binds `{{brand.surface}}` and `{{brand.canvasRaise}}`, whose
   dark values went `#111a2c → #151724` and `#1d2a42 → #1e2130`. That re-baseline is the lead's in A, before I touch
   anything.
2. **The subject changes** (PR B, mine): `posterGradient()` (`backgrounds.mjs:46-50`) reads **the poster's own
   background out of `BASELINE_LIBRARY`** and **throws** — «no poster in the library declares a gradient» — when none
   does. A flat ground makes it throw and the whole background block fails hard. So `backgrounds.mjs` (mine:
   `scripts/parity/**` minus `goldens/`) changes: a `solid-rtl` case asserts the rebuilt poster's flat ground reaches
   Chromium's computed style as exactly the palette's `canvas` (no fallback to white — the trap `render.ts` held
   open); the **LTR mirror case keeps a gradient fixture of the harness's own**, so `backgroundCss()`'s `360 − angle`
   stays a pixel fact even with no gradient in the library; `ink-on-dark` keeps its subject, because a flat
   `{{brand.canvas}}` page is still blank and the blank-capture probe still has to say so.

**Does not move, and if one does it is a bug:** the seven `goldens/*.png`, the seven `goldens/slide_pages/*.png`, and
**every geometry number in `goldens/signature.json`**. The seven shaping cases are built by `paths.mjs:buildDocument()`
on a **white solid** background in **IBM Plex Sans Arabic** at fixed sizes (`cases.mjs:87-88`); they read neither the
library nor `platformBrand()`. ★ `signature.json` **is** modified in the working tree right now (PR A, the lead's), but
reading the diff: every number is identical — 168.81, 88.05, 482.45, 497.61, the five `long-word-break` widths — and
only the probe's SHAPE changed (`distinctFromFallback` → `faceLoaded` + `coverageAdvances`). **So the shaping has not
moved, and nothing in my wave may move a number in it.** `tests/unit/gradient-render.test.ts` likewise builds its own
documents and does not move.

★ The lead's PR A has already re-baselined `goldens/backgrounds/gradient-rtl.png` in this tree (53,533 → 39,817 bytes),
which is reason 1 above landing exactly as expected.

**And one pinned artefact that is not a golden but behaves like one.**
`tests/unit/designer-derive-untouched.test.ts` holds 48 hashes of `derive()` + `renderDocumentToHtml()`.
**41 of them move** — 5 posters × 7 presets = 35, plus 6 certificates × 1 preset = 6 — because those documents are
rebuilt on purpose. **The 7 `uploaded/*` hashes must NOT move**: they come from a self-built fixture with no brand
token, and they are what still proves the derive/render engine is untouched. The file's own header says a changed
hash «is a bug to report, never a hash to refresh», so **I compute the new table, hand the before/after to the lead,
and the lead commits it beside the goldens with `DEC-242` §4's narrow suspension cited in the commit.** I do not
refresh it on my own.

---

### 6 · How `REQ-DSG-026`'s roster count stays at five and three

Measured, not argued: `tests/rls/templates-roster.test.ts:62-74`'s `platformRows()` already filters
**`t.retired_at is null`**. So a retired row leaves the count, and `roster.rows` (11), `roster.variants` (22) and
`roster.defaults` are unchanged whichever branch each row takes. `buildLibrary()` gains one line — the new seed,
through the same `migration(suffix, proposed)` helper — which is a **selector** change.

The new seed is **idempotent on the live row**, which is `0061`'s pattern with one necessary refinement: the guard
must be `where scope = 'platform' and purpose = … and family = … and retired_at is null` (plus, for the certificates,
the portrait master test `0098` already uses). Without `retired_at is null` a re-run would find the **retired** old
row and skip the insert — and worse, the portrait lookup («the non-default platform row of that family») would match
a retired landscape row. That is the one trap in this file and it is why the guard reads three conditions, not two.

`REQ-DSG-026`'s acceptance also asks for **22 renderable variants** — eleven rows each resolving every colour it
names in both schemes. Every colour in my table is a `brand.*` token, so all 22 resolve. ★ If §9.2 is settled by
admitting a non-`brand.*` binding, **`roster.variants` fails** — that is a consequence the ruling has to carry.

---

### 7 · ★★ The hardest demonstrable — a certificate issued BEFORE the wave, still rendering as its own version

**What actually protects it, in three measured parts.**

1. **The pinned version is still the one resolved.** `certificates.template_version_id` is `not null` and
   `on delete restrict`, and `certificate_render_context()` joins `design_template_versions v on v.id =
   c.template_version_id` (`0065:278`) — the **old** document, which `0193` either leaves in place (the row retired)
   or never had reason to touch. The scheme (`certificates.scheme`), the font hashes and
   `recipient_name_snapshot` are pinned on the same row.
2. **The already-rendered PDF is not touched at all.** `export_artifacts` is `unique (document_id, preset, format,
   source_fingerprint)` and the brand is composed into the bindings **before** the fingerprint
   (`regenerate_poster.ts:111-120`, `issue_certificates.ts:109`, `fingerprint.ts`'s `bindings` field). So the palette
   move makes any future render a **new** artifact row at a new path rather than an overwrite, and nothing enqueues
   a re-render: no trigger on `design_template_versions`, and `0071`'s regeneration fan-out fires on
   `save_brand_kit()`, which `0192` does not call. §9.12 is the flip side of this.
3. **A re-render of the pinned version is byte-identical at a fixed brand, and differs only by the palette.** That is
   `DEC-176`'s sentence verbatim — «an org's own untouched document renders identically, with the new values, because
   that is what moving a default means» — and the self-invalidating fingerprint (`REQ-DSG-013`) is what makes it safe
   rather than stale.

**Named tests, both new, both mine:**

- `tests/rls/designer-baseline-supersede.test.ts` — inside a rolled-back transaction: build the pre-wave library
  (`0061` + `0094` + `0098`), issue a certificate through `issue_certificate()` so it pins a **platform** version,
  then apply the proposed seed and the supersede. Assert: (a) the delete was **refused** and the row carries
  `retired_at`; (b) `certificates.template_version_id` is **unchanged**; (c) `certificate_render_context()` returns a
  `template_document` that deep-equals the **pre-wave** document, byte for byte; (d) the same for a poster through
  `design_documents` on the `talk` row; (e) the other rows **deleted**, with the function reporting `('deleted',
  null)`; (f) issuance after the wave resolves the **new** row, never the retired one.
- `tests/unit/designer-reissue-pinned.test.ts` — the pre-wave certificate document (read out of `0098`'s SQL, as
  `designer-library.test.ts` already parses it) rendered twice through `renderDocumentToHtml()` with
  `resolveBrand({}, 'light')`: byte-equal. Then the same document fingerprinted under the old and the new palette:
  **different**, which is the proof the cache cannot serve a stale artifact.

The migration's own per-row report (§2) is the third demonstrable, and the poster and certificate exported from the
rebuilt baseline — opened at their own size beside the thumbnails — are the first.

---

### 8 · Evidence — every assertion I expect to move, and whether it is a selector or an expectation

| file · case | what moves | kind |
|---|---|---|
| `tests/unit/designer-library.test.ts:70-82` «every poster family's background is `DEC-127`'s gradient» | a solid `{{brand.*}}` ground per colourway; the case is renamed to the ground | **expectation** |
| `:276` «the tasks strip is the workshop family's» | `l_tasks` is gone from every family | **expectation** |
| `:282-284` `hideAt` on `l_where` / `l_tasks` | both layers are gone | **expectation** |
| `:187-191` «the only image layer anywhere is the org logo» | becomes vacuous; I keep it and add «the baseline carries no image layer at all» | **expectation** |
| `:95-101` «every text frame is at least one line tall at its size» | recomputed by construction — must pass unchanged | no change |
| `:300-333` the seed-vs-library deep-equal | `bodies` gains the new seed file (**selector**); `latest` must prefer the **newest file** rather than the highest version number, because the new rows start at version 1 while the old sat at 2; `t.version` is 1 for all eleven (**expectation**) | **both** |
| `tests/unit/designer-derive-untouched.test.ts` | 41 of 48 pinned hashes; the 7 `uploaded/*` must not move | **pinned artefact — lead-reviewed, not refreshed by me** |
| `tests/rls/templates-roster.test.ts:39-48` `buildLibrary()` | runs the new seed | **selector** |
| `:78-104` `roster.rows` | nothing — 11, `retired_at is null` | no change |
| `:107-123` `roster.variants` | nothing — 22, **provided §9.2 keeps every colour a `brand.*` token** | no change |
| `:126-139` `roster.poster_gradient` | gradient → solid; `version` 2 → 1; renamed `roster.poster_ground` | **expectation** |
| `:141-157` `roster.defaults` | nothing — the eleven names and the `is_default` pattern are unchanged | no change |
| `:159-186` `roster.idempotent` | `{templates:"11", versions:"19"}` → `{templates:"11", versions:"11"}` in the cleared world, and the version-1 `md5` changes | **expectation** |
| `scripts/parity/backgrounds.mjs` | `posterGradient()` and `BACKGROUND_CASES` (§5) | mine, not a test |
| `tests/unit/{gradient-render,designer-presets,designer-render,designer-qr,designer-fields,designer-model}.test.ts` | nothing — all fixture-built | no change |
| `tests/rls/{designer-schema,templates-guard,templates-audit,certificates-designs,certificates-reissue}.test.ts` | nothing — all fixture-built | no change |
| new: `tests/rls/designer-baseline-supersede.test.ts`, `tests/unit/designer-reissue-pinned.test.ts` | — | **new files** |
| new cases in `tests/unit/designer-model.test.ts` for `weight` 700 and 800 | — | **additive** |

Each line that moves is a ledger row in `STATUS.md`, in the same commit (`DEC-242`'s rule; I tell the lead).
Nothing of the studio's chrome, the state machine, `canvas.tsx`'s engine or `ui/`'s files is touched: **no screen is
rebuilt and `DEC-208` does not apply** — this wave changes documents.

---

### 9 · Disagreements and questions — written with the file and the line; I pick no side

**9.1 `{التصنيف}` is a binding that does not exist.** `AdminTemplates.dc.html` draws the pill's content as
`{التصنيف}` — the *category*, which is `categories` in the product (التصنيفات والوسوم on the rail) — in the same
brace notation as `{العنوان}`, `{المُقدِّم}` and `{التاريخ}`, all of which **are** bindings. But
`resolveSessionBindings()` (`session-bindings.ts`) produces no `session.category`, and `library.ts:159-161` says so
in words: «A literal, because the family IS the kicker. Not a binding: there is nothing in the session row that says
"ورشة"». Adding one is a DAL read, a value in `poster_render_context()` (`0063`) and in
`regenerate_poster.ts` — new scope and a migration. ★ **And it has a structural consequence either way:** with a
literal the five poster documents differ by that literal and `designer-library.test.ts:48-50`'s «eleven **distinct**
documents» holds; with a binding **all five become byte-identical** and that assertion fails, taking `DEC-148`'s
reasoning («two identical documents should not be two rows») with it. **I plan the literal and ask.**

**9.2 ★★ The team colour cannot reach a template, and three of the five poster cards need it.** `DEC-242` §2 says the
colourway «reaches the poster the way `DEC-186` §2 established — as `--team` on the element, from
`companies.team_color`», and `REQ-DSG-033`'s acceptance says «a `brand.*` binding **or the team colour**». Measured,
four ways, all negative:
- `0094:103` requires every colour to match `^\{\{\s*brand\.[A-Za-z]+\s*\}\}$`, so `{{session.teamColor}}` is
  **refused by the database**;
- `brandViolations()` (`library.ts`) and `roster.variants` (`templates-roster.test.ts:107-123`) hold the same shape in
  TypeScript;
- `grep -rn team packages/designer-runtime/src worker/src/render` returns **nothing** — no binding, no render-context
  field, nothing in `poster_render_context()` or `export_render_context()`;
- `--team on the element` is a CSS custom property on a themed DOM scope (`DEC-186` §2); a poster is composed by the
  runtime from a document whose colours the guard walks, and `resolveColour()` has no third case.
So the team colourway needs **either** the guard's allowlist widened plus the two TypeScript checks plus a new
binding plus two render contexts (a migration and new scope), **or** a new brand token (§2 forbids it). ★ **A
fallback I can ship with no new mechanism, if the lead rules it:** five distinct colourways from the ten tokens —
ink (`canvas`), paper (`fgHeading`, inverted, §3), surface (`surface`), surface-2 (`canvasRaise`) and **lime**
(`node` as the ground with `canvas` text, 16:1 by `01-tokens.md`). Five grounds, five families, zero new mechanism —
but three of them are near-identical darks, which is probably not what the thumbnails mean.

**9.3 Cyan and violet are team colours, not platform accents.** `DEC-242` §1's colourway row calls `#35D0FF` and
`#9B7CFF` «a platform accent (cyan, violet)». `docs/design/01-tokens.md:59` and `:61` name them
`--color-team-cyan` (مواهب) and `--color-team-violet` (أيك) — **team colours**, which §2 says never become brand
tokens. So the artboard's «لقاء» and «إعلان» cards are **the same colourway as card 1** with a different company's
colour, not two more colourways. That reading is what makes §9.2 the only open colour question.

**9.4 The certificate ground is drawn in the dark leg's bone, not the light leg's paper.** The thumbnails paint
`#F4F1EA` (`--color-bone`) on `#0B0C12`; the light `canvas` is `#F6F3EC` (`--color-paper`) and `fgHeading` is
`#12131A`. Two units per channel — the same paper to the eye. **I bind `{{brand.canvas}}` and render `#f6f3ec`.** If
the owner wants the bone tone exactly, that is a palette change and the lead's.

**9.5 The certificate thumbnail does not say what it certifies — and without a kind line the six rows collapse.**
`DEC-242` §1 and `REQ-CRT-016` list four elements: wordmark, name, serial, QR. `library.ts`'s `l_kind` is the only
layer that prints «شهادة حضور». Drop it and `attendance@landscape` and `presenter@landscape` become **byte-identical
documents**, which `designer-library.test.ts:48-50` refuses and `DEC-148`'s own reasoning refuses. **I keep `l_kind`,
small, in the display face, under the wordmark — and write the disagreement here rather than deciding it.**
Alongside it I follow the thumbnails and **drop `l_reason`** (the session title / achievement name) and
**`l_issued`** (the date), which no `REQ-CRT-*` requires; the consequence is that an achievement certificate no
longer names the achievement and no certificate carries its date. **That is the lead's to confirm.** `l_code` stays
regardless: `REQ-CRT-010` requires the serial **and** the verification code printed as text beside the QR (A29).

**9.6 No radius in the model, and a new field is not safe this wave.** The artboard's pill is
`border-radius: 999px` and its QR square `4px`. `ShapeLayer.shape` is `{ type, fill, stroke, strokeWidth }` —
`model.ts`, no radius. ★ Adding one changes a rendered byte, which by `DEC-178`'s D2b precedent needs a
`schemaVersion` bump, and a bumped document is **refused** by `main`'s worker (`schema_version_future`) for the whole
window between the owner's push and the merge — every poster render would fail. **So: no new field.** I compose the
pill as a stadium from `ellipse` + `rect` + `ellipse` at `BASE_SCHEMA_VERSION`, behind the text. **Question:** is a
three-shape stadium acceptable, or should the category be plain bold text in the accent colour with no pill? The
QR's 4 px radius I simply do not build — a QR's quiet zone stays square and white (`REQ-CRT-010`).

**9.7 The weights the thumbnails need are not all in the model, and one is not in the font set.** The title and the
member's name are **Baloo Bhaijaan 2 800**; the presenter, date and serial are `font-weight: 700` in the body face.
`FontSpec.weight` is typed `400 | 500 | 600` (`model.ts`) and `validate.ts:95-96` refuses anything else — both files
are mine, the widening to `700 | 800` is additive, and it changes no rendered byte for an existing document because
`render.ts:137` passes the weight straight through. But `packages/fonts/manifest.json` has **Baloo Bhaijaan 2 at 700
and 800** and **IBM Plex Sans Arabic at 400/500/600 only** — there is no body face at 700. **I propose Baloo
Bhaijaan 2 700** for the small bold lines, which keeps the artefact in one face plus nothing new; `packages/fonts/**`
is lead-only and nothing is added to it.

**9.8 `<bdi dir="ltr">` on the serial is half-buildable.** `REQ-CRT-016` and my agent file ask for it.
`render.ts:145` already wraps **every** text and dynamic-field value in `<bdi>`, and the numerals are Western
(`DEC-124`), so the serial is isolated today. A `dir="ltr"` attribute would need a new model field — §9.6's problem.
**So: `<bdi>`, yes, already; `dir="ltr"`, not without a schema bump.** Reported, not worked around.

**9.9 `REQ-DSG-026` still mandates what `REQ-DSG-033` and `REQ-CRT-016` replace.** `01-prd.md`'s `REQ-DSG-026` says,
verbatim: «Posters render on a **GRADIENT** background» (`DEC-125`, `DEC-127`), «**ورشة** (workshop, **with a tasks
strip**)», certificates in «**formal Naskh**», and «The visual language is the **Knowledge Network** — dots, thin
lines, light». The thumbnails and `REQ-DSG-033`/`REQ-CRT-016` replace all four, and **neither new requirement says
`REQ-DSG-026` is amended.** `01-prd.md` is lead-only; the lead amends it or rules.

**9.10 `REQ-DSG-034`'s first acceptance bullet is false of the function it names, by that function's own design.**
«No superseded row appears in `platform_template_library()`» — but `0096` returns **every** platform row with its
`retired_at` and a `retirable` flag, precisely so SCR-083 can retire and restore. The substance holds everywhere a
teammate can reach: `055`'s platform section filters `retired_at === null` (`templates.ts:185`), `045`'s picker does
(`certificates.ts:329`), `designer.ts:449` does, and all three issuance paths do (`0127:266`, `0066:84`,
`0063:118`). SCR-083 is `/app/platform/**` — **never-touch this wave**, so I change nothing and report it.

**9.11 The org logo leaves every baseline artefact.** The thumbnails draw no logo on the poster and a **text**
wordmark on the certificate. So `brand.logoAssetId` appears in no baseline document, `06 §8.3`'s «replacing the logo
updates every template at once» has no subject, and `REQ-DSG-019`'s «the org logo must be supplied at a resolution
that clears A3» guards nothing until an org adds an image layer of its own. An org that uploaded a logo would find
it on nothing the platform ships. Written down, not decided.

**9.12 Nothing re-renders, so every already-exported poster keeps the old design.** §7.2 is why that is safe; it is
also why the goal «an admin exports a poster and gets the new design» is only true at the **next** regeneration. The
mechanism to close it exists and is not mine to invoke unasked: `0071`'s loop enqueues `regenerate_poster` once per
org session with a **live** poster under `11` §2.5's key `poster:{session_id}`, skipping `detached` ones by
`REQ-DSG-003`, and renders are serial in the `render` queue. **Is a one-off fan-out in `0193` in scope?** `DEC-242`
§4 does not mention it. The lead's call.

**9.13 Two housekeeping notes.** (a) `packages/designer-runtime/scripts/seed-sql.mjs` is the generator that writes
the seed from `library.ts`, and it is **not in my wave-24 edit list** (which names `packages/designer-runtime/src/**`
only). It must learn to emit new rows plus the supersede loop rather than «add a version to the existing row» —
**a written request to the lead.** (b) `STATUS.md`'s wave-23 PR-B and PR-C rows say the designer rebuild and the
email builder are «wave 24's», while `DEC-240`/`DEC-241` record M12 complete and accepted and `DEC-242`'s map
contains neither; all six wave-23 primitives are on disk. A documentation observation only.

---

### 10 · The order I will work in, once both posts are up

1. **`library.ts` rebuilt** — the eleven documents, `BASE_SCHEMA_VERSION`, every colour a token; `model.ts` and
   `validate.ts` widened to `700 | 800`. `npm test` over `designer-library`, `designer-model`, `designer-presets`.
2. **`allSafeAreaViolations()` measured** over all seven poster presets and both certificate compositions; frames
   adjusted until it is empty. No `hideAt` unless a preset genuinely cannot hold a line.
3. **The seed generated** into `supabase/proposed/designer/0005_playground_library.sql`, with the three-condition
   idempotency guard (§6), plus `0006_supersede_baseline.sql` (§2). `tests/rls/{templates-roster,designer-baseline-supersede}`.
4. **`backgrounds.mjs`** re-pointed (§5); `--update` run; the diff handed over with the before/after images named.
5. **`designer-derive-untouched`'s 41 hashes** computed and handed over as a table; the 7 `uploaded/*` unchanged.
6. **The two new tests** (§7) and the ledger lines for §8.
7. **Captures** at `.qa-shots/rtl/wave24-designer-<artefact>-<state>-1280.png`, honouring `E2E_SHOTS_DIR`, plus each
   render opened **at its own size** — a poster and a certificate are printed artefacts, not screens.
8. `npx tsc --noEmit`, `npm run lint` (grepped for `problems`), `npm test`, `npm run test:rls` (single runner), one
   e2e through the gate lock. `npm run qa`, `npm run visual`, `npm run build`, `db reset`, worktrees and pushes stay
   the lead's.

---

## Wave 23 — slice 3b (2026-10-03) — the certificate canvas and the four-format demonstrable

- **One page per certificate** (DEC-148, DEC-238 §3): the strip shows the composition's one preset; its other
  orientation, when the org's library has it (same family, the other master), is a button that opens that template's
  draft through `templates.ts`'s `openTemplateDraft()` (`openSiblingTemplate`, the designer route's action).
- **الحقول** from `fields.ts`: used / unused from the document; `{المستوى}` = `certificate.achievementName`, achievement
  only; `{رمز التحقق QR}` = a QR on `certificate.verifyUrl`, the URL the resolver builds. **No new binding** (§3.3): the
  board's {نوع الشهادة}, {تاريخ الجلسة}, {نص الشهادة} and {التوقيع} are not fields (D-3).
- **C4**: `getLongestSamples()` (the org's longest session title and longest active member's name, through RLS) feeds
  `useCheckFindings`' new `samples`; a layer bound to one is measured with it at its own max lines on every preset —
  the `longest` finding names the layer and the field. The contrast check of the plan is not built in 3b.
- **C5** «معاينة بعضو»: URL state (`?member=`, and `?session=` for a session kind); if the member holds an issued
  certificate of the kind, its own row binds (real serial, code, QR); otherwise only the name and the title, the rest
  left as placeholders. `previewBindings` reach the canvas and the checks only — the page's fingerprint uses the saved
  document's own bindings, and the certificate spec asserts a preview writes no `export_artifacts` row.
- **The demonstrable**: `wave23-designer-four-formats.spec.ts` (`E2E_WORKER=1`) — the platform `talk` poster, untouched,
  with every rendered input fixed (org name, session id, title, venue, time), all 12 artifacts `ready`, a SHA-256 per
  artifact (a PDF's dates and id blanked first) written to `wave23-designer-four-formats.json` for the lead to compare
  between `main`'s head and B's.

---

## Wave 23 — slice 3a (2026-10-03) — the editor chrome deleted and rebuilt; the table, written before the create

Deleted: `editor.tsx`, `inspector.tsx`, `inspector-section.tsx`, `variant-strip.tsx`, `admin/designer/[documentId]/page.tsx`.
Created back to back, from `AdminDesigner.dc.html` and `AdminDesignerElements.dc.html`, over `editor-state.ts` (slice 1).
**The behaviour tables are §W23.2 of the plan below — `editor.tsx`, `inspector.tsx`, `inspector-section.tsx`,
`variant-strip.tsx`, `page.tsx` — each row re-read against the new files after the create.** What 3a decides beyond them:

| Decision | Where | Kept by / ruled |
|---|---|---|
| The bar: back (the owner of the document), the name as the page's `h1`, the save state and the badges, ↶ ↷, the strip of **all seven** presets with the 4:5 master first and a dot per flagged preset, the zoom, «معاينة بجلسة», «صدّر» (a sheet: «اطلب التصدير», the queue, the worker's thumbnails), and «انشر» beside it on a template draft whose document differs from its last published version | `editor.tsx` (`Bar`) | `DEC-238` §3 (seven presets), D-1, D-13 |
| The rail's items: العناصر · الحقول · الملفات · الهوية · الطبقات · الفحوصات (count = rows listed) · الطبقة (only with one selection); its tablist keeps the name «لوحات المحرّر» | `editor.tsx` over `ui/editor-rail` | `DEC-NEXT-36`, `REQ-DSG-029` |
| العناصر: عنوان · نص · مستطيل · دائرة · خط · رمز QR · شعار الشركة, and four text styles — **a tap adds and arms «ضع بنقرة»**; no objects or stickers tabs | `panels.tsx` | `DEC-093`, `DEC-238` §3 |
| الحقول: the registry's fields for the purpose, «مستخدم» / «—», a tap adds the bound field or QR; the bound values (`BindingsPanel`) beneath | `panels.tsx` | `REQ-DSG-006`, `DEC-093` |
| الملفات: «أضف صورة» (`AddImage`, the one upload flow, never SVG) and the org's images — a tap adds an image layer at its proportion | `panels.tsx` | `DEC-009`, `DEC-093` |
| الهوية: the brand colour tokens by name — a tap applies one to the selected layer's colour or fill — the faces, the logo | `panels.tsx` | `REQ-DSG-021`; team colours not offered (D-12) |
| الطبقة: `Inspector` at its old path with its old props; tabs النص · الموضع · التأثيرات (a shape الشكل, an image الصورة, a QR الرمز); «الموضع والحجم» closed and never removed; the region «الخصائص» around it | `inspector.tsx` | `DEC-093`, `REQ-DSG-028` |
| The floating toolbar's five: font · size · colour · alignment · «{ } ربط» (opens النص); ↔ «املأ عرضًا»; offset clears the rotation knob; hidden during a gesture | `editor.tsx` over `ui/floating-toolbar` | `M12.md`, D-7 |
| Below `xl`: view and approve | `editor.tsx` | `09` SCR-057 (D-8) |

**Selector moves in my e2e specs (expectations unchanged), for `STATUS.md`'s ledger:** the tab «الخصائص» → «الطبقة»;
the align, order and transform buttons sit under the الموضع tab; «اطلب التصدير» sits in the «صدّر» sheet; the variant
strip's buttons are named by the preset's short name. Specs: `wave8-designer-editor`, `wave13-designer-studio-taps`;
`inspector-align.test.tsx` opens الموضع first.

---

## Wave 23 — slice 2 (2026-10-03) — `layer-list.tsx` deleted; its kept-behaviour table, read against the new files

Written before the create. `src/components/designer/layer-list.tsx` (201) is deleted; its rows become `ui/layer-list`
(no runtime import — the caller hands it the order and the words) and its panel chrome `designer/layers-panel.tsx`,
which keeps the old `LayerListProps` so `editor.tsx` swaps one import until slice 3 rebuilds the chrome.

| Behaviour (old file) | Where it lives now | Kept by |
|---|---|---|
| Front of the stack first — `paintOrder()` reversed (`:69`) | `layers-panel.tsx` builds `items` | `06` §10 |
| A locked layer listed with «مقفلة»; a hidden one «مخفية» (`:143-152`) | `ui/layer-list` (the words from `designer.layers`) | `REQ-DSG-024` |
| ▲▼ named «طبقة إلى الأمام/الخلف», `aria-describedby` the row's name, disabled at the ends (`:156-177`) | `ui/layer-list` `onMove` | `DEC-093` path 2 |
| Hide/show, disabled for a locked row (`:182-192`) | `ui/layer-list` `onToggleHidden`; ★ for a viewer who cannot edit it is now absent rather than disabled, like ▲▼ already were | `REQ-DSG-024` |
| A tap selects; shift or «تحديد متعدّد» adds and removes (`:137`) | `ui/layer-list` `multi` | `DEC-093` path 5, `DEC-178` |
| «تحديد متعدّد» toggle and «N طبقات محدّدة» as a status (`:101-113`) | `layers-panel.tsx` | `DEC-178` |
| «اختر كل طبقات: …» per visible kind (`:114-122`) | `layers-panel.tsx` | `DEC-093` path 5 |
| The count and the order hint (`:92-95`); «لا طبقات» when empty (`:126-127`) | `layers-panel.tsx` / `ui/layer-list` `labels.empty` | — |
| «أضف» — text, shape, logo, and «أضف صورة» through `AddImage` (`:75-90`) | `layers-panel.tsx` until slice 3 moves it to العناصر / الملفات | `DEC-178` (D1b) |
| 44 px rows (`:137`) | `ui/layer-list` | SC 2.5.8 |
| — new — drag to reorder, beside ▲▼ only | `ui/layer-list` `onReorder` (wired in slice 3) | `DEC-093` path 2 (the enhancement) |

**`canvas.tsx`'s frame, moved in the same slice** (`DEC-237` §3): the fit (`:216-230`) is `ui/canvas-stage`'s; the
wrapper, the size · zoom line and the scrolling host are gone (the editor shows size and zoom beside the canvas until
slice 3's bar); the placing note is the editor's; the coordinates `role="status"` stays, as a chip inside the canvas's
box. Add-only props: `scale` (default `0.4`), `snapping` (default `true`), `onGestureChange`. `canvas-overlay.test.tsx`
and `wave13-console-parity.test.tsx` untouched.

---

## Wave 23 — 2026-10-03 — the plan, PR B `wave-23b/the-designer` (planning only; nothing is deleted or built until the lead posts «the plans are approved»)

Read at `8a43de20` in the main checkout: `STATUS.md`'s wave-23 block, `CLAUDE.md`'s wave-23 map, `DEC-235` – `DEC-237`
in full, the brief, `M12.md`, `06` in full, `DEC-093`, `DEC-096`, `DEC-148`, `DEC-176`, `DEC-178`, `DEC-017`, the
lead's day-one note (`lead-wave23.md`), the three artboards beside their PNGs, every file in `src/components/designer/`,
`src/app/[locale]/app/admin/designer/**`, `src/lib/dal/designer.ts`, the runtime's `model.ts`, `presets.ts`,
`compose.ts`, `library.ts`, `session-bindings.ts`, `fingerprint.ts`, the parity harness, and the suites that pin the
studio (`tests/components/designer/*`, `tests/e2e/wave{8,13}-designer-*`).

★ **The goal I am judged on, in the owner's words: an admin designs in it without a designer.** One template, every
format, on one strip; the checks say what is wrong before export, naming the layer; every drag has a tap; an untouched
document exports identically. «The gates are green» is not the measure — the acceptance is the owner's, at 1280.

### W23.0 — what I measured that the brief and the spec did not say

1. **`canvas.tsx` already holds the seam's two halves in one file, and the frame is small.** Of 744 lines, the outer
   frame is **24**: the fit-to-container effect (`:216-230`), the wrapper and the size · zoom readout (`:459-474`, the
   coordinates readout excepted), the scrolling host (`:476`) and the placing note (`:637`). Everything else — the
   iframe of the one renderer, the overlay, five gestures, the handles, the focal dot, the safe-area/bleed guides and
   `sourceShift` — is engine and stays (§W23.1).
2. **`editor.tsx`'s state machine is ~520 of its 887 lines** (`:107-122`, `:141-598`, `:633-637`, `:684-688`). There is
   **no component test of `DesignerEditor`**: its behaviour is pinned only by four e2e specs. So the move commit is
   proven by those specs **and** by a new hook test written in the same commit (§W23.1.2).
3. **`inspector.tsx` (692) computes very little** — the clamps, the background switch, the token ↔ binding mapping, the
   focal grid's tolerance — about 40 lines. Two suites import `Inspector` and its op types by path
   (`inspector-align.test.tsx`, `wave13-console-parity.test.tsx`), so **the rebuilt file keeps the path, the export name
   and the required props**: the suites then need only selector moves, each a ledger line (§W23.2).
4. **The poster strip has SEVEN presets, not four.** `POSTER_PRESETS` is `master` (4:5, the source), `square`, `story`
   (9:16), `landscape` (16:9), `og`, `a4`, `a3` (`presets.ts:99`, `REQ-DSG-009`: «every listed variant»). The artboard
   draws 16:9 · A4 · A3 · 9:16 and **no 4:5 — the only preset that can be edited** (D-1).
5. ★★ **A certificate has ONE preset, by ruling.** `presetsForDocument()` returns `cert_landscape` **or**
   `cert_portrait` (`presets.ts:115`): «a portrait certificate is a portrait composition, chosen at issue time, and never
   a derivation» (`DEC-148`, `REQ-DSG-026`: «an orientation is a composition, so it is a row»). There is **no A3
   certificate preset** at all. `REQ-UIX-111` and the board draw A4 أفقي · A4 عمودي · A3 أفقي on one strip (D-2,
   **blocking**).
6. **Four of the board's ten certificate fields are not bindings.** The runtime resolves `recipient.name`,
   `session.title`, `certificate.serial`, `certificate.issuedAt`, `certificate.verifyUrl`, `certificate.verificationCode`,
   `certificate.achievementName`, `org.name` (`session-bindings.ts:213-226`). {نوع الشهادة} and {نص الشهادة} are
   **literal text layers** in every seeded certificate (`library.ts:359`), {التوقيع} is a **locked shape** («موضع
   التوقيع», `:448`), and {تاريخ الجلسة} is **resolved nowhere on the certificate path** (`certificate_render_context()`
   returns no session date). And the board **omits {رمز التحقّق النصّي}**, which `REQ-CRT-010` requires beside the QR
   (D-3).
7. ★ **Adding a binding to a resolver re-renders every poster in every org.** `resolveSessionBindings()` returns every
   key it can, and the whole record is hashed into `source_fingerprint` (`fingerprint.ts:66`). A new `session.category`
   key would change the fingerprint of every live poster — no golden moves, but every cached artifact is invalidated and
   regenerated. So **no new binding is added this wave** without the lead's ruling (D-4); {التصنيف} on the poster board is
   one.
8. **The design-panel on `045` imports a file `console` is deleting.** `src/components/certificates/design-panel.tsx`
   (mine) imports `TemplatePreview` from `template-preview.tsx` (one of the library's four files, `console`'s to delete
   this wave). Whichever lands first breaks the other's build (Q-4).
9. **`lead-wave23.md` landed while I planned** (`8a43de20`); §W23.4 answers it.

---

### W23.1 — ★★ the seam, file by file and by line range

**The rule I am applying** (`DEC-235` §2, `DEC-237` §2 – §3): an engine file is edited only where the chrome's contract
forces it, add-only where it can be, and **its existing suite passes untouched**; logic living in a chrome file is
**moved verbatim, in its own commit, before the delete**; the chrome is deleted, then written from the artboard.

#### W23.1.1 — `canvas.tsx` (744) — ENGINE, kept; its outer frame moves to `ui/canvas-stage`

| Lines | What | Fate |
|---|---|---|
| `:1-158` | header (DEC-017, DEC-096 exemption), props, constants, gesture/preview types, handle table | **kept** |
| `:159-214` | state, refs, the `previewRef` timing fix, `renderDocumentToHtml()` into `srcDoc` | **kept** |
| `:216-230` | fit to the container (`ResizeObserver` → `scale`) | **→ `canvas-stage`** — the stage fits and zooms; `DesignerCanvas` gains `scale?: number` (add-only, defaulting to today's `0.4`, which is exactly what `canvas-overlay.test.tsx` relies on — its stub keeps the initial `0.4`) |
| `:232-458` | geometry, `docPoint`, `paintTransient`, five gestures, keyboard, tap-to-place, `frameFor` | **kept** |
| `:460` | the `flex-col gap-3` wrapper | **→ stage** (the canvas root becomes the sized `relative` box, `:477`) |
| `:461-474` | «المقاس · التكبير» readout | size and zoom **→ the bar** (zoom % is the bar's, as drawn: «62%»); ★ **the coordinates `role="status"` stays in `canvas.tsx`** — it is gesture feedback and the one place the chip reads like the inspector's fields (DEC-096), so it moves inside the box as an absolutely positioned chip, not out |
| `:476` | the `overflow-x-auto` host | **→ stage** (the stage scrolls) |
| `:477-635` | the sized box, the iframe (physical, DEC-096), safe-area/bleed guides, the hit area, layer buttons, handles, focal dot, guides, marquee | **kept** — the guides are document geometry per preset; the stage's «منطقة الأمان» toggle drives the existing `showOverlays` |
| `:637` | «انقر على اللوحة لتضع الطبقة» | **→ the editor** (said beside the armed button and in the stage's corner) |
| `:642-744` | `sourceShift`, `Handles`, `FocalDot` | **kept** |

**Add-only props** on `DesignerCanvasProps`, each defaulting to today's behaviour so the two suites that mount it
(`canvas-overlay.test.tsx`, `wave13-console-parity.test.tsx`) pass **untouched**:
- `scale?: number` — handed down by the stage.
- `snapping?: boolean` (default `true`) — the stage's «المحاذاة التلقائية»; `false` behaves as today's held `alt`.
- `onExternalDrop?: (point: { x: number; y: number }, payload: string) => void` — a native drop on the stage of a
  `application/x-kareem-layer` payload, as a **logical** point (the same conversion `onStageClickCapture` makes,
  `:446-447`). The enhancement for the three panel drags; never the path (§W23.3).
- `onGestureChange?: (active: boolean) => void` — so the floating toolbar steps aside while a layer moves.
- `onTextDoubleClick?: (layerId: string) => void` — opens النص with the text field focused (D-9).

**Suites that prove the seam:** `canvas-overlay.test.tsx` (13 cases: DEC-096 positions in all four console × document
pairs, tap/shift/multi selection, one hand-over per gesture, the release-before-render timing, marquee in RTL, nudge on
the visual axis, tap-to-place) and `wave13-console-parity.test.tsx` — **both untouched**, run at every commit of B.

#### W23.1.2 — `editor.tsx` (887) — CHROME, with its state machine MOVED first

**Commit 1 — the move, alone.** New `src/components/designer/editor-state.ts` (`useDesignerEditorState`), the code
**verbatim**, `editor.tsx` reduced to calling it and rendering exactly the chrome it renders today:

| `editor.tsx` lines | Moves as |
|---|---|
| `:107-122` | `SaveState`, `AUTOSAVE_DELAY_MS` (1200), `UNDO_STEPS` (50) |
| `:141-175` | document, selection (`selectedLayerIds`, `multi`, `placing`), `assets`, `save`, `past`/`burst`/`future`/`depth`, `presets`, `preset`, `overlays`, `fontsReady`, `baseUpdatedAt`, the timer and the abort controller — **not** `panel` (`:152`), which is chrome |
| `:181-221` | `isLocked` (template lock **or** the layer's own flag), `placeholderLabel` (the field's Arabic name, never its path — DEC-149 §4), `faceCss`, the explicit per-family font load before `fonts.ready` (DEC-024) |
| `:223-269` | `push` (the Route Handler PUT with `baseUpdatedAt`; 409 `locked_region` / 409 / 403 / 422 / error; an abort is the next keystroke's save) and the one toast per change of failure kind |
| `:271-334` | `mutate` (validate in the browser; one undo entry per gesture/burst; a new edit ends the redo branch; autosave after 1200 ms), `step`, ⌘/Ctrl-Z and ⇧⌘Z, unmount cleanup |
| `:336-547` | `patchLayer` (snapped in logical coordinates), `arrange`, `reorder`, `commit` (a no-op is not an undo step), `applyFrames`, `nudge` + `endBurst`, `groupArrange`, `transform`, `place`, `focal`, `select`, `marquee`, `add`, `addImage`, `duplicate`, `askDelete`/`confirmDelete`/`deleting`, `selectKind`, `toggleHidden` |
| `:549-598` | `selected`, `fallbacks`/`bindingLayerNames`, `fontFamilies`, `useCheckFindings`, `flagged`, `layerNames`, `goTo`, `selectOnCanvas`, `choosePreset` |
| `:633-637` | `shown = derive(document, preset)`, `sourcePreset`, `onSource`, `lockedIds`, `selection` |
| `:684-688` | `identify` → exported pure `identifyLayer(layer, kindLabel)` (the delete confirm names WHICH layer, REQ-UIX-013) |

**The only edits inside the moved code, named so the reviewer can check them** (`git show --color-moved=zebra` shows
everything else as moved, not changed): the four `setPanel("inspector")` calls (`:486`, `:503`, `:580`, `:590`) become
`options.onRevealLayer()`, because which panel opens is chrome; and the hook returns what it computed. Nothing else.

**Proof across commit 1:** `tsc`, `npm test` (the two designer component suites, the 25 designer, render, poster, QR, font and serial unit suites), and the
four e2e specs that pin the editor — `wave8-designer-editor`, `wave13-designer-studio-taps`, `wave13-designer-studio-drag`,
`wave13-designer-upload-render` — green on the commit before and on commit 1, unchanged. I run one through the gate
lock; the lead runs the others. **Plus a new `tests/components/designer/editor-state.test.tsx`** in the same commit,
over a harness component: fifty steps and no more; a nudge burst is one entry and a key release ends it; a gesture's
frames are one entry; a no-op is not an entry; a new edit clears redo; the PUT carries `baseUpdatedAt` and fires once
after 1200 ms of quiet; 409 `locked_region` / 409 / 403 / 422 map to their states and a toast per change of kind; a
locked layer refuses move/resize/hide/delete and allows the focal point. It runs again, unchanged, after the create.

**Commit 2 — delete** `editor.tsx`. **Commit 3 — create** `editor.tsx` from `AdminDesigner.dc.html` over the module.
**Never pushed unpaired.**

★ **One new behaviour goes into the module after the move, in its own commit**: `flush()` — save now, used before
«معاينة بجلسة» / «معاينة بعضو» navigate (§W23.5), so a preview never drops the last 1.2 s of work.

#### W23.1.3 — `inspector.tsx` (692) + `inspector-section.tsx` (41) — CHROME, its arithmetic MOVED first

**Commit 1 (with the editor's move, or its own):** new `src/components/designer/inspector-ops.ts`, verbatim:
`ArrangeOp`, `GroupOp`, `TransformOp` (`:50-59`); `token()` / `bind()` (`:88-89`); the frame patch with its clamps —
W and H ≥ 1, opacity 0 … 1 in 0.05 steps, font size ≥ 1 (`:132`, `:293`, `:395-400`); the background switch that keeps
the first stop / builds `{{brand.surface}} → {{brand.canvasRaise}}` at 140° (`:435-444`) and the stop patches
(`:458-463`); the angle 0 … 360, rounded (`:476`); `FOCAL_NAMES` and the 0.005 tolerance (`:579`, `:644`).
`inspector.tsx` re-exports the three types, so both suites import them unchanged.

**Then delete** `inspector.tsx` and `inspector-section.tsx`; **create** `inspector.tsx` — same path, same `Inspector`
export, same required props (`document, layer, locked, canEdit, fontFamilies, onPatchLayer, onArrange, onDocument`),
the optional wave-13 props unchanged — drawn as the الطبقة panel: tabs **النص · الموضع · التأثيرات** for text and a
field, **الصورة · الموضع** for an image, **الشكل · الموضع** for a shape, **الرمز · الموضع** for a QR; the document's
background when nothing is selected; the group section when two or more are. The disclosure that keeps «الموضع والحجم»
closed is re-written inside it (a real `<button>`, never `<summary>` — wave 3's lesson).

#### W23.1.4 — the other engine files — kept, and what each gives the chrome

| File | Fate | Suite that proves it |
|---|---|---|
| `checks-panel.tsx` (218) | kept; **add-only**: `CheckInputs.samples?` (binding → the org's longest value) and two finding kinds, `longest` and `contrast` (§W23.6); `groupFindings()` exported so the rail's count is the panel's rows | e2e `wave8-designer-editor` (the checks), new `wave23-designer-checks` |
| `bindings-panel.tsx` (70) | kept, composed under الحقول («used» fields with the value each resolved to) | `wave8-designer-editor` |
| `export-panel.tsx`, `export-action-button.tsx`, `export-reason.ts` | kept, composed in the «صدّر» sheet | `designer-export-reason.test.ts`, `wave8-designer-editor` |
| `add-image.tsx`, `upload-asset.ts` | kept, composed under الملفات («ارفع صورة») | `wave13-designer-upload-render` |
| `packages/designer-runtime/src/compose.ts` | **add-only**: `NewLayerKind` gains `'qr'`; `NewLayerOptions` gains `shape?: 'rect' \| 'ellipse' \| 'line'` and `qrBinding?` — العناصر's دائرة, خط, رمز QR | `designer-compose.test.ts` untouched + new cases in a new file |
| new `packages/designer-runtime/src/fields.ts` | the field registry (§W23.5) | new `tests/unit/designer-fields.test.ts` |

**Not touched, and the diff will show it:** `render.ts`, `presets.ts`, `autofit.ts`, `bindings.ts`,
`session-bindings.ts`, `fingerprint.ts`, `tier-a.ts`, `model.ts`, `validate.ts`, `qr.ts`, `focal.ts`, `geometry.ts`,
`arrange.ts`, `library.ts`, `worker/src/render/**`, every worker task, `scripts/parity/**`.

---

### W23.2 — kept-behaviour tables, one per rebuilt file (re-derived from the REQs and the DAL; read back against the new files after each create)

#### `editor.tsx` → the new `editor.tsx` over `editor-state.ts`

| Behaviour | Where it lives after | Kept by |
|---|---|---|
| One engine: no poster/certificate branch in the state; a certificate is a document whose purpose is `certificate` | `editor-state.ts` | `REQ-DSG-004`, D54 |
| Canvas is the one renderer's iframe with real bindings | `canvas.tsx` (untouched) | `DEC-017`, `REQ-DSG-006` |
| Faces by SHA-256 from `/api/fonts/<sha>`, declared in the page too so the checks measure what the export measures; each family loaded before `fonts.ready` | `editor-state.ts` | `REQ-DSG-016`, A39, `DEC-024` |
| Autosave through the Route Handler, 1200 ms, abort on the next edit, `baseUpdatedAt` refusing a stale save | `editor-state.ts` | `REQ-DSG-022`, `04` §4.2 |
| Save states — saving · saved («محفوظ») · conflict · forbidden · error · locked (names the layer) · invalid (names the path) — in the bar, a toast that stays for the three failures, `role="alert"` for locked/invalid | bar + `editor-state.ts` | `16` §7.3, `REQ-DSG-024` |
| Fifty-step document-level undo/redo; ⌘Z / ⇧⌘Z; buttons disabled at the ends | `editor-state.ts`, bar ↶ ↷ (accessible names «تراجع» / «إعادة») | `06` §10 |
| A gesture is one entry; a burst of arrows is one entry; no timer (`DEC-146`) | `editor-state.ts` | `REQ-DSG-028` (W13.1 R5) |
| Browser-side `validateDocument` before a write | `editor-state.ts` | `REQ-DSG-005` |
| Locked = the template's lock **or** the layer's own flag; move/resize/hide/delete refused, order and focal allowed | `editor-state.ts` | `REQ-DSG-024` |
| Only the source preset is manipulated; a derived preset shows `derive()` and takes the focal point and the per-format overrides (§W23.7) | `editor-state.ts`, الموضع | A32, `REQ-DSG-020` |
| Overlays on by default for a print preset; switching a preset resets them | `editor-state.ts`; the stage's «منطقة الأمان» | `06` §10, `REQ-DSG-010` |
| A check selects its layer on the preset it failed in, overlays on, الطبقة opened | `editor-state.ts` (`goTo`) | `REQ-DSG-029` |
| Selecting on the canvas opens الطبقة; selecting in the list stays in the list | editor | wave 8 |
| Delete confirms **by the layer's identity** — its words, else its name, else its kind — with its place in the stack | `identifyLayer` + the dialog | `REQ-UIX-013` |
| Add text / shape / logo / image; duplicate; a new layer inside the safe area at the document's start edge | العناصر, الملفات, `compose.ts` | `DEC-178` (D1b), `REQ-DSG-021` |
| Every new colour a `{{brand.*}}` token | `compose.ts`, `TokenSelect` | `REQ-DSG-021`, `0055` |
| Read-only for a presenter or a non-admin (`canEdit`); the canvas shows, nothing writes | editor | `REQ-DSG-002`, `documents_read` |
| ★ **Below `xl`: view and approve** — the bar, the strip, the canvas unselectable, the checks, the bindings, «صدّر» | editor | `09` SCR-057 «Mobile» (not superseded by the wave-23 note, which supersedes the **panels**) — D-8 |
| The canvas is named in the outline (an `h2`), on the phone too | editor | wave 10's carried row, SC 1.3.1 |

#### `inspector.tsx` → the الطبقة panel

| Behaviour | After | Kept by |
|---|---|---|
| Only the sections the selected layer has; the document's background when none; the group section for two or more | `inspector.tsx` (tabs) | `16` §10.2 |
| ★ Numeric X · Y · W · H · rotation (+ opacity), behind a closed «الموضع والحجم» disclosure, **never removed** | الموضع tab | `DEC-093`, `REQ-DSG-028`, `REQ-UIX-110` |
| Align start/centre/end, top/middle/bottom, against the safe area or the page, on the **document's** axis | الموضع tab | `DEC-096` (byte-identical test) |
| «لائم المنطقة الآمنة», «املأ المنطقة الآمنة عرضًا», ±15°, «صفّر الدوران», «ضع بنقرة» (source preset only) | الموضع tab (+ ↔ on the toolbar, D-7) | `DEC-093` paths 1 |
| Order: forward · backward · front · back | الموضع tab; ▲▼ in `ui/layer-list` | `DEC-093` path 2 |
| Group align (selection · safe · page) and distribute (needs 3), locked layers skipped and said | group section | `REQ-DSG-028`, `DEC-093` |
| Text's own words; font family (the editor's faces); size; weight 400/500/600; colour as a brand token by name; text align start/centre/end, labelled from the **document's** direction (D-6) | النص tab + the floating toolbar | D1b, `REQ-DSG-016`, `REQ-DSG-021`, `DEC-096` |
| No letter-spacing control | النص (a note, not a field) | A30 |
| Binding and fallback — ★ the binding chosen **by its Arabic name** from the registry instead of typed as `session.title` | النص tab, «{ } ربط» | `REQ-DSG-006`, `DEC-149` §4 |
| «أقصى سطور» (`autoFit.maxLines`) — already in the model, never editable until now | النص tab | `REQ-DSG-025` |
| Image fit (contain/cover); the nine-point focal grid, physical and LTR, 44 px radios; on a derived preset it writes that preset's override | الصورة tab | `REQ-DSG-030`, `DEC-093` path 3, A32 |
| Shape fill as a token | الشكل tab | `REQ-DSG-021` |
| Background solid/gradient in tokens, the RTL angle stored (the renderer mirrors) | the document panel | `DEC-127` |
| A locked layer: one note at the top, controls disabled | panel | `REQ-DSG-024` |
| Duplicate / delete (delete confirms by name) | the panel's foot | D1b, `REQ-UIX-013` |
| Every group named, every control labelled (axe clean) | panel | `inspector-align.test.tsx` |

#### `inspector-section.tsx`

| Behaviour | After | Kept by |
|---|---|---|
| A disclosure is a real `<button aria-expanded aria-controls>`, never `<summary>` | inside `inspector.tsx` | wave 3 (Playwright waits 30 s on a `<summary>`) |
| «الموضع والحجم» closed by default; opens in one tap | الموضع tab | `DEC-093` |

#### `layer-list.tsx` → `ui/layer-list` + the الطبقات panel (the old file deleted, `DEC-235` §5.1)

| Behaviour | After | Kept by |
|---|---|---|
| Front of the stack first — `paintOrder()` reversed | the panel computes `items` | `06` §10 |
| A locked layer is listed and readable, with «مقفلة»; a hidden one says «مخفية» | `ui/layer-list` | `REQ-DSG-024` |
| ▲▼ on every row, named «طبقة إلى الأمام/الخلف» and described by the row's name; disabled at the ends | `ui/layer-list` | `DEC-093` path 2 |
| Hide/show, refused for a locked layer | `ui/layer-list` | `REQ-DSG-024` |
| Tap selects; shift or «تحديد متعدّد» adds and removes; «N طبقات محدّدة» as a status | `ui/layer-list` + panel | `DEC-093` path 5, `DEC-178` |
| «اختر كل طبقات: نص/شكل/…» | الطبقات panel | `DEC-093` path 5 |
| The count, and «لا طبقات» when empty | panel / `ui/layer-list` | — |
| 44 px rows | `ui/layer-list` | SC 2.5.8 |
| «أضف» (text, shape, logo, image) | moves to العناصر and الملفات | D1b |
| Drag to reorder — new, the enhancement only | `ui/layer-list` | `DEC-093` path 2 |

#### `variant-strip.tsx` → the bar's strip

| Behaviour | After | Kept by |
|---|---|---|
| Every preset the document exports at, one tap to show it | the bar's chips | `REQ-DSG-009`, `REQ-DSG-029` |
| `aria-pressed` on the shown one | chips | — |
| A dot where a check fails in that preset, and an sr-only «فيه ملاحظة» | chips | `REQ-DSG-029` |
| The worker's own render as a thumbnail, never a second live render | ★ the «صدّر» sheet, beside each ready artifact (D-1) | `DEC-017` |
| The preset's size, `<bdi dir="ltr">` | the chip's accessible description and its tooltip-free title row in the sheet | — |
| Scrolls inside itself; the sr-only note positioned inside the scroller (it once widened a 390 px page to 822) | chips | wave 8 capture |

#### `page.tsx` (the route) — also rebuilt, delete first

| Behaviour | After | Kept by |
|---|---|---|
| Absolute origin from the forwarded host (QR and font URLs) | `page.tsx` | `REQ-DSG-023` |
| `getDesignerDocument()` null → `notFound()`; authority is the policy, not the page | `page.tsx` | `DEC-134`, `03` §5.9b |
| The export queue keyed by the **saved** document's fingerprint — ★ never by a preview's bindings | `page.tsx` | `REQ-DSG-013` |
| Downloads through the one audited route (`downloadHref`); thumbnails signed 5-minute previews, not downloads | the sheet | `DEC-177`, `DEC-178` |
| «رجوع» to the screen that owns the document (schedule, the library tab, `045`, recognition) | the bar | `DEC-141` |
| A live poster opens read-only with the confirmed «خصّص» detach | the bar | `REQ-DSG-003`, `REQ-UIX-013` |
| A certificate template previews light or dark; a certificate row renders its pinned scheme | the bar | `DEC-148` contract 2 |
| «صدّر» requests every variant of the saved document in the previewed scheme | the bar → `queueExports` | `REQ-DSG-011`, `REQ-DSG-012` |
| `?download=failed` says so (`role="alert"`) | the page | `DEC-178` |
| Badges: live/detached, template draft, certificate, read-only; a certificate's serial `<bdi dir="ltr">` | the bar | — |
| `loading.tsx` | kept as is | — |

**Audit rows.** The editor's mutations and what each writes today — unchanged by the rebuild: **autosave** (a
`design_documents` update) writes none, by design (a draft is not an act; one row per 1.2 s would bury the log —
Q-6); **«صدّر»** → `request_render()`'s `design.export_requested` (`0060:131`); **retry** → `design.export_retried`
(`0060:243`); **a download** → `record_export_download()`'s row (`DEC-177`); **detach** → `design.poster_detached`
(`0063:182`); **publish a version** (the template draft's primary) → `console`'s `publishVersion` and whatever the
lead's template trigger writes (`REQ-UIX-108`), called, never duplicated. **No track writes `audit_log` from the DAL.**

---

### W23.3 — ★★ `DEC-093`: every drag, its tap, and the `page.click()`-only case that performs it

**New spec `tests/e2e/wave23-designer-taps.spec.ts`** — `page.click()`, `fill()` and `selectOption()` only, never
`mouse.down/move/up` or `dragTo`; after every step it reads the autosave PUT and asserts the stored document changed
as described. One case per row below, in the rebuilt chrome.

| # | Drag (where the artboard draws it) | Single-pointer path that is not a drag | Asserted |
|---|---|---|---|
| 1 | Move a layer on the canvas (wave 13) | «ضع بنقرة» then a tap on the canvas; align buttons; X/Y fields | frame moved; logical x on an RTL page |
| 2 | Resize by eight handles (wave 13) | W/H fields; «لائم المنطقة الآمنة»; «املأ المنطقة الآمنة عرضًا» | frame resized |
| 3 | Rotate by the knob (wave 13) | ±15°; «صفّر الدوران»; the rotation field | rotation 15, then 0 |
| 4 | Marquee (wave 13) | «تحديد متعدّد» + row taps; «اختر كل طبقات: …» | three selected, group align/distribute applied |
| 5 | Focal dot (wave 13) | the nine-point grid | `image.focal` set; on a derived preset, that preset's override |
| 6 | ★ **العناصر → canvas** («سحب رمز QR», `AdminDesignerElements`) | **a tap on the tile adds the layer** inside the safe area at the document's start and selects it; «ضع بنقرة» then places it | a `qr` layer bound to `{{session.eventUrl}}`; then a `shape` ellipse, a `line`, a text |
| 7 | ★ **الحقول → canvas** («اسحب حقلًا إلى اللوحة», `AdminCertDesigner`) | a tap on a field adds a bound layer (a QR field adds a QR layer) | a `dynamic_field` bound to `{{recipient.name}}`; the row flips to «مستخدم» |
| 8 | ★ **الملفات → canvas** (the asset drag) | a tap on an uploaded asset adds an image layer sized to its proportion | an `image` layer with that `assetId` |
| 9 | ★ **Layer reorder in الطبقات** | ▲▼ on the row; «إلى الأمام كليًا/الخلف كليًا» in الموضع | paint order changed by one, then to the front |
| 10 | Nothing else drags. **The stage does not pan by drag** (it scrolls); **rulers spawn no guides by drag**; the floating toolbar and the rail have no drag | — | — |

The drags themselves (rows 6 – 9) are built **after** their taps, as the enhancement: native HTML drag-and-drop from
the panel's tiles to `DesignerCanvas`'s `onExternalDrop` (one commit = one undo entry: add + place in one `commit`),
and pointer drag in `ui/layer-list` mapping a drop index to one composed reorder (one entry). A second spec,
`wave23-designer-drag.spec.ts`, drives them with the mouse; it is evidence that the enhancement works, never the
conformance path. **The numeric X/Y/W/H/rotation fields survive, in the closed «الموضع والحجم» disclosure**, and
`inspector-align.test.tsx`'s DEC-093 case keeps asserting it (one selector move: the الموضع tab first — a ledger line).

**Existing specs, selectors moved, expectations unchanged** — each a ledger line in `STATUS.md` in the commit that
moves it: `wave13-designer-studio-taps` (the tablist «لوحات المحرّر» → the rail; «الخصائص» → «الطبقة»),
`wave13-designer-studio-drag`, `wave8-designer-editor`, `wave13-designer-upload-render`, `wave8-designer-posters`;
`inspector-align.test.tsx` (`pressIn` and the DEC-093 case open الموضع first). `wave13-console-parity.test.tsx` needs
none (the group section has no tabs).

---

### W23.4 — the props I publish (contract 2, 3), and what I need from the lead's two

#### `ui/canvas-stage` (mine, new) — the stage around a child; it draws nothing of a document

```ts
export interface CanvasStageToggle { key: string; label: string; pressed: boolean; onPressedChange: (next: boolean) => void }

export interface CanvasStageProps {
  label: string;                         // the region's accessible name
  /** The child's own size in its units (document px; the email's 600 or 375). */
  contentWidth: number;
  /** Omitted for content whose height flows (the email): the stage then fits by width and scrolls. */
  contentHeight?: number;
  /** Controlled. `"fit"` fits the content in the stage; a number is a scale (1 = 100%). */
  zoom: "fit" | number;
  /** The scale the stage arrived at — the bar's «62%», and the child's `scale`. */
  onScaleChange?: (scale: number) => void;
  /** Rulers on demand, measured from the content's START edge in its own direction (DEC-096). */
  rulers?: { direction: "rtl" | "ltr"; step: number } | null;
  /** A neutral grid over the content, every `step` content px. Visual only — nothing snaps to it. */
  grid?: { step: number } | null;
  /** The toggles drawn ON the canvas (منطقة الأمان · الشبكة · المحاذاة التلقائية); `aria-pressed` buttons. */
  toggles?: CanvasStageToggle[];
  /** Hosted over the content in the stage's positioned overlay — the floating toolbar. */
  overlay?: React.ReactNode;
  /** The child, given the scale. A render prop because the child sizes itself from it. */
  children: (scale: number) => React.ReactNode;
  className?: string;
}
```

Neutral ground, a scrolling viewport, the fit (the `ResizeObserver` that leaves `canvas.tsx`), the rulers (Western
numerals, `<bdi dir="ltr">`), the grid, the toggles at the inline-start foot as drawn, and a positioned overlay for the
toolbar. **No motion.** `notify`'s `block-canvas` is the other child. Its test, `-scope` test and demo
(`(dev)/ui/demos/canvas-stage.tsx`) with the primitive.

#### `ui/layer-list` (mine, new) — rows, never a document

```ts
export interface LayerListItem {
  id: string;
  name: string;                          // shown in <bdi>
  kindLabel: string;                     // «نص», «شكل», …
  selected: boolean;
  locked?: boolean;
  hidden?: boolean;
}

export interface LayerListProps {
  label: string;                         // the list's accessible name
  items: LayerListItem[];                // in display order — the caller decides (front first)
  onSelect: (id: string, options: { additive: boolean }) => void;
  /** «تحديد متعدّد» on: every tap is additive. */
  multi?: boolean;
  /** ▲▼ — the path. Absent: read-only rows. */
  onMove?: (id: string, move: "forward" | "backward") => void;
  /** The drag enhancement: the row dropped at `toIndex`. Never the only way (DEC-093). */
  onReorder?: (id: string, toIndex: number) => void;
  onToggleHidden?: (id: string) => void;
  labels: { forward: string; backward: string; show: string; hide: string; locked: string; hidden: string; empty: string; handle: string };
  className?: string;
}
```

Strings arrive as props (wave 15's rule for primitives). ▲▼ are `aria-describedby` the row's name; a locked row's hide
is disabled; 44 px rows.

#### What I need from `ui/editor-rail` and `ui/floating-toolbar` (the lead's, `lead-wave23.md`) — three requests

1. **`editor-rail` — the panel's heading is not always the item's label.** `AdminDesigner.dc.html` heads الطبقة's panel
   «نص · {عنوان الجلسة}» (the layer's kind and name) with «إغلاق» at the end of the same row. **Request:**
   `panelTitle?: React.ReactNode` (defaults to the item's label) and `panelAction?: React.ReactNode` (the row's end).
2. **`floating-toolbar` — the rotation knob sits 32 px above a selected layer** (`canvas.tsx:707`, engine, not moved).
   A toolbar placed «above» at the box's edge covers it. **Request:** `offset?: number` (px between the anchor and the
   bar; I pass 44 for a layer with the knob).
3. **`floating-toolbar` — a rotated layer.** I hand the axis-aligned bounding box of the rotated frame, which is what
   the eye reads; please say in the props' doc comment that the anchor is a bounding box, so `notify` does the same.

Everything else in the two signatures serves: a vertical tablist with controlled `selected`, the count «never drawn at
0», the item that exists only with a selection, the fallback through `onSelect`; the toolbar's visual-axis arrows and
no focus-stealing. The rail's items for the designer: العناصر (`elements`) · الحقول (`fields`) · الملفات (`uploads`) ·
الهوية (`brand`) · الطبقات (`layers`) · الفحوصات (`checks`, with the count) · الطبقة (`layer`, only with one selection).
A read-only viewer gets الحقول · الطبقات · الفحوصات.

**Also for the lead (contract 1):** the bar's name is the page's `h1`. At bar size, is it the display face
(`REQ-UIX-053`'s «`h1` the only display use»), or body type with the `h1` semantics? I will follow the frame's answer.

---

### W23.5 — ★ the certificate canvas (C3 – C5)

**The field registry lives in the runtime** — new `packages/designer-runtime/src/fields.ts`, because the editor, the
library's test and any later caller must agree on what a field is, and it is the one place that knows a binding's
layer kind:

```ts
export interface FieldSpec {
  binding: string;                       // `recipient.name` — the path, never shown to an admin
  layer: "dynamic_field" | "qr";         // what a tap or a drop adds
  purposes: readonly Purpose[];
  /** Certificate families this field serves; absent = every family. */
  families?: readonly CertificateFamily[];
}
export const FIELDS: readonly FieldSpec[];
export function fieldsFor(purpose: Purpose, family: string | null): FieldSpec[];
/** Each field, used when the document declares its binding (`declaredBindingsOf`). */
export function fieldUsage(doc: DesignDocument, family: string | null): { field: FieldSpec; used: boolean }[];
```

- **The registry holds only bindings the runtime already resolves** (W23.0.6), and a unit test proves it: every
  `FIELDS` binding is produced by `resolveSessionBindings()` or `resolveCertificateBindings()` for a full row.
- **Poster:** {عنوان الجلسة} `session.title` · {المقدّم} `session.presenters` · {الموعد} `session.startsAt` · {المكان}
  `session.venueName` · {عنوان المكان} · {رابط الجلسة} → a QR layer on `session.eventUrl` · {اسم المؤسسة}.
- **Certificate:** {اسم العضو} `recipient.name` · {عنوان الجلسة} `session.title` (attendance, presenter) · {الرقم
  التسلسلي} · {رمز التحقّق النصّي} · {تاريخ الإصدار} · {رمز التحقق QR} → a QR layer on `certificate.verifyUrl` ·
  {اسم المؤسسة} · ★ **{المستوى} → `certificate.achievementName`, `families: ['achievement']` only** (it is what the
  achievement certificate prints today, `library.ts:391`; drawn as «للإنجازات» — D-3).
- ★ **{رمز التحقق QR} is bound to `certificate.verifyUrl`, which `resolveCertificateBindings()` builds once**
  (`${origin}/${locale}/verify/${code}`, `session-bindings.ts:218`) — the one route, never a string the editor makes.
- **Used / unused** is `fieldUsage()` against the live document; «مستخدم» or «—», as drawn, and the board's tabs
  **الشهادة · العضو** split certificate fields from the member's.
- The family a template serves comes from `design_templates.family` — `getDesignerDocument()`'s `template_draft`
  context gains `family` (add-only); a certificate row has its `kind`.

**The longest-member-name check** (C4): `getLongestSamples(locale)` in `designer.ts` (add-only) returns
`{ 'session.title': the org's longest session title, 'recipient.name': the longest active member's display name }` —
read through RLS as the admin, a few hundred rows, the longest chosen in the DAL (PostgREST cannot order by a length,
and this needs no SQL function and therefore no migration). The checks measure each layer bound to one of those at its
`maxLines` (§W23.6). The text panel shows the sample and «N أسطر ✓» or the failure, as drawn.

**«معاينة بعضو»** (C5): a combobox of the org's members (names only — no email in the page) and, for the attendance
and presenter kinds, a completed session. The choice is **URL state** (`?member=<id>&session=<id>`), so the page
renders it on the server through `getDesignerDocument(..., { previewMemberId, previewSessionId })` (add-only), which
returns a **separate** `previewBindings`:
- if the member **holds an issued certificate** of this family from this org, its real row is bound — serial, code,
  QR, all real;
- otherwise `recipient.name` and `session.title` are bound, and the serial, the code and the QR are **left absent**,
  so the canvas draws the marked placeholders (`REQ-DSG-006`) — never an invented serial, never a constructed URL.
- ★ `previewBindings` reach the canvas and the checks only; **the fingerprint and the export use the saved document's
  own bindings** (kept-behaviour row in `page.tsx`'s table). Rendering is `renderDocumentToHtml()` — the one renderer.
- «معاينة بجلسة» on a poster template is the same mechanism with `?session=<id>` (`listPreviewSessions(locale)`, the
  org's recent and upcoming sessions, add-only). A session's own poster is already real data and shows no picker.
- Before navigating, `flush()` saves (W23.1.2).

**Certificates take no object** (`REQ-DSG-026`): العناصر shows أساسية only for a certificate.

**The strip** — see D-2. Until the lead rules, a certificate shows **its one preset** as a single chip, with the
sibling orientation of the same family (if the org has it) as a link to that template, and no A3.

---

### W23.6 — checks as a rail item with a count

`useCheckFindings` stays a hook in the editor (the count must be right whether or not الفحوصات is open — its own
comment, `checks-panel.tsx:71-76`); `ChecksPanel` is composed as the panel. Add-only:

- **`longest`** — for each text/field layer bound to a key in `samples`, on every preset, `computeAutoFit()` with the
  sample through the same `domTextMeasurer`; a `max_lines_exceeded` / `min_size_reached` against the sample is a finding
  naming the layer and the sample («أطول عنوان في المؤسسة لا يتّسع في 3 أسطر»). The poster fits the longest title;
  the certificate the longest member name.
- **`contrast`** — a text or field layer's colour token against what is behind it (the document background, both stops
  of a gradient, or a shape that fully contains the layer), resolved through the brand bindings the canvas already has,
  computed by `src/lib/brand/contrast.ts`'s `checkContrast()` (client-safe, no `server-only`) (read, not copied — `branding`'s, the lead custodian) at
  AA for its size.
- PPI (A3 and every preset, inline explanation) and the safe area are today's.
- ★ **The rail's count is the panel's rows** (`groupFindings()`, one per check × layer), not the raw findings: today
  the badge counts one overflow on seven presets as 7 while the list shows one row. A fix, said in the commit.
- Selecting a finding: `goTo` — that preset, overlays on, the layer selected, الطبقة opened (`REQ-DSG-029`).

---

### W23.7 — the four-format demonstrable, and the proof that no golden moves

- **What moves nothing by construction:** the diff boundary in W23.1.4 — no renderer, preset, autofit, binding,
  fingerprint or Tier A file changes. The per-format overrides the الموضع tab now offers on a derived preset
  (`presets[preset].anchor` / `.scale`, `hideAt`) and «أقصى سطور» are fields the model already has; **an untouched
  document carries none of them, so it derives identically** (`designer-derive-untouched.test.ts`, untouched).
- **The parity harness**, `node scripts/parity/harness.mjs` (never `--update`): 28 of 28 and the background block, at
  B's head; `git diff main -- scripts/parity/goldens` empty.
- ★ **New `tests/e2e/wave23-designer-four-formats.spec.ts`** (`E2E_WORKER=1`, the lead's run with the real worker):
  the sample template — the seeded platform «جلسة» poster, copied into the org through `duplicateTemplate()` — is
  opened in the rebuilt studio **and not touched**; «صدّر» requests every variant; it asserts **16:9 (`landscape`), A4,
  A3 and 9:16 (`story`)** — and the other three — reach `ready` (a Tier A mismatch fails the export, `REQ-DSG-014`), that
  each artifact's `source_fingerprint` equals the one the runtime computes from the stored document, and it writes each
  artifact's SHA-256 to `.qa-shots/rtl/wave23-designer-four-formats.json`. **The lead runs it once on A's head (the old
  studio) and once on B's head: equal hashes are «no golden moved» for the real export path**, not only for the harness.

---

### W23.8 — disagreements with the artboards (written, not picked)

| # | Board · line | What it draws | What the plan says | My reading, for the lead |
|---|---|---|---|---|
| D-1 | `AdminDesigner` / `AdminDesignerElements`, the bar's chips | 16:9 · A4 · A3 · 9:16, text chips, no thumbnails | `REQ-DSG-009`: seven presets incl. the 4:5 master (the only editable one); `REQ-DSG-029`: «a live thumbnail of every preset» | chips for all seven, short labels (4:5 · 1:1 · 9:16 · 16:9 · OG · A4 · A3); the worker's thumbnails move into the «صدّر» sheet. ★ Needs a ruling on the thumbnails |
| D-2 | `AdminCertDesigner`, the bar | A4 أفقي · A4 عمودي · A3 أفقي on one strip | `DEC-148`, `REQ-DSG-026`: one preset per certificate, an orientation is a row; no A3 certificate preset exists; `REQ-UIX-111` repeats the board | ★★ **BLOCKING (Q-1).** One chip + the sibling orientation as a link; no A3 |
| D-3 | `AdminCertDesigner`, الحقول | {نوع الشهادة} {تاريخ الجلسة} {نص الشهادة} {التوقيع} as fields; no {رمز التحقّق النصّي} | kind and body are literal text; signature a locked shape; session date resolved nowhere on the certificate path; `REQ-CRT-010` requires the code as text | the four are **not fields** this wave (a binding would need `certificate_render_context()` changed — a migration — and would move every certificate's fingerprint); offered under العناصر as a text/line; the code is listed. {المستوى} = `certificate.achievementName` |
| D-4 | `AdminDesigner`, canvas | {التصنيف} on the poster | no `session.category` binding; adding one re-fingerprints every poster (W23.0.7) | not built; Q-2 |
| D-5 | `AdminDesigner`, النص tab | weight 700 / 800 | `model.ts:56`: 400 / 500 / 600; the font set is fixed (`REQ-DSG-016`) | 400 / 500 / 600 |
| D-6 | `AdminDesigner`, المحاذاة | يمين · وسط · يسار | stored as start/centre/end (`DEC-096`) | labels from the **document's** direction (RTL: start = يمين); same bytes from any console |
| D-7 | `AdminDesigner`, the floating toolbar | six glyphs (font · size · A · ≡ · ↔ · ربط); `M12.md` says five | — | ↔ = «املأ المنطقة الآمنة عرضًا», kept as drawn; Q if the lead reads it otherwise |
| D-8 | `M12.md` «desktop-only» | no phone form | `09` SCR-057 «Mobile: view and approve» still stands (the wave-23 note supersedes the panels) | kept — the phone view below `xl`, read-only |
| D-9 | `M12.md` «Double-click edits text inline» | inline editing on the canvas | the canvas is the renderer's iframe; an inline editor is a second text path (`DEC-017`) | double-click opens النص with the field focused |
| D-10 | `AdminDesigner`, ملاءمة تلقائية | تصغير · قصّ | `AutoFit.mode` is `shrink-then-wrap` only; truncation is a renderer change | not built; «أقصى سطور» is |
| D-11 | `AdminDesignerElements`, tabs الأشكال ثلاثية · الملصقات; tile «ملصق» | the house objects and stickers as draggable assets | `REQ-DSG-026` allows the objects as **raster** image layers on a poster; they exist only as PNG under `docs/design/assets/` (never imported) and as React components under `ui/objects` (the console's register test forbids importing them); a poster layer needs a design-asset id the worker can fetch | not built this wave (needs the objects as platform raster assets — the lead's `public/**` or a seeded asset — Q-3). «ملصق» (a poster frame?) unclear |
| D-12 | `M12.md`, الهوية | «the seven team colours by name» | a team colour is a hex from `companies.team_color`; a template takes `{{brand.*}}` only (`REQ-DSG-021`, `0055`'s guard refuses a hex) | الهوية shows the brand tokens by name, the faces and the logo; team colours not offered |
| D-13 | `AdminCertDesigner`, primary «احفظ» | a save button | autosave already saves; the act that makes a template usable is publishing a version | primary «انشر نسخة» through `console`'s `publishVersion` on a template draft; «صدّر» elsewhere |
| D-14 | both boards, the bar | no rulers toggle, no zoom control beyond «62%», no light/dark | `REQ-UIX-110`: rulers; `DEC-148`: a certificate template previews both schemes | «المساطر» added to the stage's toggles; the % opens ملاءمة · 50 · 100 · 200; the scheme pair stays on a certificate template's bar |
| D-15 | `AdminDesigner`, الربط | the field's Arabic name | the inspector types `session.title` today | a select over the registry by Arabic name (`DEC-149` §4) — the same bytes stored |

`M12.md`'s own header still says «4 artboards» (nine; known, `DEC-236` §4).

---

### W23.9 — commits in PR B, in order (after «the frame is in»)

1. `editor-state.ts` + `inspector-ops.ts` — the move, verbatim, with `editor-state.test.tsx`.
2. `ui/canvas-stage` + its test, `-scope` test, demo; `canvas.tsx`'s frame out, its add-only props in (both suites untouched).
3. `ui/layer-list` + test, `-scope` test, demo (floor 65 → 67 with 2–3).
4. `fields.ts` + `compose.ts` add-only + `designer-fields.test.ts`; `designer.ts` add-only (`getLongestSamples`,
   `listPreviewSessions`, `listPreviewMembers`, `previewBindings`, `family`); `posters.ts` add-only `listDesignAssets`.
5. `checks-panel.tsx` add-only (`samples`, `longest`, `contrast`, `groupFindings`).
6. Delete: `editor.tsx`, `inspector.tsx`, `inspector-section.tsx`, `layer-list.tsx`, `variant-strip.tsx`,
   `admin/designer/[documentId]/page.tsx` — **paired in the same push with 7**.
7. Create: the page, `editor.tsx`, `inspector.tsx`, the panels (`src/components/designer/panels/{elements,fields,uploads,brand,layers}.tsx`),
   the bar, the strip; strings in `messages/ar/designer.json` first, then `en`; ledger lines for every moved selector.
8. The drags (rows 6 – 9), after their taps.
9. `flush()`; «معاينة بجلسة» / «معاينة بعضو».
10. Specs: `wave23-designer-{taps,drag,checks,certificate,four-formats,captures}.spec.ts`; captures at 1280 —
    `wave23-designer-{poster-layer,poster-elements,certificate-fields,checks,export,preview-member}-1280.png` and the
    view-and-approve at 390.

Gates I run: `tsc`, `lint` (grepping for `problems`), `npm test`, `ui-lint` before every screen commit, the parity
harness without `--update`, one e2e spec through the lock. `console-register.test.ts` green and untouched; no
`transition`, no motion beyond drag feedback.

### W23.10 — questions for the lead

- **Q-1 (blocking for C3)** — the certificate strip: `REQ-UIX-111` / the board vs `DEC-148` / `REQ-DSG-026` (D-2).
- **Q-2** — any new binding ({التصنيف}, {تاريخ الجلسة} on a certificate, {نوع الشهادة}) re-fingerprints every
  artifact of its purpose; I build none unless you rule (D-3, D-4).
- **Q-3** — the objects and stickers tabs need the six objects as platform raster assets (D-11). Not this wave?
- **Q-4** — `design-panel.tsx` (mine) imports `template-preview.tsx` (`console`'s to delete). ★ **I agree with
  `console`'s request** (its note §1): transfer `design-panel.tsx`, `eligible-list.tsx`, `issuance.tsx` and
  `mode-control.tsx` to `console` for the wave, to be deleted in PR A. `mode-badge.tsx`, `actions.ts` and
  `held-achievements.tsx` stay mine and are not touched by PR B.
- **Q-5** — the variant thumbnails' new home (D-1) and the view-and-approve layout (D-8): confirm.
- **Q-6** — an autosave of a template draft writes no audit row today; I read `REQ-UIX-108`'s «every template
  mutation is audited» as the version publish, not each autosave. Confirm.
- **Q-7** — the three requests on your two primitives (§W23.4) and the bar `h1`'s face.
- **`console` contract** (to be confirmed in its note): its rebuilt `admin/templates/actions.ts` keeps an exported
  `publishVersion(locale, purpose, templateId)` (or names its successor), which the studio's bar imports.

---

## 0. The plan (bundle 1, written before any code)

### 0.1 Story order, and why

17 stories. The order is dictated by one fact: **every other story renders
through the document model**, so the model and the runtime come first, and the
parity suite comes as early as it can be made to fail.

| # | Story | Why here |
|---|---|---|
| 1 | **DSG-003** — one engine, one document model | Everything imports it. Model + Zod + DAL + autosave Route Handler + SCR-057. |
| 2 | **DSG-004** — versioning, two libraries, locked regions | Templates are the input to every render; the platform/org split is an RLS shape, cheapest to prove now. |
| 3 | DSG-011 — QR layers + the baseline library | The templates DSG-004 lists need real layer trees, and a certificate template without a QR is not a certificate template. The QR encoder is ours (no new dependency — `package.json` is lead-only). |
| 4 | DSG-005 — presets, safe areas, auto-fit | Derivation and auto-fit are measured in the browser; they must exist before an export can be right. |
| 5 | DSG-006 — the export pipeline | `JOB-render_variant`, `worker/src/render/**`, `export_artifacts`, `source_fingerprint`. |
| 6 | DSG-007 — parity, three tiers, 28 assertions | Follows 5 immediately: the export paths must exist to be measured, and nothing after this ships unmeasured. |
| 7 | DSG-009 — image layers, no SVG, PPI guard, uploaded posters | Needs the asset table and the print presets. |
| 8 | DSG-001 + DSG-002 — posters three ways, live/detached | The SQL hook on `sessions` (publish → posters, change → `regenerate_poster`) and the one-way detach. |
| 9 | DSG-008 — one font set, `materialise_font` | The goldens must exist (6) before a new font can be gated by them. |
| 10 | DSG-010 — brand kit tokens + the feature set | `{{brand.*}}` resolved from the platform defaults; wave 4 supplies the org override. |
| 11 | CRT-001 → CRT-002 → CRT-004 → CRT-003 → CRT-005 → CRT-006 | Recipients and modes, then issuance, then the serial, then the PDF, then `/verify`, then revocation and reproducibility. CRT-004 sits before CRT-003 because a PDF without a serial on it is a reprint. |

The lead's bundle 1 is stories 1 and 2 plus the schema and the three slots.

### 0.2 What the runtime needs that it does not have

`packages/designer-runtime/src/model.ts` is 132 lines and covers §2.1 of `06`
exactly. Missing, in the order the stories need them:

- **`schema.ts`** — the Zod schema for the document JSON. The autosave Route
  Handler validates against it before anything touches the database, and the
  same schema is the runtime's own type source (`z.infer`), so there is one
  definition rather than a type and a validator that drift.
- **Bindings as a type, not a string.** `BindingContext` = the resolved
  `{{brand.*}}`, `session.*`, `recipient.*`, `certificate.*`, `org.*` values,
  plus `resolveBinding()`. An unmatched binding must return a **marked
  placeholder**, not `''` (`REQ-DSG-006`); `render.ts` today falls through to
  the empty string, which is exactly the empty box the requirement forbids.
- **Placeholder rendering** — a dashed outline carrying the binding name, with
  `data-placeholder="true"` so the editor, the export and a test can all see it.
- **Presets and per-layer preset behaviour** (`06` §5.1) — `anchor`,
  `scale`, `hideAt`, `reflow`, and the nine presets with their safe areas as
  data. DSG-005.
- **Auto-fit** (`06` §5.2) — `shrink-then-wrap` needs a measurement pass, so it
  is a browser-side function the editor and the worker both call, not a string
  transform.
- **`locked`, plus `hidden`** — `locked` exists; hiding a locked layer must also
  be refused (`REQ-DSG-024` says moved, resized, **hidden** or deleted).
- **The QR encoder** — our own, emitting inline SVG (`06` §8.2). No dependency
  may be added: `package.json` is lead-only.
- **`sourceFingerprint()`** — hash of document JSON + template version + bound
  data + font hashes (`REQ-DSG-013`), computed in one place so the app, the
  worker and the parity suite cannot disagree about the cache key.

`render.ts` also needs two fixes found on the read-through, both real:

1. **An unbound binding renders as `''`** (`value = literal ?? resolve(...) ?? fallback ?? ''`).
   That is the empty box `REQ-DSG-006` forbids.
2. **`renderLayer` does not escape `'` in `style` or in a font family.** The
   attribute is double-quoted so it is not an injection, but a family name
   containing an apostrophe breaks the CSS `font-family:'…'`. Family names come
   from the font manifest, so this is a correctness bug, not a security one.

### 0.3 The M6 schema — `supabase/proposed/designer/0001_m6_schema.sql`

Nine tables (`02` §4.12, §4.13), their enums, RLS per `03` §5.8–§5.9, a grant
for every policy, `allocate_serial()`, `verify_certificate()`, and two
structural triggers. **The three buckets and their five policies already
exist** — `0037_m5_schema.sql` created `design-assets`, `exports` and `fonts`
with `design_assets_storage_{read,write}`, `exports_storage_read` and
`fonts_storage_read` (`03` §6.9). This file creates none of them; it would
conflict with the promoted migration.

Two structural decisions this file makes, both to move a requirement out of
application code and into the database:

- **`design_template_versions_validate`** — every layer's `kind` must cast to
  `public.layer_kind` (which is otherwise an enum no column uses), and **no
  colour field may be a hex literal** (`REQ-DSG-021`: "a literal `#0B1220` in a
  template is a defect"). Template versions only; a resolved document carries
  resolved colours.
- **`design_documents_locked_regions`** — a document instantiated from a
  template version may not move, resize, hide or delete a layer the template
  marked `locked` (`REQ-DSG-024`). Checked on insert and update against the
  pinned `template_version_id`, so the editor's refusal is a second line of
  defence rather than the only one.

**`fonts` has no `org_id`, and that is a fifth exception to `02` §7 — the
lead's call (question 1 below).** `02` §4.13 gives `ENT-fonts` no org column
and makes `sha256` platform-wide unique; `06` §6.4 and §7.3 say the point of
the table is that the editor, the worker's Chromium and the worker's
LibreOffice read **the same bytes**, and the bucket is deliberately not
org-prefixed. A per-org font table contradicts both. The cost is one DECISIONS
entry and two lines in `tests/rls/isolation.test.ts` (lead's file).

**The serial prefix already exists.** `orgs.certificate_prefix` has been there
since `0004_tenancy.sql` (M1), constrained to `^[A-Z]{2,5}$`, and the RLS
fixture already gives org A `KM` and org B `OT`. `allocate_serial()` reads it.
No new column, no `ALTER` on a table this track does not own.

### 0.4 The three slot placeholders (day one)

`src/components/posters/session-poster.tsx` → `SessionPoster` ·
`src/components/posters/picker.tsx` → `PosterPicker` ·
`src/components/certificates/mode-badge.tsx` → `CertificateModeBadge`.
All three `async ({ sessionId, locale }: DesignerSlotProps)`, rendering `null`
until their story lands, so `console`'s and the lead's imports resolve today.
The contract lives in `src/components/posters/slots.ts` and does not change
without the lead hearing. `CertificateModeBadge` becomes real at CRT-001,
`SessionPoster` and `PosterPicker` at DSG-001/002.

### 0.5 The parity suite's four export paths (28 assertions)

`scripts/parity/cases.mjs` has the seven cases (`06` §9.2) and the harness runs
them once, through one path. `REQ-DSG-015` wants **each** export path.

| # | Path | Tier A measured on | Tier B |
|---|---|---|---|
| 1 | poster **PNG** | the screen-preset page, as today | pixel diff vs golden |
| 2 | poster **PDF** | the same page under `emulateMediaType('print')` at the A3 box — print emulation changes line breaking, which is the whole risk | advisory (no rasteriser in the image) |
| 3 | certificate **PDF** | the `cert_landscape` box with the certificate face (Amiri), print-emulated | advisory |
| 4 | **slide page images** | **settled: the harness posts a generated deck to `CONVERTER_URL`** — this path is LibreOffice + poppler, which lives in the converter, not the worker image | advisory |

7 × 4 = **28 Tier-A assertions, all blocking**. Tier B stays on the raster path
where a raster exists; claiming a pixel diff on a PDF nobody rasterises would
be the "test that tests nothing" `06` §9.3 warns about.

**The lead settled path 4 as option (a):** the harness posts a generated deck
to `CONVERTER_URL` and **skips loudly** when it is unset — a line reading
`21 of 28 — converter path not configured`, never a silent pass — and CI's
`worker` job starts `kareem-converter` so CI runs all 28. Built at DSG-007.

### 0.6 Questions for the lead — all three answered

1. **`fonts` with no `org_id`** — **accepted as written.** The fifth exception
   is **DEC-049**; the lead added `fonts` to both `NO_ORG_ID` and the
   non-vacuity exclusion list in `tests/rls/isolation.test.ts` and wrote
   `tests/rls/fixture-m6.ts`.
2. **The fourth export path** — **option (a)**, recorded in §0.5.
3. **`worker/src/index.ts`** (the lead's): the four task registrations and the
   `render` queue at concurrency 2 (`11` §1.4) are handed over at DSG-006.

### 0.7 Two rules this bundle learned the hard way

- **Keep `npm run build -w @kareem/designer-runtime` green in the WORKING
  TREE, not only at commit.** The root build runs it first, so a half-finished
  runtime file blocks the lead's sync-point build even though it is
  uncommitted. It did once, for a `possibly undefined` on a
  `String.prototype.split` result.
- **Every RLS case here starts from an empty M6 world.** `fixture-m6.ts` seeds
  all nine tables on both orgs so the isolation sweep is not vacuous, so a
  case that COUNTS rows or allocates a serial must clear its tables in
  `setup()` inside the rolled-back transaction, or count by id. The lead added
  that clearing after fourteen cases counted against a populated world; it is
  the notify-contract pattern (`TEAM.md` §3) and it stays.

---

## 1. Findings

Appended as they are found. Bundle 1's read-through findings are in §0.2; the
rest came from building against the tree.

### 1.1 Three things §0 got wrong, corrected by the code

- **The serial prefix already existed.** `orgs.certificate_prefix` has been
  there since `0004_tenancy.sql`, `^[A-Z]{2,5}$`, and the RLS fixture already
  gives org A `KM` and org B `OT`. `allocate_serial()` reads it; no new column
  and no `ALTER` on a table this track does not own. §0.6's question 3 is
  withdrawn.
- **The three buckets and their five storage policies already existed** in
  `0037_m5_schema.sql` (`03` §6.9). The M6 schema creates none of them.
- **`fonts` with no `org_id`** — the lead took it as written and put `fonts`
  in both the `NO_ORG_ID` set and the non-vacuity exclusion list of
  `tests/rls/isolation.test.ts`. §0.6's question 1 is closed.

### 1.2 Reem Kufi and Amiri are not in the font set — this blocks DSG-011

`packages/fonts/manifest.json` carries **IBM Plex Sans** and **IBM Plex Sans
Arabic** and nothing else (nine web faces, six TrueType). `06` §7.1 names a
**Kufi display face (Reem Kufi)** for headings and posters and a **Naskh face
(Amiri)** for certificates, and §3.3's baseline library is written around
them: a certificate family is "formal Naskh".

So the baseline templates of STORY-DSG-011 can be built in Plex Arabic today
and in the faces the document actually specifies only after those two enter
the set. Two ways in, and **the choice is the lead's** because
`packages/fonts/**` is not this track's:

1. the lead runs `fonts:extract` with the two families added to
   `src/lib/fonts.ts` — they become platform faces, shipped in the repository
   and covered by `fonts:check`; or
2. they arrive as **materialised Google fonts** through `JOB-materialise_font`
   (STORY-DSG-008) — stored in the `fonts` bucket and `ENT-fonts`, gated by
   the goldens, never in the package.

(2) is what `06` §7.2 describes for an org's own choice, but the baseline
library is the PLATFORM's, so (1) is the honest home for it. Either way it is
work that has to happen before a certificate template can be what the
document says it is.

### 1.3 ★ CORRECTED — the unicode-range "fix" was a bug, and I shipped it

**What I claimed in bundle 1, and it was wrong.** `packages/fonts` lists a
family's Arabic and Latin subsets as two files, and I reasoned that two
`@font-face` rules with no `unicode-range` cannot merge coverage — the last
declared wins for every character, so a mixed «جلسة عن Next.js 16» would
lose its Latin. I added a range to the Arabic face and recorded it as a
finding.

**What is actually true, measured.** With no ranges at all, CSS font
matching already does the right thing: the last face wins, and WHEN IT LACKS
THE GLYPH the search continues through the rest of the family before leaving
it. Adding a range to one subset breaks that continuation — the unranged
Latin face still matches every character and still wins, but the missing
Arabic glyph now resolves to a SYSTEM font instead of to the Arabic face
beside it.

    «محمد» in IBM Plex Sans Arabic, 40 px
      no ranges .................. 88.05   the face
      range on the Arabic subset . 76.02   the system fallback

So the change made Arabic strictly worse everywhere a page declares both
subsets. It is reverted; `ARABIC_UNICODE_RANGE` is kept only to name what
was tried, `fontFaceCss` still emits a range when one is asked for, and
`tests/unit/designer-render.test.ts` now asserts the faces are declared
plainly.

**Why nothing caught it for two bundles.** The parity harness is insensitive
either way — pixel diff 0.000 % before and after, both times — so the gate
that exists precisely to catch font drift could not see this. What found it
was building the DSG-008 font gate and running it against fonts already in
the set: three Arabic families that must pass all failed «arabic_coverage».
`document.fonts.check(…, 'لا')` returns TRUE throughout, because it reports
whether SOME face in the family can render the character, not which face
wins — so the harness's own usable-face guard was satisfied the whole time.

**The lesson worth keeping:** a font assertion that is not a COMPARISON
between two measured strings is not an assertion. Every check in
`font-gate.ts` is now comparative for this reason.

### 1.4 Two deployment items for the lead, neither urgent before Launch

- **`packages/fonts` is read from `process.cwd()`**, not imported:
  `@kareem/fonts` is not a declared dependency of the app (root
  `package.json` lists only `@kareem/storage-paths`), and `package.json` is
  lead-only. `src/lib/dal/fonts.ts` reads the manifest and the binaries by
  path, so nothing undeclared is imported — but Next's tracer cannot see a
  dynamic read, so a Vercel deploy needs either `@kareem/fonts` as a root
  dependency or `outputFileTracingIncludes` for `packages/fonts/**` on the
  designer routes. Local and CI are unaffected.
- **The `fonts` bucket is empty** until `JOB-materialise_font` seeds it
  (DSG-008). `getFontBinary()` tries the bucket first and falls back to the
  package, so the editor works today and needs no change when the bucket
  fills.

### 1.5 How a template is edited, and why it needed a column

A published version is immutable — no update policy, no update grant, because
an artifact references a `template_version_id` and publishing v4 must not
reach a certificate issued against v3 (`REQ-DSG-007`, `REQ-CRT-014`). So a
template is edited through a working **document** and published **as** the
next version: the same model, the same editor and the same renderer as a
poster, rather than a second editing path nobody exercises.

That is `design_documents.draft_for_template_id` in
`supabase/proposed/designer/0002_template_drafts.sql`, `unique` so two admins
opening the library do not each create a draft and then publish over each
other. The same file adds `design_templates_single_default`, because
0055's partial unique indexes allow at most one default per family but do not
stop an application half-performing a clear-then-set — and a family with no
default is a publish with no template to bind (DEC-012).

### 1.6 What bundle 1 leaves open

- **e2e and the 390 px RTL captures for SCR-055, SCR-056 and SCR-057.**
  SCR-055/056 read `draft_for_template_id`, which lands with `0002`; and
  `.next` on disk predates these commits, so nothing serves the new routes
  until the lead rebuilds. Not faked, not skipped — waiting on both.
- **The `render` queue and the four task registrations** for
  `worker/src/index.ts` come with STORY-DSG-006.
- **Dragging, snapping, alignment guides and undo/redo** are `REQ-DSG-022`
  and land with STORY-DSG-010. The properties panel edits frames numerically,
  which is what DSG-003 needs and is also the only thing that is exact.


---

## 2. Bundle 2

### 2.1 STORY-DSG-005 — presets, safe areas, auto-fit

`packages/designer-runtime/src/presets.ts` and `autofit.ts`.

**Everything is expressed against the SAFE BOX, not the page.** A layer 80 px
below the master's top edge is a layer at the TOP of the safe area, and on
`story` — whose inset is 120 — it belongs at 120. Anchoring to the page would
drift every print preset inward by the difference, and nobody would notice
until the bleed was trimmed. Print margins are held in millimetres, so
changing a dpi cannot silently move them.

**`reflow: stack | inline` is NOT in the model, deliberately.** `06` §5.1
lists it beside anchor, scale and hide-at, and the workshop family's task
strip is its only stated use. Reflow needs a GROUP or a REPEAT concept — a
strip of tasks that can stack or inline — and the layer model has neither.
Inventing one now would be inventing a shape for a template that does not
exist yet. It lands with STORY-DSG-011, where the workshop family forces the
question with a real template in hand. The other three behaviours are
implemented and tested.

**Auto-fit's search is integer-stepped and downward, not binary.** Two
renderers agreeing on 47.318 px is luck, and `06` §9.3's «not a tolerance — a
structural comparison» does not survive luck. The extra measurements cost
nothing on a box measured once per export.

### 2.2 STORY-DSG-006 — the export pipeline

`supabase/proposed/designer/0003_render_pipeline.sql`, `worker/src/render/**`,
`worker/src/tasks/render_variant.ts`, and the queue on SCR-057.

**The fingerprint does not include the preset or the format.** They are their
own columns in `unique (document_id, preset, format, source_fingerprint)`, so
folding them in would give one source seven fingerprints and make "has this
source been rendered?" a question with seven answers. Caught while wiring
`request_render()`, which takes one fingerprint for every target.

**The render context is PINNED into the request, the document is not.** The
resolved bindings and the exact faces travel with the artifact row; the
worker renders THOSE rather than re-resolving `06` §2.3, because a second
resolution can disagree with what the admin previewed and for a certificate
it would break `REQ-CRT-014` outright. The document is read live and the
worker **re-derives the fingerprint from what it actually loaded**, refusing
on a mismatch — so a document edited between request and render fails loudly
instead of rendering new content under an old key.

**Two page probes, and they must stay self-contained.**
`packages/designer-runtime/src/page-probes.ts` holds the text measurer and
the Tier-A signature reader. `page.evaluate(fn)` ships `fn.toString()`, so a
reference to anything outside the body is `undefined is not a function` in
the worker, on the one export nobody re-ran. Keeping them closed is what lets
the editor and the worker share one measurer instead of two that drift.

**What Tier A actually compares, so nobody has to reconstruct it:** the face
resolved (advance against a face that certainly does not exist), letter-spacing
is zero, the fitted size and line count the measurement chose survived the
layout, and — when a previous render of the same fingerprint exists — the
geometry is unchanged. It does **not** prove the shaping is correct; nothing
at export time can. Correctness is the parity suite's seven cases against
reviewed goldens. Tier A proves the export matches what was decided, which is
the failure that reaches a printed page.

### 2.3 For the lead — `worker/src/index.ts` (yours)

```ts
import { render_variant } from "./tasks/render_variant.js";
// taskList: { …, render_variant }
```

The `render` queue's concurrency is **2** (`11` §1.4). graphile-worker sizes
concurrency per process, so the figure belongs to a second runner rather than
to the `default` one — `index.ts`'s own comment already says «render and
convert get their own processes when M6 and M4 introduce them». The jobs are
enqueued onto the named queue `render` by `request_render()`, so a single
runner would still pick them up; the reason for the separate process is `11`
§1.4's: one thirty-second A3 must never starve a reminder.

No crontab line — `render_variant` is enqueued, never scheduled.

New worker environment: none. `CHROME_PATH` is already in the image and
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are already required by the
content tasks.


### 2.4 STORY-DSG-009 — the uploaded poster is a document, not a second pipeline

A32 wants every variant after an upload with a per-variant crop override,
and the document model already does exactly that: one full-bleed image
layer, `scale: fill` on every preset, a focal point overridable per preset.
So an upload produces a document and goes through `derive()` and the same
render queue. No smart-crop service, no second place for a variant to be
wrong, and the crop override is a field rather than a feature.

**A per-preset entry overrides `default` FIELD BY FIELD.** Declaring a crop
for `og` must not silently drop the anchor `default` set — that is how an
override quietly re-tops a centred layer while looking like it only changed
the crop. Pinned by a test.

Image dimensions are read from real headers in the runtime, and the JPEG
reader walks the segment chain rather than trusting an offset: EXIF and ICC
come first and their sizes vary with whatever wrote the file.

### 2.5 STORY-DSG-007 — what each parity path actually asserts

Paths 1-3 are DOM-measured, so Tier A is `06` §9.3's structural comparison in
full. **Path 4 is measured differently and the harness says so** rather than
implying otherwise: a page image out of poppler has no line boxes, so what
it asserts is that our PDF embeds its faces and substitutes none
(`REQ-CRT-005`'s «renders on a machine with no fonts installed», which fails
invisibly because the PDF still opens and still looks like Arabic) plus
per-case pixel parity against a golden crop.

The Tier A probe is now the runtime's `tierASignatureBatch` — the same
function the worker runs on every export. It was a copy living in the
harness, and a copy is what this suite exists to prevent: a harness
measuring differently from the worker can be green while the worker's own
Tier A is wrong.

### 2.6 STORY-DSG-011 — the QR encoder, and the two bugs the method found

No independent QR implementation is available, none may be added, and this
Chromium exposes no `BarcodeDetector`. So the encoder is checked against
**properties the specification fixes, each by a route the encoder does not
use**: Reed-Solomon syndromes vanishing over GF(256) computed from the field
alone, the published generator rows, the thirty-two format strings forming a
BCH code of minimum distance seven, and a hand-worked byte-mode stream.

It found two real bugs on the first run, and both would have shipped:

1. the generator polynomial was built lowest-degree-first while the division
   loop assumed highest-first, so **every** error-correction codeword was
   wrong and every QR unreadable — while looking perfectly plausible;
2. the dark module was cleared by its own format-area reservation, which
   reserved eight modules down the bottom-left column where the
   specification reserves seven.

The baseline library lives in TypeScript and the seed migration is generated
from it, with a test that parses the JSON back out of the SQL and
deep-equals it. A copy nobody compares is a copy that diverges.

### 2.7 What the real browser found that nothing else did

`tests/e2e/designer.spec.ts`, SCR-055/056/057 against real local Supabase.

- ★ **The canvas drew a message key.** An unbound field's label rendered
  `designer.bindings.value` — DEC-047's lesson in a place no catalogue guard
  can see: a message carrying a tag called through plain `t()` renders the
  key, and `t.rich` returns a ReactNode the canvas cannot draw. Composed
  from an untagged key now; the renderer bidi-isolates it itself.
- **The test was wrong before the code was.** It asserted a placeholder on a
  layer declaring a FALLBACK. A fallback is real text the author meant to
  ship, not a placeholder — the distinction `REQ-DSG-006` turns on.
- **The locked-region hint repeated on every card**, so six cards of the
  same three lines made the 390 px page eleven thousand pixels tall. Found
  by looking at the capture, which is the only thing that could have found
  it. Once per section now.
- **The bindings panel said «غير مرتبط» beside a canvas showing text**,
  which reads as a contradiction. It now names the fallback that will print.

**The 390 px helper had a false positive, and it is shared.** It walked
`body *` and flagged anything past the viewport, including items inside an
`overflow-x: auto` container — which `CLAUDE.md` explicitly permits and
which does not make the page scroll. Verified directly: a nav in a scroller
flags fourteen elements on a page whose `scrollWidth` equals its viewport.
The version here asks the real question first (does the DOCUMENT scroll?)
and only then which element is responsible, skipping contained ones.
`console`'s copies of the old helper are behind most of its red 390 px
assertions.

**A real 12 px shell overflow, not mine.** On an admin page at 390 px the
document is 402 px wide. The offender is the sign-out `form`/`button` at
`src/app/[locale]/app/layout.tsx:46` (`…whitespace-nowrap md:px-3`),
measured at `left: -12`. That is the lead's file and the same class of
defect `TEAM.md` §5 already records for that layout.

### 2.8 ★ A trigger that enqueues or notifies is `security definer`

The lead had to change both poster hooks at promotion (0063). As invoker
functions they fired on a PRESENTER's own title edit and on a decline,
called `enqueue_job()` as that member, and turned three wave-1 cases red
with «permission denied for function enqueue_job». `0034`'s `rsvps_notify()`
is the precedent and I should have followed it.

**Why my own tests could not see it.** Every case in
`tests/rls/designer-posters.test.ts` drove the trigger as the OWNER, who
may call anything. A trigger's authorisation only shows up when something
other than the owner fires it. `designer-posters.test.ts` now has a case
that changes identity to a member first, asserts the trigger is never the
thing that refuses the edit, and checks the job is enqueued anyway.

**The rule for everything after this:** a trigger function that calls
`enqueue_job()`, `notify()` or `write_audit()` is
`security definer set search_path = ''`, and its test runs AS A MEMBER.

### 2.9 Two hours lost to a trigger I did not know existed

Both cost me a wrong hypothesis, and both are worth writing down because
the next track to touch `check_ins` or `sessions` from a test will hit
them.

**`check_ins.session_window` is not the value you insert.** `0010` puts a
BEFORE INSERT trigger (`check_ins_window`) on the table that overwrites
`session_window` with `tstzrange(s.starts_at, s.ends_at, '[)')` from the
named session, and `org_id` with the session's. The fixture passing
`'empty'::tstzrange` is therefore decorative — the stored windows are the
sessions' real hours. I spent a long time proving that empty ranges do not
overlap, which is true and entirely beside the point: my test cloned a
fixture session at the SOURCE's hours, so the clone's derived window was
byte-identical to the original's, and `check_ins_member_id_session_window_
excl` correctly refused a second check-in for a member already checked
into the original. The fix is one line — each clone takes a week of its
own — but it is invisible unless you read the trigger.

**There is no admin UPDATE policy on `public.sessions`.** Every state move
is an RPC. My definer case asserted `expect(refused).not.toBe("42501")`
after a direct `update … set state = 'completed'` as an admin; the 42501
came from the row policy, so the assertion could never pass and would have
proved nothing about the trigger if it had. The member-reachable path is
`transition_session(p_session, 'complete')` (`0023`, granted to
`authenticated`, REQ-SES-005's manual complete). The case now calls that
and asserts the fan-out job IS enqueued — positively. A negative assertion
would have been satisfied by a trigger that quietly enqueued nothing.

## 2.10 `/verify` is public, and the proxy's unconfigured gate does not cover it

`isPlatformPath()` matches `/{locale}/app` only, and SCR-006 is
deliberately outside it: a stranger holding a printed sheet has no
session. The consequence is that DEC-038's «the platform is
unconfigured, so every platform route 404s» does NOT apply to
`/{locale}/verify/[code]`, and without a guard `supabaseEnv()` throws
inside `createServerClient()` and serves a **500 on a public URL of a
live site** for as long as production has no `NEXT_PUBLIC_SUPABASE_*`.

The page now calls `notFound()` when `platformConfigured()` is false,
which is what every other unconfigured platform route already renders.
The alternative — widening the proxy's predicate — is the lead's file,
and is the better fix if `/verify` is ever joined by another public
platform route. Flagged at sync.

## 2.11 REQ-CRT-012 has no screen, so it got a slot

«Leaderboard certificates … released by an admin» is the requirement.
SCR-045 is `/app/admin/sessions/[id]/certificates` and an achievement
certificate has no session, so `09` gives that release nowhere to live:
built as specified, every leaderboard certificate would sit `held`
forever and the feature would be a dead end.

`<HeldAchievements locale />` is the answer — a fourth designer slot,
and the only one that writes. It renders nothing unless something is
actually held, carries its own `"use server"` action beside the
component, and calls `revalidatePath` rather than redirecting, because a
slot does not own the route it renders on. `scoring`'s SCR-054 imports
one component and nothing else. **Needs the lead to wire it.**

Two assumptions in `0008` that want a second pair of eyes:

- **«top 3 annual» is read as any FINAL member-ranked snapshot.**
  `leaderboard_kind` has no `annual` member, and 0042 fills
  `leaderboard_entries` with member ranks for `monthly`, `seasonal` and
  `topic`. `topic` is excluded deliberately — a per-category board is
  neither of the two the requirement names, and including it would
  issue certificates for every category every month.
- **A badge certificate issues outright; a snapshot one is held.**
  REQ-CRT-012 says «released by an admin» only of the leaderboard case,
  and awarding a badge already was somebody's decision.

The trigger is on `leaderboard_entries`, STATEMENT-level with a
transition table, not on `leaderboard_snapshots`. 0042 inserts the
snapshot row first and the ranks after, so a row trigger on the
snapshot would fan out over an empty entries table and issue nothing.

## 2.12 Every automatic poster failed, and the editor had been right all along

The lead ran the M6 demonstrable's first sentence against the real
worker image and all twelve variants failed at attempt 1 with «the
render context pins no faces — a render with no font set cannot be
reproduced (REQ-DSG-016)».

**The cause.** `public.fonts` holds only fonts an admin MATERIALISED
(REQ-DSG-017). The platform set — Reem Kufi, Amiri, IBM Plex Sans
Arabic, IBM Plex Sans — lives in the image's `packages/fonts/manifest.
json` and has no row there, so on a fresh install the table is empty.
`regenerate_poster` and `issue_certificates` pinned `faceRows.length ?
faceRows : []`, under a comment of mine that said an empty list means
«use what the image carries». It does not: `render_variant` refuses an
empty set, correctly, and that refusal is the only thing standing
between us and an unreproducible export.

**The editor never had this bug.** `listEditorFaces()` (src/lib/dal/
fonts.ts) has fallen back to the manifest since DSG-005. So a
hand-saved designer document exported fine while every automatic poster
failed — two font resolvers, disagreeing, which is DEC-017 («the
preview an admin approves IS the artifact») failing by construction.
`renderFaces()` in `worker/src/render/fonts.ts` is now the worker's
single copy of that rule and both tasks call it.

**A second bug found while reproducing it.** `fromPackage()` resolved
`packages/fonts` from `process.cwd()`. That is right in the image
(WORKDIR /app) and wrong from anywhere else, so a local reproduction of
a container failure produced a second, fake failure. `@kareem/fonts` is
a declared dependency and exports `./manifest.json`, so both reads now
go through `createRequire(...).resolve`.

**Verified against the real image, not reasoned about.** A fresh
published session through the fixed task queued 12 artifacts each
pinning 21 faces across all four families; the RUNNING `kareem-worker-m6`
container rendered all twelve to `ready` with a Tier A signature on
every one and correct dimensions, in about three minutes. `render_variant`
itself did not change, which is why no rebuild was needed to prove it.

**The retry path does NOT recover the old rows.** A failed artifact's
`render_context` is stored, so `retry_export_artifact()` re-runs against
the same empty face list. Recovery is a fresh publish (or re-enqueuing
`regenerate_poster`), not a retry.

## 2.13 What the 390 px captures actually caught

Three e2e traps and one copy bug, none of which a unit test could see.

- **`<summary>` is not a button.** `getByRole("button", { name: "ألغِ" })`
  waited thirty seconds and then reported the element does not exist,
  which is true: Chromium exposes a disclosure triangle. The row is
  found by its serial and the control by its tag. `console` hit the
  same thing at sync 6.
- **«the list is empty» was never the property under test.** The HOLDS
  case asserted an empty `/app/me/certificates`, but the two cases
  before it issue `automatic` certificates to the same member and those
  are correctly visible. It now asserts that THIS serial is absent
  while held, which is what REQ-CRT-004 actually says.
- **The desktop project's 12 px scrollbar, again.** SCR-045 measured
  402 px in a 390 px viewport with no element wider than the screen.
  The lead diagnosed this at sync 8 and `designer.spec.ts` skips the
  sideways check off the phone project; my copy of `review()` had not
  inherited that. It now returns early off `phone` and still takes the
  screenshot in both.
- **A real overflow underneath it.** SCR-023 measured 432 px, which is
  the 12 px scrollbar PLUS 30 px of genuine overflow: a verification
  code is 24 unbroken base64url characters with no break opportunity,
  so the flex item refused to shrink. `break-all` and `min-w-0` on the
  serial and the code, on both screens. Breaking a Latin code
  mid-string is fine — the rule against clipping is about Arabic text
  lines, and nothing is clipped.
- **The copy bug only a screenshot finds.** The status row read
  «الشهادات صالحة»: I had reused the namespace's own label where a
  field label belonged. It is «الحالة» now. Nothing typechecks that.

## 2.14 The "fewer jobs than artifacts" report: not reproducible, now covered

The lead saw four of six certificate artifacts `queued` with no
`render_variant` job in `graphile_worker._private_jobs`. I could not
reproduce a dropped enqueue, and I think the snapshot was mid-run.

**What the evidence says.** All six artifacts of that run
(`c0000000-…d1`) are `ready` now, three per document, two distinct
documents and two distinct fingerprints. Two new RLS cases prove the
SQL directly: two recipients produce six artifact rows, six
`render_variant` jobs and six DISTINCT keys of `11` §2.5's shape, and
re-requesting the same fingerprint adds neither a row nor a job.

**Why a snapshot can look like a loss.** Renders are SERIAL —
`enqueue_job(..., p_queue => 'render')` puts every one in a single
named graphile-worker queue, and a named queue runs one job at a time
whatever the pool's concurrency is. The lead's own note in
`worker/src/index.ts` already records this as a floor of 1 where `11`
§1.4 asked for 2, held for the wave-3 closing decision. Twelve poster
variants took 168 seconds in my own run, about 14 seconds each, strictly
sequential — which matches. And a COMPLETED graphile-worker job is
deleted, so at any moment the finished artifacts have no job and the
pending ones are behind one lock.

**The one path that would produce it for real** is `render_variant`
returning early when `export_render_context()` finds no row: the job is
consumed and the artifact stays `queued`. That needs the document to
have been deleted mid-flight, which did not happen here. If it recurs,
that is the line to look at first (`worker/src/tasks/render_variant.ts`,
the `if (!ctx)` warn-and-return).

---

## 3. Owner checks that no test here can stand in for

- ★ **Scan both QRs with a real phone, on paper, at print size.** The
  encoder is verified against the specification's own invariants and that
  found two genuine bugs, but nothing in this repository has ever decoded
  one of these symbols. The M6 demonstrable says «scan both QRs», and this
  is the half of it a machine here cannot do. Alongside `notify`'s
  open-the-ICS-in-Outlook check.
- **Look at a printed A3.** The PPI guard, the 3 mm bleed and the RGB
  caveat are all reasoning about paper.

---

## Wave 8 — 2026-09-17 — the plan (planning only; nothing built until the lead approves)

Read for this plan: STATUS (START HERE, wave 8), CLAUDE.md, `DEC-009` … `DEC-147` as the agent file
lists them, `06` whole, `16` §3.1/§4.2/§7.3/§7.4/§8.2/§10/§15 M12/§16.5, `01` `REQ-DSG-001` … `031`,
`REQ-CRT-001` … `014`, the `UIX` rows, `09` SCR-043/045/055–057, `0055`, `0061`, `0063`, `0065`,
`0082`, `0087`, `0088`, `library.ts`, `presets.ts`, `render.ts`, `validate.ts`, `page-probes.ts`,
`worker/src/render/**`, the four tasks, `scripts/parity/**`, the four routes and their components as
they are, and the four artboards rendered to PNG and looked at (Studio, CertBuilder, Certificate,
PosterFlow). `branding`'s contract 1 is **in the working tree, uncommitted** as I write (the
`background` union in `model.ts`, `canvasRaise` in `brand.ts`); this plan is written against that
shape.

### W8.0 Four things found on the read, before any of the questions — each changes the plan

1. ★ **A dark poster switches off the blank-capture guard, in production and in the harness.**
   `inkedRatio()` (`page-probes.ts:197`, called by `worker/src/render/variant.ts:222`) and the
   harness's `inkOf()` count a pixel as ink when any channel is `< 240`. On a `#111a2c → #1d2a42`
   background **every pixel is ink**, so a poster whose text never painted (the `font-display` failure
   that produced two blank goldens, `DEC-024`) reads 100 % inked and ships. The day contract 2 makes
   posters `'dark'`, the guard is void for every poster PNG. **Fix (mine, `page-probes.ts` +
   `variant.ts`): ink is measured against the page's own background** — a second capture with
   `.dr-layer{visibility:hidden}`, pixels differing by `> 2/255` counted — so it holds for a solid
   fill, a gradient and a future image background alike. It lands **before** any call site passes
   `'dark'`, with a unit test that a layer-less dark gradient fails the probe and the same page with
   text passes.
2. ★ **`validate.ts` refuses a gradient today** (`:234` — «a background is `{type: "solid", color}`»).
   It is my file, not one of `branding`'s five. The autosave Route Handler and **both worker tasks**
   call `validateDocument()`, so a gradient template version promoted before this changes makes every
   automatic poster throw. It is my first commit after contract 1 is committed.
3. **The derived portrait certificate is not a composition, and every certificate issued today ships
   one.** `issue_certificates` renders `cert_portrait` from the landscape master through `derive()`.
   Measured on `attendance`: every text layer lands between y = 185 and y = 1028 of a 3508 px page,
   the locked block at y = 2888 – 3208, **a 1860 px (157 mm) empty band between**, the issue date at
   33 px (about 8 pt), and `safeAreaViolations()` reports **nothing** — a safe-area check cannot see a
   bad composition. This is the evidence under contract 3 below.
4. **`16` §15 M12 and §16.5 cite migrations `0087` (focal point) and `0088` (email blocks)**; both
   numbers are now `checkin`'s (`0087_attendance_removal`, `0088_removed_check_in_hooks`). Stale
   references in a `draft` document, for the lead. Focal point needs no migration anyway:
   `design_assets.focal_x/y` and `image.focal` already exist (`0055`, `model.ts`).

### W8.a Contract 3 — what a baseline row is

**The three readings, as written:**

| Source | What it counts | Rows it implies |
|---|---|---|
| `DEC-125`, `06` §3.3's ★ note, `library.ts`'s header | «the variant is the scheme, not a second template row» | 5 + 3 = **8** (what `0061` seeds) |
| `REQ-DSG-026`'s new acceptance | «5 poster families × 2 schemes and 3 certificate families × 2 orientations» | **16** if every product is a row |
| `DEC-128`'s decision | certificates in both orientations **and** both schemes | 5 × 2 + 3 × 2 × 2 = **22** if every product is a row |

**What actually differs between the variants** is the question that settles it, and it is two
different kinds of difference:

- **Scheme is a palette.** Every colour in every template is a `{{brand.*}}` token (`0055`'s guard,
  `REQ-DSG-021`), so a light row and a dark row of the same family would carry **byte-identical
  documents**. Nothing in the document can say which it is; a row would need a `scheme` column whose
  only job is to disagree with nothing. Two identical documents are the drift `library.ts` warns
  about, and the dark copy is the one nobody would look at.
- **Orientation is a composition.** W8.0 item 3: a portrait certificate cannot be derived from a
  landscape one. `REQ-DSG-005` says a document is fully described by its JSON; the orientation is
  already *in* the JSON (`master.width` vs `master.height`), so a portrait template is a different
  document, and a different document is a row.

**Options:**

| | A row is | Seeded | For | Against |
|---|---|---|---|---|
| **A** | a family | 8 (as today) | no schema or seed change beyond v2 posters | orientation stays a `derive()` of landscape — W8.0 item 3 ships on every certificate; the count is of nothing real |
| ★ **B** | a **composition**: (purpose, family, orientation-by-master); **scheme is never a row** | **11** — 5 poster + 3 certificate × 2 orientations | matches the physics of both differences; honours `DEC-125` literally and `REQ-DSG-026`'s certificate half literally; no column needed to tell rows apart (the master says it) | `REQ-DSG-026`'s poster half («5 × 2 schemes») and `DEC-128`'s «10 promised / 5 seeded» table must be read as *renderable variants*, not rows — the acceptance text needs the lead's amendment |
| C | family × orientation × scheme | 22 | matches `DEC-128`'s decision word for word | ten pairs of identical documents; needs a `scheme` column on `design_templates` (frozen `02`) that the document contradicts nothing with; directly reverses `DEC-125`; `design_templates_platform_default` (one default per `(purpose, family)`) breaks twice over |
| D | posters × scheme, certificates × orientation | 16 | matches `REQ-DSG-026`'s acceptance word for word | treats scheme as a row for posters and not for certificates, while `DEC-128` asks for both schemes on certificates — incoherent |

**Recommendation: B.** A baseline row is a composition; scheme is a render-time choice **pinned where
the render is decided** (a poster: always `'dark'`, contract 2; a certificate: the scheme chosen for
its session and pinned on its row, W8.b). **The roster the CI test asserts, as literals** (never
`BASELINE_LIBRARY.length`, which would let a short library shrink its own expectation):

- **11 platform rows**, non-retired, each with a published version: `talk`, `workshop`, `panel`,
  `meetup`, `announcement` exactly once each; `attendance`, `presenter`, `achievement` exactly once
  **landscape** (master 3508 × 2480) and once **portrait** (2480 × 3508).
- **22 renderable variants**: every row × {light, dark} resolves every colour binding it declares
  against `platformBrand(scheme)` (so a token missing from one palette fails), 5 × 2 + 6 × 2.
- every poster row's latest version carries **exactly** `DEC-127`'s background;
- one platform default per poster family and per certificate family, and it is the **landscape** row
  (the portrait rows are `is_default = false` — the existing unique index allows one, and no schema
  change is needed).

`tests/rls/templates-roster.test.ts`, cases `REQ-DSG-026.roster.rows`, `.variants`,
`.poster_gradient`, `.defaults`; proven with `applyProposed()` in a rolled-back transaction, guarded
with `existsSync` so the lead's promotion does not turn it red. **Proposed amendment for the lead to
`REQ-DSG-026`'s acceptance** (only `01` defines): «the seeded roster is counted — 11 platform templates
(5 poster families; 3 certificate families × landscape and portrait), each renderable in both
schemes, 22 variants; a short roster fails CI». **What `platform` needs from this:** SCR-083 lists 11
rows, shows orientation from the master, and «never below one default per purpose» still holds; and
`tests/rls/platform-schema.test.ts:415` (`platform`'s — «reads all eight», `toHaveLength(8)` and a
`toEqual` family list) goes red the moment the seed is promoted — a request to `platform` through the
lead, ideally importing `BASELINE_LIBRARY` there since it is not the roster gate.

**Two consequences worth stating now:** a certificate template exports **only the preset matching its
master** (`presetsForDocument()`, new in `presets.ts`; `issue_certificates`' `certificateTargets()` and
the designer DAL's `exportTargets()` follow) — so a landscape certificate stops producing the bad
portrait PDF, and an existing certificate re-rendered later produces its landscape files only (its old
portrait objects stay in storage, untouched). And `DEC-128`'s «family» at issue time is **not a free
choice**: an attendance certificate uses an `attendance` template (the kind literal is in the
document), so the admin chooses **a template of that family** (org or platform), whose master gives
the orientation, and a scheme.

### W8.b The seed's shape, and what happens to what already exists

**Two proposed files, in this order** (numbers are mine; the lead renumbers):

1. `supabase/proposed/designer/0001_template_guard_walks_every_colour.sql` — W8.f's fix. **First**,
   so the seed below is checked by it.
2. `supabase/proposed/designer/0002_certificate_library.sql`, **generated from `library.ts`** and
   compared back by `tests/unit/designer-library.test.ts` (the `@family` marker grows an orientation:
   `-- @family attendance@portrait`), idempotent on `(scope, purpose, family, orientation)`:
   - the five poster templates gain **version 2** — `DEC-127`'s gradient
     `{ type: 'gradient', angle: 140, stops: [{ color: '{{brand.surface}}' }, { color: '{{brand.canvasRaise}}' }] }`,
     every other layer unchanged; version 1 is never edited (`REQ-DSG-007`);
   - three **new platform templates**, one portrait composition per certificate family, version 1,
     `is_default = false`, the same layer ids as landscape (`l_qr`, `l_serial`, `l_code`,
     `l_signature` locked) so the locked-region guard and its tests hold unchanged;
   - the three landscape rows **renamed** «شهادة حضور أفقية» etc. and the portrait rows named
     «… عمودية» (a platform reference row, `0083`'s precedent for seeds; scoped by scope, purpose,
     family and the old name). Optional — the lead may prefer an orientation badge alone;
   - certificates keep `background: solid {{brand.canvas}}`. `DEC-127` is about posters; a dark
     certificate is a flat `#0b1220` page. Stated so nobody reads it as an omission.

   **Promotion order is a hard dependency** (risk 2): contract 1 committed → my `validate.ts` change
   committed → `branding`'s B1 (the renderer paints the gradient) committed → then this file. Promoted
   before B1, every regenerated poster renders on the `#ffffff` fallback, silently.

3. `supabase/proposed/designer/0003_certificate_designs.sql` — the issue-time choice (`DEC-128`), which
   needs somewhere to live, because automatic issuance has **no human at issue time**: it is the edge
   into `completed` (`sessions_certificate_hook`).
   - **`ENT-session_certificate_designs`** (new; an amendment to frozen `02` §4.12, the lead's
     DECISIONS entry): `org_id`, `session_id`, `kind` (`attendance` | `presenter`), `template_id`
     (a certificate template of the matching family, org or platform), `scheme`
     (new enum `brand_scheme`), `updated_by`, `updated_at`; `unique (session_id, kind)`. Staff read;
     no write grant — written only through `set_certificate_design()` (`assert_fresh_admin()`,
     audited), which refuses once any certificate of that kind for that session is `issued` or
     `revoked` («design_locked»). No row = today's behaviour: the family default, `light`.
   - **`certificates.scheme brand_scheme not null default 'light'`** — pinned at issuance beside
     `template_version_id` and `font_hashes`, because a reissue in 2031 must know the scheme and
     nothing else records it (`REQ-CRT-014`). The default is **true of every existing row**: all were
     rendered light.
   - `issue_certificate()` re-created **from `0088`'s text, not `0065`'s** (it carries `DEC-141`'s
     `removed_at is null`; `RPC-issue_certificate.no_check_in_when_removed` must stay green with this
     layer applied), reading the design row; `certificate_render_context()` dropped and re-created
     with `scheme` (a return-type change); `record_certificate_document()` also updates
     `template_version_id`, or the locked-region guard compares a redesigned document against the old
     version.
   - `redesign_held_certificates(p_session, p_kind)` — **review mode only**: re-pins held rows to the
     current design, audited, and re-enqueues `issue_certificates` with `11` §2.5's key (the key
     moves the job; the task is idempotent on the row and requests a render under the new
     fingerprint). A held certificate is invisible and unemailed (`REQ-CRT-004`), so re-pinning it
     breaks nothing anyone holds. The serial is untouched.
   - `03` §8.2 rows handed with the file: `POL-session_certificate_designs.select_staff`,
     `.no_write_grant`, `RPC-set_certificate_design.admin`, `.family_matches_kind`, `.locked_after_issue`,
     `RPC-issue_certificate.pins_design`, `.no_design_is_default_light`,
     `RPC-redesign_held_certificates.held_only`; tests in `tests/rls/certificates-designs.test.ts`.

**What happens to what already exists** — nothing is re-rendered by a migration:

| Who | What they see |
|---|---|
| a **live auto poster** on a platform template | unchanged until its next regeneration (a title/date/venue/presenter change, or a brand save — `branding`'s `0071`); **then** v2 and `'dark'` together. `poster_render_context()` already picks the latest version of the default, so no SQL change is needed |
| an org that **duplicated** a platform template (or made an org default) | its copy never receives v2 (`REQ-DSG-008`), **but it renders `'dark'`** at its next regeneration, because the scheme is the call site's, not the template's — a dark flat `{{brand.canvas}}`, not a gradient. Every token clears contrast in both palettes, so nothing becomes unreadable |
| a **customised** (detached) poster | never regenerated (`REQ-DSG-003`); the editor previews it `'dark'`, so its next export is what the admin saw |
| an **issued certificate** | unchanged: pinned version, `scheme = 'light'` by the column default, landscape files |
| a **held certificate** (review mode) | unchanged until an admin changes the session's design and redesigns |
| **upcoming sessions' posters** | a mix of old light and new dark until each regenerates. ★ **For the owner:** a scoped one-off `regenerate_poster` enqueue for live posters of sessions with `starts_at > now()`, run after deploy under `DEC-023`'s rules — a data fix, never a migration. Twelve variants take about three minutes each, serially |

### W8.c The four routes

**Common to all four:** strings move off `?done=`/`?error=` query banners and hard-coded `/ar/`
redirects onto `useActionState` + `ui/toast` (`16` §7.3), the pattern `console` used in wave 7; every
form `noValidate` (the carried item, both files named); `ui/page-header`, `ui/section-header`; a
destructive act confirms in `ui/dialog` naming the object (`REQ-UIX-013`); `notFound()` under `/app`
streams 200 + `noindex` (`DEC-134`), and the specs assert that. Captures honour `E2E_SHOTS_DIR`.
`messages/*/certificates.json` is mine again — `app/me/certificates` (nobody's this wave) reads its
keys, so **no existing key is renamed or deleted**; new keys only.

#### D1 · `/app/admin/designer/[documentId]` — SCR-057, after `Studio.dc.html`

- **Primitives:** `page-header` (breadcrumb back to the document's owner — the schedule screen for a
  session poster, the library for a template draft, SCR-045 for a certificate — and a `badge` status:
  «مرتبط بالقالب» / «منفصل عن القالب» / «مسودة قالب» / «للعرض فقط»), `icon-button` (undo/redo), `button`
  (export), `tabs` (the left rail: «الطبقات» · «البيانات» — only panels that exist), `panel` (inspector
  sections, as local disclosures), `field` + `input` (X/Y/W/H/rotation, **demoted into a collapsed
  «الموضع والحجم», never removed** — `DEC-093`), `select` (font, weight, alignment, the background
  control once B1 lands: solid or gradient, tokens from `BRAND_COLOUR_TOKENS`, angle), `switch`
  (overlays, auto-fit), `badge` (per-variant export status), `empty-state` (no exports yet), `toast`
  (save failure, conflict, export queued), `skeleton` in a route `loading.tsx`, `route-error` in an
  `error.tsx`.
- **DAL:** unchanged reads (`getDesignerDocument`, `listEditorFaces`, `getExportQueue`,
  `assetSizesFor`); add-only on `DesignerDocumentData`: `title`, `draftForTemplateId`, `scheme`
  (the preview's — poster `'dark'`; certificate its pinned row; certificate template draft a
  `?scheme=` toggle resolved server-side, so the brand is still composed at request time); signed URLs
  for **ready** artifacts, so the variant strip shows the worker's own renders (`DEC-017`).
- **Phone (the required capture): view and approve** (`09`). The canvas scaled to width, the checks
  with a count, **every variant as the worker rendered it**, and one primary action. ★ There is no
  «approve» in the data model: I read it as **«اطلب التصدير»** — the artifact the admin approves *is*
  the export (`DEC-017`) — and «send back» (`16` §10.2.2) is **not built**, having no entity and no
  recipient. A question, W8.c.q1.
- **Captures** (`wave8-designer-editor-*`): `review` (a session poster, variants ready) · `rendering`
  (queued/rendering) · `failed` (a failed variant with retry) · `readonly` (a presenter). Plus one
  1440 px desktop capture of the editor for the lead's eye, since the editor is desktop-only.
- **Spec:** `tests/e2e/wave8-designer-editor.spec.ts` — a real autosave and a real render through the
  worker at least once.
- **Where `Studio.dc.html` contradicts a requirement or a decision** (`DEC-114`: questions, not
  instructions):
  1. every number is Arabic-Indic — the poster's date, the variant labels (4:5, 9:16), the checks
     sentence («… by 18 px») — Western (`DEC-124`);
  2. the poster on the artboard is a **flat** navy; `DEC-127` wins (a gradient);
  3. «الملصقات» as the back link names a list that does not exist (`DEC-141`: no designer landing) —
     back goes to the document's owner screen;
  4. the rail's «إضافة، نصوص، صور، أشكال، قوالب» — adding layers and swapping templates exist nowhere,
     and swapping a template inside a detached document has no meaning under `REQ-DSG-003`; not drawn;
  5. «معاينة» beside «تصدير» — the canvas already is the live preview, and the approved preview is the
     export; one control, not two;
  6. «SC 2.5.7 · كل عملية هنا بنقرة واحدة — لا سحب» in the toolbar is a designer's annotation, not copy;
  7. the selection handles, drag guides and ruler readouts are `16` §10.2's M12 mechanics (W8.d);
  8. the mobile view is not drawn at all — `09` governs.

#### D2 · `/app/admin/templates/posters` and D3 · `/app/admin/templates/certificates` — SCR-055/056

**No artboard draws either screen.** `PosterFlow.dc.html` is SCR-043's poster section, the export
queue and the detach dialog; `CertBuilder.dc.html` is SCR-057 editing a certificate template. What the
libraries follow is `16` §10.3's text («the same card grid … «منشور» / «مسودة» state, a duplicate
action, a usage count, and the platform library as a clearly separate, read-only-until-copied
section»), with the card media of `PosterFlow` and the status chip of `CertBuilder`.

- **Primitives:** `card` + `CardMedia` (a **live render** of the template's latest version through the
  runtime, inert and lazy, at the scheme it renders in: posters dark; certificates light with a
  section-level «فاتح / داكن» toggle — W8.h), `CardBody`, `CardActions`, `badge` («قالب المنصة»,
  «افتراضي», «منشور N», «مسودة غير منشورة», «متقاعد», «أفقي» / «عمودي»), `menu` (set default,
  retire/restore, rename), `dialog` (duplicate with a name; create blank with name and family — and, for a certificate, orientation, since the blank document is landscape today; retire
  confirm naming the template), `field`/`input`/`select`/`submit-button`, `empty-state` (no org
  templates, naming «انسخ من قوالب المنصة»), `toast`.
- **DAL** (`templates.ts`, mine; add-only fields): `usageCount` (posters: documents bound to a session
  on any version of the template; certificates: certificates pinned to any version — both scoped by
  RLS to the org), `orientation` (from the latest version's master), `previewDocument` (the latest
  version's JSON, for the card media). `platform`'s own functions stay in its
  `platform-templates.ts`.
- **Phone:** «عدّل» opens SCR-057, which is view-only below 1280 px — the card says so rather than
  leading to a surprise.
- **Captures** (`wave8-designer-templates-posters-*`, `wave8-designer-templates-certificates-*`):
  `populated` (the baseline and an org copy — required) · `empty-org` · `duplicate-dialog` ·
  `moderator` (read-only) · certificates `populated` shows both orientations, and `dark`.
- **Spec:** `tests/e2e/wave8-designer-templates.spec.ts` (duplicate → edit → publish → set default,
  against real Supabase).
- **Contradictions carried by the two artboards these borrow from:**
  1. `CertBuilder` names bindings `certificate.issued`, `certificate.verify`, `certificate.achievement`;
     the runtime's are `certificate.issuedAt`, `certificate.verifyUrl`, `certificate.achievementName`
     (`06` §2.3) — ours;
  2. `CertBuilder`'s serial reads `KM-2026-0417`, four digits; `REQ-CRT-008` and `0055`'s check are six
     (`KM-2026-000417`);
  3. both certificate artboards print the serial **and no verification code** beside the QR;
     `REQ-CRT-010` requires both;
  4. `CertBuilder`'s face is «Amiri · 700». The model's `FontSpec.weight` is `400 | 500 | 600`
     (`model.ts`, `branding`'s file this wave) and Amiri ships 400 and 700 only, so `library.ts`'s
     `600` **already renders the 700 face** by CSS matching, identically in editor and worker. Not a
     parity defect; a type that cannot state what renders. Recorded, not changed this wave;
  5. `CertBuilder`'s check «the longest name in the org (38 letters) overflows the portrait field» is a
     good idea and no requirement — M12, a question;
  6. `PosterFlow`'s upload card says «no other sizes are derived — what you upload is what is
     published»; `REQ-DSG-020` says every variant **is** derived by smart-cropping. And it lists
     «PNG or JPEG», dropping WebP (`DEC-009`);
  7. `PosterFlow`'s detach dialog says a customised poster «will not be affected by a change to the
     org's identity»; it binds `{{brand.*}}` like any document, so a brand change reaches its **next
     export** — it is only never *regenerated*. And «going back means deleting the copy and starting
     from the template» describes an action that does not exist (`REQ-DSG-003`: one-way);
  8. every count and date in all four is Arabic-Indic — Western.

#### D4 · `/app/admin/sessions/[id]/certificates` — SCR-045, after `Certificate.dc.html`

**Scoped, not the whole three-step flow** (`DEC-147` leaves the scope to this plan). The screen
separates `REQ-DSG-031`'s three meanings of «شهادة» as three sections, in this order:

1. **«التصميم»** — per kind present (حضور, تقديم): the template (`radio-group` of cards over the org's
   and the platform's templates of that family, each with its orientation), the scheme
   (`radio-group`, «فاتح» / «داكن»), and a **real-data preview** through the runtime — a real
   recipient's name (the first held certificate, else the first checked-in member) and the session's
   title; serial and code render as **marked placeholders** until one exists (`REQ-DSG-006`). Saved by
   `set_certificate_design()`; locked (read-only, with the reason) once issued. In review mode with
   held rows, «طبّق على المحجوزة» calls `redesign_held_certificates()` behind a confirm.
2. **«من يستحق»** — the mode as a read-only `badge` with a link to the schedule screen, **where it is
   set** (`REQ-CRT-002`: at scheduling time; the lead's L2); before completion, the names that
   `fan_out_certificates()` will use — non-removed check-ins and accepted presenters — with a count
   (all six plural forms); after completion, the three lists.
3. **«الإصدار»** — held: `data-table` with selection, bulk «أطلق» behind a `dialog` naming the count;
   issued: per row «ألغِ» behind a `dialog` with a mandatory reason (`field` + `textarea`, `noValidate`,
   `REQ-CRT-011`); revoked: the row and **its reason visible to staff** (including `checkin`'s fixed
   «أُلغي تسجيل الحضور»), never on `/verify`. Per-certificate render status (`badge`) with a retry for a
   failed PDF — `REQ-DSG-031`'s third acceptance, through the existing `retry_export_artifact()`.

- **Primitives:** `page-header`, `panel` (mode notice), `badge`, `section-header` with counts,
  `radio-group`, `card`, `data-table` (selection + actions), `dialog`, `field`, `textarea`,
  `submit-button`, `toast`, `empty-state` (mode off; nothing held; nothing revoked).
- **DAL** (`certificates.ts`, whole file mine again): `getSessionCertificates` gains `scheme`,
  `templateName`, `orientation` and artifact status per row; new `getCertificateDesign(locale,
  sessionId)` (the choice, the eligible templates per kind with preview documents, whether locked);
  new `listEligibleRecipients(locale, sessionId)`; writes `setCertificateDesign`,
  `redesignHeldCertificates`, the existing `releaseCertificates`/`revokeCertificate`.
- **Captures** (`wave8-designer-certificates-*`): `held` · `release-confirm` (the bulk dialog open) ·
  `revoked` (with its reason) · `design-landscape` · `design-portrait` · `mode-off` · `design-locked`
  · `revoke-dialog`.
- **Spec:** `tests/e2e/wave8-designer-certificates.spec.ts`; `tests/e2e/certificates.spec.ts` (mine)
  is updated where its selectors move.
- **Where `Certificate.dc.html` contradicts a requirement:**
  1. ★ **«من حضر وقيّم الجلسة» — eligibility by having rated.** `REQ-CRT-001`: attendee certificates
     key off the check-in «and nothing else». Worse, a certificate is visible to its holder and its
     state is public at `/verify`, so the set of certificates would disclose **who rated** — the
     correlation `DEC-094` exists to prevent (`REQ-RAT-004`). Not built;
  2. **«اختيار يدوي» and per-row «استثنِ»** — no data model for a pre-issuance exclusion, and
     `REQ-CRT-001` gives none. The hold-back that exists is review mode's `held`; that is what the
     screen offers;
  3. ★ **«حُجز المدى 0417 — 0468», a reserved serial range, as a preflight item.** A range reserved
     outside the issuing transaction is a gap the moment one certificate is not issued — the thing
     `DEC-010`'s locked counter row exists to prevent (`REQ-CRT-008`). **`REQ-DSG-031` itself lists
     «serial range reserved»**, so this is a conflict *inside* the PRD, for the lead: I propose
     showing the **expected next serial and count** as an estimate, never a reservation;
  4. «تطابق التصدير — 0.00 %» — a pixel percentage is Tier B, which runs in CI, not per export; what
     runs per export is Tier A, which is structural and has no percentage (`06` §9.1). If a preflight
     line is shown it reads Tier A on the preview's render, pass or fail;
  5. the mode chosen on this screen (step 2 as eligibility rules) vs `REQ-CRT-002` (set at scheduling,
     on SCR-043) — the mode stays on the schedule screen;
  6. «الإصدار» as a button: in automatic mode issuance *is* the completion edge; the button exists
     only as review mode's release;
  7. the preview shows light only — `DEC-128` gives both schemes; the serial `KM-2026-0417` is the wrong
     shape again; every number is Arabic-Indic.

**Questions for the lead (and the owner through the lead):** q1 what «approve / send back» on the
phone means, if not «request the export»; q2 the preflight's serial line (point 3 above); q3 whether
`PosterFlow`'s detach dialog copy (D2 point 7) should promise anything about the brand; q4 the
dark-gradient network rule (W8.e); q5 whether a poster's scheme should ever be choosable — contract 2
fixes it at `'dark'`, so the «light» half of «each light and dark» is renderable and tested but not
reachable by an admin.

### W8.d `16` §10.2's M12 mechanics — which, and at what cost

S ≤ half a day · M one to two days · L three or more, each including its tests.

| Mechanic | Cost | Proposal | Why |
|---|---|---|---|
| Top bar, tabbed rail, inspector accordion with «الموضع والحجم» collapsed | M | **in** | this *is* the chrome the route moves onto the system; `DEC-093`'s demotion without removal |
| Checks as a badge with a count; clicking a check selects its layer (`REQ-DSG-029` 2nd acceptance) | S | **in** | the checks already carry `layerId`; «a check that does not point at the layer is a riddle» |
| Variant strip: every preset, a warning dot where a check fails, the ready artifact's own thumbnail | S | **in** (no live renders) | `REQ-DSG-029`'s strip with the worker's renders rather than seven live iframes |
| Align to the safe area / page (start · centre · end, both axes) and «لائم المنطقة الآمنة», on the **document's** axis | S–M | **in** | pure functions over frames in a new `align.ts`; they are `DEC-093`'s pointer path and they make demoting the numbers honest; `DEC-096`'s one test: the same «align start» from an `ar` and an `en` console stores **byte-identical** documents (`tests/unit/designer-align.test.ts`) |
| Layer order ▲▼ on every row, bring to front / send to back | S | **in** | `DEC-093` path 2; no drag |
| Click-only gate for everything above (`page.click()` only, the document changed) | S | **in** | `REQ-DSG-028`'s first acceptance, for the operations that exist |
| Distribute (needs multi-select) + shift-click multi-select | M | out | nothing this wave needs a group; a marquee never ships alone anyway |
| Arrow-key nudge on the visual axis | S | out | focus model on an inert iframe needs care; the numbers and align cover it |
| Drag, eight-handle resize, rotate, snapping guides, marquee | L | **out** | the overlay's physical-coordinate exemption (`DEC-096`) and the drag model are the risk of M12; not with gradient parity in the same wave |
| Focal point: nine-point grid + dot (`REQ-DSG-030`) | M | out | no migration needed (W8.0 item 4); the only image layers are the logo and uploaded posters |
| Poster three-card chooser with the detach dialog (`16` §10.3, `REQ-UIX-013`) | M | **the lead's call** | `PosterPicker` is mine and its props would not change, but it renders on L2's screen; `REQ-UIX-013` names «detaching a poster» among the acts that must confirm by name |
| Certificate three-step flow with the full preflight | L | partial (D4) | the three meanings separated; no serial reservation; Tier A line only if the preview renders |
| Template management card grid | M | **in** (D2/D3) | it is the route |
| Phone review screen | S | **in** (D1) | it is the required capture |

### W8.e Parity — the cases I will add, and which goldens move

**No existing golden moves.** `scripts/parity/paths.mjs`'s `buildDocument()` keeps
`background: solid #ffffff`, deliberately: shaping geometry does not depend on the background, and
the harness's own blank-capture guard counts any pixel `< 240` as ink — a dark background under the
seven text cases would make every capture «100 % inked» and silently retire the guard that has caught
two blank goldens. The 28 text assertions stay 28 (21 locally without `cwebp`). What `DEC-125`/`127`
move is **production renders and the e2e captures of posters**, not the text goldens; L6's before and
after is the new block below.

**A separate background block**, reported apart from the 28 so «28 of 28» keeps its meaning, a
text-free 540 × 675 poster-proportioned document on `platformBrand('dark')`:

| Case | Asserts | Platform-independent, so blocking in CI? |
|---|---|---|
| `gradient-rtl` | computed `.dr-root` `background-image` is `linear-gradient(140deg, rgb(17, 26, 44), rgb(29, 42, 66))`; the top-left corner is darker than the bottom-right; Tier B against a new golden | structure and corner order: yes · Tier B: advisory off-platform (`DEC-028`) |
| `gradient-ltr` | the same document with `direction: 'ltr'`: `220deg` in the computed style; top-right darker than bottom-left; ★ **the LTR capture equals the horizontally flipped RTL capture** within Tier B's 0.1 % — both rendered in the same run, so no golden is involved | **yes, all three** — this is the assertion that turns `360 − angle` from a comment into a pixel fact |
| `gradient-unresolved` | a gradient whose stop tokens are not bound never paints `#ffffff` silently: `background-image` is not `none` | yes — `branding`'s trap 1, held shut |
| `ink-on-dark` | the production probe (W8.0 item 1): the layer-less dark gradient **fails** the ink check; the same page with one text layer passes | yes |

New golden files (`scripts/parity/goldens/backgrounds/{gradient-rtl,gradient-ltr}.png` and a
`backgrounds` key in `signature.json`) are **written by my `--update`, never committed by me**; the
lead reviews the images by eye and commits them. Built after B1 — before it, `gradient-rtl` is red by
design, which is the point of writing it first.

**One design question the numbers raise (q4):** the Knowledge Network rule binds `{{brand.spine}}`,
which in the dark palette is `#252e3d` — **1.27:1 on `surface`, 1.05:1 on `canvasRaise`**. Decorative,
so no WCAG failure, but at the lit end of the gradient the rule and its dots vanish. Text is fine
throughout (`fgMuted` 6.78:1 and `fgHeading` 14.36:1 on `canvasRaise`). Rebinding the rule to
`edgeStrong` (1.88:1) is a v2 layer change I will not make without a ruling.

### W8.f Does `0055`'s no-hex guard walk gradient stops? — **No.**

`design_template_versions_guard()` (`0055:472`) reads `new.document#>>'{background,color}'`, which is
`null` for a gradient, and then only `color`, `shape.fill` and `shape.stroke` on each layer. So
`{ type: 'gradient', stops: [{ color: '#1d2a42' }] }` passes. It also matches only `^#`, so
`rgb(29,42,66)`, `hsl(…)` and `navy` pass today on any field. No later migration re-creates it.

**Proposed fix** (`0001_template_guard_walks_every_colour.sql`, `create or replace`, forward-only; it
only fires on insert/update, so no existing row is re-judged): collect **every** colour-bearing value —
`background.color`, each `background.stops[*].color`, each layer's `color`, `shape.fill`,
`shape.stroke` — and refuse any present value that is not a `{{brand.<identifier>}}` binding: an
allowlist of the binding shape instead of a denylist of one notation. Token *membership* stays in
TypeScript (`brandViolations()` in `library.ts` checks against `BRAND_COLOUR_TOKENS`, stops included)
rather than a second copy of the token list in SQL. RLS cases in
`tests/rls/templates-guard.test.ts`: `POL-design_template_versions.guard_gradient_stop_hex`,
`.guard_rgb_literal`, `.guard_token_passes`. Checked first: no platform or org template version in
the tree carries a non-token colour — every org copy descends from `0061` and the editor has no colour
control today — so no in-flight draft becomes unpublishable. Production is the owner's to confirm with
one read before promotion.

### W8.g «A member re-added after a removal gets no new attendance certificate» — **not this wave**

It is two blockers, not one: `fan_out_certificates()` fires only on the edge into `completed`, **and**
even when enqueued, `issue_certificate()`'s idempotency select returns the existing **revoked** row
while `unique (org_id, session_id, member_id, kind)` forbids a second. Fixing it means deciding
whether a re-added member gets **a new certificate with a new serial** (the unique becomes partial on
`state <> 'revoked'`; the old code still verifies as «ملغاة») — a product ruling nobody has made — plus
a trigger on `check_ins` (`checkin`'s table, not spawned) and, for consistency, the matching question
for the reversed attendance points (`scoring`'s, not spawned). The certificate library does not depend
on any of it. **What I will do this wave:** SCR-045's «من يستحق» shows a checked-in member whose
attendance certificate is revoked as its own visible state, so the gap is seen by staff rather than
silent. If the owner rules «new serial», it is a small proposed file of mine plus a request to the
lead for the `check_ins` hook.

### W8.h Primitive requests (both to the lead as custodian)

1. **`src/components/ui/card.tsx` · `CardMediaProps`** (`content`'s):
   - `aspect` gains `"297/210"` and `"210/297"` — A4 landscape and portrait, for certificate cards;
     `"4/5" | "16/9" | "1/1"` has no paper ratio;
   - `children?: ReactNode`, rendered **in place of** the `<img>`/placeholder (overlay and `dimmed`
     unchanged) — the template card's media is a live runtime render, not a URL, because a template
     has no artifact.
   Fallback if declined: my own media box inside `Card`, which `ui-reach` still counts, at the cost of
   a second media wrapper.
2. **Nothing else.** The inspector's collapsible sections are local disclosures (a `buttonClass('ghost')`
   trigger with `aria-expanded`), not a new primitive; every other control above exists.

### W8.i What I need, from whom

- **`branding`:** contract 1 **committed** (it is in the tree, uncommitted); B1 mirrors the angle in
  **both** `renderDocumentToFragment()` and `renderDocumentToHtml()`'s `<body>` background; the
  collector walks every stop; and, if cheap, an exported pure `backgroundCss(doc, ctx)` from
  `render.ts`, so the harness's structural assertion and the editor's background swatch use the
  renderer's own string. B2 matters to me too: an org with a saved kit and no `canvasRaise` column
  gets the platform navy at the far end of its gradient.
- **lead:** the contract-3 ruling; approval of `ENT-session_certificate_designs` and
  `certificates.scheme` (a frozen-`02` amendment); the `REQ-DSG-026` acceptance wording; the M12
  subset of W8.d and the `PosterPicker` call; the `CardMedia` request; routing the
  `platform-schema.test.ts:415` change to `platform`; q1–q5; the post-deploy poster regeneration as an
  owner data fix; the `16` §15/§16.5 migration-number note.

### W8.j Order, once approved

1. `validate.ts` accepts a gradient; `brandViolations()` walks stops; the ink probe measured against
   the background (`page-probes.ts`, `variant.ts`, units); `0001` guard + RLS cases. Independent of
   the ruling; only contract 1 committed.
2. **D1** — the designer on the system (no SQL dependency), with the approved M12 subset.
3. After the ruling: `library.ts` (v2 posters, three portrait compositions, `presetsForDocument()`),
   `0002` seed, the roster RLS test, `designer-library.test.ts` rewritten; **D2/D3**.
4. `0003` certificate designs + RLS; the call sites (`regenerate_poster` `'dark'`,
   `issue_certificates` the pinned scheme, the designer DAL by purpose); **D4**.
5. After B1: the parity background block, `--update`, the before/after handed to the lead (L6).

Each route closes with tsc, lint (`problems` grepped), vitest, `test:rls` (single-runner checked),
`parity` 21/28 locally, `fonts:check`, its one e2e spec through the gate lock, `ui-reach --wave8` ✓,
and its captures opened at full resolution — then «ready for sync».

### W8.k The top three risks

1. **The dark scheme voids the blank-capture guard** (W8.0 item 1) — a silent production failure mode
   that every existing test would pass. Mitigated only if the probe fix lands before the first
   `'dark'` call site.
2. **Cross-track ordering of the gradient** — `validate.ts` (mine) refuses it, `render.ts`
   (`branding`'s) paints white until B1, and the seed is promoted by the lead. Any of the three
   out of order is every automatic poster failing, or rendering white, on the next title edit.
3. **Re-creating `issue_certificate()` over `checkin`'s `0088`** for the pinned design — a copy taken
   from `0065` would silently drop `DEC-141`'s removed-check-in filter, and the new table is a
   frozen-`02` amendment in a wave with no spare sync. Mitigation: start from `0088`'s text, keep
   `RPC-issue_certificate.no_check_in_when_removed` in my proposed-layer run, and hand the
   `03` §8.2 rows with the file.

### W8.l D4 as built — SCR-045 on the system (2026-09-17)

Three sections for the three meanings of «شهادة» (REQ-DSG-031): **التصميم** (per kind: template
radio group with the composition named, scheme radio group, the renderer's preview, a preflight,
save, «طبّق على المحجوزة» behind a confirm), **من يستحق** (exactly the fan-out's two groups, the
serial estimate before completion), **الإصدار** (held with bulk release behind a confirm naming
the count and the session; issued with revoke-with-reason inside the confirm; revoked with its
reason; each row's render status with a per-certificate retry). The mode is shown under the title
with a link to the schedule, never changed here.

Decisions taken inside the ruling, stated so they can be reversed:

- **The preflight is the studio's checks, not Tier A.** Tier A compares the worker's Chromium
  capture against the worker's own auto-fit decision; the same probe in the admin's browser would
  be a Safari-or-Chrome number with no bearing on the artifact (DEC-017). So the panel runs
  safe-area and auto-fit's floor/line limit through `domTextMeasurer` with the faces by SHA-256,
  **against the longest eligible name**, and says in one line that each file is checked again in
  the export engine, with any failure on its row and a retry. The preview uses the same longest
  name, so the admin approves the worst case rather than the sample.
- **The serial line** reads this year's highest serial in the org (`certs_read_held_admin`) plus
  one — `certificate_serial_counters` has no policy and stays that way. Admin only, before
  completion, mode not off, someone eligible. `estimateNextSerial()` in the DAL.
- **A moderator** reads the design and the list, and no certificate — `certs_read_*` are admin-only,
  so three empty tables would claim «none issued». The issuance section says whose it is instead.
- **`automatic`** has no held table at all; **`off` with nothing ever issued** replaces the tables
  with the one sentence.
- `certificates.review.*` deleted from both catalogues (SCR-045 was its only reader); screen strings
  live in `certificates.session.*`.

Found by the real-DB spec, fixed in the DAL: `check_ins` reaches `members` three ways (member,
`marked_by`, `removed_by`), so the unnamed `members(display_name)` embed was an ambiguity error the
DAL swallowed — «لا أحد بعد» over a full room. The embed is named
(`members!check_ins_member_id_fkey`) in both reads, and the eligible read now **throws** on error.

**`tests/e2e/certificates.spec.ts` moved with the screen** (it is in this track's edit list): the
`REQ-CRT-011` case revokes from the issued table's row through the dialog, and reads the reason on
the revoked table (the phone's card list carries the same text hidden, which strict mode counts);
the `REQ-CRT-004` case ticks the recipient's row and confirms the release. 8/8, both projects, on
`next dev` against local Supabase.

`tests/e2e/wave8-designer-certificates.spec.ts` covers the same guarantees plus the design, the
lock, redesign-held, the estimate and the moderator, and writes
`wave8-designer-certificates-{held,release-confirm,design-landscape,design-portrait,revoked,revoke-dialog,design-locked,mode-off,moderator}.png`.

### W8.m The poster picker on the system, and the detach that was never wired (2026-09-17)

**Found while building the chooser — a live REQ-DSG-003 defect.** `detach_poster()` (`0063`) had no
caller. The copy said «أول تعديل يفصل الملصق», but a save to a live poster's document updated the
row and left `session_posters.binding = 'live'`; `regenerate_poster` renders the TEMPLATE for a live
poster, so the admin's edit never reached an export and the next title change regenerated over it —
the overwrite `DEC-012` exists to prevent, silently. Fixed without SQL:

- `saveDesignDocument()` refuses a save to a live poster (`live_poster`, 409 from the autosave route).
  It does not detach on the side: `REQ-UIX-013` names detaching among the acts that confirm by name.
- The studio opens a live poster **read-only** with a panel and the same confirm as the way forward.
- The picker's «خصّص» is that confirm: it names the session, says the detach is one way, and says
  the only brand truth (`DEC-148` q3) — never regenerated, brand colours still apply at its next
  export. Confirm → `detach_poster()` (audited `design.poster_detached`) → the studio, editable.

**The chooser** (`PosterPicker`, props unchanged): three `ui/card`s — تلقائي, تخصيص, رفع ملصق جاهز —
the current one marked, the stale prompt when details moved under a detached poster, and the
automatic card saying there is no way back once detached. **The upload path was also unbuilt in the
UI** (`attachUploadedPoster()` had no caller): it is now `ui/file-drop` → the two asset Route
Handlers (sniffed after landing, `DEC-009`; `limit_poster_mb` when the upload is a poster) → a confirm
naming what it replaces → `attachPosterUpload` → `requestExports()` for every variant.

`tests/e2e/wave8-designer-posters.spec.ts` proves: the cancel changes nothing and the confirm flips row,
mode and audit together; a save sent to a live poster anyway is 409; an SVG named `.png` typed
`image/png` is refused on its bytes; an 800 × 900 PNG is refused with its numbers; a 1200 × 1500 PNG
becomes the poster, detached, with artifacts requested. Captures:
`wave8-designer-posters-{picker-live,detach-confirm,upload-rejected,picker-stale,studio-live-gate}.png`.

**Two of my specs had drifted, fixed in the same sitting:** `wave8-designer-editor`'s failing check
came from v1's 60 px `l_where` box being shorter than its line — v2 (`0098`) made it 70 px, and a
layer moved to x = 0 is clamped into the safe area by `derive()` — so the fixture now stretches the
layer edge to edge; and toast assertions across the three wave-8 specs are `exact`, because the toast
now carries a second, live-region copy of its text that strict mode counts.

### W8.n The parity background block as built (2026-09-17)

`scripts/parity/backgrounds.mjs`, run by `harness.mjs` after the 28 and reported apart — locally
«21 of 28 assertions · background block 3 of 3». The seven text goldens and `signature.json` do not
move; the block's golden is `goldens/backgrounds/gradient-rtl.png` with its own `record.json`,
written by `--update-backgrounds` (which touches nothing else) and **left uncommitted for the lead**.

- **gradient-rtl** — the gradient the first v2 poster declares (`talk`), bound to `platformBrand('dark')`:
  Chromium's computed `background-image` carries the declared angle and exactly the palette's stop
  colours (no stop fell back to white); the first stop sits at the start corner; Tier B against the
  golden, advisory off `darwin-arm64` (`DEC-028`).
- **gradient-ltr** — `220deg` computed, and the LTR capture flipped equals the RTL capture (0.000 %);
  unflipped they differ by 71.7 %, so a renderer that forgot the mirror fails it on every platform.
- **ink-on-dark** — the worker's own sequence (capture, `INK_REFERENCE_CSS`, reference, `inkedRatio`):
  the layer-less dark page measures 0.000 % (blank, refused), the same page with one line of text
  1.634 %; the pre-wave-8 rule would have called the blank page 100.0 % inked.
- **`gradient-unresolved` dropped from the plan:** `backgroundCss()` falls back to `#ffffff` for an
  unbound token by `branding`'s design, so «never white» is not the renderer's contract. What holds
  the trap shut is `brandViolations()` refusing an unknown token in a template, and gradient-rtl's
  «no stop fell back» under the real palette.

★ **Found while building it:** in headless Chrome a `clip` or element screenshot of a gradient root
came back one flat `rgb(18, 18, 18)`, while the viewport screenshot of the same page is the gradient.
The worker already captures the viewport (`captureBeyondViewport: false`), so production is not
affected; the block captures the same way, and says why.

### W8.o The lead's capture findings and (a), fixed (2026-09-17)

**Product.**
- **SCR-045 follows the job.** With any certificate (or a completed session) «الإصدار» comes first and
  each kind's design folds to one line behind «غيّر التصميم» / «اعرض التصميم»; before completion the
  design stays first. The line says what the kind **was issued with** — `issuedWith` (template name and
  pinned scheme, read through the certificate's version) in `getCertificateDesign()` — never «لم يُختر
  تصميم بعد» over certificates that exist.
- **A name belongs to a kind.** The DAL's sample carries no recipient name; each kind's preview binds
  its own longest eligible name, else the template's marked placeholder — no attendee on the presenter
  preview.
- **Template cards.** The media is capped at `h-56` under `sm` and the render **contained and centred**
  in it (`TemplatePreview` fits both sides); «الافتراضي» moved into the body's badges. `TemplatePreview`
  sets `data-rendered="true"` once its frame has loaded and its faces are ready, derived per html so a
  scheme switch is not «rendered» until its own load.
- **The studio.** The bindings panel and the canvas's unbound placeholder name fields in Arabic
  (`designer.bindings.field.*`, keyed by the binding path; else the carrying layer's name); a failed
  export says why in Arabic (`export-reason.ts`, unit-tested on the worker's real sentences) with the raw
  text beneath in an isolated `dir="ltr"` block; the safe-area check says «590 بكسل»; the live gate says
  the poster cannot be edited while linked, and its «خصّص» is secondary.
- `seed-sql.mjs`'s header says forward-only (DEC-149 §3): a later library change is a NEW seed.

**Specs.** All five scope page content to `#main` (DEC-145); captures emulate reduced motion, scroll
every preview into view and assert `data-rendered`; the check in the editor spec is chosen by the layer
it names. ★ **A `fullPage` screenshot left loaded iframes blank below the first screen** — Chromium
throttles iframe painting outside the viewport — so full-page captures now set the viewport to the
page's height, shoot, and restore 390 × 844. `certificates.spec.ts` no longer inserts a platform-wide
template (the two projects saw each other's, and one afterAll deleted what the other's certificates
pinned); a leftover of it (`قالب شهادة 1-1789600556691`, unreferenced) was deleted from the local
database by id.

### W8.p Tier A's «face never loaded» was a coin toss — the lead's real-worker run (2026-09-17)

The host worker refused three of twelve talk-poster variants: `tier_a: l_kicker: font_never_loaded —
advance 92.09 equals the fallback's 92.59` (and 71.38 / 71.77). The rule was «one line, and within 1 px
of the same string in a face that does not exist» — that is, within 1 px of whatever the PLATFORM falls
back to. Not a v2 change: the kicker («جلسة», 40 px, 500) is unchanged since `bc84c43`; the host worker
had simply never rendered it. Measured in real Chrome on the host, the worker's own load sequence:

| Case | advance / fallback | old rule | `faceResolved()` |
|---|---|---|---|
| loaded — the lead's kicker at 40 and 31 px | 92.09/92.59 · 71.38/71.77 | **refused** | resolved |
| loaded — «جلسة عن Next.js 16» | 346.19/322.53 | pass | resolved |
| no faces at all · every face corrupt | 90.05/92.59 | **passed** | never_loaded |
| Arabic subset corrupt, Latin loaded | 92.59/92.59 | refused | never_loaded |
| Latin subset corrupt, mixed text | 324.61/322.53 | **passed** | never_loaded |
| Amiri at 600 (no 600 face) | 245.19/344.75 | pass | resolved |

The old rule was wrong in five of eight, in both directions. **In the image it is worse**: fontconfig
knows only our own Arabic faces, so the fallback for a missing family can BE the layer's family, and every
one-line layer in it would collide.

**Now:** the probe reports `faceLoaded` — among the family's faces at the layer's weight (else all of
the family's) one is `loaded` and none is `error`; a corrupt subset is `error` — and `coverageAdvances`,
the string over the layer's family list followed by `serif`, then `monospace`, identical when the
fallback drew nothing. `faceResolved()` in `tier-a.ts` decides (`never_loaded` · `glyph_fallback` ·
`resolved`); `checkTierA` and the parity harness both call it; `fallbackAdvance` stays as information.
`tests/unit/designer-tier-a-face.test.ts` is built on the lead's numbers. Parity against a scratch build:
21 of 28 and background 3 of 3 with the goldens unmoved (the compared keys are unchanged), and
`--break-font` still fails every case. Limit, stated: where `serif` and `monospace` map to one font, the
coverage half cannot see a missing glyph — `faceLoaded` still sees a subset that failed to load.

Also: the editor spec's worker branch sets its own 12-minute timeout and waits for every variant to
SETTLE, then fails at once with the worker's reasons rather than polling ten minutes for «12 ready».

---

## Wave 10 plan — 2026-09-17 (planning only; nothing built until the lead approves at sync 1)

Rows D1, D2, D3 of `STATUS.md`'s wave-10 block. Serves `REQ-CRT-003`, `REQ-CRT-008`, `REQ-CRT-011`,
`REQ-CHK-017`, `REQ-DSG-002`, `REQ-DSG-013`, `REQ-SES-015`; `DEC-010`, `DEC-149` §3, `DEC-150`,
`DEC-151`, `DEC-153`, `DEC-160` §6, contracts 3, 8 and 10.

**Read for this plan, from disk:** `0055` (the table, its two uniques, `allocate_serial()`), `0065`
(release, revoke, announce, the render context), `0066`, `0082` (`poster_render_context()`), `0099`
(the live `issue_certificate()` text before `0108`), `0107`, **`0108` in full**, `0120`;
`src/lib/dal/certificates.ts` whole, `templates.ts`, `admin-exports.ts`, `platform.ts`,
`designer.ts`'s `sessionBindings()`; `packages/designer-runtime/src/{session-bindings,library}.ts`,
`packages/designer-runtime/scripts/seed-sql.mjs` (the agent file calls it `scripts/seed-sql.mjs`; it
lives in the package); `worker/src/tasks/{issue_certificates,regenerate_poster}.ts`;
`tests/unit/designer-library.test.ts`, `tests/rls/{designer-certificates,session-days-certificates,
checkin-removal,checkin-late-job-hooks}.test.ts`; `0080_public_session_card.sql` and
`src/app/api/s/[id]/og/route.ts` for contract 8.

---

### D1 — certificates, re-issued

#### D1.1 · The DDL I need from the lead (contract 10)

Three statements, in this order, carried verbatim at the top of
`supabase/proposed/designer/0001_certificates_reissue.sql` under `-- LEAD DDL (DEC-160)` so the
constraint and the functions that depend on it move in one file (`DEC-151`'s pattern):

```sql
-- LEAD DDL (DEC-160) — contract 10.
create type public.certificate_revocation_cause as enum ('for_cause', 'attendance_removed');

alter table public.certificates
  add column revocation_cause public.certificate_revocation_cause;

-- The live-row rule, which the table constraint used to be. Created BEFORE the
-- constraint is dropped, so there is never an instant with no uniqueness at all.
create unique index certificates_live_once
  on public.certificates (org_id, session_id, member_id, kind)
  where state <> 'revoked';

alter table public.certificates
  drop constraint certificates_org_id_session_id_member_id_kind_key;
```

- **The existing rule is a TABLE CONSTRAINT, not an index** (`0055:318`: `unique (org_id, session_id,
  member_id, kind)`, unnamed). Postgres names it `<table>_<col>…_key`, so in the catalogue it is
  **`certificates_org_id_session_id_member_id_kind_key`** (49 characters, under the 63-byte
  truncation). The lead confirms before writing the drop with
  `select conname from pg_constraint where conrelid = 'public.certificates'::regclass and contype = 'u';`
  — which also returns `certificates_org_id_serial_key`, and **that one stays**.
- `state` is `not null default 'held'` (`0055:286`), so the partial predicate is total. `<> 'revoked'`
  rather than `in ('held','issued')` to match the phrase already used at `0087:354`, `0105:576` and
  `0108:247`.
- Name `certificates_live_once` follows the two partial indexes beside it — `certificates_badge_once`,
  `certificates_snapshot_once` (`0055:325-328`).
- A plain `create unique index` takes a `share` lock for its duration. Volume is hundreds a month
  (A24), so the table is tiny and this is not worth `concurrently` (which cannot run in a migration's
  transaction anyway).
- `revocation_cause` is **nullable, with no check constraint**, and every reader takes it through
  `coalesce(c.revocation_cause, 'for_cause')`. Why: the column is meaningless on a live row, so
  `not null default 'for_cause'` would state a cause for every certificate that has none; and adding
  `(state = 'revoked') = (revocation_cause is not null)` to `certificates_revocation` would validate
  existing rows, which requires backfilling a cause onto rows revoked before this migration — a cause
  we cannot honestly know. `coalesce` reads those rows as **final**, which is the conservative
  direction. If the lead prefers the not-null form, the same conservative value is its default and
  nothing else in this plan changes.
- **No backfill of historical revoked rows.** A row revoked before this file stays final.

#### D1.2 · The new text

**`issue_certificate()`** — `0108:130-136` becomes two guards. Everything else of `0108`'s body is
unchanged, and the signature is unchanged, so `create or replace` keeps its grants (`service_role`
only, `0065:173-174`).

```sql
  -- REQ-CRT-003: idempotent over a LIVE row. Re-running the job returns what
  -- exists rather than allocating a second serial for the same person.
  -- ★ wave 10 (DEC-160 §6): a REVOKED row is no longer «exists». A member
  -- removed and re-added earns a second certificate under the NEXT serial;
  -- the first keeps its serial and keeps verifying as revoked (DEC-153's carry,
  -- lifted here).
  select * into v_row from public.certificates c
   where c.org_id = v_org and c.session_id = p_session
     and c.member_id = p_member and c.kind = p_kind
     and c.state <> 'revoked';
  if v_row.id is not null then
    return v_row;
  end if;

  -- ★ NOT EVERY REVOCATION IS A REMOVAL'S. An admin may revoke a certificate
  -- FOR CAUSE while attendance is still complete, and no hook, re-run fan-out
  -- or late job may quietly put a replacement in that member's hands.
  if exists (select 1 from public.certificates c
              where c.org_id = v_org and c.session_id = p_session
                and c.member_id = p_member and c.kind = p_kind
                and c.state = 'revoked'
                and coalesce(c.revocation_cause, 'for_cause') = 'for_cause') then
    -- 42501, which the worker already reads as «no longer eligible — nothing
    -- issued» and returns from without retrying: the ABSENCE of a certificate
    -- is the correct outcome, and no retry changes it.
    raise exception 'revoked_for_cause' using errcode = '42501';
  end if;
```

★ The refusal is raised **before** `allocate_serial()`, which is in the insert's value list — so a
blocked re-issue consumes no number. That is the assertion the new RLS case makes, not a comment.

The insert also gains a `unique_violation` handler, because two jobs for one member can pass the
select above concurrently and the index is the authority:

```sql
  begin
    insert into public.certificates (…) values (…) returning * into v_row;
  exception when unique_violation then
    get stacked diagnostics v_constraint = pg_exception_constraint_name;
    if v_constraint <> 'certificates_live_once' then raise; end if;
    -- The loser re-reads and returns the winner's row. DEC-010 survives because
    -- the counter is a ROW, not a SEQUENCE: the subtransaction's rollback
    -- RETURNS the serial a SEQUENCE would have burned.
    select * into v_row from public.certificates c
     where c.org_id = v_org and c.session_id = p_session
       and c.member_id = p_member and c.kind = p_kind and c.state <> 'revoked';
    if v_row.id is null then raise; end if;
    return v_row;
  end;
```

Honest about its weight: this race exists today with the table constraint and is already survivable —
a `23505` makes the worker throw, graphile retries, and the retry returns the existing row. The
handler is noise reduction, not a correctness fix, and it is six lines; the `get stacked diagnostics`
guard is what keeps it from swallowing a `certificates_org_id_serial_key` collision, which would be a
real defect. The `write_audit` below the insert is skipped for the loser because the handler returns.

**`attendance_certificate_sync()`** — `0108:260-265`'s «ANY row» becomes:

```sql
  -- ★ wave 10 (DEC-160 §6). A LIVE row means there is nothing to do — a job
  -- would be a no-op that looks like work. A row revoked BY A REMOVAL no
  -- longer stops the issue: that is DEC-153's carry, and this is where it is
  -- lifted. A row revoked FOR CAUSE still stops it, and always will.
  if exists (select 1 from public.certificates c
              where c.session_id = p_session and c.member_id = p_member
                and c.kind = 'attendance'
                and (c.state <> 'revoked'
                     or coalesce(c.revocation_cause, 'for_cause') = 'for_cause')) then
    return;
  end if;
```

**`revoke_certificate()`** gains a trailing defaulted parameter, and the old signature is **dropped in
the same file** so PostgREST never sees two overloads (`0085`'s lesson, rule 4):

```sql
drop function public.revoke_certificate(uuid, text);
create function public.revoke_certificate(
  p_certificate uuid, p_reason text,
  p_cause public.certificate_revocation_cause default 'for_cause'
) returns public.certificates …
  -- sets revocation_cause = p_cause beside the four columns it already writes
revoke execute on function public.revoke_certificate(uuid, text, public.certificate_revocation_cause) from public, anon;
grant  execute on function public.revoke_certificate(uuid, text, public.certificate_revocation_cause) to authenticated;
```

Grants **restated verbatim**: a re-created function starts with `public` execute, which is the `0002`
trap `0082`'s own header names. The sync's loop passes `'attendance_removed'`; every other caller
takes the default. `designer-certificates.test.ts:311` and `:330` call it positionally with two
arguments and are unaffected.

`fan_out_certificates()` needs **no change**: it fans out by eligibility, never by existing rows, and
`issue_certificate()` answers for each. A re-completion after a for-cause revocation therefore
enqueues a job that refuses — one info line in the worker log, no row, no serial.

#### D1.3 · ★ How a removal's revocation is told from an admin's, for cause

**The fixed phrase is not a safe discriminator**, for four reasons:

1. **It is display copy.** `revocation_reason` is what the member reads on SCR-023 and the admin reads
   on SCR-045 (`certificates.ts:37-38`). Keying behaviour on a sentence means a wording fix silently
   re-arms automatic re-issue for every revocation ever written with the old words.
2. **It is forgeable by an ordinary admin.** `revokeInput.reason` is free text, `min(3).max(500)`
   (`certificates.ts:487-492`). An admin who types «أُلغي تسجيل الحضور» while revoking for cause would
   get a silent replacement for a revocation they meant to be final. A discriminator a user can type
   is not a discriminator.
3. **It is a rendering of a fact, not the fact.** `CLAUDE.md`'s naming rule — enums are Postgres enum
   types, never `text` + check — is the same argument one level up: a category is a column.
4. **An existing test pins the phrase**: `checkin-removal.test.ts:179`,
   `expect(revoked.revocation_reason).toBe("أُلغي تسجيل الحضور")`, and `0120`'s §8.2 row repeats it.
   The phrase must stay exactly as it is, which is one more reason not to overload it with meaning.

**So: a column** — `certificates.revocation_cause`, the enum in D1.1, written by
`revoke_certificate()` on every revocation. Two alternatives, rejected and why:

- **`revoked_by`** cannot tell them apart: `remove_check_in()` runs as the admin and the sync calls
  `revoke_certificate()` inside that transaction, so `auth_member_id()` is the same person on both
  paths.
- **The audit log** (`certificate.revoked`, with its reason) cannot be the source: `audit_log` is
  append-only **evidence** (invariant 9). Making behaviour depend on reading it turns evidence into
  state — a retention pass or an export would then change what the product does — and `after` is
  unindexed jsonb.

**The RLS case that proves no replacement is issued** — new file
`tests/rls/certificates-reissue.test.ts`, `03` §8.2 row
`RPC-issue_certificate.no_replacement_after_for_cause`:

> attend every day → complete → `issue_certificate()` (serial N, state `issued`) → an admin revokes
> with **their own reason** (cause defaults to `for_cause`). Then, each asserted separately:
> (a) a further attendance change → `attendance_certificate_sync()` enqueues **nothing**;
> (b) `fan_out_certificates()` on a re-completion enqueues the job, and `issue_certificate()` raises
> **42501** with `revoked_for_cause`; (c) the member still holds **exactly one** certificate row and
> it is still `revoked`; (d) ★ `certificate_serial_counters` is **byte-identical before and after** —
> the refusal happened before `allocate_serial()`, so no number was taken and none was returned.

Its twin, `RPC-issue_certificate.replacement_after_removal`: attend → complete → issue (serial N) →
`remove_check_in()` (the sync revokes, cause `attendance_removed`, the fixed phrase) → re-add (the
sync enqueues) → `issue_certificate()` → a **second** row, serial **N+1**, state `issued`, its
`check_in_id` the **new** check-in; the first row still `revoked`, still serial N, and
`verify_certificate(first.code)` still answers `revoked` **without the reason**.

And `POL-certificates.live_once`: as owner, a second **live** row for the same
`(org_id, session_id, member_id, kind)` is refused `23505` naming `certificates_live_once`; a second
**revoked** row is accepted.

#### D1.4 · The job key after a revocation

`cert:{session_id}:{member_id}:{kind}` — `11` §2.5's, **unchanged**, which contract 3 and two existing
assertions require (`designer-certificates.test.ts:85`; `session-days-certificates.test.ts:179`).

- **Why it is enough for the second issuance.** A completed graphile job is **deleted**, so the key is
  free again once the first issuance ran. The sync can enqueue under the same key months later and get
  a fresh job. No new key shape is needed, and inventing one would break both assertions above for no
  gain.
- **Why it is not, on its own, the guarantee — and does not need to be.** `enqueue_job()` with a live
  key **moves** a pending job, so two enqueues before either runs collapse to one; that is
  de-duplication of *pending work*, not of *outcomes*. Two sequential jobs are legitimate here — that
  is the feature. What guarantees a member never holds two live certificates is the **partial unique
  index**, with `issue_certificate()`'s early return as the first line of defence and the index as the
  authority. This is `DEC-151`'s shape for the attendance award, one table over: a standing-state check
  first, the constraint as the authority, the key second.
- The fan-out and the sync build the **same** key deliberately, so a completion racing a late
  correction produces one job rather than two. Unchanged.

#### D1.5 · The serial

- The second certificate calls `allocate_serial(v_org)` in the insert's value list, inside the issuing
  transaction, and takes the **next** number. Gapless holds because the counter is a **row** under
  `select … for update`, not a `SEQUENCE`: a rollback — including the `unique_violation` handler's
  subtransaction rollback — **returns** the number (`DEC-010`, `REQ-CRT-008`).
  `designer-certificates.test.ts:443` («serials are consecutive, per org, and a ROLLBACK RETURNS THE
  NUMBER») is unmodified and still passes; it never revokes.
- The revoked one **keeps its serial**, its code, its PDF and its audit row. Two serials for one member
  and one session is correct in a register: two documents existed and the register says what became of
  each. A gap would be the defect `DEC-010` exists to prevent; a second number is not a gap.
- `estimateNextSerial()` (`certificates.ts:636-662`) reads the year's highest serial and adds one — it
  is right with two rows, and it is documented as an estimate.
- `/verify/<code-1>` answers «ملغاة», reason withheld (`designer-certificates.test.ts:412`);
  `/verify/<code-2>` answers «صادرة». Two rows, two random codes, no collision.
- Nothing is deleted (`REQ-CRT-011`): an old printed copy keeps resolving, to «ملغاة».

#### D1.6 · Every reader that assumed one row, and what each shows with two

Swept over `src/lib`, `src/app`, `src/components`, `worker/src`, `packages` and
`supabase/migrations`. **Exactly two readers need a change.**

| Reader | Where | With two rows (one revoked, one issued) | Change |
|---|---|---|---|
| `getCertificateDesign()` — `mine[0]` | `src/lib/dal/certificates.ts:362` | `certs` is ordered by `serial`, so `mine[0]` is the **old, revoked** row: «صدرت بـ» names the template the revoked certificate was pinned to, not the one the member holds | ★ **yes** |
| `listEligibleRecipients()` — `revokedButPresent` | `certificates.ts:449` | `mine.every(revoked)` goes false once the replacement exists, so the warning correctly disappears. ★ But after a **for-cause** revocation it is `true` and the copy now means the opposite of what it says — it promises a gap that will be filled, and this one never will | ★ **yes** |
| `listMyCertificates()` | `certificates.ts:139-152` | `.neq('state','held')`, ordered `issued_at desc` → the new card first, the revoked one under it, each with its own serial, code and reason | no |
| SCR-045's three tables | `getSessionCertificates()` `:190-192`, `issuance.tsx` | split by `state`, keyed by id: one row under «الملغاة», one under «المصدَرة» | no |
| `getSessionCertificatesWithRender()` | `:225-271` | `extra` is a Map by **certificate id**; artifacts by document id; `record_certificate_document()` keys on the certificate, so each row has its own `design_documents` row | no |
| `attachPdfs()` | `:106-124` | by document id | no |
| `estimateNextSerial()` | `:636` | highest serial + 1 | no |
| `verifyCertificate()` / `verify_certificate()` | `:572`, `0065` | by code, one row each | no |
| `/verify/[code]` | `src/app/[locale]/verify/[code]/page.tsx` | one certificate | no |
| `/app/me/certificates` | `page.tsx:53-54` | `key={c.id}`, two `<li>` | no code change |
| the certificates CSV | `admin-exports.ts:380-406` | **one line per certificate row**: the member appears twice, «مُلغاة» and «صادرة», each with its own serial and date — which is what a register owes | ★ **none** — no request to the lead |
| `templates.ts` usage count | `src/lib/dal/templates.ts:147-153` | `sessionsByTemplate` is a `Set` of session ids, so two certificates of one session count once; two rows on different versions count that session once for each template, which is still «sessions of this org using it» | no |
| `platform.ts` aggregates | `:123`, `:341`; SQL `0069:822`, `0069:834`, `0097:87` | `count(*) from certificates` — a revoked row already counts today, so a second row adds one to a raw total that has never meant «live certificates» | no; named for L7 |
| `set_certificate_design()`'s lock | `0099:130-131` | `state in ('issued','revoked')` — still locked | no |
| `redesign_held_certificates()` | `0099:287` | held rows only | no |
| `certificate_render_context()` | `0065` | by certificate id | no |
| `issue_certificates` worker task | `worker/src/tasks/issue_certificates.ts:132` | renders the id the RPC returned | no |
| `mode-badge`, `getCertificateMode()` | `:512` | reads `sessions.certificate_mode` | no |
| `listHeldAchievements()` | `:675` | achievements — out of scope, see Q4 | no |

**The two fixes.**

- `getCertificateDesign()`: `const live = mine.filter((c) => c.state !== "revoked"); const pinned =
  live[0] ?? mine[0] ?? null;` — the smallest possible diff, **identical to today whenever no row is
  revoked**, and it preserves the existing «first in serial order» rule among live rows (which is what
  makes held-versus-issued behave as its comment says).
- `listEligibleRecipients()`: the select gains `revocation_cause`, and `EligibleRecipient` gains
  `revocationIsFinal: boolean` beside `revokedButPresent`. `eligible-list.tsx:37-44` then prints one
  of **two** sentences — «مُلغاة، وسيصدر بديل عند إعادة التسجيل» and «مُلغاة نهائيًا — لن يصدر بديل» —
  two new keys in `messages/ar/certificates.json` (mine) with their `en/` twins, Arabic first.

#### D1.7 · ★ Contract 3 — `main`'s worker and `main`'s app, between the push and the redeploy

`main` is `f2ead54`. In the window the database has the index, the enum, the column and the three new
functions, while Vercel and Railway still run `main`.

- **`main`'s worker** (`worker/src/tasks/issue_certificates.ts`) calls
  `select id from public.issue_certificate($1,$2,$3::public.certificate_kind,null,$4)` — five
  positional arguments against an **unchanged signature**. It gets either a new row, which it renders
  exactly as it renders any other, or `42501`, which it already maps to
  «is no longer eligible — nothing issued» and returns from **without retrying** (`:140-143`).
  **Nothing to change and nothing to break.** It never asks how many certificates a member has.
- **`main`'s app** calls `rpc("revoke_certificate", { p_certificate, p_reason })`
  (`certificates.ts:505`) → resolves to the one three-argument function and takes
  `p_cause = 'for_cause'`. ★ **This is why the default is `for_cause` and not the other way round**:
  every application caller of `revoke_certificate()` is an admin's deliberate revocation. `main`'s
  `attendance_certificate_sync()` is the function my file replaces, so from the push onward the
  removal path passes `'attendance_removed'` explicitly. There is no path that writes a null cause
  after the push.
- **Can a second row even appear in the window?** Only if, after the push, an admin removes and re-adds
  a check-in on a **completed** session with certificates on. Possible, rare.
- **What it would look like on `main`'s screens:** SCR-045's three tables, `/app/me/certificates`,
  `/verify`, the CSV and the platform counts are all correct. The only wrong pixel is
  `getCertificateDesign()`'s «صدرت بـ» naming the revoked row's template on SCR-045's design panel —
  **cosmetic, one line, and self-correcting the moment Vercel deploys the merge**. It is also the
  branch's own behaviour until D1.6's fix ships in the same PR, so the window adds nothing new.
- ★ **No rule is needed in the owner's order** for this, unlike wave 9's `award_presenter_points`:
  nothing is paid, deleted, double-sent or unrecoverable. One line in L7's table naming the cosmetic
  is enough, and I would rather the lead record it than discover it.

#### D1.8 · The evidence — what covers issue, revoke and verify, and that I change none of it

| File | Covers |
|---|---|
| `tests/rls/designer-certificates.test.ts` | issue (`:85` the key verbatim, `:157`, `:173` idempotency and one serial, `:191` review holds, `:207`, `:220`, `:233` the pinned version and frozen name) · release (`:257`, `:285`) · revoke (`:311`, `:330`, `:351`) · verify (`:372`, `:387`, `:398`, `:412`, `:432`) · the serial (`:443`, `:476`) · the document (`:488`) · the render jobs (`:557`, `:607`) |
| `tests/rls/certificates-designs.test.ts` | the design lock at `issued`/`revoked`, `redesign_held_certificates` |
| `tests/rls/session-days-certificates.test.ts` (**the lead's**) | the day-aware fan-out, the predicate, the sync's four `03` §8.2 rows |
| `tests/rls/checkin-removal.test.ts` | `:156` the revocation through the audited path with the fixed phrase; `:207` the re-add |
| `tests/rls/checkin-contract-5.test.ts`, `checkin-late-job-hooks.test.ts` | the three hooks; `:90` a late `issue_certificate()` for a removed check-in raises `no_check_in` |
| `tests/unit/certificates-verify.test.ts` | the code's shape, the rate limit, `REQ-CRT-009` |
| `tests/e2e/certificates.spec.ts`, `wave8-designer-certificates.spec.ts`, `wave7-content-certificates.spec.ts`; `tests/components/me/certificates-page.test.tsx` | SCR-045, `/app/me/certificates`, `/verify` |

**I change none of them.** New files only: `tests/rls/certificates-reissue.test.ts`,
`tests/e2e/wave10-designer-certificates.spec.ts`.

★ **Does `session-days-certificates.test.ts:151` («issues_when_completed_late — … not over an existing
row») still hold? Yes.** Its last three lines set `certificate_mode = 'automatic'`, call
`issue_certificate()` and then sync: the row that case creates is **`issued`** — a live row — and the
new guard returns early on a live row exactly as the old guard returned early on any row. The case is
green unmodified. The only input the old and new code disagree about is a **revoked** row, and that
case does not exist in that file — which is precisely why lifting the carry does not touch it. Its
earlier legs are unaffected too: day 3 removed then re-added with **no certificate ever issued**
(`:168-179`) enqueues under the same key, as before.

I swept every other case that revokes: `checkin-removal.test.ts:156` revokes on an **`in_progress`**
session, so the sync's state guard returns before either row guard;
`session-days-certificates.test.ts:133` (`require_all_days = false`) leaves the certificate
**issued**. **No existing case anywhere re-issues over a revoked row**, and none asserts wave 7's carry
as an expectation. If that sweep is wrong, the finding goes in this note and to the lead — I do not
repair the lead's file.

---

### D2 — a multi-day poster's date

#### D2.9 · The binding, its formatter, and the one-day equality proof

**Name: `session.when`.** Not `session.dates` (the value carries a time, and at one day there is one
date); not `session.startsAtRange` (a lie at one day). ★ **`session.startsAt` stays exactly as it is**
— that is what makes this additive: every document pinned to poster v1 or v2, and every org's own copy
of a template, keeps rendering the instant it renders today.

**Formatter**, beside the two already exported from
`packages/designer-runtime/src/session-bindings.ts`:

```ts
export function formatBindingWhen(
  days: readonly { startsAt: string; endsAt?: string | null }[],
  timeZone: string, locale = 'ar',
): string
```

- **At `n <= 1` it `return`s `formatBindingDateTime(days[0].startsAt, timeZone, locale)`** — the same
  function call, not a re-implementation. That is the strongest available form of «renders the same
  characters»: there is no second code path to drift.
- `SessionBindingRow` gains `days?: readonly {…}[] | null`; `resolveSessionBindings()` sets
  `out['session.when']` from `row.days ?? (row.startsAt ? [{ startsAt: row.startsAt }] : [])`, and
  leaves `session.startsAt` untouched. A key is still **absent** rather than empty when there is
  nothing to bind, so an unbound `l_when` still draws the marked placeholder (`REQ-DSG-006`).

**★ The proof — `tests/unit/poster-when-binding.test.ts`** (new):

1. **String equality across dates and time zones.** A grid of instants × zones × locales, asserting
   `formatBindingWhen([{ startsAt: iso }], tz, loc) === formatBindingDateTime(iso, tz, loc)`.
   Zones: `Asia/Riyadh` (no DST), `UTC`, `Europe/London` (a DST boundary), `Pacific/Kiritimati` (+14,
   whose local date differs from UTC's). Instants: 00:30 local on 1 January, a spring-forward hour, a
   month boundary, a leap day, and noon on an ordinary day. Locales: `ar` and `en`.
2. **The binding object does not drift.** `Object.keys(resolveSessionBindings(row, opts))` for a row
   with **no** `days` differs from today's output by exactly `['session.when']` — asserted as a set
   difference, so a future edit cannot quietly drop `session.startsAt` or add a third key.
3. **Digits.** A character class over the Arabic-Indic range — built in the test from `String.raw` code
   escapes for U+0660 to U+0669, never from the glyphs themselves, because `DEC-124` forbids typing
   them anywhere, this note included — matches no produced value, for every case in the grid.
4. **The pinned document.** Poster **v2** rendered through the runtime with the new binding present
   produces, for `l_when`, exactly `formatBindingDateTime(...)` — because v2 binds `session.startsAt`,
   which this change does not touch.

**What a multi-day value reads like.** Western digits throughout; no letter-spacing; each value is a
single run safe to sit in a `<bdi>` in the editor's preview panel. Three real examples:

| Case | Arabic | English |
|---|---|---|
| Consecutive, same month | «19 – 21 سبتمبر 2026 · 6:00 م» | «19 – 21 September 2026 · 6:00 PM» |
| Across a month boundary | «30 سبتمبر – 2 أكتوبر 2026 · 6:00 م» | «30 September – 2 October 2026 · 6:00 PM» |
| Non-consecutive | «19 و 21 و 26 سبتمبر 2026» | «19, 21 and 26 September 2026» |

Built from **`Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day:'numeric', month:'long',
year:'numeric', timeZone }).formatRange(first, last)`** for the consecutive case, so the range pattern
and the month-boundary elision are **CLDR's**, not ours — the same discipline as `formatBindingDateTime`
naming `nu-latn` rather than inheriting `ar`'s `arab` default. Rules, each stated because each is a
decision:

- **Consecutive** means every day starts on the calendar day after the previous one **in the session's
  zone**. Read in `position` order — the database's derived rank (`DEC-150`) — never sorted here, and
  **never a `min` or a `max` computed in TypeScript**.
- **The time is printed only when every day shares the same local start time.** Days may differ
  (`session_days.starts_at` is per day); a single time over differing days would be a false statement
  on a printed sheet. Otherwise the dates stand alone and the event page carries the detail.
- **Four or more non-consecutive days** collapse to «4 لقاءات · من 19 سبتمبر إلى 26 أكتوبر 2026», so
  the line stays one line.
- ★ **The frame.** `l_when` is `{ x: 80, y: 870, w: 920, h: 70 }` at BODY 40 px / 1.7 with **no
  `autoFit`** (`library.ts:193-203`), and `0098`'s own header records that a 60 px frame reported
  «reached its minimum size» on every preset. So before v3 is committed I **measure** the longest of
  the three shapes at every preset; if it does not fit, v3 gives `l_when` two lines and moves `l_where`
  down — a v3 change either way. Measured through the ink guard and the export reason, **not eyeballed**.

#### D2.10 · `poster_render_context()`, dropped and re-created in the same file

Its latest text is `0082:96-140` (dropped and re-created there because a `returns table` type cannot
change under `create or replace`). Mine does the same, in **one file**, with `main`'s **sixteen columns
in `main`'s order** and one new column **trailing**:

```sql
drop function public.poster_render_context(uuid);
create function public.poster_render_context(p_session uuid)
returns table ( …0082's sixteen, verbatim, in order…, days jsonb )
…
         coalesce((select jsonb_agg(jsonb_build_object('startsAt', d.starts_at, 'endsAt', d.ends_at)
                                    order by d.position)
                     from public.session_days d where d.session_id = s.id), '[]'::jsonb)
…
revoke execute on function public.poster_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.poster_render_context(uuid) to service_role;
```

- **By `position`**, the database's derived rank. No `min`, no `max`, no ordering by `created_at` —
  which is the transaction's start and identical for rows written together, the trap wave 9 met three
  times.
- **Grants restated verbatim.** A re-created function starts with `public` execute; that is the `0002`
  trap `0082`'s header names, and `definer-exposure.test.ts` fails on it.
- No parameter is added, so there is no overload and PostgREST sees one signature. The function is
  `service_role`-only, so PostgREST never exposes it at all.
- ★ **What `main`'s `regenerate_poster.ts` does with the extra column:** it runs
  `select * from public.poster_render_context($1)` into a typed `Context` and reads **named** fields
  (`ctx.starts_at`, `ctx.title`, `ctx.presenters`, …). The extra key arrives on the row object and is
  **never read**; `main`'s `resolveSessionBindings` has no `days` parameter, so it produces exactly
  today's bindings, the fingerprint is today's, and **the artifact cache does not churn**
  (`REQ-DSG-013`). A one-day poster re-rendered in the window is byte-identical; a three-day poster
  shows its first day, which is what it shows today. The feature simply is not live until Railway
  redeploys — late, not wrong.

#### D2.11 · The new seed migration

`supabase/proposed/designer/0002_poster_when.sql`, **generated** by
`packages/designer-runtime/scripts/seed-sql.mjs` from `library.ts`. `0098` is **never regenerated**
(`DEC-149` §3); this is a new, additive seed.

- **Which versions: poster v3 × 5** — `talk`, `workshop`, `panel`, `meetup`, `announcement`. The only
  change in each is `l_when`'s `field.binding`, `session.startsAt` → `session.when` (fallback stays
  «التاريخ والوقت»), plus the frame if D2.9's measurement requires it. **The three landscape
  certificates stay at v2 and the three portraits at v1** — no certificate binds a session date. So
  `BASELINE_LIBRARY`'s `version` becomes 3 for the five posters and is untouched for the six
  certificates.
- **`REQ-DSG-026`'s counted roster is unchanged**: 5 posters + 6 certificates = 11 **templates**. The
  CI count counts templates, not versions.
- **Posters pinned to the old versions.** `session_posters.document_id` names a `design_documents` row
  whose `template_version_id` is v2. Nothing re-renders on the seed. `0098`'s own header states the
  rule and it is unchanged here: **a live poster takes the new version at its next regeneration, and an
  org's own copy never receives it** (`REQ-DSG-008`).
- ★ **A session that is ALREADY PUBLISHED** (sync 1's named question). Its poster keeps showing its
  first day until something regenerates it. On the **automatic** binding that happens at the next
  regeneration, because `poster_render_context()`'s lateral join takes the latest published version
  (`order by … v2.version desc limit 1`) — so editing a published multi-day session's details picks up
  v3 by itself. On the **detached** binding it never happens, and must not: **a detached poster is
  never auto-regenerated** (`REQ-DSG-003`). The admin's «أعد التوليد» on SCR-043 is the path, and it is
  audited.
  **I do not propose a bulk re-enqueue** of `poster:{session_id}` for existing multi-day sessions: a
  data fix is never a migration (`DEC-023`, `DEC-027`), multi-day sessions on production are days old
  and few, and the existing button is the audited path. Q5 if the lead disagrees.
- **`tests/unit/designer-library.test.ts:292-332` learns a third file.** `bodies` becomes
  `[seedFile("0004_baseline_library.sql"), seedFile("0002_certificate_library.sql"),
  seedFile("0002_poster_when.sql")]`. ★ `seedFile()` resolves a proposed name to a promoted one by
  matching the `_<suffix>` tail, so **my file's suffix must be unique across `supabase/migrations/`**;
  `_poster_when.sql` is. Nothing else in the test changes: the «latest version wins» reducer already
  handles a third file, the eleven-row assertion (`[...latest.keys()].sort()` against
  `BASELINE_LIBRARY.map(keyOf).sort()`) stays true **because the new file adds versions of existing
  compositions, not new keys**, and the family list is unchanged. **This is a ledger line** — a
  pre-existing test modified for a literal file name, **no expectation changed** — and I hand it to the
  lead for `STATUS.md`'s untouched-suite ledger rather than writing it myself.

#### D2.12 · No parity golden moves, and why

`scripts/parity/`'s 28 cases are **synthetic documents with literal text**: they do not resolve
`session.*` bindings from a session row, so a new binding name, a new template version and a new
`poster_render_context()` column change nothing any case renders. The goldens are keyed by each case's
own document. I run `npm run parity` and report «28/28, no golden moved». If one moves, that is a
**finding for this note**, not a `--update` (`REQ-DSG-015`) — `scripts/parity/goldens/**` is the lead's
and I never write there.

#### D2.13 · How days reach the editor's preview

Through **`sessions`' `listSessionDays(locale, sessionId)`** (`src/lib/dal/sessions.ts:774`) — wave 9's
contract 3, `cache()`-wrapped, returning `SessionDay[]` with `position`, `startsAt`, `endsAt`. I
**read it and never edit that file**. `src/lib/dal/designer.ts`'s `sessionBindings()` (`:136-153`)
maps `days.map((d) => ({ startsAt: d.startsAt, endsAt: d.endsAt }))` into the row — no `min`, no
`max`, no sort. The three callers that must agree then still agree: the editor's preview, the worker's
`regenerate_poster` (from `poster_render_context()`'s `days`), and the fingerprint, which hashes the
resolved bindings — so a session that gains a day produces a different fingerprint and a new artifact,
which is `REQ-DSG-013` working exactly as designed.

---

### D3 — the compiler review, and contract 8

#### D3a · What I will look for in `notify`'s block-to-table compiler (`16` §11.6)

Written properly in this note when `notify` says the compiler is ready. What I will be looking for,
published now so it can shape the compiler rather than audit it:

1. **Arabic shaping in a fallback stack.** A mail renders in the **reader's** fonts — invariant 12 does
   not reach an inbox, and `@font-face` is stripped by Gmail and Outlook. The failure mode is ours
   exactly: a stack whose first Arabic-capable face is absent falls **silently** to one that breaks
   lam-alef or drops `rlig`/`mark`. I will check the declared stack per block, that it ends in a
   generic that exists on Windows, macOS, iOS, Android and Gmail's web client, and that no rule
   letter-spaces Arabic or sets `overflow: hidden` on a text line (it clips tashkeel).
2. **`dir` on every cell.** `dir="rtl"` on the `<table>` **and** on each text-bearing `<td>`: Outlook's
   Word engine does not inherit `dir` reliably through nested tables, and a right-aligned cell is not
   an RTL cell. `align="right"` beside `text-align`, because the Word engine reads the attribute.
3. **Bidi isolation of bound values.** Every `{{binding}}` that can carry a name, a title, a venue or a
   code is a mixed-direction run inside an Arabic sentence. **`<bdi>` is not supported by
   Outlook/Word**, so the compiler must emit the Unicode isolates (`U+2068` FSI … `U+2069` PDI) or
   `dir="auto"` — **and the generated plain-text alternative must isolate too**, or the text part
   reorders. This is the one thing the DOM gives us for free and a mail does not.
4. **Forced dark.** Gmail on Android and Outlook.com repaint a mail: a light background goes dark and
   `{{brand.*}}` is inverted by an algorithm that does not know the palette. I will check
   `color-scheme` / `supported-color-schemes`, that no text colour depends on a background the client
   may repaint, that contrast holds **both** ways, and that the logo is not dark-on-transparent. This
   is `DEC-125`'s argument one layer down, and `public.brand_kit()`'s three tokens cannot state it —
   the dark palette and `canvasRaise` are contract 9's written request to the lead.
5. **And:** no `<svg>` anywhere (clients strip it; Outlook draws nothing) — the same reasoning as
   invariant 11, one medium over; every image with `alt` and explicit `width`/`height`; a fixed
   max-width so a 600 px shell does not scroll sideways on a phone.

#### D3b · ★ Contract 8 — which of my assets a mail may point at

A mail client fetches with **no session**. Read: `0080_public_session_card.sql:116-160` and
`src/app/api/s/[id]/og/route.ts`. **There is exactly one URL of mine that works there:**

> **`{PUBLIC_ORIGIN}/api/s/{sessionId}/og`** — the `og` preset (1200 × 630 PNG) of a session's poster.
> Served to **`anon`** by `POL-storage.exports.public_card` through `export_is_public_card()`, which
> permits exactly `%/exports/%/og.png` for a `ready` artifact of a session in `published`,
> `in_progress` or `completed` belonging to an **active** org. The authorisation is a policy evaluated
> by Postgres, not an `if` in the handler.

The `image` and `session_card` blocks use that and nothing else of mine. Everything else needs a
session or a signature:

- **Every other poster preset** (`master`, `square`, `story`, `landscape`, `a4`, `a3`) and **every
  certificate PDF and PNG**: `exports_storage_read` is `to authenticated` and org-prefixed, and a DAL
  signature is **five minutes** (`signCertificateUrl`, `signDesignAssetUrl`). A signed URL in a mail is
  a broken image by design — a mail is opened hours later — and it is exactly the trap the `og` route's
  own header refuses (its reason 2). Certificates are somebody's name; they are not in this door and
  will not be.
- ★ **The org's logo has no such URL today.** It is a design asset behind `signDesignAssetUrl()`, five
  minutes. **So the email studio cannot put the org's logo in a mail through anything I own.** That
  needs either a narrow public policy in the shape of `export_is_public_card()` or a CID attachment
  from the worker — a decision for `notify` and the lead (contract 9), and I am saying it now rather
  than at the studio's first preview.
- Two properties `notify` must design around: `/api/s/{id}/og` **404s** for a draft or cancelled
  session (so a mail about a cancelled session must not carry the card), and it caches for five
  minutes, so a re-rendered poster reaches an inbox quickly but a crawler's own copy does not.

Any other asset is a request, and I will answer it with a **policy**, not a signature.

---

### The order of my work

1. **Contract 8 is published above, on day one** — `notify` needs it before its blocks exist, and the
   logo finding needs the lead before the studio's first preview.
2. **D1's SQL**, once the lead lands D1.1's DDL at sync 1: `supabase/proposed/designer/0001_certificates_reissue.sql`
   (the lead's DDL carried at the top), proven with `applyProposed()` inside the new
   `tests/rls/certificates-reissue.test.ts`; then `designer-certificates`, `certificates-designs`,
   `session-days-certificates` and every `checkin-*` re-run **unmodified**.
3. **D1's two readers** + the two `certificates.json` sentences; then SCR-045 and `/app/me/certificates`
   at 390 px.
4. **D2's runtime first** — `formatBindingWhen`, `session.when`, the equality proof — **before** the
   seed, so v3 is generated from a library whose binding is already proven.
5. **D2's `poster_render_context()`**, `regenerate_poster.ts`, `sessionBindings()`.
6. **D2's seed migration** and `designer-library.test.ts`'s third file (the ledger line).
7. `npm run parity` — 28/28, **no golden moved**.
8. **D3a's review**, when `notify` says the compiler is ready.

Captures at `.qa-shots/rtl/wave10-designer-*.png`, 390 × 844, phone project, from a build the lead
names: SCR-045 for a member removed and re-added (one row under «الملغاة», one under «المصدَرة», two
serials) · `/app/me/certificates` with both cards · `/verify/<code>` for each · a certificate revoked
**for cause** with no replacement and the final sentence · a three-day workshop's poster · **a one-day
poster beside its wave-8 capture**.

### Open questions for the lead — each with my recommendation

| # | Question | My recommendation |
|---|---|---|
| Q1 | The DDL of D1.1 — the enum, the nullable column, the partial index, the constraint's catalogue name | As written. The lead confirms `certificates_org_id_session_id_member_id_kind_key` from `pg_constraint` before writing the drop; `certificates_org_id_serial_key` stays |
| Q2 | `revocation_cause` nullable, or `not null default 'for_cause'`? Extend `certificates_revocation`? | **Nullable, no new check**, read through `coalesce(…, 'for_cause')`. The column is meaningless on a live row, and a check would demand a backfill asserting a cause for historical rows that we cannot know. Either form has the same conservative default |
| Q3 | Should a **for-cause** revocation ever be re-issuable by hand? SCR-045 has **no** manual issue action (`actions.ts` has save-design, apply-to-held, release, revoke, retry-render) | **Not this wave.** The change is **monotone** — nothing issuable today becomes blocked; only the removal case is unblocked. An «أصدر شهادة» button is a new affordance with its own eligibility and audit rules. Carry it |
| Q4 | Achievements: `certificates_badge_once` / `certificates_snapshot_once` keep «one ever, a revoked one included» | **Out of scope.** `DEC-160` §6 names only the session constraint, and nothing un-awards a badge, so there is no re-add to serve |
| Q5 | A one-off re-enqueue of `regenerate_poster` for existing multi-day sessions when the seed lands | **No.** A data fix is never a migration (`DEC-023`, `DEC-027`); SCR-043's «أعد التوليد» is the audited path, and an automatic poster takes v3 at its next regeneration anyway |
| Q6 | The binding's name | **`session.when`**. `session.dates` misnames a value that carries a time; `session.startsAtRange` is a lie at one day |
| Q7 | Does `l_when`'s frame grow in v3 before or after the measurement? | **After.** The measure is the ink guard and the «reached its minimum size» export reason; a frame changed without it is a guess, and `0098` already records that guess being wrong once |
| Q8 | Does L7's owner-order need a rule for the certificate window (D1.7)? | **No rule, one line in the table.** The only observable difference is a mislabelled «صدرت بـ» that self-corrects on deploy. Nothing is paid, deleted or double-sent |

---

## Wave 10 — what was built, and where the plan above was wrong

The plan above is kept as written. Sync 1 approved D1 unchanged and **changed D2's centre**; this
section is the record of both, so nobody reads the plan as the design.

### ★ D2's defect, caught on paper by the lead — the window, on a public artefact

The plan proposed a **new binding**, `session.when`, and a new seed (poster v3 × 5). That is wrong,
and the reason is this wave's own migration order. `poster_render_context()` picks the automatic
template with `order by … version desc limit 1` — **the latest version** (`0082:131-138`). The owner
pushes migrations **before** merging, so from the push until Railway redeploys, **`main`'s worker
renders every newly published or edited session's poster from the v3 document** — whose `l_when`
would have bound a name `main`'s `resolveSessionBindings()` has never heard of. An absent binding
draws the **marked placeholder** «التاريخ والوقت» where the date belongs, and `/api/s/{id}/og` serves
that as the **public share image**. My D2.10 proved the old worker's *bindings* were today's and
missed that its *document* was not.

**The ruling: the binding's NAME does not change; its VALUE does.** Three consequences, each better
than the plan's:

1. **Every document gets the range at its next regeneration** — v1 and v2 versions, every pinned
   poster, and ★ **every org's own copy of a template**, which no seed migration can reach
   (`REQ-DSG-008`). Under the plan an org copy would have bound a first-day date for ever and never
   been fixed.
2. **The old worker and the old app render the first day from any version** — late, never wrong.
3. **No new binding, no new template version, no seed migration** — so
   `tests/unit/designer-library.test.ts` is not touched and **D2 contributes no line to the
   untouched-suite ledger**. The eleven-row assertion, the family list and `REQ-DSG-026`'s counted
   roster are all untouched because nothing was added to the library.

The name is slightly untrue at three days and is **entirely internal**; that is the cheaper of the two
untruths, and it is said in one comment beside `formatBindingWhen`.

### ★ Q7, measured — and the answer was «there is nothing to generate»

Not by eye. `measureTextBatch` — the runtime's own probe, the function `worker/src/render/variant.ts:117`
runs on every production export — in headless Chrome against the pinned `packages/fonts` bytes inlined
as `scripts/parity/harness.mjs` inlines them, over `derive(talkPoster, preset)` for **all seven poster
presets** in **both locales**. Throwaway script; nothing added to the repo.

★ **With a control first**, because «everything fits» is unfalsifiable otherwise: a ladder of growing
strings breaks from one line to two between 41 and 63 characters at `master`, at `og` and at `a3`
alike. The probe is sensitive, and the fit is **preset-invariant** — `derive()` scales the frame and
the font size by one factor, which is also why `l_when` has no `autoFit`.

| Shape | ar | en |
|---|---|---|
| one day, today's value (the baseline) | 1 line | 1 line |
| consecutive, same month — «19 – 21 سبتمبر 2026 · 6:00 م» | 1 line | 1 line |
| across a month boundary — «30 سبتمبر – 2 أكتوبر 2026 · 6:00 م» | 1 line | 1 line |
| non-consecutive — «19 و21 و26 سبتمبر 2026» | 1 line | 1 line |
| non-consecutive with a shared time | 1 line | 1 line |

**`l_when` at 920 × 70 / 40 px holds every shape this product can produce**, so a v3 has nothing to
change. Two further findings:

- **The list form scales**, because only the last entry carries the month and the year: eight days is
  still one line («1 و3 و5 و7 و9 و11 و13 و15 سبتمبر 2026 · 6:00 م»). So the plan's «N لقاءات» collapse
  form is **dropped entirely** — a count noun in the runtime would have meant Arabic plural forms in a
  package with no ICU and no message catalogue. **The fallback past the budget is the first day's full
  date, today's value**: never wrong, never worse than what the poster says now.
- **Both scripts break in the same place** — 46 characters fits, 54 wraps — which is the only reason a
  single 48-character budget is defensible as a proxy for a rendered width. Both data points are in the
  comment, so the next person need not re-derive them.

Confirmed while measuring: **a poster is always Arabic.** `locale: "ar"` is hard-coded at
`src/lib/dal/designer.ts:241` and `worker/src/tasks/regenerate_poster.ts:125`, so the `en` column is a
guard-rail rather than a constraint.

### D1 as built

`supabase/proposed/designer/0001_certificates_reissue.sql` — the lead's four DDL statements carried
verbatim under `-- LEAD DDL (DEC-160)` (contract 10), then `revoke_certificate()` (dropped and
re-created for the trailing `p_cause`, grants restated verbatim), `issue_certificate()` and
`attendance_certificate_sync()`.

Two things the plan did not have:

- **A `unique_violation` handler on the insert**, guarded by `get stacked diagnostics v = CONSTRAINT_NAME`
  so it can only ever swallow `certificates_live_once` and never a `certificates_org_id_serial_key`
  collision, which would be a real defect. ★ The item is **`CONSTRAINT_NAME`**, not
  `PG_EXCEPTION_CONSTRAINT_NAME` — the wrong spelling raises `unrecognized GET DIAGNOSTICS item` at
  **apply** time, so every case in the file failed at once and the real error was one line up from ten
  cascading failures. Postgres does fill it with the **index's** name for a bare unique index, which is
  what the new case asserts rather than assumes.
- **The audit row carries the cause** beside the serial, so a log read later says which kind of
  revocation it was — the column exists for the same reason.

`tests/rls/certificates-reissue.test.ts`, 10 cases, green. The sharp one is
`no_replacement_after_for_cause`: it reads `certificate_serial_counters` **before and after** the
refused issue and asserts it did not move, which is what proves the raise happens before
`allocate_serial()`.

### Two traps this unit met

1. ★ **A proposed file containing `alter table` deadlocks concurrent RLS runs.** `applyProposed()`
   runs inside each test's transaction, so `alter table public.certificates add column` takes
   **`access exclusive`** on `certificates` for the whole of each of my ten cases. `fileParallelism`
   is `false`, so my own run is safe — but another track running `npm run test:rls` at the same time
   deadlocks against it, and **so do I**. Three of my first ten failures were `deadlock detected` in
   `seed`, not defects in anything. Teammates' proposed files are normally functions, which take no
   table lock; contract 10 is the first time a teammate's file carries DDL. **The cure is promotion**:
   once `0001` is in `supabase/migrations/`, `applyProposed()` is a no-op and the lock disappears.
   Until then, `pgrep` before every run and re-run a deadlock rather than reading it as a finding.
2. **A test that fakes a duplicate row must keep every OTHER constraint satisfied.** Appending a
   letter to `serial` to dodge `certificates_org_id_serial_key` broke
   `certificates_serial_shape` instead, and `23514` arrived where the case asserted `23505` — a
   passing-looking constraint test that was testing the wrong constraint. The serial's **counter part**
   is replaced now, so the shape holds and only the intended rule can fire.

### Gates on `8607d07` (D1) and `333486c` (D2)

`npx tsc --noEmit` clean, app and worker · `npm run lint` **0 errors** (25 pre-existing warnings) ·
`npm test` **2055 passed, 1 skipped, 212 files** · `npm run test:rls` **1128 passed, 109 files**, the
one failure being `notify`'s own in-flight `notify-template-blocks.test.ts` · `npm run parity`
**holds, 21 of 28 with the harness's loud cwebp skip, background 3 of 3, no golden moved**.

★ **What I cannot prove alone, stated rather than implied:** the existing certificate suites ran
against the database **without** `0001` applied — only my own file calls `applyProposed()` — so they
are evidence of `main`'s behaviour, not of mine. That they still pass **under** the change is proven at
**promotion**, and the cases to watch are named in D1.8 above:
`session-days-certificates.test.ts:151` («not over an existing row») holds because the row that case
creates is `issued`, i.e. live; `checkin-removal.test.ts:156` holds because its session is
`in_progress`, so the sync returns before either row guard.

---

## D3 — the review of `notify`'s block-to-table compiler (`3cf1e6b`, `16` §11.6)

Read: `packages/mail-runtime/src/{compile,primitives,render,blocks}.ts`, `worker/src/tasks/send_notification.ts`,
`supabase/migrations/0126_public_org_logo.sql`, `src/app/api/brand/[orgId]/logo/route.ts`. **Read-only** — I
edit nothing under `packages/mail-runtime/` or `worker/src/mail/`; each finding is a request and the lead routes it.

The compiler was written **against** D3a rather than audited by it, and it shows: `dir="rtl"` and
`align="right"` are on every text-bearing cell through one `cell()` helper, there is one declared stack reused
rather than redeclared, the VML button is there, there is no `<svg>` anywhere, and every image carries `alt`
and an explicit `width`. Four of my five items are answered in the code. The findings below are what is left,
and the two that matter are both in item 4.

### Cleared — each said because each LOOKS like a hazard

- ★ **Bidi isolation is complete on BOTH parts.** I traced all nine block types and the composed footer. Bound
  values reach the HTML through `interpolateIsolated()` (`heading`, `paragraph`, `button`'s label,
  `detail_list`, `image`'s `alt`) or through an explicit `isolate()` (`session_card`'s four lines, the
  `button`'s href in the text part, the preferences URL). **Every `text.push()` carries the isolated value,
  not a second rendering of it** — which is the half that usually gets forgotten, because the text part is
  the one nobody looks at. Keeping it out of `interpolate()` is right: that function is the string path's, and
  isolating there would move all 116 pinned files for an org that has touched nothing.
- **`#ffffff` on the primary button is not a contrast risk**, and it looks like one. `accent` is `fgHeading`
  (`render.ts:320`), not a tenth token, and **contrast is symmetric** — white on `fgHeading` is the same ratio
  as `fgHeading` on a white surface, which is the pairing the brand kit already guarantees. It stops being
  exactly symmetric only where `surface` is tinted rather than white, and there it moves in the safe direction.
- ★ **No SVG can reach a mail through the logo door**, which is invariant 11 holding in a medium that is not
  ours. `org_public_logo()` gates on **`a.sniffed_mime in ('image/png','image/jpeg')`** — the sniffed type,
  not the extension (`0126:65`, `:83`) — and the route sets that content type with `nosniff`. A WebP or an SVG
  logo yields no row, `logoUrl` is null, and the design falls back to the org's name.
- **`escapeHtml` not escaping `'` is safe**: every attribute in both files is `"`-quoted.

### F1 · ★ HIGH — the mail declares no colour scheme, so forced dark is unmanaged (item 4)

`render.ts:352`'s head is `<meta charset>` and `<meta name="viewport">` and nothing else. There is no
`color-scheme`, no `supported-color-schemes`, and no `<style>` at all.

Apple Mail on macOS and iOS, and Outlook.com, **auto-invert a message that does not declare its scheme**. The
shell hard-codes `background:#f5f5f5` on `<body>` and on the outer table and puts `surface` (default
`#ffffff`) on the card, while every text colour is set explicitly. An inverter that darkens a background it
judges light while leaving an explicitly-set text colour alone produces **dark text on a dark card** — the
classic failure, and the one a light-mode-only reviewer never sees.

**Request:** add to `<head>` —
`<meta name="color-scheme" content="light" />`, `<meta name="supported-color-schemes" content="light" />`,
and `<style>:root{color-scheme:light;supported-color-schemes:light;}</style>`. That is the documented opt-out
for Apple Mail and Outlook.com. **Gmail's Android app inverts anyway**, which is what F2 is about.
★ This moves every pinned file, so it is a reviewed change to `tests/unit/mail-pinned/` — which is the pin
doing its job, not an argument against the fix.

### F2 · ★ HIGH — a transparent logo disappears in the one client that inverts regardless (item 4)

`0126` serves a PNG, and a brand logo is very often **dark ink on transparency**. The `image` block renders it
with `display:block` and **no background of its own** (`compile.ts:242`), so it sits on whatever the card's
`surface` has become. Gmail on Android darkens that surface and the logo's ink goes with it: a transparent
PNG has nothing to stand on, and the header of every designed mail goes blank for a large share of readers.

**Request:** put the logo cell on an explicit **`bgcolor` attribute** — `<td bgcolor="#ffffff">` around the
`org_logo` image, not a CSS background. The attribute is what Outlook's Word engine reads and what Gmail's
inverter respects most consistently; a CSS `background` is the first thing it overrides. The logo then keeps
the background it was drawn for in every client. This is the mail-shaped version of `DEC-125`'s argument that
a scheme is chosen, never defaulted at render time.

### F3 · MEDIUM — contract 8's one permitted URL is never used: the session-card image is dead at both ends

`compile.ts:183` reads `block.withImage`, and `imageUrl()` resolves a `session_card_image` from
`payload.session_card_image_url` (`:252`).

- **Nothing in the repository sets `session_card_image_url`.** `grep` across `src`, `worker`, `packages` and
  `supabase` finds the string only inside `compile.ts`. `lookup()` returns `undefined`, `formatValue()` makes
  it `""`, and `imageUrl()` returns `null` — so the image is dropped **always**.
- **Nothing sets `withImage` either.** It is declared in `blocks.ts:53`, read in `compile.ts:183`, and set by
  no design — so the first branch is false before the second one can fail.

Not a live defect, because no design opts in; but the code and its comment describe a feature that does not
exist — the comment reasons about «the إلغاء design asks for no image», implying the others ask for one, and
none does. ★ **This is the same shape as the `{{url}}` defect `notify` itself found this wave**: a binding
supplied by nothing, discovered only by tracing the value rather than reading the code that consumes it.

**Request, and it is contract 8's answer made concrete:** `send_notification.ts` sets
`session_card_image_url = ${appUrl}/api/s/${sessionId}/og` — **that URL and no other** — and only when the
payload carries a session id **and** that session is `published`, `in_progress` or `completed`. The state
condition is not defensive: `/api/s/{id}/og` **404s** for a draft or a cancelled session by
`export_is_public_card()`'s own predicate, which is exactly why a cancellation must not carry the card.

### F4 · MEDIUM — iOS and Android have no DECLARED Arabic face (item 1)

`FALLBACK_STACK` is `'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif` (`primitives.ts:19`).

`IBM Plex Sans Arabic` is ours and is never installed on a reader's machine, which is correct and effectively
never used. `Segoe UI` and `Tahoma` are Windows; `Tahoma`'s Arabic is solid. But **iOS ships none of the
three, and Android ships none of the three** — so on both, every Arabic run falls through to `sans-serif` and
then to the OS's glyph-level fallback: Geeza Pro on iOS, Noto Naskh Arabic on Android.

It *works* — a fallback face shapes its own run, so lam-alef survives — but it is **discovered, not
declared**, and this repository's standard is the opposite: `06` §5.1's «what does not survive a crop is
DECLARED, not discovered» is the same argument. A platform changing its fallback order changes our Arabic
silently, on the majority of readers, and nothing would tell us.

**Request:** `'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, 'Geeza Pro', 'Noto Naskh Arabic', Arial, sans-serif`.
★ **It is not free:** `FALLBACK_STACK` is in every cell of **both** paths, so this moves all 116 pinned files.
That makes it the lead's call rather than a nit — and if it is taken, it should be taken **with F1**, in one
reviewed pin diff rather than two.

### F5 · LOW — `session_card`'s inner `<div>`s carry no `dir` (item 2)

`compile.ts:190-191` builds the card's lines as bare `<div style=…>` inside a `<td dir="rtl">`. Every other
text-bearing element in the file goes through `cell()` and gets `dir` and `align` explicitly. The file's own
stated reason for that — «Outlook's Word engine does not inherit direction reliably through nested tables» —
applies less to a `div` in a `td` than to a table in a table, which is why this is low. But the card is the
one block whose lines are **bound values** carrying names, venues and dates, so it is the worst place to rely
on inheritance. **Request:** `dir="rtl"` on those two `<div>`s.

### F6 · LOW — `white-space:nowrap` on a `detail_list` label

`compile.ts:212` keeps the label cell from wrapping. Fine for «الموعد» or «المكان»; a longer authored label at
320 px pushes the value column off the card, and a mail has no overflow affordance. **Request:** drop it, or
cap the label column's width instead.

### What I did not review

The 21 compiler cases and the 116 pinned files are `notify`'s evidence and I did not re-run them; the **preview
plumbing** (the sandboxed iframe, the form target) is `notify`'s and outside `16` §11.6's «`designer` reviews
the compiler». F1 and F4 both move the pin, so whoever takes them takes the reviewed diff with them.

### The captures — six files, and why not seven

Taken by `tests/e2e/wave10-designer-reissue-and-days.spec.ts`, phone project, 390 x 844, into
`E2E_SHOTS_DIR` (default `.qa-shots/rtl`). Opened by the lead in bands on the production build of
`2ef91b3`.

| File (`wave10-designer-…`) | What it shows |
|---|---|
| `scr045-reissued-and-revoked-final.png` | SCR-045 whole: «المصدَرة» carrying Sara's replacement, «الملغاة» carrying her original and Khalid's for-cause revocation with its own reason, and the eligible list's «مُلغاة نهائيًا — لن يصدر بديل.» under Khalid's name |
| `me-certificates-both.png` | «شهادتان» — the live card, and the revoked one with «سبب الإلغاء: أُلغي تسجيل الحضور» |
| `verify-issued.png` | «شهادة صالحة» for the replacement's own code |
| `verify-revoked.png` | «هذه الشهادة ملغاة.» — and no reason shown to a stranger |
| `poster-three-days.png` | «17–19 نوفمبر 2026 · 6:00 م» |
| `poster-one-day.png` | «الثلاثاء، 17 نوفمبر 2026 في 6:00 م» — the characters `main` prints |

★ **It was seven, and two of them were the same picture.** `scr045-reissued` and
`scr045-revoked-final` were byte-identical (one md5): the two cases navigate to the same URL and
assert different halves of **one screen state**, so each capture wrote the same image under a second
name. Caught by the lead opening them. Two names for one image is a reviewer opening the same screen
twice believing they have seen two — which is the opposite of what opening captures is for. The
second case now asserts and captures nothing, and says so in place.

**A rule for the next spec I write:** a capture is named for a *screen state*, not for a *test*. Two
cases that leave the page in the same state share one file, and if a case cannot name a state of its
own it does not get a picture.

**Read in the poster captures, and correct:** «17–19 نوفمبر 2026» puts 17 on the right, because the
en dash between two `EN` runs resolves as `R` in the bidi algorithm and the whole range sits in the
Arabic paragraph direction. First day first, read right to left, which is what a range should do and
is not something `formatRange` had to be told.

### D3 · F2 revisited — `notify` was right, and the root cause is not mail's

`notify` implemented F2 as `bgcolor="${palette.surface}"` where I had asked for `bgcolor="#ffffff"`,
and put it to me rather than let me find it. **Their version is correct and mine was wrong.**

The argument that settles it is checkable rather than aesthetic: **`palette.surface` is the LIGHT
palette's.** `compilePalette()` reads `brand.light` through `legacyBrand()` (`render.ts:295-300`,
`:316`), and a light scheme's `surface` is by construction a light colour — it is the ground the
app's own dark body text sits on, guaranteed by the same contrast relation that cleared the primary
button. So `notify`'s stated worry — «the org's surface is a dark-ish tint, and dark ink on it is
still invisible» — **cannot occur** without that org's app being broken by the same token. Where the
two values differ, `surface` is right; where `surface` would be wrong, `#ffffff` is not available to
help, because the client has inverted everything anyway.

★ **And I overstated F2's mechanism.** I wrote that the `bgcolor` attribute is what Gmail's inverter
«respects most consistently». True as a comparison with a CSS `background`, and not a guarantee: a
client that inverts wholesale inverts the attribute too, and **Gmail does not invert images** — so
dark ink on a now-dark ground is invisible whichever value we wrote. F2 improves the odds in the
clients that honour explicit attributes and does nothing in the ones that do not. It is the best
available lever, not a fix, which is exactly why item 4 stays open until somebody looks at an
inverted render.

★ **The root cause is ours, not mail's: this product has ONE logo asset for TWO schemes.** There is a
single `brand.logoAssetId`; the poster template's logo layer binds it (`library.ts:121`) and **a
poster renders at scheme `dark`** (`regenerate_poster.ts:121`, `designer.ts:110` — `DEC-125`). So an
org whose logo is dark ink on transparency has an **invisible logo on every generated poster
today** — the same failure as F2, one medium over, and it predates this wave entirely. A JPEG is
safe by accident (no alpha, a white ground baked in); a transparent PNG is not.

**Carried, not fixed here.** The brand kit is `branding`'s (held by the lead) and the real answer is
either a per-scheme logo or a stated requirement that the asset must read on both grounds — a
`branding` change with an upload-time check, not a mail change and not a poster change. Recorded so
the next reader of F2 knows the mail was where it was noticed, not where it lives.

### ★ D3 · item 4 — a forced-dark SIMULATION must not invert images, or it lies toward comfort

Sent to `notify` before the preview's forced-dark toggle exists, because the obvious way to build it
is the one that cannot detect the defect it is built to detect.

**`filter: invert(1)` on a container inverts everything painted inside it, `<img>` included.** Gmail's
dark mode is not that: it is a colour substitution over CSS and attribute colours, and it **leaves
image pixels alone**. That asymmetry is the whole of F2 — a logo that is not inverted, on a ground
that is.

So a toggle built as a blanket CSS inversion turns a dark-ink logo into **light** ink on a dark
ground and shows it surviving. A **false pass**, produced by the most natural implementation, on the
one finding nobody can close by argument. The honest simulation inverts the shell's colours and
**excludes images** — then the logo pair either holds or does not, which is the question.

The assertion, restated so it is testable: not «it looks right inverted», but that the two pairs
survive inversion **independently** — the page background against the card surface (cosmetic if they
diverge), and the logo against whatever the card becomes (not cosmetic). A simulation that inverts
images can answer neither.

★ **`notify` then added the control, and it is the better half of the measurement.** The capture set
carries the **same design with a JPEG logo beside the transparent PNG**. That turns one observation
into a comparison: if the PNG pair fails and the JPEG pair holds, the variable is isolated to
**alpha**, and the carried poster defect stops being my reasoning and becomes a measurement. It is
also a second check on the instrument — my «if the PNG passes, suspect the simulation» has one
signal; **two logos have three outcomes**, and «both pass» is far more likely a blanket inversion
than two safe logos, because a white-grounded JPEG on a darkened card should stay visible as a light
box whatever the client does.

**The one thing that makes it valid: the JPEG must be the SAME ARTWORK as the PNG** — same ink, same
dimensions, differing only in the alpha channel. Two different logos would be two observations
rather than a controlled comparison, which is the whole value.

This is the same discipline as Q7's measurement: there, «everything fits» meant nothing until a
ladder of growing strings proved the probe could report «does not fit». A control is what separates
a measurement from a reassurance, and it is worth saying that the reviewer asked for the finding and
the author supplied the control.

### Two read-only reviews for other tracks, and what is OWED after the stand-down

Both were read-only; I edited nothing in either track. Findings went to the lead, who routed them.

**1 · The survey's SQL** (`0137_survey_submit`, `0138_survey_results`), read after `event`'s commit at
`c652c95`, never the working tree.

- ★ **F1 — `survey_results()` failed OPEN on a missing `org_settings` row** (`0138:77`). The column is
  `not null default 3`, but a missing ROW leaves `v_min` NULL, and every guard is a comparison against
  it: `if v_n < v_min` is NULL rather than false, so the withheld branch is skipped and the two
  `case when a.answered < v_min` guards fall through to their else branches. At one response,
  distributions and every free text released, with `withheld` reported as `null` rather than `true`.
  **Fixed by the lead at `2b8fc93`** — `greatest(coalesce(v_min, 3), 3)`, fail closed at the floor,
  mutation-checked in both directions. Not reachable in production (`create_org()` inserts the row)
  but held closed only by a convention outside the function; the test fixtures create orgs without it.
  The lead found the same shape in `limit_image_mb` (`0050`, `0115`) and the co-presenter cap (`0010`)
  and carried it to wave 11 as a class — **read, backfill, then the trigger, in one change**, because a
  trigger alone fixes no org that already lacks the row.
- **F2** — the jitter's comment overstated: for the 10 minutes to 4 hours the job is pending, the queue
  row holds the submit instant beside the payload. `service_role` only, so outside the threat model;
  taken as a sentence, not a defect.
- Clean and reported as such: «answered with nothing in the box» is **unreachable** (the only path that
  removes an attached survey's questions is `survey_detach()`, which deletes the `surveys` row and
  cascades the register and the box with it); `survey_for_member()` returns the same `null` for «no
  survey» and «not for you»; no definer trusts a caller-supplied org or member.

**2 · The mail's injection surface** (`compile/primitives/render/blocks.ts`, the preview route,
`0125`/`0134`). All **24** interpolation sites in `compile.ts` enumerated rather than spot-checked —
which is what makes «clean» a result rather than an impression. **F1–F3 routed to `notify`:**

- **F1** — a RECOGNISED block with a missing field is fatal (`block.text`, `block.urlBinding`,
  `block.items`, `block.src`), which is the opposite of `readBlocks`'s stated tolerance; the database
  validates no field (`0134`). Fixed in `readBlocks()`, and the checks panel now NAMES the dropped
  block — the lead's addition, and the better half: a silent drop still hides a broken template.
- **F2** — `SPACER_PX[block.height]` returns an inherited property for `height: "constructor"`; not an
  injection (no `Object.prototype` member stringifies with `"` or `>`), malformed output only.
- **F3** — no scheme allowlist on a button's href; ruled IN. ★ My «and relative» was wrong for this
  medium — a mail has no base document — and the lead's «same-origin as the configured app origin» is
  the right tightening. The wrinkle I flagged: the app origin is `http://localhost:3000` in dev, so the
  same-origin arm must compare **origins, not schemes**, or every designed template previews with no
  buttons on every developer's machine.
- Clean: escaping at every site (`paragraph` escapes **then** inserts `<br />`); the palette into
  `style=`/`bgcolor=` is safe **structurally, not by escaping** — anchored `~* '^#[0-9a-f]{6}$'` column
  checks (`0068:69-76`, `0093:48-49`), and Postgres's `$` is end-of-string by default, so the
  `#ffffff\nevil` bypass is closed; interpolation is single-pass (a **function** replacer, so no
  `$&` expansion and no re-scan); the preview is `sandbox` with no `allow-*`, reflects nothing from the
  request, serves `text` mode as `text/plain` with `nosniff`, and is CSRF-inert; and no bound value can
  carry a CR/LF into a subject (`render.ts:420` collapses `\s+`).

### ★ OWED after the stand-down — two items, neither started

1. **Re-read `notify`'s diff** for the three injection findings, when its hash arrives. The thing to
   check is F3's same-origin arm against a `http://localhost:3000` origin, and that F1 drops rather
   than throws for all four malformed shapes above.
2. **Read the forced-dark capture** when `notify` sends it — three cells, the same artwork as
   transparent PNG, flattened JPEG and light-ink PNG. **Read it, never accept a claim.** The reading
   instruction is recorded above: «both pass» is more likely a blanket inversion than two safe logos,
   and an empty cell means the `0126` mime gate, not the dark mode.

Carried under my name, neither fixed this wave: the phone review layout's canvas missing from the
heading outline (M13), and **one logo asset for two schemes** (`branding`/M13).

---

## Wave 13 plan — 2026-09-22 (planning only; nothing is built until the lead approves it at sync 1)

`DEC-176`, M15. The requirements are `REQ-DSG-027` … `031`, the specification is `DEC-077`, `DEC-093` and `DEC-096`, and
the contracts are 1, 2 and 4. Everything below was measured on `46bbb15` unless a line says otherwise.

### W13.0 · Where the brief and the code disagree. Each one changes the plan

1. ★ **The owner asked for more than positioning.** The agent file says «the layer model already holds everything
   the owner asked to add». That is true of the **model** (`model.ts:91–135`: text, image, shape). It is not true of
   the **studio**. The editor has **no way to add a layer or delete one**: no add-text, add-image, add-logo or
   add-shape, and no delete or duplicate (grepped for add/remove/delete/duplicate across `src/components/designer/*`
   and the runtime, and found none). It has **no field for a text layer's own words** either: the inspector edits the
   binding and the fallback, never `text.literal` (`inspector.tsx:205–237`). Nor can it set a text's weight or
   colour, or a shape's fill. «add images, logos, text, format the text» is the owner's sentence, and drag alone does
   not answer it. Proposed as **D1b** below, and put to the lead as **Q1**.
2. ★ **Snap at a phone's scale is the wrong worry. The certificate is the right one.** The phone never edits: the
   editor is `xl:` only, 1280 px and up (`editor.tsx:458`, `:494`), and the phone's canvas is rendered with
   `selectable: false` (`:471`). At desktop, the canvas column is about 486 px: the ~830 px content column
   (`editor.tsx:49–52`, measured in wave 8), minus the 20 rem panel and the gap. The canvas scales as
   `min(1, available / master.width)` (`canvas.tsx:90`), so `snap()`'s 8 document px comes out as **3.6 screen px on
   a 1080 poster, 1.6 px on a portrait certificate (2480) and 1.1 px on a landscape certificate (3508)**. The
   certificate is where it is nearly sub-pixel. Answer: R2.
3. ★ **`DEC-093`'s shift-click is not a single-pointer path on a touch device.** Shift needs a keyboard. A tablet
   with no keyboard would be left with «select all of this type» alone, which cannot pick *these two* layers. R3
   adds a tap-only multi-select toggle beside both.
4. ★ **The canvas's iframe is positioned wrong in two of the four console × document combinations**, and this is
   `DEC-096`'s class of bug. `canvas.tsx:125` places the iframe with `insetInlineStart: 0`, which resolves against
   the **console's** direction because the wrapper carries no `dir`. `:103` then picks `transform-origin` from the
   **document's** direction. The two match only when the console and the document agree. For an RTL poster in an
   `en` console the scaled page lands `W·(1 − s)` px off its box, and the same happens for an LTR document in an `ar`
   console. It is dormant because `en` is not shipped (`REQ-INT-008`), which is exactly `DEC-096`'s «lies dormant»
   warning. The fix is physical `left: 0` with `transform-origin: top left`, which is correct in all four cases.
   The selection overlay itself is correct today, but only because its wrapper carries `dir={doc.direction}`
   (`:164`). `DEC-096` asks for physical `left`/`top` there, so D1 makes that explicit.
5. ★ **The focal point is already in the runtime, and today it does nothing visible.** `image.focal` is modelled
   (`model.ts:110`), validated (`validate.ts:165`), threaded per preset by `derive()` (`presets.ts:251`) and rendered
   as `object-position` (`render.ts:164`). But it only shows under `fit: 'cover'`. The one kind of cover layer that
   exists is the uploaded poster (`posters.ts:168–192`), and its `scale: 'fill'` keeps the frame at **4:5 on every
   preset**, so there is nothing to crop. I measured `derive()` on `uploadedPosterDocument()` with the built runtime:

   | preset | page | derived frame | |
   |---|---|---|---|
   | master | 1080×1350 | x 80 · y 100 · 920×1150 | inset 80 px: the master itself is **not full bleed** |
   | square | 1080×1080 | y **−35** · 920×1150 | spills off the page top and bottom |
   | landscape | 1920×1080 | y **−535** · 1720×2150 | a 4:5 poster behind a 16:9 window |
   | og | 1200×630 | y **−345** · 1056×1320 | same |
   | story · a4 · a3 | | 4:5, centred | letterboxed on the background, which is `#ffffff` (no `background`) |

   So `REQ-DSG-020`'s «every variant exists … smart-cropped» and `REQ-DSG-030`'s «drives every derived crop» are
   both **false for the only layers a focal point could act on**. A dot and a grid over this would move nothing an
   admin can see. This is **D2b** and **Q4**.
6. **`withVariantCrop()` already exists and nothing calls it** (`posters.ts:243`). It sits in a `server-only` DAL
   module, so the client studio cannot reach it. It moves into the runtime, and there is still one copy.
7. **`DEC-096`'s «one test» already exists and passes**: `tests/components/designer/inspector-align.test.tsx:81`, with
   `:89` covering every edge in both document directions. Wave 13 adds the same byte-identity proof for the
   operations that are new (group align, distribute, nudge, a drag). Those go in a new file, and the old one stays
   evidence.
8. **Much of `16` §10.2 is already built** (wave 8): single-layer align on the document's axis, «لائم المنطقة الآمنة»,
   ▲▼ per row, front and back, «الموضع والحجم» closed by default, the checks badge that selects its layer, the
   variant strip, the phone's review layout, and the click-only e2e (`wave8-designer-editor.spec.ts:205–310`).
   Wave 13 adds **pointer** manipulation on top of an already-conformant tap path. It does not build the tap path
   from nothing.
9. **Three comments now say the opposite of the wave.** «dragging is deliberately absent» (`presets.ts:340–342`),
   «NO DRAGGING THIS WAVE (DEC-148)» (`editor.tsx:56–59`) and «no second event model» (`canvas.tsx:23–25`, which
   stays true). Each is rewritten in the commit that makes it false.
10. ★ **A plain member can enumerate and download every certificate PDF in their org** (R11 below). I measured it.
    I did not fix it.

### W13.1 · The research (`DEC-176` §1), narrowly — five questions

**R1 · Hit-testing and the pointer model on a rotated layer in an RTL document.**
- *How others do it.* Canvas engines (Konva/Polotno, Fabric) hit-test in their own scene graph, with a transform
  matrix per node. They own rendering, so they are out on sight. A DOM editor does what the browser already does:
  wrap the selection in an element carrying the **same** `transform: rotate(θ)` about the same origin, put the
  handles **inside** that element, and let the browser hit-test the rotated box. Figma's public model is the same
  idea: each node carries a `relativeTransform`, and handles live in node-local space.
- *Here.* The renderer draws each layer at `inset-inline-start: x; top: y; width; height; transform: rotate(θ)`, with
  the default origin (the centre) (`render.ts:111–118`). **CSS rotation is not mirrored by `dir`**, so the direction
  affects exactly one number, the physical left: `L = dir === 'rtl' ? W − x − w : x`. The overlay draws each box at
  physical `left = L·s`, `top = y·s` and `w·s × h·s`, with the same `rotate(θ)`. The **browser hit-tests the rotated
  box for free**. No hit-testing maths is written.
- *What does need maths*, as pure functions in a new `packages/designer-runtime/src/geometry.ts`, each unit-tested
  in both directions:
  - `toPhysical` / `toLogical` (the one direction switch);
  - `moveBy(frame, dxScreen, dyScreen, scale, dir)`, where the x delta is negated for RTL;
  - `resizeFromHandle(frame, handle, dx, dy, θ, dir, {keepRatio})`: the pointer delta is rotated into the layer's
    local axes by −θ, the opposite handle stays fixed in document space, and the result is converted back to a
    logical `x`;
  - `rotateTo(centre, pointer, start, {step15})`, normalised to (−180, 180] and a whole number of degrees.
- **Cost:** about 200 lines of pure functions plus their tests. No dependency.
- *Seen on the way, and not fixed:* the LTR mirror of a template (A27) renders a rotated layer with the **same**
  sign, so it is not a true mirror. That is the renderer's behaviour, it is outside this wave, and no template
  rotates today.

**R2 · Snap tolerance and guides.** Measured as in W13.0 item 2. The tolerance becomes **screen-space**:
`tolDoc = round(6 / scale)`, which is 13 document px on a poster and 43 on a landscape certificate. That is the same
feel on both, and in the 4–8 screen px band the tools converge on. **`snap()` is reused unchanged.** It already
takes `tolerance` (`presets.ts:357`). The typed-number path keeps its 8 (`editor.tsx:303–304`), so no existing test
moves.
- Targets are `snapTargets()` / `snapTargetsBlock()` unchanged: the safe box's edges and centre, the page, and the
  siblings' edges. The moving layer offers its start edge, end edge and centre, and the nearest candidate wins
  (a new `snapFrame()` built on the two helpers and `snap()`).
- Siblings' centres are **not** added this wave. Adding them to `snapTargets()` would change what a typed number
  snaps to.
- Guides are 1 px physical lines in the overlay, drawn only during a gesture, in an existing token. Alt suspends
  snapping. A rotated layer snaps its unrotated frame (stated in the UI copy's hint).

**R3 · Marquee in RTL, and the taught alternative.**
- The marquee lives in **screen space**. It selects every visible layer whose rotated box **intersects** it (Figma's
  rule), so direction never enters: both rectangles are physical. It starts only on empty canvas and only for
  `pointerType` mouse or pen. On touch, empty canvas keeps its scroll (`touch-action: pan-y`) rather than hijacking
  the page.
- **The taught alternatives, all single-pointer:**
  - (a) «اختر كل طبقات هذا النوع» in the layers tab (`DEC-093`);
  - (b) ★ an **«تحديد متعدّد»** toggle in the layers tab that turns each row into a checkbox, so a tap adds or
    removes a row (W13.0 item 3);
  - (c) shift-click on the canvas or on a row, for a keyboard.
- The rail's hint names (b). A marquee is never the only way.

**R4 · Touch targets at 390 px, and whether the essential exception survives.**
- *At 390 px there are no handles at all.* The phone is view and approve (`editor.tsx:457–488`) and its canvas is
  not selectable (wave 11's sweep). `DEC-093`'s claim is therefore never tested on a phone. It is tested on a
  **touch device at 1280 px or wider** (a tablet in landscape).
- There, each handle is an 8 px visual square inside a 24 × 24 transparent hit area, which meets `SC 2.5.8`'s size
  by itself. On a small layer the eight hit areas overlap. At a screen box under 48 px on an axis, the four edge
  handles are hidden and the corners stay. Under 24 px, only the move behaviour stays.
- **The claim, stated precisely.** For `SC 2.5.8` it is the **«equivalent»** exception, not «essential»: the same
  function is on the same page in controls that meet the size (the fields, align, «لائم», ±15°). That is the
  exception `canvas.tsx:161` already names for the layer boxes. For `SC 2.5.7` the handles need no exception,
  because a dragging function with a single-pointer alternative conforms. `DEC-093`'s «essential» wording is
  stricter than required, and still true.

**R5 · Undo granularity.**
- **One entry per gesture.** `pointermove` never calls `mutate()` (`editor.tsx:231`). The gesture keeps a transient
  frame. On `pointerup`, one `mutate()` pushes one undo entry and one debounced autosave. A gesture under a 3 screen
  px threshold is a **tap**: it selects and writes nothing.
- *Live feedback during the gesture:* the overlay's box and handles move with the pointer. The iframe's own
  `[data-layer]` element gets a transient `translate` / size through `contentDocument`, which is reachable because
  the frame is `allow-same-origin` with no scripts. That is the real rendered element offset for the gesture's
  duration, not a second renderer. The committed `srcDoc` replaces it on release. Autofit runs at render, so text
  in a box being resized shows its old fit until release (acceptable, and stated in the comment).
- **Arrow-key nudge coalesces:** a burst of arrow presses on the same selection is one entry, closed on `keyup`, on a
  selection change or on any other operation. This is `mutate(next, { coalesce: key })`, which replaces the top of
  `past` instead of pushing. It uses no timer (`DEC-146`).
- A typed number stays one entry per change, as today (the wave-8 undo assertion depends on it).

**Libraries evaluated — all in-overlay candidates. I propose none. No `package.json` request.**

| Library | What it is | Verdict and why |
|---|---|---|
| Konva / react-konva, **Polotno** | canvas scene graph and editor | **disqualified on sight.** It renders (`DEC-017`, `DEC-048`) |
| Fabric.js | canvas object model | **disqualified.** Same reason |
| **react-moveable** (daybrush) | DOM drag, resize, rotate, snap, guidelines and groups over any target | the only serious candidate. It sits in the overlay and would target our proxy boxes, not the iframe. **Dropped**: its handles are unlabelled divs we would have to re-wrap for `DEC-093` anyway; it writes transforms onto its target, which fights our physical-from-logical positioning (`DEC-096`); it snaps on screen geometry, not on `snapTargets()`, which would be a second copy of the seven helpers; and it is a large dependency for about 200 lines we would still write for the write-back |
| interact.js | pointer gestures with snap modifiers | **dropped.** Pointer Events with `setPointerCapture` give the same thing natively, and its snapping would be a second snap |
| @use-gesture/react | small gesture-state hooks | **dropped.** Convenient, but tap-vs-drag and capture are about 30 lines here |
| dnd-kit | list and sortable drag-and-drop | **dropped.** Not free-form transforms, and drag in lists is not this wave |
| Selecto (daybrush) | marquee selection | **dropped.** The marquee is about 40 lines of intersection over boxes we already have |

### W13.2 · ★ Contract 1 — the download DTO and its route (day one)

In `src/lib/dal/posters.ts`:

```ts
export type DownloadState = "ready" | "pending" | "failed";

export interface PosterDownload {
  preset: PresetName;                 // master · square · story · landscape · og · a4 · a3
  format: "png" | "webp" | "pdf";
  widthPx: number | null;
  heightPx: number | null;
  state: DownloadState;               // queued and rendering are both "pending" — never a link
  byteSize: number | null;            // ready only (export_artifacts.byte_size, 0055)
  href: string | null;                // ready only: `/api/designer/downloads/${artifactId}`; null otherwise
}

export interface SessionPosterDownloads {
  sessionId: string;
  primary: PosterDownload;            // ALWAYS master · png (DEC-176: «a simple download») — pending when not ready
  others: PosterDownload[];           // the rest of the set, in presetsFor('poster') order, png before webp
  ready: number;
  total: number;
  /** A newer render of this poster is queued or running — the files above are the previous one's. */
  updating: boolean;
}

/** null = render nothing: no poster, no document yet, or a caller who is not
 *  admin · moderator · an accepted presenter of this session (REQ-DSG-027). */
export async function getSessionPosterDownloads(locale: string, sessionId: string): Promise<SessionPosterDownloads | null>;
```

- **Which set of files.** It is the same set `getSessionPoster()` shows (the newest *ready* fingerprint, else the
  newest row's). The helper `currentPosterSet()` is extracted and shared, so the file downloaded **is** the poster
  on the page. `updating` is true when another fingerprint of the document has queued or rendering rows. It orders
  by `rendered_at` as today, never by `created_at`.
- **Entitlement** is re-derived in the DAL from `session.role` plus an accepted `session_presenters` row read under
  RLS. That decides only whether a menu renders. **The refusal that counts is the route's**, through contract 3.
- **`sessions` renders a plain `<a href download>`, never a `<Link>`**, so nothing is prefetched. The route answers
  with a redirect, so `download` is a hint and the filename comes from the signer.

**The route — `src/app/api/designer/downloads/[artifactId]/route.ts`, `GET`:**
1. Zod checks that `artifactId` is a uuid; otherwise `400`.
2. It calls the lead's contract-3 function under the caller's session. **Proposed** signature, the name the lead's
   to give: `record_export_download(p_artifact uuid) returns table (storage_path text, file_name text)`, security
   definer, `0049`'s pattern.
   - It re-derives from the artifact's document: a **session poster**'s artifact admits admin, moderator or an
     accepted presenter of that session; a **certificate**'s artifact admits an org admin (`certs_read_*` are
     admin-only, `03` §5.8); a template's or an unbound document's admits an admin.
   - The artifact must be `ready`, in `auth_org_id()`'s org.
   - Everything else gets `42501`, and an unknown id gets the same `42501` (no existence oracle).
   - It writes `audit_log` through `write_audit()`, for example `export_artifact.downloaded` naming the artifact,
     preset, format and session or certificate.
   - `file_name` is ASCII and built in SQL: `poster-<preset>.<ext>`, or `certificate-<serial>.pdf` (the serial is
     Western, `DEC-095`).
3. `42501` → `403`, empty body. A ready row is expected, so a missing path → `404`.
4. `signExportUrl(path, { download: file_name })` → `303` to the signed URL, with `Cache-Control: no-store`.

**One route for both, not two.** The certificates screen's link points at the same route with the certificate
artifact's id. That means one audit call site, one signer call site and one set of tests. `src/app/api/certificates/`
stays unbuilt, which is my recommendation. **Q2** asks the lead to rule on the function's name, return shape and
audit action.

### W13.3 · The fold of the three signers (D4)

- **The one implementation** moves to `posters.ts`, the leaf module: `designer.ts` imports `posters.ts`
  (`designer.ts:22`), and `certificates.ts` imports `designer.ts`, so posters is the only home without a cycle.
  ```ts
  export async function signExportUrl(locale: string, storagePath: string, options: { download?: string } = {}): Promise<string | null>
  ```
  It is `createSignedUrl(path, 300, options.download ? { download } : undefined)`: five minutes, as all three are
  today.
- `designer.ts` keeps `export { signExportUrl } from "@/lib/dal/posters"`, so the studio page's import is unchanged.
- `certificates.ts` keeps `export const signCertificateUrl = signExportUrl`: **an alias, not a copy**.
  `sessions/[id]/page.tsx:379` is `sessions'` file and `me/certificates/page.tsx:30` and its component test mock
  that name. The alias keeps both unchanged, and no test moves. `sessions` can switch its import during H4, and the
  alias is deleted when the last caller goes.
- `loadSessionPoster()`'s inline `createSignedUrl` (`posters.ts:351`) calls `signExportUrl`.
- **A guard:** `tests/unit/designer-one-signer.test.ts` scans `src/**` and fails if `.from("exports")` is followed by
  `createSignedUrl` anywhere but `posters.ts`'s one function.
- **The studio's export panel downloads** (`designer/[documentId]/page.tsx:98–104`, the `links` map) switch to the
  audited route's `href`, so an admin's download from the studio is audited too. **The variant strip's thumbnails
  stay signed URLs.** They are `<img src>`, not downloads.

### W13.4 · `REQ-DSG-029` and `REQ-DSG-031` — what is built, measured

**`REQ-DSG-029`:**

| Acceptance | State |
|---|---|
| a variant is inspectable before export | **built.** A strip tile puts `derive(document, preset)` on the canvas live (`editor.tsx:382–385`, `:420`) |
| a warning dot where a check fails | **built** (`variant-strip.tsx:63–67`) |
| a persistent badge with a count | **built** (`editor.tsx:413–418`, `:509–511`) |
| clicking a failed check selects its layer | **built**, and it switches to the failing preset (`:368–373`). Pinned by `wave8-designer-editor.spec.ts:222–240` |
| «live thumbnail» | the tile shows the **worker's** PNG once exported, and proportions before that. Ruled in wave 8 (W8.d) because seven live iframes are the cost. **Propose: unchanged** |

**`REQ-DSG-031`:**

| Acceptance | State |
|---|---|
| three meanings separated | **built.** Design, who and issue are three sections, in the order the job needs (`certificates/page.tsx:27–51`, `:151–161`) |
| preview with a real attendee | **built.** The longest eligible name stands in for the recipient (`design-panel.tsx:150–159`) |
| preflight | **partly built.** The studio's own checks run against the longest name (safe area, the auto-fit floor), and the next serial and count are an estimate, never reserved (`page.tsx:95–123`). **Not stated as a checklist:** fonts resolved and bindings bound. Tier A can only be green after a render, and it is shown per row (`issuance.tsx:151–175`) |
| no trigger from a dropdown without preflight and confirmation | issuance is **not triggered by hand at all**: it is the completion fan-out (automatic) or a confirmed release of held rows (`issuance.tsx:305–331`, `REQ-UIX-013`). The only unconfirmed act is **choosing the mode**, on the schedule's radio |
| a failed certificate re-issued alone | **built** (retry per row, serial untouched, `issuance.tsx:37–39`, `:118–125`) |

**What I would build (small, and it rides on contract 2).**
- The mode control in «من يستحق» (W13.7). Choosing «تلقائي» or «مراجعة» before completion opens a confirmation
  listing the preflight as a checklist: fonts resolved (the manifest's faces for the chosen template), bindings
  bound (declared minus resolved against the sample), the checks against the longest name, and the estimate.
- If contract 2 goes the other way, the checklist sits under «الإصدار» as a read-only preflight instead.

### W13.5 · Direct manipulation, file by file (D1) — each operation with its non-dragging path

| Operation | Pointer (new) | Non-dragging path — `DEC-093` | Where |
|---|---|---|---|
| move | drag the box | ★ X/Y fields (kept, collapsed) · align start/centre/end × two axes · «لائم المنطقة الآمنة» · **tap-to-place**: «ضع هنا» arms, the next canvas tap places the layer's centre there (a `page.click({position})`, never a drag) | canvas · inspector |
| resize | eight handles | ★ W/H fields · «لائم» · **«املأ المنطقة الآمنة عرضًا»** (new, one tap) | canvas · inspector |
| rotate | a knob above the top edge, shift snaps to 15° | ★ the rotation field · **±15° buttons** · «صفّر الدوران» | canvas · inspector |
| reorder | — (no drag in lists this wave) | ▲▼ per row (built) · front/back (built, in the inspector) · `Ctrl/⌘ + ↑↓` | layer list · inspector |
| multi-select | marquee (mouse and pen only) · shift-click | ★ «تحديد متعدّد» toggle · «اختر كل طبقات هذا النوع» | canvas · layer list |
| group align / distribute | — | buttons, prominent in the inspector when two or more are selected. Distribute needs three | inspector |
| nudge | arrows 1 px, shift 10 px, on the **visual** axis | the fields | canvas focus |
| focal point | the dot | ★ the nine-point grid (W13.6) | inspector |

**Files:**
- **`packages/designer-runtime/src/geometry.ts`** (new): `toPhysical`, `toLogical`, `moveBy`, `resizeFromHandle`,
  `rotateTo`, `boundsOf` (rotated bounding box, for the marquee and group bounds), `snapFrame` (built on `snap`,
  `snapTargets` and `snapTargetsBlock` — the helpers are called, not copied) and `nudge(doc, ids, dxVisual,
  dyVisual)`, which is the one place the visual → logical sign flip lives. Whole pixels throughout (`arrange.ts:21`'s
  rule).
- **`packages/designer-runtime/src/arrange.ts`**: **added to, nothing edited.** New `alignLayers(doc, ids, axis, edge,
  target: 'safe' | 'page' | 'selection')`, `distributeLayers(doc, ids, axis)` (equal gaps between bounds, the end
  layers fixed), `placeCentre(doc, id, point)` and `rotateBy(doc, id, deg)`. `alignLayer`, `fitLayerToSafeArea` and
  `reorderLayer` are untouched and so are their tests. Locked layers are skipped by the group operations and reported
  back.
- **`packages/designer-runtime/src/focal.ts`** (new): `setFocal(doc, layerId, focal, preset?)`, which is
  `withVariantCrop()` moved here and generalised. `posters.ts` re-exports the old name.
- **`packages/designer-runtime/src/validate.ts`**: `presets.*.focal` validated in 0…1, as `image.focal` already is.
  It is only stricter, so `main`'s worker is unaffected.
- **`packages/designer-runtime/src/index.ts`**: exports the new functions. **Not touched:** `render.ts`, `derive()`,
  `fingerprint.ts`, `bindings.ts`, `brand.ts` (see W13.8 for D2b's one exception, put to the lead).
- **`src/components/designer/canvas.tsx`**:
  - the iframe fix (W13.0 item 4);
  - the overlay repositioned in **physical** `left`/`top` from `toPhysical()`, with the `DEC-096` exemption written
    as a comment where the style is set;
  - `selectedLayerIds: string[]`;
  - a selection frame carrying the layer's rotation, with handles as its children (`aria-hidden` pointer targets,
    per R4's size rules) and a rotation knob;
  - `onPointerDown` with `setPointerCapture` and a tap threshold;
  - guides, the marquee, and a live coordinate chip that reads x/y **from the document's start edge**, exactly as
    the fields do. That keeps `DEC-096`'s «rulers share an origin with the fields» true without drawing rulers
    (**Q9**);
  - arrow keys on the focused layer button;
  - on a **derived preset**, handles are hidden and a note offers «حرّر على المقاس الأساسي», because a derived frame
    is computed and writing it back would be a guess. The focal grid still works per preset.
  - the per-layer `<button>`s stay: their names, `aria-pressed` and the wave-8 spec's locators are unchanged.
- **`src/components/designer/editor.tsx`**:
  - selection becomes a list;
  - `mutate(next, { coalesce? })`;
  - `commitGesture()` pushes one entry;
  - keyboard handling: arrows, `Ctrl/⌘+↑↓`, `Escape` clears the selection, and `Delete` only with D1b;
  - the old comments are rewritten (W13.0 item 9).
- **`src/components/designer/inspector.tsx`**:
  - new props are **optional** (`selection?`, `onGroupArrange?`, `onFocal?`), so the existing component test mounts
    unchanged;
  - the group section appears for two or more layers;
  - an «الصورة» section for image layers holds fit (contain/cover) and the focal point;
  - ±15° and «املأ عرضًا» go in «المحاذاة والترتيب»;
  - «الموضع والحجم» stays **closed by default and present**. ★ It is not deleted, not hidden on multi-select (on
    multi-select it says «حدّد طبقة واحدة لتحرير الأرقام»), and not tidied.
- **`src/components/designer/layer-list.tsx`**: the «تحديد متعدّد» toggle with checkbox rows, «اختر كل طبقات هذا
  النوع» per kind, and shift-click. The existing row button, its name and `aria-pressed` stay.
- **`src/messages/{ar,en}/designer.json`**: new keys, Arabic first; every count carries all six plural forms and
  goes through `formatNumber`.

**D1b — «add images, logos, text, format the text» (Q1). Proposed IN, after D1, and sheddable before D1 is.**
- An «أضف» group heads the layers tab: **نص** (a literal text layer at the safe box's start, brand ink),
  **صورة** (the existing `/api/designer/assets` upload, sniffed on content, no SVG, `DEC-009`, with the PPI guard
  checking at 200), **الشعار** (an image bound to `brand.logoAssetId`, `contain`) and **شكل** (a rect in
  `{{brand.*}}` only).
- Duplicate, and delete through a confirm that names the layer. A template-locked layer can be neither, and
  `design_documents_guard` refuses it anyway (`0055:533–554`).
- The inspector gains the text's own words (`text.literal`), weight (400/500/600), a colour **token** select
  (`REQ-DSG-021`, the background's pattern at `inspector.tsx:265–281`) and a shape fill.
- Letter-spacing stays uneditable (A30).
- Every one of these is a click, so the `SC 2.5.7` gate covers it.

### W13.6 · The focal point (D2), and why no golden moves

- **The inspector's «الصورة» section, for `fit: 'cover'` layers only.** Under `contain`, `object-position` changes
  nothing visible, so the control would be a lie. There, the section says «نقطة التركيز تعمل مع الملء
  (cover)» next to the fit toggle.
- **The nine-point grid** is a `radiogroup` of nine 44 px buttons (the corners, the edges and the centre, named in
  words) and is **sufficient by itself**. The draggable dot sits on the layer's thumbnail and refines it to two
  decimals.
- On the **source preset** it writes `image.focal`. On a **derived preset** it writes `presets[preset].focal`, which
  is A32's override (`setFocal`).
- **The centre default.** An untouched layer has no `focal`. Choosing «الوسط» on a layer with no `focal` is a
  **no-op**: nothing is written, so there is no fingerprint change and no undo entry. Otherwise an untouched
  document would change bytes the first time someone looked at the grid.
- ★ **No golden moves, and here is why:**
  - (a) D2 changes **no** renderer and **no** derivation code. `object-position` and the per-preset threading already
    exist in `main`'s runtime.
  - (b) `scripts/parity/cases.mjs` (88 lines, 7 text cases) and the background goldens contain **no image layer**,
    so no golden can see a focal point.
  - (c) A new unit test, `designer-derive-untouched.test.ts`, asserts that for every seeded library template
    `derive()` and `renderDocumentToHtml()` are **byte-identical** before and after the wave's runtime changes
    (a committed snapshot taken from `main`'s runtime at `46bbb15`).
  - (d) I run the parity harness without `--update`, and every golden must be unchanged. A moved golden is a bug I
    report, and `goldens/**` is never mine.
  - D2b (W13.8) is the only item that could change a render, and it is put to the lead.

### W13.7 · Contract 2 — who writes the certificate mode after this wave

Today, `schedule_session()` writes `certificate_mode` from `p_certificate_mode`, whose default is `'off'`
(`0112:68`, `:312`). The schedule form sends it every time, and SCR-045 only links there
(`certificates/page.tsx:31–33`, `:178–182`).

**Recommendation: SCR-045 writes it (`designer`), and the schedule screen shows it.**
- `REQ-DSG-031` places the mode in step 2, «من يستحق» («the mode, with the resulting list of names shown live and a
  count»). The live list and the count are only on SCR-045.
- The preflight confirmation (W13.4) is the one unconfirmed act left, and it belongs beside the mode.
- The owner's complaint is written in that page's own comment.
- The schedule shows `<CertificateModeBadge>` (my slot, unchanged) with a link into the hub's certificates tab.

The pieces:
- **Mine:** a new definer function, `set_certificate_mode(p_session uuid, p_mode public.certificate_mode)`, in
  `supabase/proposed/designer/`. It is admin only, `42501` otherwise, with the same state rule `schedule_session`
  applies to the mode (measured at build). It is audited through `write_audit()` and granted to `authenticated` alone
  (`DEC-152`). **No table change.**
- **`sessions'`:** `schedule_session()`'s `p_certificate_mode` default changes from `'off'` to `null`, and
  `certificate_mode = coalesce(p_certificate_mode, certificate_mode)`. It is dropped and re-created in the same file
  with its signature unchanged, so `main`'s app, which still sends the mode, behaves exactly as today in the gap.
  The form stops sending it.
- **Cost, named:**
  - `tests/e2e/wave9-three-day-workshop.spec.ts:297–310` (the **lead's**) checks the radio on the schedule and reads
    `certificate_mode = 'automatic'`, so it moves.
  - `tests/components/checkin/schedule-form.test.tsx:39` (`sessions'`) passes `certificateMode`, so it moves.
  - Each change is a ledger line by its owner.
  - `wave8-designer-certificates.spec.ts:466`'s «الوضع معطّل» ×2 is **kept**: the radio labels will not contain that
    phrase.
- **Option B**, if the lead prefers zero moved assertions: the schedule stays the writer, SCR-045 keeps its link, and
  the W13.4 preflight becomes read-only under «الإصدار». That is cheaper, but it leaves the owner's complaint
  standing.

### W13.8 · The certificates screen's download (D5), and D2b

**D5:**
- `SessionCertificateRow` gains `downloadHref: string | null`. It is set for **issued** rows with a ready PDF, to
  `/api/designer/downloads/<artifactId>`, in `getSessionCertificatesWithRender()`, whose PDF lookup already exists
  (`attachPdfs`).
- A «الملف» column in the issued table (`onCard`, so it shows on the phone's cards) holds a plain link named
  «نزّل شهادة <bdi>{name}</bdi>».
- Held and revoked rows get no link: a revoked certificate's file is not something to hand out again, and a held
  one has not been released.
- The moderator sees no issuance section (unchanged).
- **The header under the hub.** When `sessions` lands `[id]/layout.tsx` with the sub-nav, this page's `PageHeader`
  breadcrumb and its «sessionLine» may duplicate the layout's. I change mine to fit once the layout's contract is
  published. That is **Q6**, routed through the lead.

**D2b (Q4), the uploaded poster's crop.** It is proposed and not assumed, because it is the one thing here that
changes a render.
- A new `LayerPresetOverride.scale` value, **`'page'`**: the frame becomes the preset's whole page, bleed included,
  so `cover` plus `focal` actually crop. It is added to `derive()` as a **new branch**. The existing
  `proportional`, `fixed` and `fill` branches are byte-identical, and `fill` is used by nothing but existing uploaded
  posters (grepped).
- `uploadedPosterDocument()` writes `'page'` from now on, and that document declares **`schemaVersion: 2`**.
  `SCHEMA_VERSION` becomes 2. Every other writer (`library.ts`, `templates.ts` createBlank) pins its current `1`, so
  no seed and no fingerprint moves.
- Existing uploaded posters keep `'fill'` and render as today. Re-uploading gives the new behaviour. Whether to
  convert the few existing documents is a data question for the owner, never a migration.

### W13.9 · Existing tests whose expectation moves

**Mine: none planned.** Each file below was checked, with the reason it holds.

| File | Why it does not move |
|---|---|
| `tests/e2e/wave8-designer-editor.spec.ts` | the per-layer canvas buttons, «الموضع والحجم» closed by default, the align, «لائم», undo and typed-number paths and their stored values are all kept (`:205–310`). Still no `mouse.*` |
| `tests/components/designer/inspector-align.test.tsx` | the new Inspector props are optional. Its four cases, and axe on a text layer, are unchanged |
| `tests/unit/designer-arrange.test.ts` | `arrange.ts` is added to, never edited |
| `tests/unit/designer-presets.test.ts` | `snap`, `snapTargets` and the existing `derive` branches are unchanged |
| `tests/unit/designer-ppi.test.ts:160–190` | asserts only the focal threading for `'fill'`, which is unchanged |
| `tests/unit/designer-model.test.ts:91` | written against `SCHEMA_VERSION + 1`, so it follows the constant |
| `tests/components/me/certificates-page.test.tsx` · `tests/e2e/wave7-content-certificates.spec.ts` | `signCertificateUrl` is kept as the alias, and the member's page is unchanged |
| `tests/e2e/wave8-designer-certificates.spec.ts` · `certificates.spec.ts` · `wave10-designer-reissue-and-days.spec.ts` | a new column appends a cell; no column count or index is asserted (grepped) |

**Other tracks' tests that move, but only if contract 2 goes my way (W13.7):**
`wave9-three-day-workshop.spec.ts:297–310` (the lead's) and `schedule-form.test.tsx:39` (`sessions'`).

If anything above is wrong at build time, the ledger line goes in `STATUS.md` in the same commit as the change.

**New tests** (all mine, new files):
- **unit:**
  - `designer-geometry.test.ts`: `toPhysical`/`toLogical` round trip in both directions; the RTL east handle writes
    `x` and `w`; a rotated resize keeps its opposite corner fixed; rotate snaps and normalises; nudge → in RTL
    decreases `x`.
  - `designer-group-arrange.test.ts`: align, distribute, locked layers skipped.
  - `designer-snap-drag.test.ts`: screen-space tolerance at three scales.
  - `designer-focal.test.ts`: the centre no-op; the per-preset override; validation of `presets.*.focal`.
  - `designer-derive-untouched.test.ts` (W13.6 (c)).
  - `designer-one-signer.test.ts`.
  - `designer-download-route.test.ts`: `400` on a bad uuid, `403` on `42501`, `303` with `no-store`, the filename
    passed to the signer.
- **component:**
  - `tests/components/designer/wave13-console-parity.test.tsx`: group «align start», distribute and a nudge from an
    `ar` and an `en` console, in both document directions, give **byte-identical** documents.
  - `canvas-overlay.test.tsx`: physical `left` for each of the four console × document combinations; the iframe's
    origin.
- **RLS**, if contract 2 is mine: `tests/rls/certificates-mode.test.ts`, applied with `applyProposed()`. The `03`
  §8.2 rows:
  - `FN-set_certificate_mode` — an admin sets it, and an audit row is written in the same transaction.
  - A moderator or a member → `42501`.
  - Another org's admin → `42501`.
  - The state rule.
  - `schedule_session` with a null mode leaves it unchanged (that one is `sessions'` row).
- **e2e:**
  - ★ `wave13-designer-studio-taps.spec.ts`, the `SC 2.5.7` gate. Move (align, tap-to-place), resize (fields,
    «املأ عرضًا»), rotate (±15°), reorder, focal (grid), multi-select (the toggle), group align and distribute, and
    D1b's add, format and delete, each with `click()` alone (`page.click({position})` for tap-to-place), and the
    stored document asserted after each.
  - `wave13-designer-studio-drag.spec.ts`, the pointer path. `mouse.down/move/up`: drag, a resize handle, the
    rotation knob, the marquee, and **one undo entry per gesture**.
  - `wave13-designer-certificates-download.spec.ts`: an admin's link → `303` → the file, and an audit row; a plain
    member forging the URL → `403`.
- The captures go to `.qa-shots/rtl/wave13-designer-{studio,certificates}-<state>.png`.

### W13.10 · What `main`'s worker does in the gap

- **D1, D1b, D2, D4 and D5 change nothing a render produces.** Their documents are ordinary frames, rotations,
  literals, tokens and `image.focal`, which `main`'s runtime already renders (`render.ts:111–118`, `:164`;
  `presets.ts:251`). `derive()`, `render.ts` and `fingerprint.ts` are untouched, so a document edited in the new
  studio renders byte-identically on `main`'s worker.
- `validate.ts` only becomes stricter, so anything the new app saves, `main`'s worker accepts.
- The download route, the signer and `set_certificate_mode` are app and SQL only. `main`'s app never calls the new
  functions. `schedule_session`'s coalesce keeps `main`'s app's explicit mode working (W13.7).
- ★ **D2b is the one exception, and its answer is the schema version.** `main`'s worker would render `'page'` through
  the proportional branch, cache that wrong artifact under the new fingerprint, and keep it. Declaring
  `schemaVersion: 2` makes `main`'s `validateDocument()` refuse it with `schema_version_future` instead. The
  artifact fails loudly and is retried once Railway runs the new image. That is the mechanism `model.ts:9–10`
  exists for.

### W13.11 · The measurements the agent file asks for

1. ★ **Can a member learn another member's certificate `storage_path`? Yes, through Storage. No, through the tables.**
   - *Tables:* `exports_read` (`0055:650`) needs the design document to be readable, and `documents_read`
     (`0055:614–619`) shows a certificate's document only to an admin or to its own member. `0145`'s policy covers
     session posters only. So `export_artifacts` does not leak another member's certificate.
   - *Storage:* `exports_storage_read` (`0037:674`) admits **any** org member to **any** object under the org
     prefix, and Storage's list runs `storage.search` / `list_objects_with_delimiter`, both `SECURITY INVOKER`
     (checked in `pg_proc`).
   - **Probed locally, in one rolled-back transaction.** As the owner I inserted
     `<org>/exports/<doc>/cert_landscape.pdf`. As `authenticated`, with `org_role: member`,
     `select name from storage.objects where bucket_id = 'exports'` **returned it**. A member can therefore list
     every certificate PDF in the org and mint a signed URL for any of them (`createSignedUrl` needs only that
     `select`).
   - **Not fixed. It is a finding for sync 1 (Q3).** A proposed shape for the lead: a **restrictive** `select`
     policy on `storage.objects` for `bucket_id = 'exports'`, `to authenticated`, that passes unless the object is
     a certificate document's render the caller cannot read. That is a definer predicate over
     `design_documents.bound_certificate_id` and the path's document segment; a plain «must see its
     `export_artifacts` row» would break cross-org public-card posters, `0080`. It needs a test for each of the
     four readers (own, admin, another member, anon via the public card).
2. **What the phone gets on SCR-057 today** (`editor.tsx:457–488`, `page.tsx:152–173`):
   - the notice «على الهاتف تراجِع ولا تحرّر» (1280 px);
   - the canvas, not selectable, under «المعاينة»;
   - the variant strip with the worker's thumbnails;
   - the checks with their count and «اذهب إلى الطبقة»;
   - the data;
   - «اطلب التصدير» in the header, and the export queue below.
   `16` §10.2.2's «approve **or send back**» has no «send back»: there is no approval state in the model, so «اطلب
   التصدير» is the approval. **Propose: unchanged this wave.** «send back» would need a state and a notification,
   and that is new scope.
3. **A document carrying a focal point on `main`'s worker:** it renders the same (W13.10). `object-position` has been
   in the runtime since M6, and the uploaded poster has carried `focal: {0.5, 0.5}` since wave 3.

### W13.12 · Order, once approved

1. D4 (the fold) and **contract 1** (the DTO plus the route against a stub of the lead's function, then the real one
   at `0152`). This unblocks `sessions'` H4 on day one.
2. D5 (the certificates download).
3. D1's runtime (`geometry.ts`, the `arrange.ts` additions, `focal.ts`) with its units.
4. D1's canvas and editor (pointer, handles, snap, marquee, nudge, undo).
5. D1's inspector and layer list (the group section, multi-select, tap-to-place, ±15°).
6. D2 (focal).
7. The `SC 2.5.7` gate and the drag spec.
8. D1b, if approved.
9. Contract 2's SQL and the mode control, if ruled mine.
10. D2b, if approved.
11. The captures.

`npm run parity` (no `--update`) runs after 3, 6 and 10.

**If I must shed:** D2b first, then D1b's delete/duplicate, then rotation's knob (the field and ±15° remain). D1's
drag, resize, snap and multi-select are not shed.

### W13.13 · Questions for the lead

1. **Q1 — D1b.** Adding text, image, logo and shape, deleting and duplicating, and editing a text's own words, weight
   and colour token. The owner's sentence asks for it, and `REQ-DSG-028`'s text does not. In scope? My
   recommendation: **yes**, after D1.
2. **Q2 — contract 3's function.** Its name, `record_export_download(p_artifact uuid) returns table (storage_path
   text, file_name text)` or yours, and one function covering posters and certificates by the artifact's document.
   Is the audit action `export_artifact.downloaded`? And may the studio's export panel downloads go through the
   same audited route (I recommend it)?
3. **Q3 — the certificate enumeration** (W13.11 item 1). Is it yours as a migration at `0152`+, or deferred? It is
   not mine to fix silently.
4. **Q4 — D2b.** Should the uploaded poster crop for real (`'page'` plus `schemaVersion: 2`)? Without it, `REQ-DSG-030`'s
   focal point has no visible effect on any layer that exists.
5. **Q5 — contract 2.** My recommendation is SCR-045 as the writer (W13.7), with the two named test moves, one of
   them in your spec. Option B moves nothing.
6. **Q6 — the certificates page under `sessions'` layout.** Should `[id]/layout.tsx` render the session title and
   status (so I drop mine), or only the sub-nav? I need that contract before I change my header.
7. **Q7 — a member's own certificate download** (`me/certificates`, the event page). Should it stay a direct signed
   URL with no audit (my recommendation: unchanged, since it is their own document), or also go through the
   audited route?
8. **Q8 — the iframe origin fix** (W13.0 item 4). It is a fix in my file with no render change. Is it OK to land
   with D1?
9. **Q9 — rulers.** `DEC-096` rules on their axis if they exist, and `REQ-DSG-028` lists no ruler operation. I
   propose none this wave, only a coordinate chip that reads like the fields. Agreed?
10. **Q10 — the «تحديد متعدّد» toggle.** It goes beyond `DEC-093`'s named paths, because shift-click needs a keyboard
    (W13.0 item 3). Should `DEC-093` be read as I read it, or should this be logged?
11. **Q11 — contract 4.** `console`'s grid can read `getTemplateLibrary(locale, purpose)` as it stands. If the index
    page wants counts only, I will add `getTemplateOverview(locale)` on request. I will not guess its shape.

*Research sources consulted for the table in W13.1:* the daybrush/moveable repository and docs
(github.com/daybrush/moveable, daybrush.com/moveable); W3C and practitioner notes on `SC 2.5.8`'s five
exceptions (github.com/w3c/wcag/issues/3714, wcag22aa.org/new-criteria/target-size).

### W13.14 · Amended by `DEC-177` (`225d858`) — contract 3 has two subjects, and the member's own download is audited

I re-read `DEC-177` and the agent file from disk. The change supersedes W13.2's route text where they differ,
W13.8's D5, and Q2 and Q7.

**One function, not two.** The route passes **only `p_artifact uuid`**. The function finds the subject from the
data, never from the URL, so a forged link cannot pick a laxer branch. It also gives one call site, one grant and
one row in `definer-exposure.test.ts`.

Proposed for `0152` (the lead's to write and name):

```
record_export_download(p_artifact uuid) returns table (storage_path text, file_name text)
  security definer · set search_path = '' · revoke from public, anon · grant to authenticated   (DEC-177 §1, 0049's pattern)
```

It works in this order:
1. The artifact must be `ready`, with `org_id = auth_org_id()`. Anything else raises `42501`, and so does an
   unknown id, so there is no existence oracle.
2. **Session poster**: the document is some `session_posters.document_id`. Admitted: `is_staff()` (admin or
   moderator), or an **accepted** `session_presenters` row for that session and `auth_member_id()`.
3. **Certificate**: the document's `bound_certificate_id` is set. Admitted: `is_staff()`, or
   `certificates.member_id = auth_member_id()`. For the member, the certificate must not be `held` (`REQ-CRT-013`:
   invisible until released). A `revoked` one stays downloadable to its member, as the page does today
   (`me/certificates/page.tsx:111–114`, `REQ-CRT-011`).
4. **Any other document** (a template draft, an unbound document in the studio's export panel): `is_org_admin()`.
   This is not a new audience; `documents_read` already limits these to admins.
5. **Everyone else** raises `42501`.
6. `write_audit()` then records the actor, the subject and the artifact, as `REQ-ADM-021`'s acceptance asks. The
   action is `export.downloaded`, the target is `export_artifacts` / `p_artifact`, and the details are `{ subject:
   'session_poster' | 'certificate' | 'document', session_id?, certificate_id?, preset, format }`. It is written in
   the same transaction, and then the path is returned.
7. The function builds `file_name` as `poster-<preset>.<ext>` or `certificate-<serial>.pdf`: ASCII, and the serial
   is Western (`DEC-095`).

The `03` §8.2 rows the lead's red→green needs:

| Subject | Rows |
|---|---|
| poster | admin ✓ · moderator ✓ · accepted presenter ✓ · a presenter not yet accepted ✗ · a plain member ✗ (though `0145` lets them read the bytes) · another org's admin ✗ |
| certificate | its member ✓ · its member while `held` ✗ · its member when `revoked` ✓ · another member ✗ · admin ✓ · moderator ✓ |
| both | unknown id ✗ · a non-`ready` artifact ✗ · exactly one audit row per admitted call · none per refused call · `anon` cannot execute |

**One thing to flag on the moderator row.** `DEC-177` admits a moderator to a certificate, but `certs_read_*` are
admin-only (`03` §5.8). So a moderator never *sees* a certificate row to get its `href`, and SCR-045 shows them no
issuance table (`certificates/page.tsx:131–132`). The function allows it and no screen offers it. That is consistent,
and I am stating it so nobody reads the missing link as a bug.

**D5 is now three surfaces, one route:**

| Surface | Change | Owner |
|---|---|---|
| SCR-045 (`admin/sessions/[id]/certificates`) | issued rows get a «الملف» link, as W13.8 | mine |
| ★ **`me/certificates/page.tsx:115`** | the bare `<a download>` on a render-time signed URL becomes `href={c.downloadHref}`, a plain `<a>` to `/api/designer/downloads/<artifactId>`. «قيد التجهيز» when it is null, exactly as today. `links` and the `signCertificateUrl` call on that page go | mine (fixes only, `DEC-177` §2) |
| the event page's «شهادتك» (`sessions/[id]/page.tsx:376–380`, `myCertificateHref()`) | **the same unaudited class**: a render-time signed URL on the member's own certificate. I publish `downloadHref` on `listMyCertificates()`'s rows, and `sessions` changes the one line to use it, which is a request to `sessions` through the lead. If it stays, `REQ-ADM-021` is still unmet on that page | `sessions'` file |

**In the DAL.** `CertificateRow` gains `downloadHref: string | null`. `attachPdfs()` already selects the ready PDF per
document, and it additionally selects the artifact `id`, so both `listMyCertificates()` and
`getSessionCertificatesWithRender()` fill it. `pdfPath` stays, because other readers use it.

**`signCertificateUrl` now has no caller left in my files.** If `sessions` moves the event page to `downloadHref`,
the alias is deleted and **`signExportUrl` is left with exactly two callers**: the studio's thumbnails, and the
route.

**Tests, re-checked against this change:**
- `tests/components/me/certificates-page.test.tsx`: **no assertion moves**. Its fixture's `pdfPath: null` case still
  shows «قيد التجهيز» (the row carries no `downloadHref`). No case asserts the download link's `href`. Its
  `signCertificateUrl` mock becomes unused; I leave it, because removing it is an edit to evidence for nothing.
- `tests/e2e/wave7-content-certificates.spec.ts` asserts «الشهادة قيد التجهيز» and not the link (`:11`), so it holds.
- **New:** `wave13-designer-certificates-download.spec.ts` gains the member's case. The member downloads their own
  certificate from `/app/me/certificates` → `303` → the PDF, with one audit row naming them. Another member forging
  that artifact id → `403`, with no row.

**Q2 and Q7, answered by `DEC-177`:** one function (above), and the member's own download **is** audited. Q2 is now
only the lead's call on the name and the action string.

## Wave 13 — as built (after sync 1, `DEC-178`)

| Row | Commit | State |
|---|---|---|
| C1 — `getSessionPosterDownloads()` + types, `downloadHref()` | `e2f9ddb` | **published** |
| D4 — one signer in `posters.ts`; `designer.ts` re-exports it, `signCertificateUrl` is an alias; `designer-one-signer.test.ts` guards it | `e2f9ddb` | done |
| The audited route `GET /api/designer/downloads/[artifactId]` → `record_export_download()` → `303` to the signer; a refusal or failure → `303` back to the same-origin Referer with `?download=failed` | `ddf9edb` | built. **End to end waits on `0152`** |
| D5 — SCR-045's issued rows link to the route; `me/certificates` moved off its bare `<a download>` (`DEC-177`); the studio's export panel moved to the route; thumbnails stay previews | `ddf9edb` | built. The e2e waits on `0152` |
| D1 runtime — `geometry.ts`, the `arrange.ts` additions, `focal.ts`, `validate.ts` checks a preset's focal | `aa17eb4` | done, with unit tests |
| D1 UI — canvas pointer model, handles, knob, guides, marquee, nudge bursts, the iframe origin fix; inspector group, transform and image sections; «تحديد متعدّد», select-by-kind | `61afd8b` | done, with jsdom tests. **e2e not yet run (needs a build)** |
| D1b — add text, shape and logo; duplicate; named delete; text words, weight, colour; shape fill | `eebeb1f` | done. **«صورة» held** on the asset-resolution finding below |
| D2 — the nine-point grid (the path) and the draggable dot; «الوسط» on an untouched layer writes nothing | `61afd8b` | done |
| D2b — `scale: 'page'`, `SCHEMA_VERSION` 2, `BASE_SCHEMA_VERSION` 1 for every other writer, `page_scale_needs_v2` | `50c76af` | done. Parity holds; `designer-derive-untouched` matches `main`'s runtime |
| The posters \| certificates tab strip | `5cd672c` | done |
| The `SC 2.5.7` gate and the drag spec | `dfafeab` | written, **not yet run** |
| Contract 2's control on SCR-045 | — | waits on the lead's «promoted» |

**Parity**, run without `--update` after D2b: «parity holds». 21 of 28 assertions ran (the 7 slide-page cases skip locally because there is no `cwebp`), the background block ran 3 of 3, and `scripts/parity/goldens/**` is untouched.

★ **Found while building D1b and sent to the lead, unruled at this writing: no image asset resolves to a URL.**
- `render.ts:163` passes `image.assetId` through `resolveRef()`, which returns a non-binding value unchanged. The output is `<img src="<uuid>">`.
- **Every uploaded poster** renders its only layer as a broken image, in the studio and in every export.
- **Every worker-generated poster** draws the org's logo the same way: `resolveBrand()` gives the raw asset id.
- The app-side export of a logo works only while the 5-minute signed URL that `getDesignerDocument()` pins is still fresh.
- My proposal is in the message: an optional `assets` map on the binding context. The worker supplies data: URIs and the studio signed URLs, and with no map the output is byte-identical.

### DEC-179 as built (`7f3b2a0`), and the owner's step after the merge (condition 5)

What was built:
- The runtime's `BindingContext.assets` and `assetIdsOf()`. With no map, the output is byte-identical: `designer-derive-untouched` passes against `main`'s hashes.
- `worker/src/render/assets.ts` inlines each asset as a `data:` URI:
  - only this org's asset ids are looked up;
  - another org's id fails the artifact with its reason;
  - over 32 MB the artifact fails too, never truncated.
- The studio gets signed URLs through `DesignerDocumentData.assets`.
- The logo stays an **id** in the pinned bindings. Before, the logo went into the bindings as a signed URL that changed on every page load, so the fingerprint changed too. For a logo document the studio's export queue could therefore never match what was already rendered. It is now stable.
- `brand.ts` is untouched in both places.

Tests:
- `tests/unit/render-assets.test.ts` (4 tests).
- `tests/e2e/wave13-designer-upload-render.spec.ts` uploads through the real picker and asserts two things:
  - the studio's canvas image loads;
  - with `E2E_WORKER=1`, the worker's pixels: red at the master's centre and corner, and red at the square's corners.

★ **Which posters are cached broken, and why a plain re-enqueue does NOT fix them.** `request_render()` (`0060:94–96`) finds a ready artifact for the same fingerprint and renders nothing. The fingerprint does not change: the stored document and the bindings are the same bytes, and the asset is immutable per id. So re-enqueuing `regenerate_poster` is a no-op for every poster that already rendered. The step has two parts:

1. **Find them**, read-only:
   ```sql
   -- every poster whose document draws an asset: an upload, or the logo where the org has one
   select p.session_id, p.mode, p.binding, d.id as document_id
     from public.session_posters p
     join public.design_documents d on d.id = p.document_id
    where exists (select 1 from jsonb_array_elements(d.document->'layers') l
                   where l->>'kind' = 'image'
                     and (l#>>'{image,assetId}' ~ '^[0-9a-f-]{36}$'
                          or (l#>>'{image,binding}' = 'brand.logoAssetId'
                              and exists (select 1 from public.brand_kits b where b.org_id = p.org_id and b.logo_asset_id is not null))));
   ```
2. **Clear their cached artifacts, then render again.** Delete the `export_artifacts` rows of those documents. It is a data fix, scoped by that list, and never a migration. Then:
   - a **live** poster: re-enqueue `regenerate_poster` under `poster:{session_id}`;
   - a **detached** poster (customised or uploaded): press «اطلب التصدير» in the studio. `REQ-DSG-003` forbids regenerating it automatically.
   
   The old objects are overwritten at the same paths by the new renders.
3. Certificates draw the logo too. An issued certificate's PDF re-renders only by the per-row retry or a re-issue, and a certificate is what was printed (`REQ-CRT-014`). **I recommend leaving issued certificates as they are**: the owner decides.
