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

### 1.3 Two subsets of one family do not merge coverage

`packages/fonts/manifest.json` lists IBM Plex Sans Arabic **twice per weight**,
once for the Arabic subset and once for the Latin one, with different hashes.
Declared as two `@font-face` rules with no `unicode-range`, the LAST one wins
for every character — so a mixed «جلسة عن Next.js 16» loses its Latin to
whatever the host machine has, which is a different render per machine and
exactly what D66 forbids.

`ManifestFont.unicodeRange` is now optional on the runtime's face type and
`fontFaceCss()` emits it when present. The editor sets it on the Arabic face
(`ARABIC_UNICODE_RANGE`); the parity harness passes manifest entries with no
range, so its output is byte-identical and the goldens did not move.

**For DSG-006:** when the worker builds its face CSS, it must build it the
same way the editor does, which means moving that construction into the
runtime and giving the harness the ranges too. That will move the goldens,
and it is a **lead-reviewed diff** (`REQ-DSG-015`), not an `--update` run.

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
