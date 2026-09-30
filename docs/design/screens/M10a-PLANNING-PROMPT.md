You are the **wave-18 planner** for كريم معرفة. You do not implement anything in this session. Your
output is the brief the implementing lead reads first: **`docs/plan/notes/wave-18-lead.md`**, plus the
`DECISIONS.md` entries it needs and the new head of `STATUS.md`.

**State of `main`:** `badab40e` — wave 17 merged (PR #35, `DEC-199`…`DEC-202`), wave 17b merged
(PR #37, `DEC-203`, `DEC-204`). Production is at migration `0163`; migrations start at **`0164`**;
the next decision is **`DEC-205`**. M0–M19 are done. `DEC-199` §7 names the order from here:
**M20** session stories · **M21** the member screens, opening with `SCR-002`/`003`/`004` · the console ·
the studio · the public site last.

**What this wave claims — M10a, by the owner's ruling (see the order note below).** The owner has approved **batch M10a** of the screen designs — the first
batch of M21 — thirteen artboards for `SCR-002 · 003 · 004 · 007 · 010 · 011 · 012 (three phases)
· 014 · 016`, phone at 390 and desktop at 1280 for `010` and `012`. Its spec is
**`docs/design/screens/M10a.md`**; its artboards are `docs/design/screens/m10a/*.dc.html` (the
source of truth for layout, sizes and copy — each is a self-contained HTML page; open it in a
browser, ignore the `support.js` line) with a PNG of each in `docs/design/screens/m10a/png/`.

**Read in this order.** This brief · `docs/design/screens/M10a.md` in full · the thirteen artboards
· `docs/plan/notes/wave-17-lead.md` (the programme so far) · `docs/design/README.md`,
`00-direction.md`, `04-components.md`, `05-stories.md`, `06-decisions-proposed.md` ·
`DECISIONS.md` **`DEC-183` §4, `DEC-195`, `DEC-199` §2, §5, §7, `DEC-203`** · `16-ui-redesign.md`
§3.1, §5, §6, §7 · `09-sitemap-screens.md` §3, §4, §8 · then `STATUS.md`, `CLAUDE.md`, `TEAM.md` §1–§3.

---

## The rule that governs the wave — `DEC-199` §2

**A screen is REBUILT to its design, never restyled.** Every screen in M10a is rebuilt from its
artboard: its regions in the artboard's order, its copy from `messages/ar/` (new strings marked ★
in the spec are written in Arabic first, `en/` follows), its primitives by the names in
`M10a.md` §10. Nothing from the current page files survives by default; what survives is the data
layer, the actions, the tests of behaviour, and every `REQ-*` the screen already satisfies.

## Three owner rulings, 2026-09-30 — not to be re-derived

1. **The shell has five phone tabs** — الرئيسية · الجلسات · اقترح (raised) · الترتيب · حسابي — and on
   desktop a **nav rail (start) + content + game rail (end)** instead of `16 §6.1`'s two-row header.
   Search stays in the bar, staff links stay in a ruled section. Log it as the entry
   `M10a.md` §11 proposes (`DEC-NEXT-16`) — it supersedes `REQ-UIX-021`'s "two rows on desktop".
2. **Home is the feed** (`06-decisions-proposed.md` `DEC-NEXT-6`, now accepted). `/app` becomes its
   own page; `/app/sessions` stays the canonical browse URL (`DEC-112`, `DEC-130` unchanged).
3. **The event hero is the whole poster at 4:5**, phone and desktop — no cropped band
   (`16 §4.2.2` retired). The «+50 عند الحضور» sticker belongs to the **poster template**, not to a
   component (`REQ-UIX-024` unchanged).

Anywhere else the artboards and `docs/plan/` disagree, list it in the wave's decision entry the way
`DEC-183` §4 and `DEC-199` §5 do — one line per deviation, which document wins, why. Never pick a
side silently.

## What you must settle in the brief

- **The order — ruled by the owner, 2026-09-30: wave 18 is M10a.** `DEC-199` §7 put M20 (stories)
  before M21; the owner reverses that for this one step. M20 becomes **wave 19**. In wave 18 the
  `story-ring` row on `010` and «شاهد القصة» on the live `012` render `05-stories.md`'s **ring
  states only** (live · unseen · seen · none) from existing session activity, and the ring opens
  nothing yet; the viewer lands with M20. Log this as **`DEC-205`** — one paragraph, the reason (the
  shell and the event page are what every later screen inherits, so they land first), and the
  amended order: M10a · M20 · the rest of M21 · console · studio · public site last.
- **One PR or two.** Count the screens against `TEAM.md`'s wave sizes. If two, the split is
  **shell + auth + `007` + `010` + `011`** then **`012` (three phases) + `014` + `016`** — the second
  needs the first's shell.
- **The four new primitives** (`week-hud`, `feed-item`, `action-bar`, `attendee-stack`) and the
  three prop additions (`avatar` team ring; `card` `post` and `row` variants; `session-cta` phases as
  drawn). Each is a story with a gallery section and a scope test; the file count in
  `src/components/ui/` moves from 49 and `DEC-199` §5.27's gate is updated in the same commit.
- **The feed's data.** `010` reads session posts, recaps, achievements (level-ups, badges, rank
  changes) and admin announcements, grouped by date, committed-first. Name the DAL functions, the
  indexes if any, and whether the achievement items need a view or exist already in the ledger.
  No new table without a `REQ-*` and a migration story at `0164`.
- **Which of the five moments fire where** — `M10a.md` says so per screen; confirm each against
  `DEC-195`'s once-per-occurrence and static-state rules. **No sixth moment.** The wrong-code shake on
  `014` is input feedback, not a system-failure animation; say so in the brief so `REQ-UIX-053`'s
  reviewer does not bounce it.
- **Stories per screen**, each with its `REQ-*` ids, the artboard it is built from, the states from
  the spec that are not drawn, and its definition of done: the screen matches its artboard at 390 and
  at 1280 in a capture, `ui-lint --strict` passes, the scope tests pass, `qa:contract` is untouched.
- **What is explicitly out**: `/app/members` (SCR-019, batch M10b), the viewer (`013`), rate (`015`),
  propose (`017`/`018`), profile (`020`), the hub (`021`–`028`), every console and studio route, the
  five public routes.

## What the brief must not do

- Re-litigate a `DEC`. `DEC-124` numerals, `DEC-186` §4's `1.08` ceiling (still open with the owner,
  not yours to close), `DEC-199` §5's derived treatments, `DEC-203`'s font doors.
- Touch the five public routes or anything `tests/unit/public-graph.test.ts` protects.
- Restyle. If a story reads "restyle X to match", it is written wrong.
- Let a prototype's class name into `src/`, or a `.dc.html` file into the bundle.
- Drop the ★ new strings into `en/` first, or leave a `<bdi>` off an interpolated title, name or code.

## Deliverables of this session

1. `docs/plan/notes/wave-18-lead.md` in the register of `wave-17-lead.md`: state, read order, the
   why, the rulings, the stories, the gates, what the lead must not delegate.
2. The `DECISIONS.md` entries, appended: the shell ruling, the order decision if any, the deviation
   list.
3. `STATUS.md`'s head rewritten for wave 18. **Update it before you end**, finished or not.
