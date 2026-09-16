# designer — M6 (DSG · CRT), wave 3

The `designer` teammate's working note. Plans before code, findings as they are
found. `docs/plan/` is otherwise the lead's; this file is mine.

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
