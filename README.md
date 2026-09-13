# كريم معرفة | Knowledge Kareem — Pre-launch Site

Bilingual (Arabic RTL primary / English LTR) pre-launch site for the group's internal
knowledge-sharing initiative: a landing page plus an interest-registration form. When the
platform launches, registrants get emailed; providers get a follow-up call about their topic.

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · next-intl 4 ·
Supabase (Postgres, insert-only via Server Action — no auth) · Vercel.

## Routes

| Route | Rendering | Notes |
|---|---|---|
| `/` | redirect | 307 → `/ar` (Arabic is primary; no Accept-Language guessing) |
| `/ar`, `/en` | static | Landing page |
| `/ar/register`, `/en/register` | dynamic | Form; dynamic because the anti-spam token is minted per request |
| anything else | 404 | e.g. `/fr` → `/ar/fr` → localized not-found |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values (see below)
npm run dev
```

Environment variables (`.env.local` locally, Vercel project settings in production):

- `SUPABASE_URL` — the Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — the **publishable** key (`sb_publishable_…`). Never the
  secret key: the publishable key operates as `anon` under RLS, which is insert-only here.
- `FORM_TOKEN_SECRET` — HMAC secret for the min-time-to-submit token: `openssl rand -hex 32`.
- `SITE_URL` — optional; canonical URL for OG metadata in production.

No `NEXT_PUBLIC_` variables exist anywhere; the browser never talks to Supabase.

## Database

Run [supabase/migrations/0001_create_registrations.sql](supabase/migrations/0001_create_registrations.sql)
in the Supabase SQL Editor. It creates the `registrations` table with:

- one row per `(email, role)` — duplicates surface as a friendly "you're on the list" info state;
- provider rows require `topic_title` + `topic_category` (`topic_description` optional);
- RLS **insert-only for `anon`** — no select/update/delete policies, plus explicit revokes.

The team reads submissions in the Supabase dashboard (Table Editor) — that *is* the admin UI.

## Anti-spam (all invisible to real users)

1. Honeypot field with an autofill-proof nonsense name (`field_xk2`).
2. Signed min-time token: reject < 3 s (bots) and > 2 h (replay). Minted per request via
   `connection()` — this is what makes `/register` dynamic.
3. Per-IP+email tripwire with a generous per-IP cap (corporate NAT!) returning a real,
   retryable error — never a fake success.
4. DB unique index as the backstop.

## Testing & QA

```bash
npm test              # Vitest: unit (Node) + components (jsdom, RTL document)
npm run test:e2e      # Playwright, against the stub — never a real project
npm run visual capture <name>   # screenshots of the frozen routes; `compare <a> <b>` diffs two
```

Interactive headless-Chrome QA (40 checks: routing/RTL/toggle, the CSS-only provider reveal,
keep-but-hide role switching, validation timing, success/duplicate submit paths, the full
**no-JS** progressive-enhancement round-trip, mobile layout, reduced motion, and the
cinematic layer — sting once-per-session/skip/never-on-register, WebGL live + fallback):

```bash
node scripts/supabase-stub.mjs &                       # fake PostgREST on :54321
SUPABASE_URL=http://127.0.0.1:54321 npm run start &
node scripts/qa.mjs
```

## Cinematic layer (media-production-grade motion)

- **Opening sting** ([intro-sting.tsx](src/components/intro-sting.tsx)): a ~3s
  production-logo sequence (dot ignites → ripple → network draws → wordmark light-sweep →
  curtain lift). Plays once per session on the landing page only, gated by an inline
  pre-hydration script in the layout; any click/key skips it; reduced motion disables it
  entirely. Natural end sets `data-sting-done` (never remove `data-sting` on natural end —
  the hero-entrance delays are derived from it and would restart).
- **WebGL constellation** ([network-gl.tsx](src/components/network-gl.tsx)): hand-rolled
  WebGL (no library) — designed constellation clusters + bridge lines, depth-of-field point
  softness, a glowing focal node, light pulses traveling along connections, breathing dolly
  and scroll/pointer parallax. Pauses off-screen/hidden-tab, DPR capped at 2, falls back to
  the SVG artwork without WebGL or with reduced motion. Shader gotcha: point softness must
  stay **below 0.5** or `smoothstep(0.5, vSoft, d)` degenerates and draws squares.
- **Scroll-directed film** (CSS scroll-driven animations, `@supports`-gated): section
  headings cut in, seam threads grow, "how it works" steps illuminate in sequence, the CTA
  network draws its lines on arrival, and a playhead progress line tracks the page.
- **Micro**: metallic light-sweep on primary buttons; word-by-word focus-pull hero headline.
- **Do NOT add `loading.tsx` to the register route**: with JS disabled the streamed
  Suspense fallback never swaps out, covering the form and breaking progressive enhancement
  (this was tried and reverted).

## Design system notes

- Brand palette + semantic tokens live in [src/app/globals.css](src/app/globals.css).
  Dark/light is **per-section** via `.theme-dark` reassigning semantic CSS variables — the
  semantic Tailwind colors are declared in an `@theme inline` block (load-bearing: a plain
  `@theme` freezes the light values at `:root`).
- RTL: logical properties/utilities only (`ps-*`, `me-*`, `start-*`, `text-start`). The two
  sanctioned exceptions: the email input is hard `dir="ltr"`, and the network SVG mirrors in
  LTR (it's authored RTL-first).
- The hero "knowledge network" SVG is committed, hand-tuned output of
  [scripts/gen-network.mjs](scripts/gen-network.mjs) (seeded — same output every run).
- The OG card ([src/app/opengraph-image.png](src/app/opengraph-image.png)) is rendered from
  [scripts/og-card.html](scripts/og-card.html) with headless Chrome (satori can't shape
  Arabic): `chrome --headless --screenshot=og.png --window-size=1200,630 og-card.html`.
- No icon libraries, no emoji, no photography. Permitted glyphs: dots, lines, check, spinner.
- The typographic wordmark is the logo *placeholder*; swap `icon.svg` and the wordmark when
  the real logo lands.

## Deploy checklist (dashboards, not code)

**Supabase**: create the project under the org account (region nearest Saudi Arabia) → run the
migration → copy the publishable key only → verify the RLS badge on `registrations` → invite
the follow-up team as dashboard members.

**Vercel**: import the repo → set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`FORM_TOKEN_SECRET`, `SITE_URL` for Production + Preview → attach the production domain →
smoke-test a Preview end-to-end (submit → row in Table Editor) before promoting.

**Before announcing**: initiative owner signs off on the marketing copy (the recognition
tiles promise points / a company race / annual recognition at teaser level, mirroring the
brief) — copy lives in [src/messages/ar.json](src/messages/ar.json) and
[src/messages/en.json](src/messages/en.json).

The site is `noindex` (robots meta + robots.txt) but ships full OG tags so links shared in
email/WhatsApp preview properly.
