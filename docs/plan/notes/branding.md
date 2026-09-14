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
