You are the **wave-26 planner** for كريم معرفة. You implement nothing. Output:
`docs/plan/notes/wave-26-lead.md`, the `DECISIONS.md` entries it needs, the new head of `STATUS.md`
(update it before you end).

**State of `main`:** take it from the tree, not from this prompt — `main` is at `29aa7ddb` or
later; the log ends at `DEC-244` so the next decision is **`DEC-245`**; migrations run to `0197`
(`0192` is `platform_palette`, taken) so the next is **`0198`**; **`0194` is missing from the
sequence** — the lead rules on it, you only flag it. Verify the primitive count and the gate's
floor against the tree.

**The owner's rulings, logged as `DEC-245` §1:** (1) **M13 and stories together, in this wave**
— nothing remains after it. (2) **The platform
console is redesigned** (`DEC-240` §5's reading (b)) on the console frame — built screens, deleted
and rebuilt. (3) **The landing's
appearance changes** under `REQ-NFR-019`'s permitted path.

**This wave claims M13 + stories + the mark** — **seventeen artboards** in `m13/`: eleven
screens (`000 · 001 · 006 · /app/me/privacy · 059 · 080 · 081 · 082 · 083 · 084 · 085`), five story
boards (`StoryLive · StoryPhoto · StoryRecap · StoryAdd · StoryAttendee`; the other three generated
frames are in `prototypes/stories.html`), and `AdminAttendance` — `SCR-044`, rebuilt in wave 21,
**extended** here with the «قصص الحضور» strip. ★ **`080`–`085` are a REDESIGN of built screens**
(wave 8, `DEC-147`): delete-then-rebuild under `DEC-208`, not new pages. `SCR-000 · 001 · 006 · /app/me/privacy · 059 ·
080 · 081 · 082 · 083 · 084 · 085`. Spec `docs/design/screens/M13.md`; artboards
`docs/design/screens/m13/*.dc.html`; PNGs in `docs/design/screens/m13/png/`.

**Read in this order.** This brief · `M13.md` · `STORIES-USER-STORIES.md` (STO-01…18 — write
`REQ-STO-*` from them one-to-one, then the stories of PR D from the `REQ`s) · `M11a.md` §0 · the artboards ·
`notes/wave-23-lead.md`, `DEC-240` §5, `DEC-241` · `REQ-NFR-019` and `DEC-167` (the public
contract) · `tests/unit/public-graph.test.ts` and the visual-diff baseline · `REQ-NFR-014`,
`REQ-TEN-*`, `REQ-AUT-003`, `REQ-ADM-015`, `REQ-DSG-021`, `REQ-PRV-*` · `03-permissions-rls.md` for
the platform role · `docs/design/05-stories.md`, `prototypes/stories.html` ·
`messages/ar/marketing.json`, `branding.json`, `platform.json`, `privacy.json`, `stories.json` · `CLAUDE.md`, `TEAM.md` §1–§3.

## Settle
- **PR split.** **A** the public site (`000` + `001` + `006`) — one commit carries the `DEC`, the
  re-baselined visual diff and the appearance change together; `public-graph.test.ts` untouched;
  the accessibility floor re-run. **B** `059` + `/app/me/privacy`. **C** the platform console
  (`080`–`085`) on `admin-rail`. Retarget before merging with `--delete-branch`.
- **The frozen behaviour**: list what `001` does today on submit and on error, and show the story
  keeps it to the letter.
- **Platform isolation** (`REQ-NFR-014`): the metrics and orgs tables carry counts only; the brief
  names the DAL functions and their tests.
- **Impersonation**: the reason and duration are stored, the org's audit receives the entry, the
  session ends at the duration — existing behaviour (`DEC-1xx`, name it) kept under the new screen.
- **Stories per screen**, `REQ-*` ids, undrawn states (verify revoked / not found; register
  success / error; privacy export states), definition of done as before.
- **Stories** (`DEC-NEXT-40`, PR **D**): the requirements first — `01-prd.md` gets `REQ-STO-*`
  from `05-stories.md` (frame types, triggers, sources, 24 h expiry, visibility = the org,
  reactions as `REQ-SCR-021` zeros, no authoring); then `story_views` at the next free migration; the generator (a
  frame per trigger, idempotent); `story-viewer` with its tap/hold/swipe model and keyboard
  alternative; the ring on `010` and «شاهد القصة» on live `012` wired; the desktop centring.
  Definition of done: a live session produces its frames within a minute of each trigger, a
  member views them, the ring turns seen, frames vanish at 24 h.
- **Attendee stories** (`DEC-NEXT-41`, in PR D): `story-capture` (photo tap / video hold, 15 s
  cap, caption), the posting gate (checked-in, start → +24 h), the photo path reusing the album
  upload (points, cap, EXIF), the video path (≤ 15 s, ≤ 60 MB, one MP4 rendition, transcoding —
  name the service or the library, and the cost), the admin strip on `044` with removal that
  cascades, reports/takedowns through the photo queues, `REQ-STO-*` written for all of it, and the
  migration columns at the next free migration (`story_frames` with `kind`, `author_id`, `caption`, `asset`). Video
  moderation: say what happens on report (hidden on first report, like photos).
- **After this wave**: write the sentence into `STATUS.md` — every screen has a design and is
  built; nothing remains.

- **PR E — the mark** (`docs/design/LOGO-PROMPT.md` — the one authoritative copy — and
  `docs/design/assets/brand/logo/README.md`, `docs/design/prototypes/logo-motion.html`; if either
  is missing, the logo pack was not unpacked — stop and say so): replace both wordmark
  components — `src/components/wordmark.tsx` (public, live text) and
  `src/components/brand/wordmark.tsx` (`PlayWordmark`, inline SVG; fills the console-frame brand
  slot) — with one `<Logo>` that inlines `docs/design/assets/brand/logo/logo.svg`; add the mark to
  `platform/layout.tsx`, which has none; motion CSS beside the keyframes in `globals.css` (from
  533) under `.theme-play`, gated like the moments (597 / 834) and collapsed at 1568, mechanisms in
  `src/lib/ui/`; the loading move replaces `ui/route-progress.tsx`'s indicator and the bare
  `loading.tsx` boundaries over 400 ms; `src/app/icon.svg` becomes the mark; add `apple-icon.png`
  and a `manifest.webmanifest` from the pack's icons; `scripts/og-card.html` gets the mark and
  `scripts/og-render.mjs` is re-run — and **add `/og.png` to `scripts/visual-diff.mjs`'s ROUTES
  with a baseline**, since today only `qa:contract` shape-checks it. One `DEC` with PR A's.

## Do not
Re-litigate a `DEC`. Change a public URL, the registration behaviour or the accessibility floor.
Write «restyle». Let a `.dc.html` class into `src/`. Put a ★ string into `en/` first. Leave a
`<bdi>` off a code, a slug or a number.

## Deliverables
1. `docs/plan/notes/wave-26-lead.md`. 2. `DECISIONS.md` from `DEC-245`. 3. `STATUS.md`'s head.
