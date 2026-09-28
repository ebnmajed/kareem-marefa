# 01 — Tokens

**Serves:** `REQ-UIX-001` (one source of primitives), `REQ-UIX-014` (motion by token),
`REQ-INT-005` (typography as tokens), `REQ-DSG-021` (brand kit feeds the theme layers).
**Companion file:** `tokens.css` — the `@theme` block, ready to merge into `src/app/globals.css`.

## Rules of engagement

- Tokens are added to the existing `@theme` blocks in `src/app/globals.css`. **Do not rename or delete
  the tokens the 37 primitives already consume** (`--color-canvas`, the `.theme-dark` mechanism, the
  status colours). Add the new tokens, then migrate primitives to them one file at a time in `04`'s
  order, and remove an old token only when nothing reads it.
- The `@theme inline` block is load-bearing for dark mode. Semantic tokens that switch per theme go
  through the same mechanism the repo already uses; the raw palette below never switches.
- Status colours are **platform constants** (`REQ-UIX-003`). An org's brand kit (`ENT-brand_kits`)
  restyles brand tokens, never status tokens.
- Team colours are org data (`ENT-companies` gains `team_color` — see `06`), rendered through a CSS
  variable on the element (`--team`), never through a class per company.

## Raw palette

Dark ground (the default surface):

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#0B0C12` | page ground |
| `--color-surface` | `#151724` | cards, sheets, tab bar |
| `--color-surface-2` | `#1E2130` | raised elements, chips, inputs |
| `--color-line` | `#2A2E40` | hairlines, borders |
| `--color-bone` | `#F4F1EA` | primary text on dark |
| `--color-muted` | `#A7ABBE` | secondary text on dark (8.5:1 on ink) |

Accents (exactly two):

| Token | Hex | Role |
|---|---|---|
| `--color-lime` | `#C6FF3D` | points, the primary action, level 4 «كريم معرفة». Text on it is ink (16:1) |
| `--color-lime-deep` | `#78AD12` | press shadow under primary buttons, lime on light ground |
| `--color-coral` | `#FF6E4F` | streak, «جارية الآن», check-in urgency (7:1 on ink) |
| `--color-coral-deep` | `#C2472C` | press shadow under coral buttons |

Light ground (supported, not default):

| Token | Hex | Role |
|---|---|---|
| `--color-paper` | `#F6F3EC` | page ground |
| `--color-paper-surface` | `#FFFFFF` | cards |
| `--color-paper-line` | `#E4DFD3` | borders |
| `--color-paper-ink` | `#12131A` | primary text |
| `--color-paper-muted` | `#5B5F73` | secondary text (7:1 on paper) |

Team colours (proposal; the mapping to companies is the owner's to change):

| Token | Hex | Proposed company |
|---|---|---|
| `--color-team-silver` | `#E9E4D6` | شبه الجزيرة |
| `--color-team-tangerine` | `#FF9A2E` | صنف |
| `--color-team-magenta` | `#FF4FB8` | بنينسولا ستوري |
| `--color-team-cyan` | `#35D0FF` | مواهب |
| `--color-team-gold` | `#FFD23F` | دبابيس |
| `--color-team-violet` | `#9B7CFF` | أيك |
| `--color-team-mint` | `#3BE8B0` | جذر |

A team colour is always paired with the company logo or name; it is never the only channel.

Level ramp (the five seeded levels, `REQ-REC-004`):

| Token | Hex | Level |
|---|---|---|
| `--color-level-1` | `#9AA0B4` | مشارِك |
| `--color-level-2` | `#C8875A` | مشارِك نشِط |
| `--color-level-3` | `#D9DEE8` | صاحب أثر |
| `--color-level-4` | `#C6FF3D` | كريم معرفة (the brand accent, on purpose) |
| `--color-level-5` | `#BFE9FF` | سفير المعرفة |

Status (platform constants; keep whatever `DEC-073` already fixed if it differs, and reconcile in one
DEC):

| Token | Value | Badge |
|---|---|---|
| `--color-status-live` | `--color-coral` fill, ink text, leading dot | «جارية الآن» |
| `--color-status-done` | `--color-surface-2` fill, bone text, line border, check glyph | «مكتملة» |
| `--color-status-cancelled` | transparent, muted text and border, x glyph | «أُلغيت» |
| `--color-status-waitlist` | `--color-team-cyan` fill, ink text, clock glyph | «قائمة انتظار» |
| `--color-status-full` | `--color-surface-2` fill, bone text | «ممتلئة» |

Avatar tints (`REQ-PRF-009`: six tints keyed to a stable hash of the member id; never encode role,
company or status): `#2C3D4A`, `#3A3F56`, `#4A3A2E`, `#2E4A3F`, `#463A4A`, `#3C4A2E`. Bone initial on
each (all ≥ 7:1).

## Semantic layer

The primitives read semantic names, never raw palette names, so light mode is a remap:

```
--bg            ink        | paper
--bg-surface    surface    | paper-surface
--bg-raised     surface-2  | paper-line (at 60% mix with surface)
--fg            bone       | paper-ink
--fg-muted      muted      | paper-muted
--line          line       | paper-line
--accent        lime       | lime            (text on it is always ink)
--accent-deep   lime-deep  | lime-deep
--signal        coral      | coral
```

Dark is the default; `.theme-light` (or whatever the existing switch is named) applies the second
column. Team, level and status tokens do not remap.

## Radii, borders, elevation

| Token | Value | Used by |
|---|---|---|
| `--radius-card` | 22px | cards, panels, race widget |
| `--radius-poster` | 16px | poster block inside a card |
| `--radius-input` | 12px | inputs, code boxes |
| `--radius-pill` | 999px | buttons, chips, stickers, tabs |
| `--border-hair` | 1px `--line` | every card |
| `--ring-team` | 3px solid `--team` | avatar ring |
| `--shadow-press` | `0 5px 0 var(--accent-deep)` | primary button (press: `0 2px 0` + `translateY(3px)`) |
| `--shadow-sticker` | `0 0 0 3px <ground>, 0 0 0 6px var(--fg)` | die-cut sticker rim |

There is no soft grey drop shadow anywhere in the app; depth comes from surface steps and the press
shadow.

## Motion tokens

| Token | Value | Role |
|---|---|---|
| `--duration-fast` | 120ms | hover, focus, pop start |
| `--duration-base` | 220ms | screen fades, toasts, state changes |
| `--duration-slow` | 420ms | sheets, rows moving, ticket rise |
| `--duration-party` | 900ms | celebration sequences (check-in, level flip, race bar) |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | the only easing for entrances and moves |
| `--ease-in` | `cubic-bezier(.7, 0, .84, 0)` | exits only |

All four durations collapse to `0ms` under `prefers-reduced-motion: reduce`, declared once, globally,
as the repo already does. Looping animations (flame flicker, live-ring pulse) are switched to
`animation: none` under reduced motion because a zero-duration infinite loop is not a static state.

## Spacing and layout

The 4-px scale already in use stands. Phone gutters 12px, card padding 12px, panel padding 16–18px,
desktop content max 1200px (`09` §2). Touch targets ≥ 44px; primary CTAs 52px.

## Merging into `globals.css`

1. Append `tokens.css`'s `@theme` block after the existing one.
2. Add the semantic layer to the existing theme mechanism (same file, same switch).
3. Run the gallery (`KAREEM_GALLERY=1`) and confirm nothing changed visually yet — the new tokens are
   unused until `04`'s migration.
4. Migrate primitives in `07-tasks.md`'s order; each migration is its own commit with its gallery
   screenshot.
