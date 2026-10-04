# The كريم معرفة mark

`logo.svg` — the mark as delivered by the owner (2026-10-04), cleaned to attribute strokes, viewBox
215.78 × 294.03, every stroked path with `pathLength="1"` so motion needs no measuring. `logo-animated.svg`
— the same with `class="arc <coral|lime|violet|orange> <face|shadow>"` on each stroke, for
`prototypes/logo-motion.html`'s CSS. `png/` — transparent renders at 256/512/1024/2048 tall, and on
ink / bone squares. `icons/` — the app icon: the mark at 70 % on an ink rounded square, 32/180/192/512/1024.

## Where it goes
Everywhere the written wordmark stood: the app's top bar (24 px → the mark at 36 px tall), sign-in
(66 px), the console and platform bars (30 px), the public pages (33 px), the email header and the
certificate header of the brand kit (the kit's default logo is this mark), the OG image, the favicon
and the app icons. The name «كريم معرفة» stays in text only where it is a word in a sentence, and
as the mark's `aria-label`.

## Motion (`prototypes/logo-motion.html`)
- **Reveal** — sign-in and cold start only: the four faces draw in order coral → lime → violet →
  orange (620 ms each, 140 ms apart), each shadow trails its face by 90 ms, then one settle
  (scale 1 → 1.06 → 1, 420 ms). 1.4 s total. Never repeated on navigation.
- **Loading** — the four faces breathe in sequence (1.6 s loop, 200 ms apart, shadows at 50 %):
  replaces every spinner and skeleton-only wait longer than 400 ms.
- **Tap** — one settle bounce when the mark is pressed as the home control.
- `prefers-reduced-motion`: static mark, nothing moves. No sixth moment: the mark never animates
  inside the five moments.
