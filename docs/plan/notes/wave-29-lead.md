# Wave 29 — the lead's brief (M34: the profile picture and the moves)

**Written:** 2026-10-10 by the wave-29 lead, after sync 1's «go» · **Decision:** `DEC-280` — where this brief and the
decision disagree, the decision wins. **Prompt:** `docs/design/LEAD-PROMPT-avatars-transitions.md`.

## Measured from the tree at the start

- `main` `2d145348` (#103). Production `0220`. **Next migration `0221`, next decision `DEC-281`** (this wave took 280).
- Wave number: 29 (`STATUS.md`'s last wave was 28). Milestone **M34** (the roadmap ended at M33).
- `ui/` holds **71** files; the gate's floor is 71. This wave adds **no primitive**.
- ★ **`0194` is not missing** — on disk and in production's history. Nothing to fill (`DEC-280`).
- The design pack is whole: `public` gets the 50 SVGs from `docs/design/assets/avatars/{characters,objects}/`.

## The goal, above the process

**Nobody is initials on day one, a member changes their picture in one sheet without ever losing it to a refresh,
and moving through the app feels like the playground — without the console moving and without a dropped frame.**
«Good» is not «the gates are green».

## The three PRs

| PR | Branch | Tree | Stories | Owner |
|---|---|---|---|---|
| **A** — the library | `wave-29a/the-library` | main checkout | `STORY-PRF-008`, `009` | lead (`avatar.tsx` lent from `content`) |
| **B** — the picture | `wave-29b/the-picture`, cut from A's head | `../kareem-marefa-wave29b` | `STORY-PRF-010` … `013` | `content`, `platform`; lead `0222` |
| **C** — the moves | `wave-29c/the-moves`, cut from `main` | `../kareem-marefa-wave29c` | `STORY-UIX-111` … `116` | lead |

Merge order A, B, C. B is retargeted to `main` **before** A merges with `--delete-branch` (PR #36's lesson).

## PR A — the library (`REQ-PRF-014`, `REQ-PRF-015`; AVA-01 … 03, 10, 11, 13 … 15)

1. `public/avatars/{characters,objects}/<key>.svg` — the fifty files, copied verbatim; a unit test refuses a
   `<script>`, an `on*=` attribute, an `href`/`xlink:href` to anything but a fragment, and a `<foreignObject>`.
2. **`0221`**: `create type public.avatar_source as enum ('google','upload')`; `members.avatar_key text` with a check
   over the fifty keys; `members.avatar_source public.avatar_source`; `public.random_avatar_key()` (volatile, from
   the same list); the key assigned in the member-creation path — a `before insert` trigger on `members`, so
   `provision_member()`, `add_member()` and any future writer are covered by one rule; the backfill
   (`where avatar_key is null and anonymised_at is null`); `avatar_source` backfilled `google` where a copy exists;
   `avatar_key` appended to the member column grant and the member view; anonymisation nulls it.
3. **The resolver** (`src/components/privacy/avatar-href.ts`): `avatarHref({ id, avatarVersion, avatarKey }, size)`
   returns our copy when a version is held, else `/avatars/<key>.svg`, else null. Every reader selects
   `avatar_key`; realtime payloads carry the key. The DTO field keeps its name.
4. `ui/avatar` takes `src` as today, plus an optional `label` (the library name) — the name is the accessible name
   only, never drawn. The initials stay laid under the image (`DEC-182`).
5. Boards, CSV and mail are untouched and a test holds each.

## PR B — the picture (`REQ-PRF-016` … `019`, `REQ-PRF-011`; AVA-04 … 09, 12, 16, 17)

- **`content`:** the way in on `SCR-021` (tappable hero; the 26 px lime camera badge in «عدّل ملفك»), the sheet
  `صورتك` in its three states on `ui/sheet` (centred `ui/dialog` from `lg`), the crop step (canvas, client-side,
  1024 px, JPEG quality stepped down until ≤ 1 MB; `accept="image/png,image/jpeg"`; pinch, drag, a zoom slider), the
  refusals as words, `profile.json`'s strings. A pick or a removal is staged in the sheet and committed by «حفظ».
- **`platform`:** `POST /api/avatars/upload` (Route Handler, Zod, 1 MB cap, into the staging prefix through the one
  path builder); `JOB-process_avatar_upload` (sniff, strip, 96/192 WebP, delete the previous photo object, move the
  version, set `avatar_source = 'upload'`, delete the staged file); `import_avatar` refusing to run while
  `avatar_source = 'upload'` unless the member asked from the sheet; the definer functions `set_avatar_library()`,
  `remove_avatar_photo()`, `request_avatar_google()`, `take_down_avatar()` (admin, audited); the row action on
  `SCR-049`; anonymisation, export, the prefix assertion.
- **Lead:** `0222` — the staging bucket or prefix and its policy, the job registrations, `03` rows.
- ★ **Not reportable** (`DEC-280` §8): no `report_target` value, no queue row.

**Undrawn states, named:** the sheet when Google gave nothing (the button absent); the crop screen's three refusals;
the sheet centred on desktop; the upload in flight («حفظ» pending, the ring unchanged until the version moves).

## PR C — the moves (`REQ-UIX-121` … `130`; TRN-01 … 10)

**Mechanism (verified in the tree):** Next 16.3.5 vendors React canary (`next/dist/compiled/react`), which exports
`ViewTransition` and `addTransitionType`; the guide (`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`)
says it works **with no configuration** — `experimental.viewTransition` is not needed. `next/link` takes
`transitionTypes` (16.2+). Types come from `@types/react/canary`.

- **Poster:** `<ViewTransition name={`poster-${id}`} share="poster" default="none">` on the timeline card, the browse
  card and the event hero. ★ **The event page is dynamic**, so its `loading.tsx` usually commits first and no pair
  forms. The fix: the card writes its poster's `src` and aspect to a tiny client store on press; the event's skeleton
  reads it and draws the same named poster. **Proven on a production build before anything else in C.** If it cannot
  be made to pair, the event page drops in like a push and the brief says so at PR time.
- **Root kinds:** `ui/link` takes `nav?: "jump"|"push"|"back"|"switch"|"sheet"` and sets `<html data-nav>` on press;
  `::view-transition-old(root)` / `-new(root)` keyframes keyed on `:root[data-nav=…]`. The browser's back sets
  `data-nav=back` from the Navigation API's `navigate` event (`navigationType === "traverse"`), else from `popstate`.
- **Story:** WAAPI on the viewer's root from the ring's measured rect (`transform` + `border-radius`), reversed on
  every close path.
- **Console:** its layout sets `data-nav="none"` and `view-transition-name: none` on its root; `console-register`
  refuses a `nav=` prop and a `ViewTransition` import in the staff tree.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` sets `::view-transition-*` animations to none and
  every duration token to 0; the press stays (a step change, no spring).

| Browser | View transitions | Types · `view-transition-class` |
|---|---|---|
| Chrome / Edge | 111+ | 125+ |
| Safari (incl. iOS) | 18.0+ | 18.2+ |
| Firefox | 144+ | 144+ |

Without the API the navigation is a cut — the static state is the design.

## Contracts

1. **Lead → `content`, `platform` — the resolver** (A): `avatarHref({ id, avatarVersion, avatarKey }, size)`; no
   reader forks on the source.
2. **Lead → `platform` — tables** (`0221`, `0222`): columns, enums, buckets, policies and grants are the lead's; a plan
   names what it needs.
3. **`platform` → `content` — the sheet's writes**: four DAL functions in `src/lib/dal/avatars.ts`, names and types in
   `platform`'s note on day one; `content` calls them and never touches storage.
4. **Lead → everyone — motion** (C): no file outside the lead's adds a keyframe, a `view-transition-name` or a
   `data-nav` kind.

## Gates

`ui-lint --strict` with the new keyframes rule (two escape hatches) · the reduced-motion Playwright pass · the
throttled trace · `console-register` extended · the prefix assertion over staged and avatar objects · RLS cases for
assignment, the three sources, both deletions, the refresh-never-overwrites case, takedown and anonymisation · the
SVG content test · the five public routes unmoved (`qa:contract`, `visual`'s public pairs) · `npm run qa` green.

## Risks

- The poster pair (above). The blur's cost on a throttled CPU — first to go if a frame misses. «Within a second»
  depends on the worker's LISTEN wake-up — measured, not assumed. `DEC-204`'s doubled hard load could look like a
  double move — measured against `main`.
