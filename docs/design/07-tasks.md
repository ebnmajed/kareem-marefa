# 07 — Implementation order

**Serves:** the build process already in use (lead + teammates, PR per wave, the owner merges, `STATUS.md`
and `DECISIONS.md` as the source of truth).

## Before any code

1. The lead reads this folder in order and the prototypes.
2. The lead lists the entries in `06-decisions-proposed.md` and asks the owner to accept, amend or
   refuse each. **No wave starts on an entry that is not in `DECISIONS.md`.** Waves 1 and 2 need
   DEC-NEXT-1, 3 and 4; wave 3 needs DEC-NEXT-14; wave 4 waits for the screen designs.
3. The lead writes the plan as `STORY-*` items in the existing backlog shape, each citing the `REQ-*`
   it serves and the primitive file it owns, and posts it for review before assigning teammates.

## Waves

### Wave 1 — tokens, type, primitives, gallery
- Merge `tokens.css` into `globals.css`; add the semantic layer to the existing theme switch; nothing
  visible changes yet.
- Materialise Baloo Bhaijaan 2 through the font path (`02-typography.md` §"Getting the display face
  into the product"); parity goldens green; `@font-face` with a metric-matched fallback.
- Migrate the primitives in this order, one commit each with a gallery screenshot at 390px and desktop:
  `button` → `chip` → `status-badge` → `avatar` → `card` → `field`/`input`/`select`/`combobox`/
  `date-time` → `sheet` → `tabs` → `toast` → `skeleton` → the console primitives (tokens only).
- ★ **Corrected by `DEC-199` (wave 17, M19):** this order names about twenty primitives. `page-header`, `prose`,
  `link`, `icon-button`, `section-header`, `submit-button`, `reorderable-list` and `icons` are absent from it, were
  not migrated, and are wave 17's. A list cannot notice what it omits; `tests/unit/ui-playground.test.ts` reads the
  directory instead.
- New primitives: `sticker`, `poster`, `session-cta`, `reaction-bar`, `code-input`, `progress-bar`,
  `rank-row`, `race-bar`, `level-card`, `story-ring`.
- New glyphs in `icons.tsx` (from `assets/icons/icons-additions.tsx`).
- Install the assets per `08-assets.md`: wordmark component, mark and metadata icons, object components and `public/objects/`, the 2048 px rasters as platform design assets.
- Gate: `npm run qa` green; the frozen public routes' visual baseline **unchanged**
  (`REQ-NFR-019`); every new primitive has its jsdom test, RTL check and gallery entry.

### Wave 2 — the five moments  ·  ★ built as M18, wave 16 (`DEC-195`): on the real screens; §1.1 of that entry names the five surfaces, and the home card is not one of them
- `lib/ui/confetti.ts`, `useCountUp`, the once-per-occurrence keying.
- Moment 1 on `SCR-012` (reservation); moment 2 on `SCR-014` (check-in celebration, honest copy from
  `REQ-CHK-018`); moments 3 and 4 on `SCR-022` and the home «التالية لك» card; moment 5 on
  `SCR-027`/`SCR-028`.
- Static states reviewed at 390px beside the animated ones.
- Gate: Playwright trace on a throttled CPU, no frame over 16ms for moments 1 and 2; lint clean.

### Wave 3 — stories
- Migration: `story_views` (if DEC-NEXT-14 option A), the `story` photo derivative in the photo job.
- `dal/stories.ts` and its RLS tests; the ring row on `SCR-010`; the viewer under `features/stories/`;
  the «القصة» sub-nav entry on `SCR-012`.
- Gate: the RLS cases in `05-stories.md` §Tests; Playwright tap/hold/swipe at 390px.

### Wave 4 — screens
- ★★ **A screen is REBUILT to its design, never restyled** (`DEC-199` §2). Applying the scope to existing markup
  produces the right colours on the wrong structure. The screen is built from its document — its layout, its
  hierarchy, its affordances — not patched until it looks close. Wave 17 (M19) put every screen inside the scope at
  the token level; that is not any screen's redesign.
- Waits for the per-screen designs (mobile and desktop per `SCR-*`), delivered in the same folder as
  `docs/design/screens/<SCR-id>.md` with their reference artboards. Milestone order follows
  `09` §8: M10 member screens first, then M11 console, M12 designer and certificates, M13 public.
- ★ **Corrected by `DEC-195` §5 — the three `(auth)` screens open the member screens.** `09` §8 placed `SCR-002`
  sign-in, `SCR-003` choose-org and `SCR-004` no-access at M9, which is in none of the four groups above: they are
  neither behind sign-in nor public marketing, so this ordering skipped them — as the first redesign did before the
  owner asked for the login page by name (`DEC-129`). **They are the member-screens wave's first three screens.**
  The milestone labels above are also spent (M10–M13 closed by wave 11); the programme's own numbers and order are
  in `docs/plan/14-roadmap.md`, «The programme's sequence», which wins where the two differ (`DEC-183`).

## Definition of done (every wave)

- Only primitives from `src/components/ui/`; no control styles declared in a screen.
- Tokens only; no hex, no per-component duration, no animation dependency.
- RTL renders correct at 390px in Arabic with no horizontal page scroll; Western numerals; `<bdi>` on
  mixed runs.
- Loading skeleton and error boundary at every touched route boundary.
- WCAG 2.2 AA: focus visible, targets ≥ 44px, contrast as in `01-tokens.md`.
- `npm run qa` green; `main` deployable; `STATUS.md` updated; `DECISIONS.md` untouched by the agents
  (the owner writes decisions).

## What must not move

- `docs/plan/02-domain-model.md` beyond the additions named in `06` (`team_color`, `weekly`,
  `consecutive_sessions`, `proposal_votes`, `feed_announcements`, `story_views`).
- The append-only tables, the check-in constraints, the certificate identifiers, the RLS pattern.
- `REQ-NFR-019`'s frozen routes before M13.
- The designer's document model and export pipeline (`06-visual-designer.md`); this direction adds
  templates and assets, not mechanics.
