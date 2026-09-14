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
