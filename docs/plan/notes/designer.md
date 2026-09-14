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
