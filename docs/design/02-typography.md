# 02 — Typography

**Serves:** `REQ-INT-005` (type as tokens), `REQ-INT-009` (self-hosted, subsetted fonts),
`REQ-DSG-016` / `REQ-DSG-017` (one font set everywhere; fonts materialised and gated).

## The pairing

| Role | Face | Weights | Where |
|---|---|---|---|
| Display | **Baloo Bhaijaan 2** (Google Fonts, OFL) | 700, 800 | headings, the wordmark, big numbers (points, ranks, counts), CTA labels, stickers, poster titles, celebration copy |
| Body / UI | **IBM Plex Sans Arabic** (already shipped) | 400, 500, 600, 700 | everything else: labels, body, forms, tables, captions |
| Certificates | the Naskh family already in the manifest | unchanged | certificates only (`REQ-DSG-026`) |

Baloo Bhaijaan 2 is a rounded, heavy, Kufi-based face with harmonised Latin, which is exactly the
"chunky and warm" of the direction and satisfies `REQ-INT-005`'s "a Kufi display face". If the owner
wants a sharper option later, the two alternates evaluated were **Changa** and **Alexandria**; the
tokens do not change, only `--font-display`.

## Scale (phone / desktop)

| Token | Phone | Desktop | Face |
|---|---|---|---|
| display-xl | — | 64 | display 800 |
| display-lg | 48 | 56 | display 800 |
| display-md | 30 | 34 | display 800 |
| display-sm | 22 | 24 | display 800 |
| title | 28 | 32 | body 700 |
| subtitle | 22 | 22 | body 600 |
| body | 17 | 17 | body 400/500 |
| secondary | 15 | 15 | body 400/500 |
| caption | 13 | 13 | body 600 (never 400: it fails contrast in muted) |

Line height: display 1.15, headings 1.4, body 1.7. Base 17px on mobile (`REQ-INT-005`).

## Arabic rules (enforced as tokens and review, not as advice)

- Letter-spacing 0 on all Arabic text; a component setting it fails review.
- No `overflow: hidden` on a text line (it clips stacked diacritics). Truncation uses a container with
  `line-clamp`, never a clipped line. The only exception is the story header title, which is a
  single-line ellipsis on a container tall enough for marks.
- No justified text anywhere. Kashida off.
- A 1.2× length allowance against English in every text box; poster and certificate text boxes
  auto-fit (`REQ-DSG-025`).
- Western numerals everywhere, formatted with `toLocaleString('en-US')` or the repo's formatter
  (`REQ-INT-006`). Numbers in the display face are tabular enough for counters; if a count-up jitters,
  set `font-variant-numeric: tabular-nums`.
- Mixed runs (a code, a serial, a Latin product name) are wrapped in `<bdi>`; the check-in code boxes
  are `dir="ltr"` inside the RTL page (`SCR-014`).

## Getting the display face into the product

Baloo Bhaijaan 2 will appear on posters (titles) as well as in the UI, so it enters through the same
door as every poster font:

1. Materialise it through the Google Fonts path (`REQ-DSG-017`): fetch the binaries once for the
   weights above, store them in our storage, record the SHA-256 in `ENT-fonts`, `subsets` includes
   `arabic`.
2. Run the shaping-parity goldens (`REQ-DSG-015`) so the face is selectable in the designer.
3. Subset for the web build with a subsetter that **keeps `rlig`, `mark` and `mkmk`**
   (`REQ-INT-009`); the CI check that fails a font present in one place and absent in another covers
   it from then on.
4. Declare `@font-face` in `globals.css` with `font-display: swap` and a metric-matched fallback
   (`size-adjust` against IBM Plex Sans Arabic so the swap does not reflow the poster title).
5. Set `--font-display`. Nothing else in the tokens changes.

No production font ever loads from a CDN, including in the prototypes' successors: the prototypes use
a Google Fonts `<link>` only because they are standalone reference pages.
