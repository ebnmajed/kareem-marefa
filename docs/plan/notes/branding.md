# `branding` — working notes (M7-branding, wave 4)

## 0. The plan, written before any code

### 0.1 What this track delivers

`REQ-DSG-021` (the brand kit is the single source of brand truth), `REQ-ADM-015` (the branding
screen), SCR-059 at `/app/admin/branding`. The demonstrable (`TEAM.md` §1, wave 4): an org admin
changes one colour and replaces the logo, and the UI theme, a poster re-render and an email
preview all change — **one edit, four consumers** (`06` §8.3) — with the parity goldens
untouched, because the platform default is the identity override.

### 0.2 Story order

1. **`getBrandKit()` published first**, returning platform defaults with no row, so the lead can
   wire the CSS theme layer in the app layout before SCR-059 exists.
2. **The schema** (`supabase/proposed/branding/0001_brand_kits.sql`): `brand_kits`, RLS, grants,
   `save_brand_kit()`, `reset_brand_kit()`, `public.brand_kit(p_org uuid)`, and the
   `export_render_context()` amendment that adds a `brand` object.
3. **RLS proof** (`tests/rls/brand-kits.test.ts`), proving the identity-override property
   explicitly: `export_render_context()` byte-identical for an org with no `brand_kits` row.
4. **Sync with the lead** for the four consumer seams, then SCR-059 itself (logo upload Route
   Handler, the branding screen, live previews, contrast ratios, reset action) as a second pass.

### 0.3 The `getBrandKit()` signature

The codebase's DAL convention is `fn(locale, ...)` — `requireSession(locale)` needs the locale to
build a sign-in redirect (`src/lib/dal/session.ts`). The spawn message named the function
`getBrandKit(orgId)`; I am implementing it as `getBrandKit(locale, orgId)` to match every other
DAL function in the tree (`getDesignerDocument`, `getSessionPoster`, …) rather than invent a
second calling convention. `orgId` is accepted as a plain argument (shape, not authority,
`CLAUDE.md` § Validation) — the underlying `brand_kit()` RPC is `security invoker`, so RLS still
scopes the read to the caller's own org regardless of what `orgId` is passed; a mismatched id
degrades to the platform defaults rather than leaking anything, since a brand kit carries no
sensitive data. Flagging this for the lead at sync 1 in case `orgId` was meant to be dropped
entirely once every caller already has a session.

### 0.4 The `brand_kits` schema (DEC-052 decision 4, `02` §4.13)

One row per org (`unique (org_id)`), `logo_asset_id uuid references design_assets(id)` (raster,
sniffed — DEC-009), nine light and nine dark colour tokens as `text` constrained to `#rrggbb`
(`BRAND_COLOUR_TOKENS` from the runtime), `heading_font_id` and `body_font_id uuid references
fonts(id)` (selectable at `parity_status = 'passed'` only, checked in the write RPC, not a DB
constraint — a font's status is a property of the font row, not of the reference), `updated_by
uuid references members(id)`, `updated_at`. No row means the platform defaults. Every change
writes `scoring_config_history` (`scope = 'branding'`, which needs the check constraint on that
table widened — `02` §4.1 made the table general on purpose but the six-value check predates this
track). P1 read (every member — the theme is read on every page), P2 write through
`assert_fresh_admin()`.

### 0.5 The four consumers, and who wires each (`06` §8.3, TEAM.md §1)

| Consumer | What `branding` supplies | Who wires the call |
|---|---|---|
| CSS `@theme` layer | `getBrandKit()` | lead, in `src/app/[locale]/app/layout.tsx` |
| Designer templates | `export_render_context()`'s `brand` object + `resolveBrand(overrides)` in the runtime | lead, in `worker/src/render/**` |
| Email templates | `public.brand_kit(p_org uuid)` | lead, in `worker/src/mail/**` |
| Editor preview | `getBrandKit()` through `designer`'s DAL | lead promotes an add-only DAL function |

`resolveBrand(overrides)` only resolves `BRAND_COLOUR_TOKENS` + `logoAssetId` — the existing
`{{brand.*}}` contract. `heading_font_id`/`body_font_id` are stored on the kit but are not wired
into a `brand.*` binding this wave; nothing in `06` §8.3's four consumers or the wave's
demonstrable needs a font swap to reach a template yet, and inventing a new token the runtime
contract does not already name is a bigger change than this story asks for. Noted for the lead —
open question, not a silent scope cut.

### 0.6 The logo path

The logo is a `design_assets` row (same bucket/shape `packages/storage-paths` already builds for
every design asset — `designAssetPath(orgId, assetId, ext)`). `packages/storage-paths/src/brand.ts`
adds a thin, semantically named wrapper (`brandLogoPath`) rather than a new shape, because the
storage layout is already correct for this file type and a second shape for the same bytes would
be the thing DEC-047/06 §6.4 warn against. **`src/index.ts` is not in my glob** — I need the lead
to add one export line (`export * from "./brand.js"`) so the Route Handler can reach it through
`@kareem/storage-paths`'s public surface rather than a deep import.

### 0.7 SCR-059 (second pass, after sync)

Logo (current, replace, minimum resolution stated before the picker opens, the PPI it yields at A3
after upload), nine tokens × light/dark with a live preview (heading, body, button, card) in both
schemes, contrast ratios beside each pair (refused below AA, not warned), the two faces from
`parity_status = 'passed'` fonts, reset-to-platform action (deletes the row). Mobile 390 px:
previews stack. Survives a failed action (uncontrolled `<form action>` reset — return what was
typed).

### 0.8 Questions for the lead

1. Confirm the `getBrandKit(locale, orgId)` signature (§0.3) — or say to drop `orgId`.
2. Confirm `scope = 'branding'` is the right value to add to `scoring_config_history`'s check
   constraint, and that widening it is mine to do in the proposed file (it touches a table `02
   §4.1` calls "deliberately general enough to carry non-scoring settings too", but the constraint
   itself was written before this track existed).
3. One export line needed in `packages/storage-paths/src/index.ts` (§0.6) — not in my glob.

**Resolved at sync 1 (DEC-053):** all three. `0068_brand_kits.sql` promoted as proposed,
`getBrandKit(locale, orgId)` kept as written (the app layout calls it exactly that way), the
`'branding'` scope stands, and `packages/storage-paths/src/index.ts` gained the export line. The
four consumers are wired: the CSS layer in the app layout (`.brand-org` over `globals.css`'s
tokens), `worker/src/render/brand.ts`'s `brandBindings()` in `regenerate_poster`/
`issue_certificates`, `send_notification`'s mail renderer against `public.brand_kit()`, and the
editor's preview in `designer`'s `getDesignerDocument()` — all through `resolveBrand()`, resolved
at REQUEST time (before the fingerprint), never at render time, which is DEC-053's correction to
my own plan: I had assumed `export_render_context()`'s `brand` column would be what the worker
reads, and it turned out to be the wrong seam for `0060`'s "never a fresh resolution" rule. The
column stays, unread by the worker, which is harmless and still tested.

## 1. Second pass — SCR-059 itself

Built after sync 1, on top of the wired consumers:

- **`src/lib/brand/ppi.ts`** — `ppiAtA3()`, REQ-DSG-019's 300/200 PPI thresholds read backwards at
  upload time: "if this logo filled A3, what PPI would it be?" A conservative worst-case number
  (any smaller placement only improves it), shared between the upload Route Handler (which
  computes it) and the screen (which shows it) so there is one rounding, not two.
- **`src/app/api/admin/branding/logo{,/complete}/route.ts`** — thin wrappers over `designer`'s
  `initiateAssetUpload()`/`completeAssetUpload()` (`src/lib/dal/posters.ts`) rather than a second
  sniff-and-measure pipeline; `complete` adds the `a3` PPI reading to the response.
- **`src/lib/brand/fonts.ts`** — `listSelectableFonts()`, a small query of my own rather than
  reusing `designer`'s `listEditorFaces()`: that function falls back to the unmaterialised package
  manifest (no `fonts.id`, which `save_brand_kit()` needs) when the bucket is empty, and offering a
  choice the RPC cannot accept would be dishonest.
- **`BrandKitForm`** holds all nine-times-two colour tokens, the logo and the two font choices
  **fully controlled** in React state rather than `defaultValue` — the live preview needs it, and
  it is what satisfies "the form survives a failed action" without an echo-back state field:
  React re-asserts a controlled input's DOM value on every render, so React 19's post-action form
  reset is never visible. Switching the light/dark tab mirrors the untouched scheme into hidden
  inputs so neither is lost on submit.
- **`ContrastBadge`** shows WCAG 2.2 AA against four pairs: heading/body/muted text on canvas, and
  edge-strong on canvas as a UI border — the last one matches `globals.css`'s own comment that
  `edge-strong` "must meet 3:1 (SC 1.4.11)" for input borders, so the check is not an invented
  pairing.
- **Reset** is a two-step confirm inside the same page (no modal dependency): a toggle button
  reveals a confirm/cancel pair, and only the confirm one submits.

**Definition of done, as it stands:** `tsc --noEmit` clean, `lint` zero errors, `npm test` green
(`tests/components/branding/brand-kit-form.test.tsx`, `tests/unit/brand-runtime.test.ts`,
`tests/unit/brand-schema.test.ts`), `npm run test:rls` green (14 cases,
`tests/rls/brand-kits.test.ts`, now proven against the real promoted migration `0068` rather than
`applyProposed()`). **`tests/e2e/branding.spec.ts` is written and the moderator-404 case passes,
but the admin flow does not yet** — the currently-served build predates this track's route
(`/app/admin/branding`, `/api/admin/branding/**`), and only the lead runs `npm run build`
(`CLAUDE.md`). Needs a rebuild to go green; not blocking, flagged to the lead.

**Left for a later pass, named rather than silently skipped:** the two font ids are stored and
unbound (§0.5, DEC-053 decision 5); no dedicated unit test asserts the SQL literals in
`0068_brand_kits.sql`'s `brand_kit()` fallback match the runtime's `platformBrand()` beyond what
`tests/rls/brand-kits.test.ts`'s `POL-brand_kit.identity_default` case already does at the
integration level (sufficient — it is the same guarantee, proven against the real function).

## 2. Third pass — a save re-renders the org's live posters

The lead's request after reviewing SCR-059: the demonstrable needs a poster to actually re-render
when an admin saves, not just a colour to persist. `supabase/proposed/branding/0002_regenerate_
posters_on_save.sql` — a new file on top of `0068` (never an edit to a promoted migration) —
`create or replace`s `save_brand_kit()`/`reset_brand_kit()` to enqueue `regenerate_poster` (`0063`,
key `poster:{session_id}`) for every session in the org with a **live** poster. A customised one is
left alone (DEC-012's asymmetry — the same one `0063`'s own session hooks respect). Included in
both save and reset, though the ask named only "save" — a reset reverts the override to the
platform default, which is symmetrically a brand change; flagged to the lead to confirm or narrow.

`tests/rls/brand-kits.test.ts` grew from 14 to 19 cases: one job per org (isolation holds), a burst
of saves collapses to one job via the enqueue key, a customised poster gets nothing, reset
enqueues on an actual change and nothing on a no-op. All green against the real `0068` plus the new
proposed layer. Two DB gotchas worth recording: `graphile_worker.jobs` is a **view** — deleting
from it fails ("cannot delete from view"), the underlying table is `_private_jobs`; and that table
has no `task_identifier` or `payload` column (those live on `_private_tasks` / elsewhere) — the
view exposes `task_identifier` for reads, so filter reads through the view and clear with an
unconditional `delete from graphile_worker._private_jobs` in setup, matching every other RLS file
in the tree.

Ready for sync. Track complete: `getBrandKit()`, the schema (`0068` + this proposed addition),
19 RLS cases, SCR-059 with a real logo upload, live preview, contrast display and reset, a
component test suite, and the poster-regeneration seam the demonstrable needs — all green except
the e2e admin flow, which needs a rebuild to pick up the new route.

---

## Wave 8 — 2026-09-17

`0068`/`0071` are promoted (live in `supabase/migrations/`), and `supabase/proposed/branding/` is
empty again. This wave's work: `DEC-127`'s gradient poster background end to end for the five
runtime files transferred to me this wave (`brand`, `model`, `render`, `bindings`,
`worker/src/render/brand.ts`), the `canvasRaise` column pair, and SCR-059 rebuilt on the M9
system. Read before this section: `.claude/agents/branding.md` (regenerated at Step 0, the
authoritative wave-8 mandate — supersedes the wave-4 text embedded above wherever the two
disagree), `DEC-124` … `DEC-128`, `DEC-146`, `DEC-147`, `06` §2.2/§3.3/§6/§7/§8.3,
`16` §3.1/§4.1/§4.2/§7.4/§8.2, `09` SCR-059.

### 0. Contract 1 — landed, `391150e`

`model.ts`'s `background` is now DEC-127's union; `BRAND_COLOUR_TOKENS` gains `canvasRaise`
(`#1d2a42` dark / `#f1f3f7` light), add-only, appended after `node` so no existing token's array
position moves. Both silent traps DEC-127 names are **held open, not fixed**: `render.ts`'s two
`background?.color` reads and `bindings.ts`'s stop-collector now type-check against the new union
by narrowing on `type === 'solid'` — a gradient document still renders on `#ffffff` and its stops'
tokens are still uncollected, byte-identical to before this commit. That is deliberate: fixing the
behaviour is §1 below, with a failing test written first.

Two of my own test fixtures needed `canvasRaise` added once it became a required
`BrandColourSet` key (`tests/unit/brand-schema.test.ts`'s `FULL_LIGHT`,
`tests/components/branding/brand-kit-form.test.tsx`'s `LIGHT`/`DARK`) — fixed in the same commit.

★ **One cascading risk, open until §2 lands, named here so it is not a surprise:** `canvasRaise`
becoming a required key of `BrandColourSet` also reaches `getBrandKit()`
(`src/lib/brand/kit.ts:51`, `brandKit.parse(...)`) — and `public.brand_kit()` (the SQL RPC it
parses) still returns only nine colour keys per scheme until §2's migration lands. Nothing in the
committed test suite exercises this path today (the RLS suite calls SQL directly, the component
test mocks the kit, `npm run test:rls` passed 19/19 unchanged — checked, not assumed), but a real
visit to `/app/admin/branding` or a run of `tests/e2e/branding.spec.ts`'s admin flow would throw a
`ZodError` right now. **This is why §2 (the SQL) is the very next thing built, not deferred.**

★ **Also reaches `src/app/[locale]/app/layout.tsx:29`'s `CSS_VAR` record** — the lead's file, never
mine to edit. `npx tsc --noEmit` names it explicitly; left red there, reported to the lead rather
than patched. The lead's fix is one line (`canvasRaise: "--canvas-raise"` or an explicit decision
that the org theme layer does not carry this token — `canvasRaise` has no CSS consumer today,
since nothing paints it outside a poster's gradient, so omitting it from `CSS_VAR` on purpose is
also defensible; either way it is the lead's call, not mine, per the never-touch list).

### 1. The render and binding changes — the two red tests first

New file `tests/unit/gradient-render.test.ts` (mine, matches the allowed glob
`new tests/unit/gradient*.test.ts`):

1. **`renderDocumentToFragment` on a gradient document must not render on `#ffffff`.** A document
   with `background: { type: 'gradient', angle: 140, stops: [{ color: '{{brand.surface}}' }, { color: '{{brand.canvasRaise}}' }] }`
   and bindings resolving `brand.surface`/`brand.canvasRaise`, rendered, must produce a root `style`
   attribute containing `linear-gradient(140deg, <resolved-surface>, <resolved-canvasRaise>)` —
   never `background:#ffffff`. **Red today** (the trap held open in contract 1): the current code
   reads `doc.background?.type === 'solid' ? doc.background.color : undefined`, which is
   `undefined` for a gradient, so the render falls to the `#ffffff` fallback.
2. **`declaredBindingsOf` on a gradient document must collect every stop's binding**, in document
   order. The same document as above must yield `['brand.surface', 'brand.canvasRaise']` (plus
   whatever the layers add) from `declaredBindingsOf`. **Red today** for the identical reason —
   `bindings.ts`'s collector only reads `doc.background?.type === 'solid' ? doc.background.color : undefined`.

Then the fix, in the same two files:

- **`render.ts`**: a `backgroundCss(doc.background, ctx)` helper (private to the module) that
  returns either `resolveColour(ctx, bg.color, '#ffffff')` for `'solid'`, or a
  `linear-gradient(<angle>deg, <c1> <at1%>, <c2> <at2%>, …)` string for `'gradient'` — each stop's
  colour resolved through the existing `resolveColour()`, `at` included only when the layer
  specifies one (CSS distributes evenly with no explicit stop positions, so an author who does not
  care about exact stops need not supply `at` at all). Used at both of today's two call sites
  (`renderDocumentToFragment`, `renderDocumentToHtml`) in place of the held-open ternary — one
  function, so the two sites cannot drift the way the two separate `resolveColour(...)` calls
  already almost did once (they were two near-identical lines before this wave too).
- **`bindings.ts`**: `declaredBindingsOf` walks `doc.background.stops` when `type === 'gradient'`,
  calling the existing `add()` once per stop's `color`, in array order — no new namespace, no new
  binding syntax, just not stopping at the first (only) colour the 'solid' case has.

**The mirror — where it lives.** `angle` is the RTL source composition's (contract-1 comment in
`model.ts`, and `06` §3.3). The mirror is **in `render.ts` only**, applied at render time from
`doc.direction`: `const effectiveAngle = doc.direction === 'ltr' ? (360 - bg.angle) % 360 : bg.angle`.
Nothing upstream of this — not the document, not the template, not `library.ts`'s seed (`designer`'s)
— ever stores a mirrored angle; a template author writes the RTL angle once and both directions
render correctly from the one stored number. `% 360` guards `angle: 0` producing `360` rather than
`0` (cosmetically identical in CSS but worth being exact about, since a parity golden diffs bytes).
A third unit test in the same new file asserts the mirror directly: the same document rendered with
`direction: 'rtl'` then `direction: 'ltr'` (angle `140` in both, since the document itself never
changes) must differ only in the gradient's angle term, `140deg` vs `220deg`.

**Two guard-rail tests, not the two "red first" ones but written alongside them:** a gradient with
zero stops (defensive — a template guard should reject this upstream, per `05` below, but the
renderer must not throw); a gradient stop bound to an out-of-list token — resolves through the
existing `resolveColour()` fallback (`'transparent'`? — no: `resolveColour`'s fallback parameter is
per-call; I will pass `'#ffffff'` per stop, consistent with the solid case's own fallback, rather
than inventing a different unbound-colour behaviour for gradients).

### 2. The scheme default — decided: it goes

`platformBrand()`, `resolveBrand()` (`brand.ts`) and `brandBindings()` (`worker/src/render/brand.ts`)
currently default `scheme` to `'light'`. Checked every call site in the tree
(`grep -rn "platformBrand(\|resolveBrand(\|brandBindings("`): **every one already passes a scheme
explicitly** — `src/lib/dal/designer.ts:203` (`"light"`, the editor preview — `designer`'s file),
`worker/src/tasks/regenerate_poster.ts:108` (`"light"`, **wrong per `DEC-125`** — a generated
poster should default to `'dark'`) and `worker/src/tasks/issue_certificates.ts:152` (`"light"`,
**wrong per `DEC-128`** — should be the issued certificate's own template's scheme). Every test that
calls these three functions also passes a scheme explicitly.

**Decision: the `= 'light'` default is removed from all three signatures; `scheme` becomes a
required parameter.** Nothing in the tree relies on the default today, so this compiles clean the
moment it lands, and it converts "remember to pass the scheme" from a convention into a compiler
error — exactly what let two worker call sites carry the wrong value silently until `DEC-125`/`128`
were written down. This is a signature change in **my** files (`brand.ts`,
`worker/src/render/brand.ts`) but the two **values** that need to change (`"light"` → `"dark"` in
`regenerate_poster.ts`, `"light"` → the certificate's scheme in `issue_certificates.ts`) are in
`designer`'s files — I will land the signature change in the same commit as §1 (it is a one-line
diff per function, mechanical, and leaving the default in place one commit longer only postpones a
`tsc` error `designer` must see anyway), and tell `designer` directly which two lines now fail to
compile and what each should become, rather than routing it through the lead as a "primitive"
request (these are not `ui/` primitives — they are files DEC-147 explicitly transferred to me, and
the two call sites needing a new value are `designer`'s own files, which I never edit).

### 3. The `0055` guard and gradient stops — a coordination point, not my file

`design_template_versions_guard()` (`0055_m6_schema.sql:455`) checks
`(new.document#>>'{background,color}') ~ '^#'` for the hardcoded-colour guard. On a gradient
document `background.color` does not exist at all (the path resolves to SQL `null`, and
`null ~ '^#'` is `null`, which the guard's `if` treats as false) — **a gradient template with a hex
literal in a stop would pass today's guard silently.** This function lives in a promoted migration
(`0055`) and is not one of my five transferred runtime files; fixing it is a `create or replace` in
a *new* migration, and whether that lands in `designer`'s proposed SQL (which already touches
template guards) or mine is the lead's call at sync 1. Flagging here, and I will say so again in
the sync message, per my agent file's explicit instruction on this exact point.

### 4. The SQL — `canvasRaise` on the brand kit

New file, `supabase/proposed/branding/0001_brand_kits_canvas_raise.sql` (the proposed directory is
empty again; `0068`/`0071` are promoted). Registered in `tests/rls/brand-kits.test.ts`'s `PROPOSED`
array alongside the existing two entries, `existsSync`-guarded exactly as they are, so the suite
runs against the real promoted `0068`/`0071` plus this new layer until the lead promotes it too.

**Columns**, added to the already-live `brand_kits` table, matching the other nine token pairs'
shape (`text not null check (... ~* '^#[0-9a-f]{6}$')`) but backfilled for any row that already
exists (a kit saved in an earlier wave, including any real org that has already visited SCR-059):

```sql
alter table public.brand_kits
  add column light_canvas_raise text check (light_canvas_raise ~* '^#[0-9a-f]{6}$'),
  add column dark_canvas_raise  text check (dark_canvas_raise  ~* '^#[0-9a-f]{6}$');

update public.brand_kits
   set light_canvas_raise = '#f1f3f7', dark_canvas_raise = '#1d2a42'
 where light_canvas_raise is null;

alter table public.brand_kits
  alter column light_canvas_raise set not null,
  alter column dark_canvas_raise  set not null;
```

No column-level default is kept after the backfill — matching the other nine columns, which rely
on `save_brand_kit()` always receiving a whole `BrandColourSet` (§0's Zod cascade already makes
that true app-side) rather than a database default silently filling a gap. **A kit saved before
this migration has no value for the new pair until an admin next saves — until then the backfilled
platform value is what every consumer reads, which is the identity override applied per-token
rather than per-row:** the org's other nine tokens keep whatever they already customised;
`canvasRaise` alone reads as the platform default, exactly as `06 §8.3`/`DEC-052` require for a
brand-new token added to an existing kit.

**`brand_kit()`** (`create or replace` — its `returns jsonb` signature is unchanged, so unlike
`export_render_context()`'s `0068` amendment this needs no `drop`): both `light`/`dark`
`jsonb_build_object` calls gain `'canvasRaise', coalesce(bk.light_canvas_raise, '#f1f3f7')` /
`coalesce(bk.dark_canvas_raise, '#1d2a42')`, literal-for-literal what `brand.ts`'s `LIGHT`/`DARK`
now carry (the header comment on `0068` already names this pairing as the thing
`tests/rls/brand-kits.test.ts`'s `POL-brand_kit.identity_default` case guards against drifting —
that case needs no edit, since it loops `Object.keys(kit.light)`, which will include `canvasRaise`
the moment the RPC does).

**`save_brand_kit()`** (`create or replace`, on top of `0071`'s version — same signature, the
poster-regeneration body carried forward untouched): the `insert … values (…)` and
`on conflict (org_id) do update set …` column lists gain `light_canvas_raise`/`dark_canvas_raise`,
sourced from `p_light ->> 'canvasRaise'` / `p_dark ->> 'canvasRaise'` — no new function parameter,
since `p_light`/`p_dark` already carry a full `BrandColourSet`-shaped object from the client and the
Zod schema (§0) already requires the key going forward. A save that omits it (a stale client, or a
direct RPC call) fails `23502`, the same error code every other missing token already produces —
no new error branch needed in `actions.ts`.

**`export_render_context()`** (`create or replace` — its `returns table(...)` column list is
unchanged this time, `brand` was already added in `0068`; only the jsonb **value** gains a key, so
no `drop` is needed here either): the `light`/`dark` `jsonb_build_object`s inside the `brand` column
gain `'canvasRaise', bk.light_canvas_raise` / `'canvasRaise', bk.dark_canvas_raise` — raw, no
coalesce (header note 2's rule stands: this column is the RAW override only, `{}` with no row,
merged exactly once in `resolveBrand()`).

**`03` §8.2 rows this file needs**, handed to the lead with the file:

| Policy | What it proves |
|---|---|
| `POL-brand_kit.canvas_raise_identity_default` | For an org with no row, or a row saved before this migration, `brand_kit()`'s `canvasRaise` matches `platformBrand()`'s — the per-token identity override. |
| `POL-brand_kit.canvas_raise_override` | With a row whose `canvasRaise` was explicitly saved, `brand_kit()` returns that value, not the platform default. |
| `POL-save_brand_kit.canvas_raise_required` | A save whose `p_light`/`p_dark` omits `canvasRaise` fails `23502`, same as any other missing token. |
| `POL-export_render_context.canvas_raise_override` | With a row, the `brand` column's `light`/`dark` objects carry the saved `canvasRaise`; with none, they omit the key entirely (raw override, `{}` semantics unchanged). |

**RLS test file changes**, all in `tests/rls/brand-kits.test.ts` (mine): the top-of-file `LIGHT`/
`DARK` fixtures used by `saveKit()` gain a `canvasRaise` entry each (so every existing save-path
case keeps exercising a whole, valid kit); the `PROPOSED` array gains
`"branding/0002_brand_kits_canvas_raise.sql"` (or `0001` if renumbered — matching whatever filename
the proposed file actually gets, decided when I write it, not guessed here); four new `it()` cases
for the table above. `POL-brand_kit.identity_default`'s existing case needs no edit (see above) —
it already loops the RPC's own keys.

**`worker/src/render/brand.ts`** (mine): `COLUMNS`, the `Row` type and `set()` gain the two new
columns/keys, mechanically, in the same shape as the other nine.

### 5. SCR-059 — primitives, states, and where the current screen contradicts a requirement

Audited the live code (`src/app/[locale]/app/admin/branding/**`,
`src/components/branding/**`) against `16` §4.2/§8.2 and the `REQ-UIX-*` series. It works and is
tested, but it predates the M9 system (built in wave 4, before M9 existed) and misses several
things my agent file names explicitly:

| What the screen does today | What it should do | Requirement |
|---|---|---|
| `ColourField`, `FontPicker`, the scheme tablist and every `<fieldset>` are hand-rolled markup and Tailwind strings | Every control from `src/components/ui/`: `ui/field` wraps each control (label/hint/error/required), `ui/select` for the font pickers, `ui/tabs` for the light/dark switch, `ui/panel` around each fieldset's content | `REQ-UIX-001` |
| The logo picker is a hidden native `<input type=file>` behind a styled trigger button | `ui/file-drop` | agent file, §"SCR-059" |
| The reset confirmation is an inline two-button toggle in the page, not a modal | `ui/dialog`, naming the object ("your organisation's brand kit") and the consequence (reverts to the platform default) before the confirming click | `REQ-UIX-013` |
| Save/reset results render as an inline `role="status"`/`role="alert"` paragraph in the page | `ui/toast`, fired from the action's returned state (still real content — `role="status"`/`"alert"` is `ui/toast`'s own contract, not lost, just centralised) | agent file, §"SCR-059": "a toast fired **from the action**" |
| The pending save/reset buttons swap their label text (`t("actions.saving")` replaces `t("actions.save")`) | `ui/button`'s built-in `pending` prop — keeps the label, adds a spinner beside it, sets `aria-busy` | `REQ-UIX-007` |
| `ColourField`'s text input never changes appearance when `aria-invalid` | The field wrapper's error styling (red border, icon) when the hex text diverges from the swatch | `REQ-UIX-010` |
| No `<FormSummary>` | Given today's only failure modes are whole-form (`notAdmin`/`badReference`/`unknown`/font-gate), not per-field, a `FormSummary` with "one link per failed field" does not obviously apply — I will ask the lead at sync 1 whether SCR-059 is one of the screens `REQ-UIX-009` expects it on, or whether a single-item summary is the right shape here, rather than guess | `REQ-UIX-009` (open question) |
| `BrandPreview`'s card only shows a flat `surface` swatch | A second preview swatch painted with the actual poster gradient CSS (`linear-gradient(140deg, surface, canvasRaise)`, both schemes) — "the preview carries a gradient surface" is named explicitly in the wave-8 checklist row (B3) | `DEC-127`, checklist row B3 |
| Minimum logo resolution is already stated before the picker opens | No change needed | `REQ-DSG-019`, already correct |
| Contrast ratios are shown but a failing pair does not block submit | Old notes (`§0.7`/`§1` above, wave 4) claimed "refused below AA, not warned" — checked against the current `actions.ts`/`BrandKitForm`: **it does not refuse today, only displays**. My agent file's SCR-059 bullet says "the contrast ratio beside each pair" without repeating "refuses" for the *brand* tokens (only the M13 *status-colour* section says "refuses"), so I read this as a wave-4 claim that was never actually wired, not a wave-8 requirement I am dropping — flagging to the lead rather than silently either adding enforcement or leaving the stale claim in this file | open question |

**States to capture** (`.qa-shots/rtl/wave8-branding-*.png`, phone, 390×844, per the DoD):
`platform-defaults` (no row, every field shows the platform value, reset action is absent or
disabled since there is nothing to reset), `override-saved` (a saved kit, gradient preview visible
in both schemes), `field-error` (a save that fails — `badReference` or the font gate — shown via
toast, and whichever inline state remains after the primitives pass), `reset-confirm-open` (the
`ui/dialog` mid-confirmation, naming the org).

**Messages**: `colours.tokens.canvasRaise` is a new required key in `messages/ar/branding.json`
(authored first) and its `en/` twin — the token grid already renders every entry of
`BRAND_COLOUR_TOKENS` today (`TOKEN_ORDER` in `brand-kit-form.tsx`), so the tenth field appears
automatically the moment §4's SQL and this key both land; omitting the key would render a raw
`colours.tokens.canvasRaise` fallback string in production between those two landings, so they
should land in the same sync-2 batch of commits, not weeks apart.

### 6. Order I intend to build in, after this plan is approved

1. §1 (render/bindings gradient + mirror), red tests first, committed alone.
2. §2 (scheme default removal), told to `designer` directly (the two call-site values are theirs).
3. §4 (SQL), proposed file + RLS cases, handed to the lead with the `03` §8.2 rows.
4. §5 (SCR-059 on the M9 primitives), once §4 is promoted (so the tenth field has somewhere to
   read/write), messages first in `ar/`, then the component rebuild, then the four e2e captures.
5. §3 (the `0055` guard gap) stays a note to the lead/`designer`, not mine to build, unless routed
   back to me at sync 1.

### 7. Risks, top three

1. **The live break named in §0** — `getBrandKit()` will throw for any org between contract 1 (now)
   and §4 (SQL) landing, if anything exercises the real screen or `tests/e2e/branding.spec.ts`'s
   admin flow against local Supabase in that window. Mitigation: §4 is next, not deferred; flagging
   loudly here and in the sync message so nobody runs that e2e spec meanwhile without knowing why
   it would fail.
2. **The mirror is easy to get backwards.** `360 − angle` for LTR only, never stored, never applied
   twice (e.g. if `designer`'s editor ever previews an LTR variant through a *different* path than
   `render.ts`, it must call through the same function rather than re-deriving the mirror — I will
   say this explicitly when I hand the render change over).
3. **The `0055` guard gap (§3) is a real, currently-live gadget**: today, before any of this wave's
   code exists, a hand-crafted `document` with `background: {type:'gradient', stops:[{color:'#bada55'}]}`
   already bypasses the hardcoded-colour guard, because the guard only ever checked
   `{background,color}`. It is not new risk this wave introduces — it is a latent gap the union
   makes exploitable in practice rather than academic, since `designer`'s seed is about to start
   writing real gradient templates. Worth the lead treating it as more urgent than "a request for
   later."
