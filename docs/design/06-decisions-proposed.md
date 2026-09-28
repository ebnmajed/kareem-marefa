# 06 — Decisions this direction requires (proposed)

> Draft entries in the shape of `docs/plan/DECISIONS.md`. Numbering is left as `DEC-NEXT`; the owner
> assigns ids on acceptance. Until an entry is in `DECISIONS.md` it is a proposal, and the existing
> decision it names still stands. A coding session that meets one of these conflicts **stops and asks**
> rather than picking a side.

Each entry: what is decided, why, what it changes, and what it must not be read as.

---

### DEC-NEXT-1 — Five orchestrated moments, and the house vocabulary includes confetti and stickers
**Amends:** `REQ-UIX-018`, `REQ-UIX-019`, `DEC-100`.
**Decision:** the orchestrated moments are five — reservation, check-in, session completion, level-up,
rank change — each playing once per occurrence with a named static state. The motion vocabulary adds
a confetti burst (transform and opacity, WAAPI, no library), a sticker overshoot of at most 1.08, and
the toy-gloss object set. Hover scaling stays forbidden. Failure states, tables, admin surfaces and
error states still never animate. `REQ-UIX-020` is unchanged.
**Why:** the owner chose the full-party tone; two moments and no celebration cannot carry it.
**Not:** a licence for scattered micro-animations. Everything outside the five is a 220–260ms
acknowledgement.

### DEC-NEXT-2 — The house 3D object set is an allowed optional poster layer
**Amends:** `REQ-DSG-026` (forbidden imagery list).
**Decision:** the six rendered objects (coin, cup, flame, ticket, star badge, rocket) are platform
assets available as an optional image layer in poster templates. The rest of the rule stands: no
books, caps, lightbulbs or education iconography; no icon libraries; no emoji; no photography in
templates; certificates untouched.
**Why:** the app's game layer and its posters must speak one language.
**Not:** cartoon illustration in general.

### DEC-NEXT-3 — The display face is Baloo Bhaijaan 2
**Realises:** `REQ-INT-005`'s unnamed Kufi face.
**Decision:** Baloo Bhaijaan 2 (700, 800) is the display face for the UI and for poster titles,
materialised through the Google Fonts path and gated by the parity goldens (`REQ-DSG-017`,
`REQ-DSG-015`). IBM Plex Sans Arabic stays the UI face. Certificate faces unchanged.
**Alternates evaluated:** Changa, Alexandria.

### DEC-NEXT-4 — Team colours are company data
**Amends:** `ENT-companies` (adds `team_color text check (#rrggbb)`), `REQ-PRF-009` (unchanged rule,
restated: the company is the ring, never the fill).
**Decision:** each company carries a team colour, seeded for the first org with the mapping in
`01-tokens.md` and editable by an org admin on `SCR-048`. It renders as a CSS variable on the
element. Avatar tints stay neutral and keyed to the member id.

### DEC-NEXT-5 — The marketing site is re-skinned to the direction in M13
**Touches:** `REQ-NFR-019`, `DEC-167`, `DEC-078`.
**Decision:** [OWNER TO CHOOSE] A. M13 re-cuts the frozen routes to the playground identity (URLs,
registration behaviour and accessibility floor unchanged; visual baseline re-cut in the same commit).
B. The marketing site keeps the "Knowledge Network" identity and the app is its own brand behind
sign-in.
**Recommendation:** A. A member who lands on a navy marketing page and signs into a lime playground
will assume two products.

### DEC-NEXT-6 — The home timeline carries recap, achievement and announcement items
**Amends:** `DEC-112`, `REQ-UIX-021` (one column stays), §25 (polls stay out).
**Decision:** `SCR-010` remains one column of sessions grouped by date, and gains three item kinds
between sessions: a session recap (derived: completed session + photos + counts, no new row), an
achievement item (badge earned, level reached, streak — from `member_badges`, `points_balances`,
`streak_awards`; shown for members who have not opted out of leaderboards), and an admin
announcement. Announcements need a small entity (`feed_announcements`: org, author, body, poster
optional, published_at, expires_at; RLS org-read, admin-write). Polls remain out of scope.
**Not:** free posts by members.

### DEC-NEXT-7 — Comments stay one level deep
**Confirms:** `REQ-EVT-002`.
**Decision:** the owner's "fully threaded" is met by one level of replies with the composition surface
of `REQ-UIX-024`; deeper nesting is refused by the existing trigger and not designed.
**Why:** a phone cannot show a third level legibly, and the reference apps (Instagram) are one level.

### DEC-NEXT-8 — A weekly leaderboard window, and faces on boards
**Amends:** `REQ-LDR-002` (adds `weekly`), `leaderboard_kind` (adds `weekly`), `DEC-099` (no avatars
on boards).
**Decision:** a weekly snapshot (Friday, org time zone) joins monthly, seasonal and all-time. Rows
carry the initials avatar with the team ring. Opted-out members are absent for others as before.
**Deferred:** leagues (cohorts with promotion). Decide after the leaderboard screens are designed; if
adopted they need `league_cohorts` and a weekly job.

### DEC-NEXT-9 — Streaks count consecutive sessions, with one free skip per season
**Amends:** `REQ-REC-005` (default rule), `ENT-streak_rules` (adds `kind: consecutive_sessions`,
`skips_per_period`).
**Decision:** the default streak is consecutive attended sessions the member reserved, evaluated at
completion (`REQ-PTS-015`), with one skip per season that consumes no streak. The monthly three-check-
in rule stays available as a second rule kind.

### DEC-NEXT-10 — Reactions stay worth nothing
**Confirms:** `REQ-EVT-004`, `REQ-PTS-010`.
**Decision:** the reaction set (like + four house stickers) earns zero points structurally. Comments
and photos keep their per-session caps. The UI treats a reaction as a whisper.

### DEC-NEXT-11 — Calendar: connected sync stays Google; Outlook and Apple stay links
**Confirms:** `REQ-CAL-001` … `REQ-CAL-003`.
**Decision:** Microsoft connected sync is a later provider (`calendar_provider` gains `microsoft` when
built); at launch Outlook and Apple are add-to-calendar links plus ICS.

### DEC-NEXT-12 — Sign-in stays Google at launch; magic link is a later, domain-gated method
**Confirms:** `REQ-AUT-001`; **relies on:** `REQ-AUT-002`.
**Decision:** a magic-link method may be added later without a schema change; when it is, it is
domain-gated exactly as Google is (`REQ-AUT-003`) and never creates an account for a non-listed domain.

### DEC-NEXT-13 — Proposal voting is an org-toggled feature
**Adds:** `proposal_votes (org_id, proposal_id, member_id)` unique per member, RLS org-read,
self-write; `org_settings.proposal_voting_enabled boolean default false`.
**Decision:** when enabled, members can mark «سأحضر» on a proposal in `submitted` / `in_review`;
the count is visible to members and on the admin queue. Off by default. Votes never affect state.

### DEC-NEXT-14 — Stories are generated, with a `story_views` register
**Adds:** `story_views` (see `05-stories.md`, option A) and the `story` photo derivative.
**Decision:** session stories are derived from existing rows in a 24h-before to 24h-after window, with
the eight frame types of `05`; no authored frames; seen state persisted per member.

### DEC-NEXT-15 — Desktop shell
**Touches:** `REQ-UIX-021`, `09` §2.
**Decision:** [OWNER TO CHOOSE after the screen designs] A. three-column social shell (nav rail, feed,
game rail) at ≥ 1280px, collapsing to two columns on tablet — amends `REQ-UIX-021`'s "one column" to
"one column of content". B. one column with a sticky game bar under the header — complies as written.
