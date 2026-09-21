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

---

## Wave 11 — 2026-09-22, planning only (`DEC-166`, `DEC-073`'s consequence)

Read before writing this: `STATUS.md`'s START HERE block and the wave-11 block, `CLAUDE.md` §
*Ownership map (wave 11)*, `DEC-166`, `DEC-167`, `DEC-073` in full, `0068_brand_kits.sql` and every
migration that has touched `save_brand_kit()` since (`0071`, `0093`), `globals.css`'s status tokens
(read, not edited), `16` §16.6, `src/lib/brand/contrast.ts`, `tests/unit/status-tokens.test.ts`,
`src/components/ui/badge.tsx`, `src/components/ui/panel.tsx`, `src/components/branding/{contrast-badge,brand-kit-form}.tsx`.
This section is B1/B2/B3 of the checklist. Nothing in `src/` or `supabase/` changes yet.

### B1 — the status-colour guard

#### The exact pairs, read off the actual code rendering the badge, not assumed

`Badge`'s filled tones (`badge.tsx:33-36`) put a **near-white platform fill** behind status text in
light context, and switch to **transparent + border** once an ancestor carries `.theme-dark`
(`DEC-080`'s per-section band). `Panel`'s coloured tones (`panel.tsx:11-12`) do the same with a
translucent border. Both sit on top of whatever the org's theme layer just painted underneath them
— a card (`bg-surface`) most of the time (`Card`'s own background, e.g. `browse/session-card.tsx`),
sometimes the bare page (`bg-canvas`, e.g. a `Panel` used directly on `/app/propose/[id]`). So the
badge/panel's own fill is a **UI object laid over an org colour**, and the org colour underneath it
is either `light_canvas` or `light_surface` — I check both, since `16` §16.6's own example names
"dark canvas… dark cards" together rather than picking one.

`OUTLINE_TONE.live`/`.ended` (`badge.tsx:44-46`) and the outline `Badge` usages that already exist
in the tree (`platform/templates/library-table.tsx:143`, `platform/impersonate/history-table.tsx:58`)
drop the fill entirely: the status **ink itself** sits directly on the org colour, as small text
(badge label size, never ≥ 19 px bold) — SC 1.4.3's 4.5:1, not the UI-component 3:1.

So, three buckets, matching my agent file's framing exactly:

| Bucket | Pair | Criterion | Threshold | Why it's skipped or kept |
|---|---|---|---|---|
| skip | `--color-live` on `--color-live-bg`; `--color-ended` on `--color-ended-bg` | 1.4.3 | 4.5:1 | constant on constant — always ≈15–17:1, cannot fail, no org value in it at all |
| **kept** | `--color-live-bg` against `light_canvas` | 1.4.11 (UI component) | 3:1 | the filled badge/panel as an object against the page it sits on |
| **kept** | `--color-live-bg` against `light_surface` | 1.4.11 | 3:1 | same object, against a card |
| **kept** | `--color-ended-bg` against `light_canvas` | 1.4.11 | 3:1 | " |
| **kept** | `--color-ended-bg` against `light_surface` | 1.4.11 | 3:1 | " |
| **kept** | `--color-live` (ink) against `light_surface` | 1.4.3 | 4.5:1 | the outline badge's text, no fill under it |
| **kept** | `--color-live` (ink) against `light_canvas` | 1.4.3 | 4.5:1 | same control used bare on the page |
| **kept** | `--color-ended` (ink) against `light_surface` | 1.4.3 | 4.5:1 | " |
| **kept** | `--color-ended` (ink) against `light_canvas` | 1.4.3 | 4.5:1 | " |
| **kept** | `--color-live-on-dark` against `dark_canvas` | 1.4.11 | 3:1 | dark badge is `bg-transparent` + `border-live-on-dark/50` — the border is the object, `dark_canvas`/`dark_surface` are just as overridable as their light twins |
| **kept** | `--color-live-on-dark` against `dark_surface` | 1.4.11 | 3:1 | " |
| out of scope, on purpose | `ended` in dark context | — | — | `badge.tsx:35`'s dark leg is `border-edge-strong` + `text-fg-muted` — **both already org tokens** (`dark_edge_strong`, `dark_fg_muted`), not platform constants. There is no `--color-ended-on-dark`. This pair is an org-vs-org question (already, in principle, whatever `checkContrast()` on the form's own `edgeStrong`-vs-`canvas` badge covers today, however loosely) and not `DEC-073`'s consequence — I am not inventing a tenth platform token to close it. Naming it here so it isn't silently assumed covered. |

Ten guarded pairs: four fills (1.4.11, 3:1) × {live-bg, ended-bg} × {canvas, surface} in light, two
border pairs (1.4.11, 3:1) for `live-on-dark` × {canvas, surface} in dark, and four ink pairs (1.4.3,
4.5:1) × {live, ended} × {canvas, surface} in light. `ended` contributes no dark pair; `live-on-dark`
contributes no *ink* pair distinct from its border pair in dark (same value, same two backgrounds —
one `>= 3` check covers both readings, since 4.5 ⊃ 3 is false in general but here I'll gate at the
lower 1.4.11 threshold for the dark border specifically, and separately name in the SQL comment that
a badge label's actual TEXT weight in dark mode is `text-live-on-dark` on transparent, i.e. the same
pair again — one check, cited for both reasons, not two redundant checks).

#### Where this lands: `save_brand_kit()`, in SQL, refusing before the write

New `plpgsql` guard function, `public.status_contrast_ok(p_light jsonb, p_dark jsonb)` — plain
`sql`/`plpgsql`, no table read, so it is trivially unit-testable through the RLS harness without a
fixture — that:

1. Computes WCAG relative luminance and contrast ratio in SQL (the same two-line formula
   `contrast.ts`/`status-tokens.test.ts` already carry twice in TypeScript; a third copy in SQL is
   unavoidable here because the enforcement point is the database, per `DEC-073`'s own text —
   "that is `REQ-NFR-007` at the one place it can actually be enforced"). I will comment the
   function with the same warning `status-tokens.test.ts:8-10` gives about a second source of
   truth, and add a **fourth** reader — a new `tests/unit/status-contrast-sql.test.ts` (mine) that
   feeds the same ten pairs' fixture hexes through both the SQL function (via `applyProposed()`'s
   pool) and `checkContrast()` in TypeScript and asserts they agree, so the two never quietly
   diverge the way the plain-text warning alone cannot prevent.
2. Takes the ten pairs above as **literal hex constants transcribed from `globals.css`** — not a
   read of `globals.css` (SQL can't read a file at runtime) but comments citing the exact line
   numbers, same discipline `0093`'s `canvasRaise` backfill already uses for its own transcription.
3. Raises `'status_contrast_failed'` with **errcode `'55000'`** (object-not-in-prerequisite-state —
   the precedent is `0099_certificate_designs.sql:133`'s `'design_locked'`, a business rule that
   isn't a bad reference or a missing value, which is why it is not `22023`) and a **detail** naming
   which pair failed (`errhint`/`errdetail` carrying e.g. `'live_bg_vs_light_canvas'`), so the field
   the toast points at is derivable without re-running the maths client-side.
4. Is called from inside `save_brand_kit()`, **before** the `insert ... on conflict` — a check that
   ran after the write would need the write to roll back on top of an already-armed
   `write_audit()`/history trigger, and `CLAUDE.md`'s write-then-`raise` rule says a function raises
   before its first write, not after (`DEC-043`). `save_brand_kit()`'s shape already raises before
   any write for the logo/font checks (`0068:154-166`) — this is the same pattern, one more
   `if ... then raise` block, before the `insert`.

New file: `supabase/proposed/branding/0003_status_contrast_guard.sql`, `create or replace function
public.save_brand_kit(...)` (unchanged signature, `0093`'s body plus the new guard call at the top),
`create function public.status_contrast_ok(...)`, no `alter table`.

**Tests, `tests/rls/brand-kits.test.ts`** (mine, existing file — new cases, not edited assertions):
- `POL-save_brand_kit.status_contrast_refused` — a light palette whose `canvas` is `#fbf3e8` (chosen
  to sit under 3:1 from `#fbf5ea`) is refused `55000`.
- `POL-save_brand_kit.status_contrast_accepted` — the platform default palette
  (`platformBrand()`'s own light/dark, transcribed) saves cleanly; this is the "platform default
  accepted" case my agent file names explicitly, and it is also the regression guard against ever
  shipping a guard the platform's own values can't pass.
- `POL-save_brand_kit.status_contrast_dark` — a dark palette whose `dark_canvas` is close to
  `#d2a86b` is refused; a dark palette far from it saves.
- ★ **The existing fixture breaks under the new guard and I have to fix it, in the same commit as
  the guard, not as a separate "test update" that looks like scope creep**: `LIGHT.surface` is
  `"#222222"` today (`brand-kits.test.ts:26`) and every *other* case in that file — the font gate,
  logo ownership, `canvasRaise`, the two poster-regeneration cases — saves a kit through that
  fixture incidentally. `#222222` gives `live` ink 2.70:1 and `ended` ink 2.80:1 against it (measured
  with `contrast.ts`'s own formula), both under 4.5 — so my new guard would refuse **every existing
  case in the file**, not just the ones about contrast. I checked the literal appears exactly once
  (`grep -n '"#222222"' tests/rls/brand-kits.test.ts`), so the fix is a one-line fixture change to a
  light value that still fails obviously against `LIGHT.canvas`'s `#111111` (so the fill checks stay
  meaningful) but passes against both status inks — `#eeeeee` measures `live` 5.08:1, `ended`
  4.90:1, both ≥ 4.5, and against `LIGHT.canvas` the fill checks are unaffected (they read `canvas`,
  not `surface`). Flagging this here rather than discovering it silently at build time, because it
  is exactly the kind of thing "the existing suites are evidence, not edited to fit" is meant to
  catch — this is not editing an assertion to make a test pass, it is keeping a fixture valid under
  a new invariant the file's own header already anticipates ("the seam M13 extends", `status-tokens.test.ts:12-18`,
  written in wave 4/M9 for exactly this day).
- The parity-golden claim in my agent file ("the parity goldens unmoved") holds by construction:
  `status_contrast_ok()` touches nothing `export_render_context()` or `worker/src/render/**` reads;
  it only gates the write path.

#### The screen's message

New key `errors.statusContrast` in `branding.json` (`ar/` first): something naming the object and
the fix, not a bare "failed" — draft: **"يتعارض تباين لون شارة الحالة مع اللون الذي اخترته لهذه
الخلفية. جرّب لونًا أفتح أو أغمق."** (approximate — I will tune the Arabic once I have the actual
failing-pair detail to decide whether to name the background field specifically, e.g. "الخلفية
(canvas)" vs "السطح (surface)", once `errdetail` gives me the pair). `actions.ts` (mine) maps
`errcode === '55000'` to `'statusContrast'` beside the existing `42501`/`22023` mappings — one more
`if`, same shape. Surfaced through the existing `role="alert"` toast path (`SaveBrandKitState.error`),
no new UI primitive.

#### The production read, and what "an existing kit that now fails" does

The owner's order (`STATUS.md`, already drafted) puts this first, before push. The read I am asking
the owner to run, read-only, against the linked project:

```sql
select bk.org_id, bk.light_canvas, bk.light_surface, bk.dark_canvas, bk.dark_surface, bk.updated_at
  from public.brand_kits bk;
```

— every existing row is small enough to eyeball; I do not need a computed pass/fail column from a
production read (that would require running my own not-yet-promoted SQL against production, which
is not how migrations are proven). Once I have the rows, I run the same ten checks against each
locally with `contrast.ts` before the guard is promoted, and report which org IDs (if any) already
hold a palette the new guard would refuse.

**What happens to one that fails: refuse on the next save, never rewrite a stored kit.** My agent
file says this in one line and I am not re-opening it — a migration silently rewriting an admin's
chosen colours is a worse experience than a save that already succeeded staying on disk unless
that admin visits SCR-059 again, and `save_brand_kit()`'s CHECK-based validation has never
retroactively validated stored rows either (a font going from `passed` to some other `parity_status`
after being referenced is explicitly allowed to sit unenforced until the next save, per `0068`'s own
header note 3.5-ish comment on `heading_font_id`/`body_font_id`). If the read finds any org already
below threshold, that org's SCR-059 will show the guard on its *next* save attempt, same as everyone
else's — nothing forces it back into the admin's face before then.

### B2 — the three `ui-lint` violations

Not yet read in detail (planning budget went to B1 first, since it is the one with a schema
consequence and an owner-read dependency). `colour-field.tsx`, `contrast-badge.tsx`,
`logo-uploader.tsx` — I will read `scripts/ui-lint.mjs`'s two rules against each file at build time
and report the fix per file in this note before committing code, per the definition of done
("`ui-lint --strict` shows none of your files"). Expect: `colour-field.tsx` is a raw `<input
type="text">` with a hex value that should sit on `ui/field`/`ui/input` (my agent file's SCR-059
audit from wave 8, §5 above, already named this exact file for the same reason); `logo-uploader.tsx`
is very likely the raw `<input type="file">` behind a styled trigger, same §5 finding, which
`ui/file-drop` (owned by `content`, imported by path, never edited by me) should replace;
`contrast-badge.tsx` I have not yet matched to a rule — read at build time.

### B3 — one logo for two schemes

**The two options, and what each costs the other two tracks:**

1. **A per-scheme logo** — a second column on `brand_kits` (not mine to write: I name it in this
   plan, the lead lands it) — `logo_asset_id_dark uuid references design_assets(id)`, alongside the
   existing `logo_asset_id` (read as `logo_asset_id_light` in spirit, unrenamed to stay additive).
   Costs: `save_brand_kit()` gains one more optional parameter (trailing, defaulted — the wave-11
   additive rule); `brand_kit()` and `export_render_context()` each add one more key
   (`logoAssetIdDark`) to their jsonb; `designer`'s `resolveBrand()`/`bindings.ts` pick the dark id
   when `scheme === 'dark'` and a poster is always dark (`DEC-125`) — so **every poster's logo would
   change to the dark asset the day this ships**, which is a real behaviour change `designer` has to
   sign off on, not a free win; `notify`'s mail (light-context email chrome) keeps using the light
   id unchanged. SCR-059 gains a second `LogoUploader` instance, one per scheme tab (the form
   already tabs light/dark for colours — the same `Tabs` wrapper covers a second uploader with no
   new primitive).
2. **An upload-time check that the one asset reads on both grounds** — refuse (or warn) at
   `save_brand_kit()`'s logo-ownership check if the uploaded PNG's alpha-weighted content is too
   dark-ink-on-transparent to read against a dark poster background. Costs: no schema change, but a
   real content check needs the image's *pixels* (alpha + luminance of the opaque pixels), which
   `design_assets` does not store (`sniffed_mime`/`width`/`height`/`sha256` only, `0055:161-176`) —
   so this option means decoding the PNG at save time (the Route Handler that already sniffs the
   upload, before it becomes a `design_assets` row, is the natural place — not `save_brand_kit()`
   itself, which never sees bytes) and either storing a derived boolean (`logo_reads_on_dark
   boolean`, one more small column, still the lead's to land) or refusing the upload outright with
   no new column at all. Cheaper on the schema, but it is a **refusal at upload time for a shape
   `DEC-009` already forces raster-and-sniffed** — consistent with how this codebase already treats
   uploads, and it never touches `designer`'s renderer or `notify`'s mail.

**The owner's read that decides between them**, which I have not run (my agent file: "waits on the
owner's production read"):

> Is the live org's saved logo (`brand_kits.logo_asset_id` → `design_assets.storage_path`) a PNG with
> a transparent background whose opaque pixels are dark ink (the failure mode `DEC-125`'s dark
> posters expose)? `sniffed_mime`/`width`/`height` alone cannot answer this — it needs the actual
> bytes. Read:
> ```sql
> select o.slug, bk.updated_at, da.storage_path, da.sniffed_mime, da.width, da.height
>   from public.brand_kits bk
>   join public.orgs o on o.id = bk.org_id
>   join public.design_assets da on da.id = bk.logo_asset_id
>  where bk.logo_asset_id is not null;
> ```
> then, for each row returned, download `storage_path` through the storage console (or a signed
> URL) and open it — is it PNG with an alpha channel, and are its opaque pixels dark? If there is
> **no** row (no org has uploaded a logo yet), the question is moot for now and either option is
> equally free to build against a green field — I'd read that outcome as leaning towards Option 2
> (cheaper, no schema growth) since there is no live regression to fix, only a future one to
> prevent, but the choice is still the owner's/lead's to make, not mine to default into.

I will build **neither** before the lead rules, per my agent file.

### Order I intend to work in, once this plan is approved

1. B1's SQL (`supabase/proposed/branding/0003_status_contrast_guard.sql`) + the RLS cases +
   the `LIGHT.surface` fixture fix, handed to the lead with the `03` §8.2 rows, together — this is
   the piece with a schema consequence and it goes first so the owner's read and the migration can
   move in parallel with everything else.
2. B1's screen message + `actions.ts` mapping, once the guard is promoted (so `errcode '55000'` is
   real to map against).
3. B2, the three `ui-lint` files — independent of B1, can start as soon as B1's SQL is handed off.
4. B3 stays a plan until the owner's read comes back and the lead rules between the two options.

---

## Sync 1 — B1 approved with corrections, built — 2026-09-22

Lead's four corrections, applied: (1) the SQL-vs-TS agreement check moved to `tests/rls/
status-contrast.test.ts` — CI's unit job has no database; (2) the fixture change is a ledger line,
verbatim below; (3) I measured the platform default AND every seeded/test palette before finalising
the guard, per the lead's instruction, and it changed the guard's shape — see below; (4) B3 stays
unbuilt, its read is in the owner's order; (5) B2 done in this pass, `logo-uploader`'s file input was
already on `ui/file-drop` — nothing needed a request to the lead.

### The measurement that changed B1's shape

My original ten-pair draft (above, before sync 1) included four "fill vs canvas/surface" pairs at
SC 1.4.11's 3:1 — the filled `Badge`/`Panel`'s near-white background as an object against the page
underneath it. **Measuring the platform default against that draft found it fails its own guard**:
`platformBrand('light').canvas`/`.surface` are both `#ffffff`, and `contrastRatio('#fbf5ea',
'#ffffff') ≈ 1.09`, `contrastRatio('#f1f3f7', '#ffffff') ≈ 1.11` — nowhere near 3:1.
`DEC-052`/`DEC-073` require the platform default to always be accepted, so a guard that refuses it
is wrong regardless of how defensible the abstract WCAG reading looks. Rereading `16` §16.6's own
numeric example confirmed it never actually claims the fill-vs-canvas pair as a violation — its one
concrete number is "`--color-ended` **as text** on an overridden surface can fall below 4.5:1" — so
I dropped the four fill pairs entirely rather than widen the guard past what the platform itself
clears.

**The guard is six pairs, all at SC 1.4.3's 4.5:1** (status colour AS TEXT, never the filled badge's
own chip, which the platform already ships borderline and wave 11 does not get to retroactively
outlaw):

| Pair | Where it's live today |
|---|---|
| `--color-live` vs `light.canvas` | `Badge`'s outline `live` variant, used bare on the page |
| `--color-live` vs `light.surface` | same variant, on a card |
| `--color-ended` vs `light.canvas` | `Badge`'s outline `ended` variant — `platform/templates/library-table.tsx:143`, `platform/impersonate/history-table.tsx:58` |
| `--color-ended` vs `light.surface` | same |
| `--color-live-on-dark` vs `dark.canvas` | `Badge`'s dark leg drops the fill (`border-live-on-dark` + `text-live-on-dark`, `badge.tsx:33`) |
| `--color-live-on-dark` vs `dark.surface` | same |

`--color-ended` contributes **no** dark pair: its dark leg (`badge.tsx:35`) is `border-edge-strong
text-fg-muted` — both already org tokens (`dark_edge_strong`, `dark_fg_muted`), not platform
constants, so it is an org-vs-org question this decision does not reach, not an omission I forgot.

I also measured every other `save_brand_kit()` caller in the tree before finalising (the lead's
instruction 3): `tests/rls/brand-kits.test.ts` is the ONLY test file that calls the RPC (grepped
`save_brand_kit\|saveBrandKit\b` across `tests/`, `supabase/`, `src/`); `tests/rls/fixture-m7.ts`
and `tests/e2e/wave10-notify-forced-dark.spec.ts` both insert into `brand_kits` **directly**,
bypassing the RPC entirely (the former "as the owner", the latter a raw `insert` for the mail
forced-dark demo), so neither is reachable by a guard that lives inside `save_brand_kit()`.
`tests/e2e/branding.spec.ts` and `wave8-branding-review.spec.ts` each edit exactly one field
(`fgHeading`, then `canvasRaise`) through the real screen and leave `canvas`/`surface` at the
platform default, which clears the guard — unaffected.

### Untouched-suite ledger line (`STATUS.md`, verbatim to copy in)

| File | Case | Why | Commit |
|---|---|---|---|
| `tests/rls/brand-kits.test.ts` | every case (fixture-level) | `LIGHT.canvas`/`LIGHT.surface` were `#111111`/`#222222` — a fixture colour the new status-contrast guard refuses (`--color-live`/`--color-ended` measured 2.70–3.32:1 against them, under the new 4.5:1). Changed to `#eeeeee`/`#f5f5f5`, which clear both status inks. No assertion in the file changed. | (this wave, before promotion) |

### What was built, all green (`npx tsc --noEmit`, `npm run lint` 0 errors, `node scripts/ui-lint.mjs --strict` shows no `branding/` file, `npm run test:rls` on both files, `npm test` on the components/unit files)

- `supabase/proposed/branding/0003_status_contrast_guard.sql` — `wcag_relative_luminance()`,
  `wcag_contrast_ratio()` (the SQL twin of `contrast.ts`'s formula, revoked from every client role —
  pure maths, no table read, called only from inside `save_brand_kit()`), `status_contrast_failure()`
  (the six pairs, skips a pair on a missing/malformed hex rather than raising a raw cast error — the
  table's own `23514` still catches that at `insert`), and `save_brand_kit()` re-created with the one
  new `if ... then raise` block before the `insert` (errcode `55000`, precedent `0099`'s
  `'design_locked'`, `errdetail` naming the failing pair).
- `tests/rls/brand-kits.test.ts` — the fixture fix above, plus three new `describe` blocks:
  `POL-save_brand_kit.status_contrast_refused` (two cases: canvas alone, surface alone; the first
  also asserts `errdetail === 'live_vs_light_canvas'` and that no row was written),
  `POL-save_brand_kit.status_contrast_accepted` (the platform default, built from `platformBrand()`
  directly — the regression guard against ever refusing the identity override),
  `POL-save_brand_kit.status_contrast_dark`.
- `tests/rls/status-contrast.test.ts` (new) — `POL-status-contrast-formula-agreement`: eight pairs
  (the six the guard checks plus four edge cases — identical, maximal, two near-whites, an arbitrary
  pair) through `public.wcag_contrast_ratio()` and `contrast.ts`'s `contrastRatio()`, asserting
  agreement to two decimals, plus a symmetry check on the SQL side alone.
- `src/app/[locale]/app/admin/branding/actions.ts` — `errcode === '55000'` mapped to
  `'statusContrast'`, beside the existing `42501`/`22023` mappings.
- `src/messages/{ar,en}/branding.json` — `errors.statusContrast`, ar authored first.
- **B2**, the three `ui-lint --strict` violations, all the same shape — a non-control element
  (a decorative colour swatch, a status row `<div>`, a logo `<img>`) coincidentally re-typing
  `ui/field.tsx`'s `controlClass()` recipe (`rounded-field border border-edge(-strong)?`) rather than
  actually being one: `colour-field.tsx`'s swatch → `rounded-full` (a round chip reads better for a
  colour preview anyway), `contrast-badge.tsx`'s row → `rounded-card` (a small status panel, not a
  field), `logo-uploader.tsx`'s thumbnail → `rounded-card`. No escape hatch needed, no request to
  the lead — `ui/file-drop` was already in use for the real picker.
- B3: unchanged from the plan above — neither option built, my read query is in the owner's order.

`survey-submit.test.ts` fails 6/6 on `main` with none of this wave's SQL applied (checked by running
it alone) — `event`'s file, unrelated to B1, flagging rather than touching it.

**Ready for sync.** Next: none of mine pending — waiting on the owner's two reads (B1's already-saved-kits query, B3's logo-format query) before anything further.

---

## Prose-dependent screens — the owner's rule, 2026-09-22

The lead's instruction: a screen whose meaning depends on reading a paragraph of explanation is
**listed, not rewritten or cut** — a later wave replaces the prose with an affordance by design, and
piecemeal copy edits now would pre-empt that. `errors.statusContrast` (this session's new key) does
NOT belong here — it is a field-level error, not explanatory prose, and the lead already said so.
Four candidates on `/app/admin/branding` (SCR-059), none touched:

| Route | Message key(s) | What depends on it | The affordance that could carry it instead |
|---|---|---|---|
| `/app/admin/branding` | `branding.contrast.title`/`.body`/`.muted`/`.large`/`.ui`/`.pass`/`.fail`/`.ratioLabel` | Whether a chosen brand-token colour pair (`fgHeading`/`fgBody`/`fgMuted`/`edgeStrong` against `canvas`) meets WCAG AA is conveyed ONLY as a ratio number plus a pass/fail word (`ContrastBadge`, `contrast-badge.tsx`) — nothing stops the save if it fails, unlike the new status-colour guard. The lead named this exact screen as a likely case. | A pass/fail glyph (check/alert icon, already in `ui/icons.tsx`) beside each swatch pair, the ratio text demoted to a `title`/tooltip rather than the only signal; and/or `save_brand_kit()` itself refusing a failing brand-token pair the way it now refuses a failing status pair (a separate, bigger decision — not assumed here). |
| `/app/admin/branding` | `branding.logo.ppiResult`, `.ppiSufficient`, `.ppiWarning`, `.ppiInsufficient` | Whether an uploaded logo prints legibly at A3 is conveyed only as a PPI number and a sentence of arithmetic — no colour or icon signal. | A traffic-light badge (green/amber/red) beside the logo preview, the PPI sentence demoted to supporting detail. |
| `/app/admin/branding` | `branding.colours.canvasRaiseLightHint` | Why editing the light scheme's `canvasRaise` field visibly changes nothing today (`DEC-125`: posters always render dark) is explained only in a sentence beside the field. | Grey/disable the light `canvasRaise` field with a short inline tag ("غير مُستخدم اليوم") rather than a full sentence, or move the fact into the field's own `hint` slot styled distinctly from an active field's hint. |
| `/app/admin/branding` | `branding.actions.resetConfirm` | That resetting deletes the org's customisation, reverts every screen to the platform default, and re-renders live posters is conveyed only as one dialog sentence — nothing previews WHAT changes. | A small before/after swatch pair inside the dialog (current org colour → platform default), the sentence kept but no longer the only signal. |

None of these are edited this wave — flagging per the rule, not fixing.
