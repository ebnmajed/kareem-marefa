# `console` — wave 3 (M7-console + SCR-011)

Written before code, updated as bundles land. Read `notify.md` §6.1, `scoring.md`'s wave-3
handoff and `content.md` §5 first — they describe what I inherit and where the gaps already are.

## Story order

1. **This plan** + **the admin route list** (below) — day one, before any screen.
2. **SCR-011** — `/app/sessions`, browse (`REQ-DSC-003/005/007`, `REQ-SES-011`).
3. **The admin shell** — `app/admin/layout.tsx`, the staff gate, the sub-nav.
4. **STORY-ADM-003** — SCR-040, the org dashboard.
5. **STORY-ADM-004** — SCR-047/048, categories and companies (managed lists, `REQ-ADM-007/008`).
6. **STORY-ADM-005** — SCR-049, members and roles, the moderator-scope proof (`REQ-ADM-009`,
   `REQ-ADM-020`) and the last-admin guard (`REQ-TEN-005`).
7. **SCR-044** — attendance (`REQ-CHK-008/012`), the point where the moderator's nav question
   below gets answered for real.
8. **STORY-ADM-006** — SCR-050–052, moderation queues (takedowns vs. reports kept apart, DEC-005).
9. **STORY-ADM-007** minus templates — SCR-061 exports, SCR-062 audit, SCR-063 settings, plus the
   member picker on SCR-053's adjustment form and the RTL date-time picker on SCR-043.
10. **STORY-ADM-008** — the fourth, offset-agnostic reminder message (DEC-047, a migration on
    `0026`'s matrix and `reminder_message_key()`).

SCR-046 (venues) is already built (`sessions`, wave 1) and needs no new work this wave beyond
living inside the new admin shell.

## The admin route list — `app/admin/layout.tsx`, published here so `designer` can build against it

Every route under `/app/admin`, in 09 §5's order. `mod` = visible to a moderator's sub-nav (not
just reachable — `REQ-ADM-020` is enforced in the DAL/RPC either way; this column is what the
nav shows). `owner` = who edits the page.

| Route | Screen | Top nav? | `mod` | Owner | Status |
|---|---|---|---|---|---|
| `/` | SCR-040 dashboard | yes | no | console | bundle 1 |
| `/proposals` | SCR-041 review queue | yes | no | console (inherited) | built (wave 1) |
| `/sessions` | SCR-042 management | yes | **yes, scoped** — see below | console (inherited) | built (wave 1), moderator scoping is SCR-044's story |
| `/sessions/[id]/schedule` | SCR-043 ★ | nested | no | console (inherited) | built (wave 1); RTL date-time picker is this track's backlog item |
| `/sessions/[id]/attendance` | SCR-044 | nested | yes | console | not yet |
| `/sessions/[id]/certificates` | SCR-045 | nested | no | **designer** | designer's |
| `/venues` | SCR-046 | yes | no | console (inherited) | built (wave 1) |
| `/categories` | SCR-047 | yes | no | console | not yet |
| `/companies` | SCR-048 | yes | no | console | not yet |
| `/members` | SCR-049 | yes | no | console | not yet |
| `/moderation/comments` | SCR-050 | yes | yes | console | not yet |
| `/moderation/photos` | SCR-051 | yes | yes | console | not yet |
| `/moderation/reports` | SCR-052 | yes | yes | console | not yet |
| `/scoring` | SCR-053 | yes | no | console (inherited) | built (wave 2) |
| `/recognition` | SCR-054 | yes | no | console (inherited) | built (wave 2) |
| `/templates/posters` | SCR-055 | yes | no | **designer** | designer's |
| `/templates/certificates` | SCR-056 | yes | no | **designer** | designer's |
| `/designer/[documentId]` | SCR-057 ★ | nested (reached from schedule/templates) | no | **designer** | designer's |
| `/branding` | SCR-059 | **not linked** | no | wave 4 | out of scope |
| `/emails` | SCR-058 | yes | no | console (inherited) | built (wave 2) |
| `/reminders` | SCR-060 | yes | no | console (inherited) | built (wave 2) |
| `/exports` | SCR-061 | yes | no | console | not yet |
| `/audit` | SCR-062 | yes | yes (own actions only) | console | not yet |
| `/settings` | SCR-063 | yes | no | console | not yet |

**The moderator/`/sessions` decision, flagged for the lead too:** 09's sitemap has no standalone
"attendance" screen a moderator can navigate to — SCR-044 lives at `/sessions/[id]/attendance`,
nested under a session a moderator has no other reason to open. Inventing a new top-level route
isn't in `01`, so the plan is to reuse the inherited SCR-042 route: the DAL scopes what
`/app/admin/sessions` shows by role — full management rows and actions for an admin, and for a
moderator a read-only, attendance-focused list (title, date, an "attendance" link) with none of
`REQ-ADM-005`'s edit/cancel/complete controls rendered *or* reachable — enforced in the DAL
(`REQ-ADM-020`'s "rejected by policy, not by hidden navigation" is `assert_fresh_admin()`/RLS
already refusing a moderator's scheduling call; the DAL scoping here is the honest nav to match
it, not the boundary). Implemented at the SCR-044 story, not before — until then the `/sessions`
nav item stays admin-only in the layout, since the moderator-facing rows don't exist yet to show.

**Templates (`designer`'s three folders) are excluded from the "console-only" edit list but
included in the shell's nav from day one**, per the spawn note: `designer/`, `templates/`,
`sessions/[id]/certificates/`. Their pages render inside my `layout.tsx`; I never edit them.

**`/branding` is wave 4's and is deliberately not linked** — DEC-048 Decision 2.

## The three carried-over items

1. **SCR-043's RTL date-time picker** (DEC-045) — native `datetime-local` today. Scheduled with
   the SCR-043 touch in bundle 9, once the managed lists and members work is done.
2. **SCR-053's member picker** (`scoring.md`'s handoff) — the manual-adjustment form takes a raw
   UUID today. Needs whatever member-search component `/app/admin/members` (bundle 6) builds;
   wiring it into `/scoring` is a UI change on an existing RPC call, not a new RPC.
3. **`08`'s fourth reminder message** (DEC-047) — a proposed migration on `0026`'s reminder
   matrix and `reminder_message_key()`, plus the reminders screen showing it. Last, since it is
   the only item here needing new SQL.

## Notes as bundles land

### Bundle 1

- SCR-011 built against `searchSessions()` (`src/lib/dal/search.ts`, content-owned, unchanged) —
  its return type is `{id, title, abstract, level, language, startsAt, state}`, no venue/category/
  presenter name, so the card shows only what that shape carries; nothing wider was added to
  `search.ts` (out of my edit list). `<SearchFilters>` already renders its own removable-chip row
  (`content`'s `filters-form.tsx`), so the browse page embeds it once rather than building a
  second chip row.
- `<SessionPoster>` (`@/components/posters/session-poster`) — checked `git log` before writing
  the card; `designer` had published its no-op placeholder by the time I reached this step
  (`session-poster.tsx`, `picker.tsx`, `mode-badge.tsx` all landed together), so the card imports
  it directly.
- The admin dashboard (`src/lib/dal/admin-dashboard.ts`) needed no new SQL — every figure is a
  plain aggregate over tables the admin's existing RLS policies already let them read
  (`sessions`, `proposals`, `rsvps`, `check_ins`, `points_ledger`, `members`), so there is nothing
  under `supabase/proposed/console/` yet.
- **e2e blocker, both bundles:** `.next/BUILD_ID` predates this session's files, so
  `test:e2e:local` 404s every new route against a stale build (the three inherited-screen specs
  still pass, since they exercise code untouched by this session). Not something this track can
  fix — only the lead runs `npm run build`. Both new spec files are written and reported to the
  lead; they need a sync-point rebuild to actually turn green.

### Bundle 2

- SCR-047/048 (`src/lib/dal/admin-lists.ts`) needed no new SQL either: `categories` and
  `companies` already carry `p2_admin_insert`/`p2_admin_update` (0004), and the generic
  `POL-{companies,categories}` cases in `tests/rls/tenancy.test.ts` (the lead's) already prove
  the write policy — this track's insert/update is a plain call into it, same as `createVenue`/
  `setVenueActive` (`sessions`'s SCR-046 code, inherited) already did.
- The dashboard's "busiest categories"/"most active companies" figures, which bundle 1 had to
  link forward, now point at real screens; "active members" still 404s until SCR-049 (bundle 3).

### Bundle 3

- SCR-049 (members and roles) turned out to need **no new writes**: `set_member_role`,
  `deactivate_member`, `reactivate_member` already exist in migration `0005` — the last-admin
  guard, the audit row and the `claims_version` bump REQ-ADM-009/REQ-TEN-005 ask for were already
  built and already proven in `tests/rls/rpcs.test.ts`. This screen is a thin caller, and its own
  job was turning a raised identifier (`last_admin`, `cannot_deactivate_self`, …) into a real
  Arabic sentence per row rather than one generic "failed."
- **One real gap, closed with new SQL:** `03`'s role×resource matrix says an org admin has full
  read on `members`, but `0004`'s column grant never actually included `email` for ANY role but
  the member's own `me()` RPC (`0005`'s own comment on `me()` says so). REQ-ADM-009's "view a
  member's full record" had no path until `admin_list_members()`
  (`supabase/proposed/console/0001_admin_members.sql`) — `me()`'s shape widened to "my org, admin
  only." A column grant can't do this: it would hand every member in the org everyone else's
  email, not only an admin's (the same reasoning DEC-044 gave for `list_session_ratings_admin()`).
  Flagged to the lead with the `03` §8.2 rows in the commit.
- Every dashboard figure now has a real destination — `/app/admin/members` was the last one
  bundle 1 had to link forward.
- The SCR-049 list is what `scoring.md`'s carried-over member-picker item (SCR-053's manual-
  adjustment form) will eventually search against — not built yet; noted for the bundle-9 touch.

### Bundle 4 — SCR-044, and the moderator/`/sessions` question closed for real

- **The manual-mark RPC already existed.** `mark_checked_in_manually()` (`0015`, `checkin`'s
  wave-1 work) already does everything `REQ-CHK-008` asks: admin-or-moderator, a mandatory
  reason, `REQ-CHK-011`-safe, and it only works while the session is `in_progress` — the screen
  surfaces that constraint rather than fighting it (a note, not a hidden form). `listUncheckedConfirmedRsvps()`
  (also `checkin`'s) is exactly the picker source SCR-044's manual-mark form needs.
- **The attendance report itself is new** (`getAttendanceReport()`, `src/lib/dal/checkin.ts`,
  added under this track's "admin-only functions in checkin.ts" allowance) — a caller-side join
  of `rsvps`/`check_ins`, both already staff-readable for the whole session. A no-show is
  computed the *same way* `worker/src/tasks/evaluate_no_shows.ts` defines one (confirmed RSVP, no
  check-in) so the report and the points job can never quietly disagree about what counts.
- **REQ-RAT-005 needed nothing new either** — `getRatingsForAdmin()` (`event`'s `ratings.ts`,
  already calling the audited `list_session_ratings_admin()` from DEC-044) is imported directly
  and gated `admin`-only within this otherwise staff-accessible screen.
- **The moderator/`/sessions` gap flagged at bundle 1 is closed.** `admin/sessions/page.tsx` now
  branches on role at its very top: an admin gets the exact same page as before (byte-for-byte
  unchanged code path below the branch), and a moderator gets `ModeratorSessionsView` — a new,
  separate render with id/title/state/start-time and one link to `/attendance`, backed by the new
  `listSessionsForAttendance()` (`src/lib/dal/sessions.ts`). No pipeline, no direct-create form,
  no `SessionControls`: `REQ-ADM-005`'s scheduling actions are absent from the render, not hidden
  by CSS, because `listSessionsForAdmin()` (the only thing that could produce them) is never
  called on the moderator path.
- **One new proposed migration, generic on purpose:** `write_admin_export_audit()`
  (`supabase/proposed/console/0002_admin_export_audit.sql`) is REQ-ADM-017's "every export is
  audited," written to take a plain export-type label so SCR-061's org-wide exports (sessions,
  RSVPs, ratings, points, certificates, members — bundle 7) can call the same function rather than
  each getting their own. The attendance CSV (`src/app/api/admin/exports/attendance/[sessionId]/
  route.ts`) is its first caller.
- `src/lib/dal/admin-exports.ts`'s `buildCsv()`/`csvField()` (BOM, RFC 4180 quoting, CRLF records)
  is the shared CSV builder every future export in this track should reuse rather than
  reimplementing — flagged here so bundle 7 finds it before writing a second one.
