# 04 — Components

**Serves:** `REQ-UIX-001` (every control from `src/components/ui/`; every primitive has a jsdom test,
an RTL check and a gallery entry), `REQ-UIX-002` (the shell), `REQ-UIX-003` (status badge),
`REQ-NFR-009` (touch targets), `REQ-PRF-009` (avatars).
**Ownership:** per file, as `16-ui-redesign.md` §4 already sets it. This document does not rename any
of the 37 primitives; it changes their look through tokens and adds nine new ones.

## Migration of existing primitives (tokens only unless stated)

| Primitive (file) | Change |
|---|---|
| `button` | New variants: `primary` (accent fill, ink text, display face at 20px, press shadow `--shadow-press`, active `translateY(3px)` + `--shadow-press-down`), `secondary` (2px `--fg` outline, transparent, display face), `quiet` (`--bg-raised` fill, body 700), `signal` (coral fill for check-in), `disabled-with-reason` (muted text, the reason rendered beside or beneath, never hidden — `REQ-SES-013`). Min height 44; CTA size 52. Pending state keeps the label (`REQ-UIX-007`) |
| `chip` | Pill, `--bg-raised`, 13px 700. Gains `tone` for team/level colours via `--team` |
| `status-badge` | Same semantics; colours from the status tokens in `01`; leading dot for live, glyph for done/cancelled/waitlist; never a sticker |
| `avatar` | Initials over the six tints (unchanged rule); gains `teamColor` → 3px ring; sizes 32/38/40 |
| `card` | `--radius-card`, `--bg-surface`, 1px `--line-color`, padding 12 (phone) / 16 (desktop); no shadow |
| `field`, `input`, `select`, `combobox`, `date-time` | tokens only; `--radius-input`; focus ring = 3px accent outline |
| `sheet` | full-height on phone, `translateY(100%)→0` over `--duration-slow`; carries its own action bar and hides the tab bar while open (`REQ-UIX-002`: one fixed bottom bar) |
| `tabs` (bottom tab bar) | five slots with the centre slot a raised 56px accent circle («اقترح»); active colour accent; contextual (hidden on detail/immersive screens where an action bar replaces it) |
| `toast` | whisper: `--bg-raised`, 13px 600, glyph, 220ms |
| `skeleton` | shaped like the content (`REQ-UIX-005`), opacity pulse only |
| `data-table`, `reorderable-list`, `file-drop` and the rest of the console primitives | tokens only; **no animation** |

### ★ The rows this table never had — added by `DEC-199` (wave 17, M19)

The table above names about twenty primitives, and `07-tasks.md`'s order the same. **Eight were in neither**, so
wave 15 migrated what was listed and these kept the old design on every scoped screen — the mixture the owner saw.
Their design is derived from the documents that do speak (`02-typography.md`'s pairing, `01-tokens.md`), and
`tests/unit/ui-playground.test.ts` now reads the **directory**, so a primitive can no longer be missing from a list.

| Primitive (file) | Change |
|---|---|
| `page-header` | The page's one `h1` in the display face at display-md; breadcrumb, eyebrow and description in the body face, muted; chevrons mirror. Actions wrap under the text on a phone |
| `section-header` | `h2` in the display face at display-sm; `h3` in the body face; the count stays body, muted |
| `prose` | Body face, body line height 1.7; headings inside it follow `section-header`; a link inside it is underlined in the text colour |
| `link` | It draws nothing of its own: a link's colour and underline are its caller's, and `prose` underlines a link in the text's colour. **Never the accent as the only signal** (lime on the light ground is 1.07:1). The pending dot is the link's own colour |
| `icon-button` | A `button` in a square: its faces, its press, the pill radius; ≥ 44 px; the name on the element |
| `submit-button` | `button`'s `primary`; pending keeps the label |
| `reorderable-list` | tokens only; **no animation**; the move buttons are the conforming path (`DEC-093`) |
| `icons` | unchanged drawings, `currentColor`, `1em`; shown whole in the gallery. The public routes import it, so it changes last, alone |

**The console** (`/app/admin/**`, `/app/platform/**`) takes the palette, the radii and the type, and **none of the
motion, objects or stickers** (`DEC-199` §1.1).

## New primitives

| Primitive | File | Spec |
|---|---|---|
| **Sticker** | `ui/sticker.tsx` | Die-cut pill: display face 16–20px, ink text, fill from a small allowed set (accent, signal, cyan, gold, violet, bone), `rotate` prop in `[-6, 6]`, rim = `--shadow-sticker` computed from the ground it sits on. Decorative only: `aria-hidden` unless it carries information a badge does not. Never used for lifecycle status |
| **Poster** | `ui/poster.tsx` | The card-level poster block: team-coloured (`--team`) 4:5 area, category chip, sticker slot, display title (30px, `text-wrap: balance`), meta row with date and a QR placeholder that becomes the real poster QR (`REQ-DSG-023`). Renders the rendered poster artifact whole when one exists (`REQ-UIX-026`); the block above is the placeholder while it renders |
| **SessionCTA** | `ui/session-cta.tsx` | One control, six states: reserve, waitlist, booked (with cancel beneath), check-in (signal), attended, none-with-reason. Capacity chip in the trailing slot. Drives moments 1 and 2 |
| **ReactionBar** | `ui/reaction-bar.tsx` | Like + four house stickers (fire, star, bolt, pin), counts, `pop` on press, optimistic (allowed: uncontended, `REQ-UIX-007`). Zero points; nothing here reads as an achievement |
| **CodeInput** | `ui/code-input.tsx` | Six 48×60 boxes in a `dir="ltr"` container inside the RTL page, `inputMode` matched to the alphabet, autocorrect/autocapitalize off, paste supported, per-box `hit` pop, lime border when complete; a11y: one labelled input per box with `aria-describedby` on the error (`SCR-014`) |
| **ProgressBar** | `ui/progress-bar.tsx` | Track + fill by `scaleX(var(--v))`, `transform-origin` at the inline start; used by level progress, race bars and story segments |
| **RankRow / RaceBar** | `ui/rank-row.tsx`, `ui/race-bar.tsx` | Leaderboard row (rank in display face, avatar with team ring, name + company, points, delta arrow) with the FLIP move; race bar with team ring, name, bar, value. `me` variant outlined in accent |
| **LevelCard** | `ui/level-card.tsx` | Two faces, flip on level change, shine once; front = current level + privilege, back = new level + privilege |
| **StoryRing / StoryViewer** | `ui/story-ring.tsx`, `features/stories/*` | See `05-stories.md` |
| **Confetti** (utility) | `lib/ui/confetti.ts` | See `03-motion.md` |

## New glyphs for the house icon set (hand-authored, 24px, stroke 2)

flame, trophy, compass, plus, ticket, coin, bolt, star, pin, camera, download, calendar-check,
chevron-start/end (mirrored pair), pause, close. Each is an inline SVG in `icons.tsx`; none comes
from a library.

## Assets

The six objects, the wordmark, the app mark, the display font files and the new glyphs ship in
`docs/design/assets/` — masters as SVG with outlined labels, rasters at 1×/2×/4× and 2048 px for
posters, WebP with PNG fallback. `08-assets.md` says where each file goes in the repo and how to
regenerate them. Inline the SVG when an object animates (coin, flame); use `<img>` with `srcset`
elsewhere; hand the designer only the rasters (`DEC-009`).

| Asset | Used by |
|---|---|
| coin («+50») | check-in celebration, points empty state |
| cup | companies race, season end |
| flame | streak card, story «جارية الآن» |
| ticket | reservation moment |
| star badge | achievements, badge unlock |
| rocket | level-up |

## Definition of done for every primitive

- Renders from tokens only; no hex in the component.
- jsdom test, an RTL render check, and a gallery entry at 390px and desktop (`(dev)/ui`).
- Focus visible at 3:1; hit target ≥ 44px; label never blanked while pending.
- If it animates: durations from tokens, transform/opacity only, a reviewed static state.
