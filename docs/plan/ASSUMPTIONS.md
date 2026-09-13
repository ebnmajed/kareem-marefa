# ASSUMPTIONS

**Status:** `settled` · **Owns:** the `A*` ID space
**Cites:** `_source-brief.md` §5, `DECISIONS.md`

Every assumption from the brief's §5 is carried here under its own ID. **None was silently
replaced.** Where a better default was found, the original is stated first and the alternative
sits next to it with its rationale, exactly as the brief's §2.3 requires.

## Status vocabulary

| Status | Meaning |
|---|---|
| **kept** | Adopted as written. |
| **kept + resolved** | Adopted; a choice the assumption left open is now made. |
| **kept + constrained** | Adopted; a further constraint narrows it. |
| **kept + narrowed** | Adopted; one case is carved out. |
| **kept + caveat** | Adopted; something in it does not work as stated, and the workaround is named. |
| **kept + gap noted** | Adopted; it assumes tooling or infrastructure that does not exist yet. |
| **kept + strengthened** | Adopted; corroborated and made more demanding. |
| **proposed alternative** | Original stated, alternative proposed beside it with rationale. |
| **superseded by owner** | The owner decided otherwise. The original is preserved here. |

---

## A1 — Moderator tier · **kept**

An org **مُنظِّم** (moderator) exists between admin and member: moderation queues, event-day
operations (check-in status, manual attendance backup), removal of comments and photos. No
settings, no scoring configuration, no member management, no session scheduling.

Kept as written. The Arabic term is **مُنظِّم** — see `00-overview.md` §4 for why not «مُراقِب».
Serves `REQ-TEN-005`.

## A2 — Org resolution at sign-in · **kept**

The sign-in page is global; the Google email domain determines the مؤسسة. If a domain appears on
more than one org's list, the user picks once and the choice is permanent (D4).

Kept. One implementation note carried into `02-domain-model.md`: the permanence of the choice is
enforced by the **`org_id` claim being immutable** (DEC-014), not by UI that hides the picker.

## A3 — Profile fields · **kept**, extended by A33

Name and avatar from Google; **شركة** (required, from the org list); job title; short bio; topics
of interest from org categories. Profiles are visible to all members of the org.

Kept. "Visible to all members of the org" is the *default* tier; **A33** defines what each tier
actually shows, per DEC-011/D69.

## A4 — Proposal form fields · **kept**

Title, abstract, category, level (introductory / intermediate / advanced), target audience,
expected duration, co-presenters, optional draft materials, notes to admin. Admins may also
create a session directly and assign a presenter.

Kept. The live pre-launch registration form already collects **عنوان الموضوع**, **تصنيف** (فني /
إداري / إبداعي / درس من تجربة) and **نبذة** — the platform's proposal form is the superset, and
its Arabic labels should match the copy members have already seen.

## A5 — Co-presenters · **kept**

A session can have more than one **مُقدِّم**; all presenters earn presenter points and
certificates.

Kept. Consequence carried into `05-scoring-engine.md`: the per-attendee presenter bonus is
awarded **per presenter**, and its cap applies per presenter, so a two-presenter session costs
twice the bonus. This is deliberate — co-presenting is not half a job.

## A6 — Session states · **kept**

`draft → submitted → in_review → changes_requested → approved → published → (full) → in_progress
→ completed → archived`, with `cancelled` reachable from any state after approval. The worker
moves `published → in_progress` at start time and `in_progress → completed` at end time; admins
can override either.

Kept. Two modelling notes in `02-domain-model.md`: `full` is a **derived display state**, not a
stored one (it is `confirmed_count >= capacity`), because storing it invites it to disagree with
the RSVP table; and `cancelled` is reachable from any post-approval state **including
`completed`**, for the case where a session is retroactively voided.

## A7 — Check-in code rotation · **kept**

A 6-character code rotating every 10 minutes (org-configurable), previous code valid for a
2-minute grace period.

Kept. **DEC-015** settles the *mechanism*: codes are **stored rows per rotation window**, not
derived from a secret, so an operator can burn a leaked code with one update.

## A8 — Manual attendance backup · **kept**

Admins and moderators can mark attendance manually with a mandatory reason; every manual mark is
audited and flagged in exports.

Kept. Reinforced: a manual mark produces the **same check-in event** as a code entry, so D24 is
not weakened — points, ratings, certificates and photo rights all still key off one event type.
The `method` column (`code` | `manual`) is what carries the distinction into reporting.

## A9 — Form-type pre-session tasks · **kept**

Responses are stored and visible to the presenter and admins; completion is neither enforced nor
scored (D30).

Kept.

## A10 — Default scoring rulebook · **kept**

| Actor | Action | Default |
|---|---|---|
| حاضر | verified تسجيل الحضور | **20** |
| حاضر | تقييم submitted | **5** |
| حاضر | تعليق | **2**, cap 5 per جلسة |
| حاضر | صورة | **3**, cap 5 per جلسة |
| حاضر | سلسلة bonus — 3 check-ins in a calendar month | **15** |
| مُقدِّم | مقترح accepted | **10** |
| مُقدِّم | جلسة delivered | **50** |
| مُقدِّم | per checked-in حاضر | **2**, cap 60 |
| مُقدِّم | average تقييم ≥ 4.0 with ≥ 5 ratings | **20** |
| مُقدِّم | materials uploaded after the جلسة | **10** |
| — | الحجز, تفاعل, viewing | **0** |
| — | negative actions | present in the catalogue at **0** (D40) |

Kept exactly. All values org-editable without a deploy.

## A11 — Company leaderboard metric · **kept**

Show both total points and points per active member; rank on the metric the org admin selects.
Default: **per active member**.

Kept. One hardening carried into `05-scoring-engine.md`: points-per-active-member has a
**time-dependent denominator**, so it is **frozen into the snapshot** rather than recomputed
live — otherwise deactivating a member silently rewrites last quarter's standings. Deactivation
requires a reason for the same reason.

## A12 — Poster and certificate size presets · **kept**

Poster master 1080×1350 (4:5). Variants: square 1080×1080, story 1080×1920, landscape 1920×1080,
open-graph 1200×630, print A4 300 dpi (2480×3508), A3 (3508×4961). Certificates: A4 landscape
(3508×2480) and A4 portrait, 300 dpi. Each preset has a defined safe area.

Kept.

## A13 — Verification page · **kept**

Public, unauthenticated, rate-limited. Shows recipient name, certificate type, session title and
date (or achievement name), org name, issue date, valid/revoked status. Nothing else.

Kept. **DEC-010** is what makes it safe: the page is reachable only by the **random verification
code**, never by the sequential serial, so the recipient list cannot be enumerated. An unknown
code returns a neutral "not found" that does not distinguish *never existed* from *revoked*.

## A14 — No recurring series · **kept**

Each session is scheduled individually. Also on the §4.22 out-of-scope list.

## A15 — Discovery · **kept + caveat**

Admin-defined **تصنيفات** plus free-form **وسوم**; org-wide search across sessions and materials
(title, abstract, tags, presenter, company); filters by category, date, venue, level, presenter,
company; personal **المحفوظات** (no points).

**The caveat, decided now rather than discovered later:** Postgres ships **no Arabic FTS
dictionary**. `to_tsvector('arabic', …)` does not exist. The assumption's "Arabic-aware
normalization (tashkeel stripping, alef/yaa/taa-marbuta folding)" is therefore **our own
normalization function** feeding the `simple` configuration, with `unaccent` and `pg_trgm` for
fuzzy matching. Specified in `02-domain-model.md`.

Second caveat: Arabic text extracted from PDFs is unreliable — extractors commonly return visual
rather than logical order, so words come out reversed. **Material search therefore stays on
metadata**, which is exactly how A15 scopes it ("title, abstract, tags, presenter, company").
Full-text search *inside* documents is not planned.

## A16 — File limits · **kept + narrowed**

Documents 50 MB, audio 200 MB, images 20 MB, poster uploads 30 MB, all org-configurable.
Replacing a material keeps prior versions in a version list.

Kept, **narrowed by DEC-006**: `.key` (Keynote) is accepted within the document limit but is
**download-only** — no page images, no viewer. Also narrowed by **DEC-009**: image uploads are
PNG/JPG/WebP, validated by **content sniffing, not extension**; SVG is rejected.

## A17 — Ratings structure · **kept**

Session 1–5 stars, presenter 1–5 stars, optional free text, one rating per attendee per session,
editable for 14 days after completion.

Kept. With a hard constraint from D36 carried into `03-permissions-rls.md`: the presenter sees
**aggregates only**, the org admin sees **who rated what**, and the 14-day edit window does not
change either. See **OQ-009** on the honesty of anonymity at small N.

## A18 — Realtime · **kept**

Comments, reactions, RSVP counts and check-in counts update live via Supabase Realtime.

Kept — with the consequence flagged loudly in **DEC-020**: Realtime needs a **browser Supabase
client**, which reverses this repo's documented invariant that no `NEXT_PUBLIC_` variables exist
and the browser never talks to Supabase. RLS then becomes the only thing between a browser and
the data. **The owner confirmed the trade (DEC-021)**; server polling was the named alternative
and is rejected, so A18 is kept in full with no reduced-scope variant.

## A19 — Reminders · **kept**

7 days, 1 day and 2 hours before; rating prompt 1 hour after completion; org-configurable; each
member controls their own notification preferences.

Kept.

## A20 — Time and calendar · **kept**

Gregorian dates with Arabic locale formatting; org default time zone `Asia/Riyadh`; all
timestamps stored in UTC.

Kept. One clarification in `10-i18n-rtl.md`: "Gregorian with Arabic locale formatting" means
`ar` locale month names (يناير, فبراير) — the **Levantine/Gulf set**, not the Maghrebi
(جانفي, فيفري) — pinned explicitly, because `Intl` output varies by region subtag.

## A21 — UI kit · **proposed alternative**

> **Original:** Tailwind CSS with **shadcn/ui**, extended with Arabic-first tokens.

**Proposed alternative:** Tailwind CSS (kept) with **Radix primitives used directly** — see
**DEC-019**.

**Rationale, in one line:** shadcn is not installed, its Tailwind layer introduces a second token
vocabulary (`--background`/`--foreground`) competing with the shipped `--color-canvas` /
`.theme-dark` system, and it pulls `lucide-react`, which brand policy bans — while Radix alone
supplies the accessibility and `DirectionProvider dir="rtl"` that were the actual reason to want
shadcn.

**Named alternative if this is rejected:** shadcn re-themed onto the existing tokens with the
icon dependency stripped — more work than adopting Radix directly, and permanently diverged from
upstream.

## A22 — Services · **kept + resolved**

Resend for transactional email; Sentry for errors; PostHog for product analytics (optional).
Worker on Railway **or** Fly.io — *"recommend one"*.

Kept. The open choice is **resolved: Fly.io** (**A34**, **DEC-018**), with **graphile-worker**
as the queue (**A35**). Each service keeps its one-line justification and named alternative in
`04-architecture.md`.

## A23 — Quality · **kept + gap noted**, environments clause **proposed alternative**

Vitest for unit tests, Playwright for e2e, GitHub Actions CI, environments dev/staging/prod with
separate Supabase projects.

Kept, with **one clause superseded** and one gap noted.

**The gap:** Vitest is installed but configured `environment: "node"` only — there is no jsdom, no
`@testing-library`, and **no Playwright**. Adding them is M0 work.

**The superseded clause — "separate Supabase projects" (DEC-025).**

> **Original:** environments dev / staging / prod, each with its own hosted Supabase project.

**Proposed alternative:** **dev is local** (`supabase start`), **CI uses an ephemeral Postgres
container**, production stays as it is, and a hosted **staging** project is deferred until there is
a reason for one.

**Rationale, in one line:** each hosted project costs roughly $10/month and the only thing it buys
over local is *sharing* — while the safety M1 actually needs, "never run an untested migration
against production", is fully delivered by local plus CI.

**Named alternative if this is rejected:** three hosted projects as A23 literally specifies, at
roughly $20/month more than today. A reasonable call if a second developer joins; not required now.

**Recorded honestly:** the plan carried A23's environments clause through several documents
*without costing it*. The owner caught that. Adding a hosted project later is a dashboard click and
an env var.

## A24 — Scale target · **kept**

Tens of orgs; hundreds to low thousands of members per org; tens of sessions per org per month;
design to reach 10× without re-architecture.

Kept. This is what makes the gapless per-org certificate counter (DEC-010) affordable: hundreds
of certificates per month means row-lock contention is irrelevant.

## A25 — Branding · **proposed alternative**

> **Original:** No brand yet. Neutral platform design tokens; each org sets its own logo and
> primary colors, which flow into templates, emails and the UI accent.

**Proposed alternative:** the **existing كريم معرفة brand becomes the platform default theme** —
see **DEC-003**.

**Rationale, in one line:** a client-approved brand already shipped in this repo, so "neutral
tokens" would mean discarding a finished design system to rebuild a weaker one.

**What survives unchanged:** the second half of A25. Each org still sets its own logo and colours,
which still flow into templates, emails and the UI accent — the token layer just distinguishes
**platform defaults** from **org overrides** (**A40**).

## A26 — No data migration · **kept**

> Greenfield; nothing to import.

**Kept — with the premise corrected.** There *is* data: the live `registrations` table holds real
pre-launch signups including provider topic proposals. The owner's decision (**DEC-002**) is to
**keep it as a historical record and start the platform clean**. So the conclusion A26 draws is
right even though its premise was wrong, and the distinction matters: "there is nothing to
import" and "we choose not to import" lead to the same schema but different obligations — the
table is **frozen legacy**, never dropped, never altered, never read by platform code.

## A27 — Template library baseline · **kept + constrained**

Poster families — talk, workshop (with a pre-session tasks strip), panel/roundtable,
meetup/series, generic announcement — each light and dark, themed from the brand kit, RTL-first
with a mirrored LTR variant reserved for English. Certificate families — attendance,
presenter/speaker, achievement — landscape and portrait, formal Naskh, with locked regions for
logo, signature block, certificate ID and QR. Every template declares its dynamic fields and its
safe area per preset.

Kept, **constrained by the brand policy this platform now inherits** (DEC-003): no open books, no
graduation caps, no lightbulbs, no traditional education iconography, no cartoon illustration —
and, by project policy, **no icon libraries, no emoji, no photography**. Permitted glyphs: dots,
lines, chevron, check, spinner. The visual language is the **Knowledge Network** — connected dots
and thin silver lines.

## A28 — Designer engine approach · **kept + strengthened**

DOM/SVG editor so the browser's own text stack shapes Arabic; documents as JSON layer trees;
exports rendered from the same document in headless Chromium inside the worker. Fonts self-hosted
and identical in the editor, the worker and the LibreOffice converter.

Kept and **strengthened by evidence from this very repository**: the pre-launch site's OG card
could not be rendered with satori / `ImageResponse` because satori cannot shape Arabic, and is
rendered instead from `scripts/og-card.html` through headless Chrome. A28's conclusion was
already learned here the hard way.

Strengthened further by **DEC-017**: the renderer is **bundled in the worker image** rather than
called as a route in the Next app (guaranteed font identity beats automatic code identity), and
D66 is restated in three testable tiers because pixel identity against an arbitrary browser is
not a testable claim.

## A29 — Export formats · **kept**

Screen: PNG sRGB at exact preset size plus a WebP copy; no JPEG unless an org opts in. Print:
PDF 300 dpi, RGB (print-shop caveat surfaced in the UI), 3 mm bleed, 5 mm safe margin, fonts
embedded, images at native resolution. Certificates: PDF (A4 landscape or portrait, fonts
embedded, QR ≥ 25 mm with a 4-module quiet zone, certificate ID as text beside it) plus a 1600 px
PNG preview. Exports run as jobs with progress and status; every export is stored and reused
until the source document or template changes.

Kept. "Certificate ID printed as text next to the QR" resolves to the **الرقم التسلسلي** *and*
the **رمز التحقق**, both printed — see DEC-010.

## A30 — Typography system · **superseded by owner** (for the certificate builder only)

> **Original:** Arabic UI face a variable sans with full Arabic coverage (IBM Plex Sans Arabic or
> Noto Sans Arabic), self-hosted and subsetted; a Kufi display face for headings and posters
> (Reem Kufi or Cairo); a Naskh face for certificates (Amiri or Noto Naskh Arabic); Latin
> companions; fallback stacks everywhere. Rules: letter-spacing 0 on Arabic; body line-height
> 1.7, headings 1.4; base 17 px on mobile; never clip stacked diacritics; no justification;
> kashida off by default; text boxes auto-fit for Arabic's ~1.2× length; bidi-isolate mixed
> strings; numeral system an org setting, default Western.

**The app UI follows A30 in full — every rule above, unchanged.** IBM Plex Sans Arabic is already
the shipped face, so the UI half of A30 is not a plan, it is the status quo.

**Superseded for the certificate builder only** (**DEC-007**): org admins pick fonts through the
**Google Fonts developer API**, filtered to `subset=arabic`. A chosen font is **materialised** —
downloaded once, stored with a SHA-256, registered in the font manifest, loaded from *our*
storage by both the editor and the worker, and gated behind the shaping-parity goldens before it
becomes selectable. Templates pin the exact font hash. See **A39**.

**Every A30 typographic rule still applies** to what the builder produces. Font *choice* opened
up; the typography did not.

## A31 — Designer feature set · **kept**

Layers with alignment guides and snapping; brand kit injected into templates; safe-area and bleed
overlays; undo/redo; autosave; admin-locked regions; live preview of every variant; dynamic-field
preview with real data; image upload with focal-point cropping; QR layer; export queue with
status.

Kept, with **DEC-009**'s constraint on the image layer (PNG/JPG/WebP, no SVG) and its PPI guard
(warn below 300 PPI at the print frame, block below 200).

## A32 — Uploaded posters · **kept**

Minimum 1080 px on the short side; type and size validated server-side. Missing variants
generated by smart-cropping around the master with safe margins; the admin can adjust the crop
per variant before publishing.

Kept. "Validated server-side" is implemented as **content sniffing, not extension matching**
(DEC-009).

---

# New assumptions

These arose from the plan and from decisions taken with the owner. They follow the same rules:
each is a provisional default that a later session may challenge **through `DECISIONS.md`**.

## A33 — Profile visibility matrix · new

The field-level implementation of **D69 / DEC-011**. Three tiers: **self**, **member** (any other
member of the same org), **admin** (org admin; moderators see the member tier plus moderation
context).

| Field | self | member | admin |
|---|---|---|---|
| الاسم, avatar, الشركة, job title, bio, topics of interest | ✅ | ✅ | ✅ |
| Level (**مستوى**), badges (**شارات**), current **سلسلة** | ✅ | ✅ | ✅ |
| Total **نقاط** and leaderboard rank | ✅ | ✅ | ✅ |
| Sessions **presented** | ✅ | ✅ | ✅ |
| Photos **uploaded** by this member | ✅ | ✅ | ✅ |
| Sessions **attended** | ✅ | ❌ | ✅ |
| Full **سجل النقاط** (every ledger row) | ✅ | ❌ | ✅ |
| **تقييمات** this member *gave* | ✅ | ❌ | ✅ |
| Aggregate ratings this member *received* as presenter | ✅ | ❌ | ✅ |
| **تغيّب** and **إلغاء متأخر** history | ✅ | ❌ | ✅ |
| Email address | ✅ | ❌ | ✅ |
| Notification preferences | ✅ | ❌ | ❌ |
| **Google Calendar OAuth tokens** | ❌ *(never displayed to anyone, including self)* | ❌ | ❌ |

Four rules the matrix encodes:

1. **Ratings given are never member-visible.** D36 makes ratings anonymous to the presenter, and
   a presenter is an ordinary member on someone else's session page. A member-visible "ratings
   given" list would unwind D36 in one click.
2. **تغيّب / إلغاء متأخر is admin-only.** It is negative, HR-adjacent data. Publishing it stacks
   informal social punishment on top of the points system's designed consequence, and falls
   hardest on people whose schedules are not their own. **Self sees their own record**, so the
   system stays transparent to the person it judges.
3. **Sessions attended is not member-visible; sessions presented is.** A talk is a stage —
   presenting is a public act. Attendance reveals who was in a room with whom, and by inference
   interests and affiliations.
4. **Calendar OAuth tokens are hidden from org admins too.** The one row in this product where
   admin access is *narrower* than member self-access, deliberately: a token is a credential for
   a third-party account, not org data. It is never rendered anywhere; only the *connection
   status* is.

**No photo tagging at launch.** "Photos" on a profile means photos that member **uploaded**.

## A34 — Worker hosted on Fly.io · new (resolves A22)

**Fly.io**, not Railway. Justification: burst economics for a ~2 GB Chromium + LibreOffice image,
and — decisively — it lets the document converter run as a **separate app holding no database
credentials**, so the code parsing hostile PPTX gets the fewest secrets in the system.
**Named alternative:** Railway.

## A35 — graphile-worker as the queue · new (resolves D63)

**graphile-worker**, Postgres-backed, so no extra infrastructure (D63's own requirement).
Justification: job keys map directly onto D63's idempotency requirement — re-saving a poster
leaves **one** pending render, rescheduling **moves** a reminder rather than adding one — and
jobs can be enqueued from SQL **inside the originating transaction**, removing the dual-write
window entirely. **Named alternative:** pg-boss.

**The operational catch, stated up front:** graphile-worker needs a **session-mode** connection
(port 5432) for `LISTEN`/`NOTIFY`, *not* the transaction pooler on 6543. A **boot-time probe** is
mandatory, because the failure mode is silent degradation to polling — jobs still run, just late,
and nothing errors.

## A36 — Cache Components OFF · new

See **DEC-013**. Routes become dynamic by touching `cookies()` in the DAL, never via
`export const dynamic`, so a future migration is a config change rather than a rewrite.

## A37 — Radix primitives directly · new (supersedes A21)

See **DEC-019**. Roughly eight inline SVGs cover the permitted glyph set (dots, lines, chevron,
check, spinner).

## A38 — Marketing site and platform coexist in one deployment · new

The landing page stays as the unauthenticated marketing shell; sign-in leads into the platform
(**DEC-001**). Consequences that bind every milestone:

- `/`, `/ar`, `/en`, `/ar/register`, `/og.png` are a **frozen public contract**, guarded in CI by
  the existing `scripts/qa.mjs`.
- `main` stays deployable at all times.
- Every migration is **forward-only** and safe against the real rows already in the database.
- `registrations` is never dropped.

## A39 — Google Fonts materialisation · new (implements DEC-007)

A font chosen in the certificate builder is not referenced — it is **captured**:

1. Pick, from the Google Fonts developer API, filtered `subset=arabic`.
2. Download the binary **once**; store it in Supabase Storage; record its **SHA-256**.
3. Register it in the **font manifest** — the single list the editor, the worker's Chromium and
   the LibreOffice converter all read.
4. Run the **shaping-parity goldens** against it. It becomes selectable only if they pass.
5. Templates pin the **font hash**, so reissuing a 2027 certificate in 2031 is byte-reproducible.

The editor **self-hosts** the stored binary rather than hot-linking Google's CDN, whose
dynamically subset slices are not byte-stable — which would break D66 invisibly.

**Why step 4 is not optional:** a font with partial `GSUB` or `mark` coverage renders Latin
perfectly and silently breaks lam-alef and stacked tashkeel. A Latin smoke test would pass.

## A40 — Centralised brand tokens · new (implements DEC-008)

**One source of truth** for brand colours and fonts, feeding four consumers:

1. The CSS `@theme` / `@theme inline` layers (platform default theme).
2. The per-org **هوية المؤسسة** in the database (org overrides).
3. The designer's brand kit (templates resolve colours and logo through it).
4. The email templates.

Changing a brand colour or a face is **one edit in one place**. The org logo is an image layer fed
from the brand kit, so replacing the logo updates every template at once.
