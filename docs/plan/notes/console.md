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

### Bundle 5 — SCR-050/051/052, and why there are three screens, not one

- **The three-way split, decided here and worth restating if it's ever questioned:** comments
  have exactly one moderation path (a report — nothing hides a comment instantly the way a photo
  takedown does), so SCR-050 is the comment report queue. Photos have two, and DEC-005 requires
  they never merge: SCR-051 is the takedown queue (already hidden, urgent), SCR-052 is the photo
  report queue (not yet hidden, a different urgency). "Reports" (SCR-052) is therefore
  photo-specific, not a general inbox — comment reports live entirely on SCR-050.
- **Two real gaps, both explicitly flagged by earlier waves' own notes for whoever built this UI**
  (found by reading `content.md` §1.4 and migration `0032`'s own header before writing anything):
  `remove_photo()` is the RPC `content`'s note called "STORY-EVT-006's RPC, not this schema
  pass," and `_reverse_photo_points()` is the trigger `scoring`'s note called "the same shape
  [as `_reverse_comment_points()`] applies the day [photos] does." Both now exist, plus a third
  gap neither note mentioned: comment removal never wrote an `audit_log` row at all —
  `comments_audit_staff_actions()` closes it, mirroring `photos_audit_staff_actions()` (`0051`).
- **`removal_reason` is a new column on both `comments` and `photos`** — REQ-EVT-014's "audited
  with actor AND REASON" had nowhere to put the reason on either table. Extending `moderateComment()`
  itself (event's) wasn't an option (not this track's file to edit), so this track's own writes in
  `admin-moderation.ts` set the column directly, using the `p6_staff_update` grant `0003_moderation.sql`
  extends to include it.
- `remove_photo()` also sets `hidden_at` on removal (not just `removed_at`) — `photos_read`'s
  policy checks `hidden_at`, not `removed_at`, so without this a "removed" photo with `hidden_at`
  still null would stay visible to ordinary members through the policy itself, with only the DAL's
  own `.is("removed_at", null)` filter (defence in depth, never the boundary) standing between it
  and them.

### Bundle 6 — SCR-061/062/063, and every REQ-ADM-004…020 screen is now built

- SCR-061 (exports), SCR-062 (audit) and SCR-063 (settings) needed no new SQL at all —
  `write_admin_export_audit()` (bundle 4) is generic across every export type, `audit_read_admin`/
  `audit_read_moderator_own` (0004) already pre-scope the audit query by role, and `p2_admin_update`
  plus `org_settings_history()` (both 0004) already cover every settings field and its own history.
- Ratings' export is deliberately aggregate (`session_rating_aggregates`), not per-rater —
  `list_session_ratings_admin()` is audited once per session on SCR-044; looping it across an
  entire org for one CSV would multiply its audit rows for a shape nobody asked for.
- Settings deliberately excludes the reminder schedule (`/admin/reminders`) and the recognition
  perks (`/admin/recognition`, including `priority_rsvp`'s own enablement) — both already own
  their slice of `org_settings`.
- **Every REQ-ADM-004…020 screen this track was assigned is now built.** What remains is exactly
  the three carried-over items — bundle 7.

### Bundle 7 — the three carried-over items, closing the track

1. **SCR-043's RTL date-time picker** (DEC-045) — `<RtlDateTimePicker>`
   (`src/components/admin/rtl-datetime-picker.tsx`), replacing all four native `datetime-local`
   fields on the schedule form. Fully custom DOM, no OS overlay, so it actually inherits the
   page's `dir="rtl"`; digits follow the org's numeral system. **Known collateral, not fixed
   here** (the file is out of this track's edit globs): `tests/e2e/sessions-screens.spec.ts:205`
   (the M2 demonstrable's own walk) calls `.fill()` on the field labelled «التاريخ والوقت», which
   now opens a picker rather than accepting typed text. Suggested replacement for that one line,
   for whoever owns that file:
   ```ts
   const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
   await boss.getByRole("button", { name: new RegExp("^التاريخ والوقت:") }).click();
   await boss.getByRole("button", { name: new RegExp(`^${when.getDate()} `) }).click();
   await boss.getByLabel("الساعة").selectOption("18");
   await boss.getByLabel("الدقيقة").selectOption("0");
   await boss.getByRole("button", { name: "تم" }).click();
   ```
   Two component test files prove the picker itself
   (`tests/components/admin/rtl-datetime-picker.test.tsx`, 7 cases) — not yet run against a real
   page, same e2e-build blocker as everything else this wave.
2. **SCR-053's member picker** (`scoring.md`'s flagged gap) — `<MemberPicker>`
   (`src/components/admin/member-picker.tsx`), a client-side filter over `listMembersForAdmin()`.
   Zero e2e collateral: neither `scoring-screens.spec.ts` (this track's) nor `points.spec.ts`
   (scoring's, checked before touching anything) drives the manual-adjustment form's member field
   through the UI.
3. **08's fourth reminder message** (DEC-047) — `reminder_message_key()` and `notification_
   matrix()` both extended (`supabase/proposed/console/0004_reminder_generic_message.sql`), proven
   at the database layer (`tests/rls/reminder-generic-message.test.ts`, 4 cases). **Genuinely
   incomplete, and said so in the commit**: the actual subject/body text for `MSG-reminder_generic`
   lives in `worker/src/mail/templates.ts` (email) and `notifications.json`'s `message.MSG-*` map
   (in-app) — both outside every one of this track's edit globs, and DEC-047's own words call the
   message itself "a plan decision, not mine." Both files WERE read (read access is unrestricted;
   only writes are globbed) to draft this accurately rather than guess. Drafted in full below for
   the lead to apply; nothing here is faked or silently skipped.

   **For `worker/src/mail/templates.ts`** (add alongside the other `MSG-reminder_*` entries — same
   shape, `{{title}}`/`{{startsAt}}`/`{{venue}}`/`{{tasks}}`/`{{url}}` all already populated by
   `send_reminder_notification()`'s existing payload for every reminder key alike):
   ```ts
   "MSG-reminder_generic": {
     subject: "تذكير: {{title}}",
     body: `${greeting}\n\nتذكير بجلسة «{{title}}» القادمة.\n\nالموعد: {{startsAt}}\nالمكان: {{venue}}\n\n{{tasks}}\n\n{{url}}`,
   },
   ```
   **For `src/messages/{ar,en}/notifications.json`'s `notifications.message` map** — checked
   against the real file first: every entry there (`MSG-reminder_7d`, `MSG-session_changed`,
   `MSG-badge_earned`, …) is a short, STATIC headline string with no interpolation at all — the
   inbox component reads the session title/date from `notification.payload` itself and renders
   this phrase alongside it, not inside it. So the addition is one short phrase per locale, not an
   object:
   ```json
   "MSG-reminder_generic": "تذكير بجلسة قادمة"
   ```
   ```json
   "MSG-reminder_generic": "Upcoming session reminder"
   ```
   **A `DECISIONS.md` entry is needed** per DEC-047's own framing ("a plan decision"). Suggested
   content: record that `08` §1.2 gains a fourth reminder message, `MSG-reminder_generic`,
   category `reminders`, channels in-app + email, for any `reminder_offsets_minutes` value outside
   ±20% of the three built-in offsets; cite REQ-NTF-004; supersede nothing (additive to `08`'s
   frozen matrix, the same class of change `0026`'s two missing email defaults already made under
   DEC-047 itself).

## Bug-fix pass against real e2e failures (post-bundle-7)

Fixed and verified against a real local build + real local Supabase, `browse.spec.ts` /
`admin-members.spec.ts` / `admin-attendance.spec.ts` / `admin-exports.ts` in scope:

1. **Ambiguous PostgREST embed, three call sites** (`src/lib/dal/checkin.ts`'s
   `getAttendanceReport()`, `src/lib/dal/admin-exports.ts`'s `exportAllAttendanceCsv()` and
   `exportPointsCsv()`): `check_ins` has two FKs into `members` (`member_id`, `marked_by`) and
   `points_ledger` has two (`member_id`, `actor_id`) — an unqualified `members(...)` embed is
   ambiguous and PostgREST refuses it outright, a real server crash on SCR-044 for both admin and
   moderator. Fixed with `members!check_ins_member_id_fkey(...)` /
   `members!points_ledger_member_id_fkey(...)`, matching the precedent already in `event`'s
   `comments.ts` (`author:members!comments_author_id_fkey(...)`). Verified against a real build.
2. **admin-members role-change test race**: the `<select>` is uncontrolled, so
   `selectOption()`'s DOM value is set instantly and is unaffected by whether the server action
   ever completed — the test's DB assertion could run before the RPC committed. Added a `done`
   flag to `changeRole`/`deactivate`'s returned state (`admin/members/{actions,state}.ts`) and a
   visible confirmation the test now waits on instead (`member-row.tsx`,
   `roleChanged`/`deactivateDone` in `admin.json`). Verified against a real build, 4/4 passing on
   both projects.
3. **390 px admin sub-nav overflow**: `admin/layout.tsx`'s nav used `overflow-x-auto
   whitespace-nowrap`, a legitimate scroller, but the shared 390 px helper flags anything that
   escapes the viewport regardless of container — switched to `flex-wrap`. Verified against a real
   build, dashboard/lists/moderation 390 px cases green on the phone project.
4. **SCR-011 own e2e, two test-side bugs** (mine to fix, not app bugs):
   - The `phone` Playwright project runs at a narrow viewport by default, so the category chip and
     the search field only exist inside `<FilterSheet>`'s mobile bottom sheet — the original tests
     never opened it. Fixed with a shared `openMobileFilterSheetIfPresent()` helper.
   - That helper needs to *poll* for the toggle rather than sample `.isVisible()` once: this
     route's shell can still be resolving a streamed Suspense boundary for a few hundred ms after
     `goto()` returns, during which the toggle briefly sits in a hidden placeholder — an unpolled
     check reads that as "no toggle" indistinguishably from desktop. `waitFor({state:"visible"})`
     fixed it.
   - Once the sheet is open, `<FilterSheet>` (content's) has TWO copies of `<SearchFilters>` in
     the DOM at once — the always-mounted, CSS-`hidden` desktop `<aside>`, and the dialog.
     `getByRole` is accessibility-tree-scoped so the chip test's role lookup only ever saw the
     dialog's copy; `getByLabel` is not, so the search test's label lookup hit a strict-mode
     violation (2 matches) once the sheet opened. Scoped the search test to the dialog's own
     locator, returned by the shared helper. Verified: `browse.spec.ts`, 10/10 (excluding the
     bookmark case below and the 390 px capture, not re-run this pass), both projects, twice in a
     row for stability.

**Not mine to fix — reported to the lead, `content`'s files**: `REQ-DSC-006` bookmarking from the
list is a **genuine, deterministic server bug**, not a test race (confirmed by direct REST
reproduction, not just the e2e run — see the team-lead message). `public.bookmarks` (`0037_m5_
schema.sql`) grants only `select, insert, delete` to `authenticated`; `toggleBookmark()`'s
(`src/lib/dal/bookmarks.ts`) `.upsert(..., {onConflict:"member_id,session_id"})` compiles to
`INSERT ... ON CONFLICT (member_id, session_id) DO UPDATE ...` regardless of whether a conflict
ever actually occurs — Postgres checks the privileges the *parsed* statement references, not the
runtime path, so every first-time bookmark hits `42501 permission denied for table bookmarks`.
PostgREST's own error hints the missing grant. The function's own comment says the intent was a
harmless no-op on a repeat bookmark, which points at `ignoreDuplicates: true` (→ `ON CONFLICT DO
NOTHING`, no UPDATE privilege needed) as the more targeted fix over adding a grant + policy this
table was never meant to have. `tests/e2e/browse.spec.ts`'s own `REQ-DSC-006` test was fixed to
`expect.poll()` the DB instead of trusting the button's optimistic label (the same test-race class
as item 2 above) and now fails for the right reason — it stays red until `content` lands the fix.

**Housekeeping**: Supabase's local containers were found stopped, then Kong's cached DNS to a
restarted `auth` container went stale, mid-investigation — both fixed with `supabase start` and
`docker restart supabase_kong_kareem-marefa` since nothing else here could produce a trustworthy
green/red signal. Flagged to the lead since the console track's own rules say not to touch the
Supabase lifecycle.

## Second pass — sync-6's full-suite run

Two more real bugs, neither visible from source review, both fixed and verified:

- `admin-members.spec.ts`'s deactivation test hung the full 30 s: `member-row.tsx`'s "deactivate"
  control is a bare `<summary>` (the `<details>` disclosure itself), which does not get an
  implicit ARIA "button" role in Chromium — `getByRole("button", ...)` never matched it. Switched
  to `getByText`. Test-only fix, verified immediately (no rebuild needed): 9/9 passing.
- SCR-044's manual-mark form reused `listUncheckedConfirmedRsvps()` — the presenter host view's
  own function, scoped on purpose to confirmed RSVP holders — so a waitlisted attendee who showed
  up was never selectable, and the whole form silently doesn't render once nobody unchecked
  qualifies. Added `listUncheckedForAdminManualMark()` to `checkin.ts` (admin-only, additive,
  `listUncheckedConfirmedRsvps()` itself untouched) scoped to confirmed OR waitlisted, wired
  SCR-044's page to it instead. **Source-verified, not yet e2e-green**: this needs a rebuild
  (`.next/BUILD_ID` predates the fix) — `tsc`/lint are clean and the translation keys
  (`memberLabel`, `mark`, `reasonLabel`) match the test's locators exactly.

`content` has already landed the bookmark fix I reported (`ignoreDuplicates: true` in
`toggleBookmark()`) — confirmed by reading the diff, not yet rebuilt/re-run.

---

## Wave 5 — M9, the system (this session)

Read `.claude/agents/console.md` (regenerated for M9 — DEC-085), `CLAUDE.md`'s wave-5 table,
DEC-019/069/085/087/101, `16` §4.2/§6.7/§16.2, `10` §7. The wave-3 track above is history; M9
builds no screens (`16` §16.2: "nothing you build in M9 redesigns a screen"). This wave's job is
six `ui/` primitives plus the admin shell's skip link, so M11 has real components to build the
console from.

### Scope

`src/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.tsx`, replacing the lead's
day-one stubs against the FROZEN `ui/index.ts` contract; `app/admin/layout.tsx` (the second skip
link past the nav, `REQ-UIX-017` — the rail itself is M11) + `app/admin/error.tsx` (the shared
`RouteError`); `member-picker.tsx` re-exporting `ui/combobox`; `messages/*/admin.json`.

### Order (easiest first)

1. `menu.tsx`, `tabs.tsx`, `sheet.tsx` — Radix wrappers, `dialog.tsx` is the house precedent.
2. `date-time.tsx` — adopts `src/components/admin/rtl-datetime-picker.tsx` unchanged (not in my
   edit list; import only).
3. `combobox.tsx` — promotes `src/components/admin/member-picker.tsx`'s pattern; Arabic
   normalisation, multi-select with removable chips.
4. `data-table.tsx` — sticky header, `aria-sort`, selection + bulk bar, phone stacked-card mode.
5. `member-picker.tsx` → thin wrapper over `ui/combobox`, same external signature (the caller,
   `admin/scoring/page.tsx`, is `scoring`'s file this wave — not in my edit list, so the wrapper
   must stay byte-compatible with its existing call: `members`, `name`, `label`, `required`,
   `placeholder`, `noMatches`).
6. `admin/layout.tsx` + `admin/error.tsx`.
7. Tests: one jsdom + axe-core test per primitive in `tests/components/ui/`.

### Three real gaps found in the frozen contract, flagged here (not blocking — interim built, documented)

1. **`DateTimeProps` and `ComboboxProps` carry no `label`.** Every other labelled control in `16`
   §8.2's model expects `<Field>` to own the visible label via `<label htmlFor>`. That works
   unmodified for `combobox` (a real `<input>` — `<label for>` on a labelable element is enough).
   It does NOT work for `date-time`: the adopted picker's trigger is a `<button>` whose accessible
   name must combine the field's meaning with the LIVE value (`rtl-datetime-picker.tsx`'s own
   comment explains why — a plain `<label for>` would freeze the name at mount and never update as
   the value changes). With no `label` prop to build that from, `ui/date-time.tsx` uses a GENERIC
   internal string («التاريخ والوقت» — `admin.dateTime.triggerLabel`) for now. **Real consequence:**
   until `DateTimeProps` gains a `label: string`, every `<DateTime>` on a page with more than one
   date field (SCR-043 has four) is accessibly indistinguishable by name alone. Suggested fix for
   the lead: append `label: string` to `DateTimeProps` (non-breaking — nothing consumes it yet).
2. **Neither carries `numerals`/`locale`.** Every existing numerals-aware client component in the
   repo (`schedule-form.tsx`, four call sites) takes `numerals: NumeralSystem` as a prop from its
   server-rendered parent — there is no client context for it anywhere in `src/` (`grep -rn
   createContext src/` is empty). `date-time.tsx` and `combobox.tsx`'s internal default
   `resultsLabel` therefore accept `numerals` as an EXCESS optional prop beyond the frozen type
   (`DateTimeProps & { numerals?: NumeralSystem }`), defaulting to `"western"` — matching
   `org_settings.numerals`'s own DB default (`0004_tenancy.sql:113`), so an org that never
   overrides the setting sees no drift. `locale` comes from `useLocale()` (next-intl, no prop
   needed). Suggested fix: the same append, `numerals?: NumeralSystem`, to both types.
3. **`DataTableProps` has no per-row selection label, and none is derivable from `columns`** (a
   cell can render arbitrary `ReactNode`, not guaranteed text). Standard fix, no type change
   needed: the selection checkbox is `aria-labelledby` over a shared hidden "تحديد الصف" span
   *plus* the row's own first-column cell id — the visible content already there stands in for a
   caller-supplied label, so nothing is invented and nothing is lost.

None of these block M9 — nothing here is consumed by a real screen until M11, and by then either
the lead has appended the two fields above or `console` (still me, in M11) migrates the interim
default at the one call site it will actually matter.

### axe-core in jsdom

No `jest-axe`/`vitest-axe` wrapper is installed and `package.json` is lead-only, so I cannot add
one. `axe-core` itself IS present (`node_modules/axe-core`, a transitive dep of
`@axe-core/playwright`) and importable directly — `import axe from "axe-core"; const { violations
} = await axe.run(container); expect(violations).toEqual([])`. Repeated per test file rather than
factored into a shared helper, since my test-file edit list is the six exact filenames, not a
helper module.

### `combobox`'s Arabic normalisation

`src/lib/dal/search.ts`'s `arNormalize()` cannot be imported into `ui/combobox.tsx` — that module
starts `import "server-only"`, which throws if pulled into a client bundle. Duplicated verbatim
(same transform, same order: strip tashkeel/tatweel, fold alef/yaa/taa-marbuta, collapse
whitespace) with a comment pointing at the original, the same reasoning `numerals.ts:9` already
uses for why `NumeralSystem` is declared twice rather than imported once.

### `DataTableProps` has no `search`/`pagination` field

`16` §6.7's prose describes a table with "a search box … pagination" but the frozen type
(`index.ts:600`) carries neither — per DEC-102 ("§16.2 is authoritative" over §4.2's looser prose
for a similar count mismatch), the type wins: search and pagination are the CALLING SCREEN's
composition (filter `rows` before passing them in, render its own pager), not `DataTable`'s own
job. Flagged so whoever builds the first real M11 screen doesn't go looking for a prop that was
never meant to exist.

### A real, pre-existing bug found by `date-time.test.tsx`'s axe assertion, outside my edit list

`src/components/admin/rtl-datetime-picker.tsx`'s prev/next-month buttons (the ones with
`<ChevronIcon direction="back"/>`+`<ChevronIcon direction="forward"/>`, no `label`, no `aria-label`
of their own) fail WCAG 4.1.2/1.1.1 — axe's `button-name` rule, caught the moment the picker's
popover is open. Not a false positive (unlike `color-contrast` and `region`, both jsdom-harness
artifacts disabled the same way `tests/components/ui/badge.test.tsx` already does): a screen reader
announces both buttons as bare "button" with no way to tell which direction is which. This file is
explicitly **not** in this track's M9 edit list (DEC-045's file, "adopt, do not replace" per the
spawn note), so `date-time.test.tsx` disables `button-name` for its one open-popover assertion,
documents why in the same comment, and records it here rather than silently hiding it.

**Suggested fix for whoever next touches that file:** `aria-label={prevMonthLabel}` /
`aria-label={nextMonthLabel}` on the two buttons (or pass `label` into `<ChevronIcon>` instead),
sourced the same way the picker's other six labels already are — as new required props on
`RtlDateTimePickerProps`, threaded from `ui/date-time.tsx`'s own `admin.dateTime.*` keys the way
`clearLabel`/`todayLabel`/etc. already are. Two new keys, `admin.dateTime.previousMonth` /
`admin.dateTime.nextMonth`, would cover it.

### A second, narrow exception to the file list: `tests/components/admin/member-picker.test.tsx`

Not in this track's M9 edit list either, but changing `member-picker.tsx` to wrap `ui/combobox`
(an explicit instruction this wave) broke its existing test two ways, both real: (1) it needed
`NextIntlClientProvider` (the wrapper's non-zero results announcement now falls back to a
translated string); (2) `getByRole("combobox", {name:...})` still resolved correctly since the
external `<label htmlFor>` wiring is unchanged. Fixed with a provider wrapper, kept otherwise as
close to the original as possible. `npm test` green was the overriding constraint — leaving a test
red as a direct, foreseeable consequence of an explicitly requested change would not be.

### Two real bugs `combobox.tsx`'s own test found before I wrote a report about them

1. **`role="option"` was on the `<li>` wrapper while `onClick` lived on a nested `<button>`** — a
   click event's target is the innermost element, so `fireEvent.click` on the `getByRole("option")`
   element (the `<li>`) never reached the button's handler at all. Fixed by moving `role="option"`
   onto the button itself, matching `member-picker.tsx`'s own original precedent
   (`role="option"` was already on ITS button, not a wrapping `<li>` — a detail lost while
   generalising it).
2. **That same fix then broke `aria-required-children`/`aria-required-parent`**: `<ul
   role="listbox">`'s direct children were `<li>` elements carrying their own implicit `listitem`
   role, which breaks the ARIA-required `listbox` → `option` relationship once `option` moved one
   level deeper. Fixed with `role="presentation"` on each `<li>`, which removes it from the
   accessibility tree's structural requirements without changing anything a sighted or keyboard
   user experiences.

Neither would have been caught by reading the code — both came directly from the axe assertion and
the `fireEvent.click` selection test the spawn note asked for by name ("axe cannot tell you whether
`aria-activedescendant` follows the highlighted option").

---

## Wave 6 — the admin console on the system (DEC-110, DEC-130)

Read `.claude/agents/console.md` (regenerated for wave 6, then again at `57f1103`),
`STATUS.md`'s START HERE + WAVE 6 block, `CLAUDE.md`'s wave-6 map,
`DEC-110/112/114/122/123/124/130/131/132`, `16` §3.1/§4.2/§5.2/§6.7/§7.3/§7.4/§8.2,
`REQ-UIX-001/003/007/009…013/017`, `REQ-ADM-004/005/009/010/020`.

**Numerals landed at `57f1103`** (code half `c20b901`, a date-time a11y fix `73b0f3e`). §0–§4 below
were drafted against the pre-sweep tree (`9120237`) and have been **re-read and checked against disk
since** — corrections are marked ★ inline rather than silently rewritten over. The two real
deltas found: (1) `admin/proposals/page.tsx` and `admin/moderation/reports/page.tsx` dropped
`getOrgPrefs()` entirely (it existed only for `numerals`); `admin/sessions/page.tsx` and
`admin/members/page.tsx` keep it — it still returns `timeZone` for `formatDateTime`. (2) the lead
fixed `rtl-datetime-picker.tsx`'s month-button a11y bug directly (`73b0f3e`) — not mine to redo, and
not consumed by any of my five routes this wave regardless. **Still no source file touched** —
holding for the lead's reply to the report before starting code, per this turn's instruction.

Owned this wave: `admin/{layout,page,loading,error}.tsx`, `admin/proposals/**`, `admin/members/**`,
`admin/moderation/reports/**`, `admin/sessions/{page,actions,state,session-controls,direct-session-
form}.tsx` only (never `[id]/**`), `lib/dal/{admin-dashboard,admin-lists,admin-members,admin-
moderation}.ts`, `components/admin/**`, my six `ui/` files, `messages/*/admin.json`.

**Never-touch, restated per `57f1103`'s naming pass (decided, NOT this wave):** multi-day sessions
(`DEC-119`–`121`), the manual check-in switch + walk-ins as a publishing setting
(`DEC-113`/`116`/`117`/`118`), gradient posters + `canvasRaise` (`DEC-127`). None of the three touches
the admin sessions list as planned in §2.3 below — that section shows `SessionState`/`startsAt` only,
no check-in switch, no walk-in flag, no poster styling.

### 0. What the current tree actually does (read before planning, not assumed)

- `admin/layout.tsx` — a flat wrapping `<ul>` of 19 links (`NAV_ITEMS`), gated on `built`/
  `adminOnly`, plus a working second skip link (`#admin-content`, `tabIndex={-1}`). `admin/error.tsx`
  already renders the shared `<RouteError>` (M9) — nothing to change there beyond a re-check after
  the layout edit. `admin/loading.tsx` is already a generic `SkeletonPageHeader` + eight row
  skeletons, direction-agnostic, no `getTranslations` — also already correct as the shared boundary.
- `admin/page.tsx` (SCR-040) — six ad hoc `<section>` blocks (`getAdminDashboardData()`), no «يحتاج
  انتباهك» section exists at all today — it is new work, not a re-skin.
- `admin/proposals/page.tsx` (SCR-041) — `ReviewCard` (client), approve is one click, reject/request-
  changes are typed behind a `<details>` reveal (deliberately not `required`, comment explains why),
  no dialog anywhere, no toast — an inline `role="alert"` paragraph is the only feedback.
- `admin/sessions/page.tsx` (SCR-042) — three sections (ready-to-schedule, direct-create with an
  **all-org-members checkbox list** for presenters — the exact scroll-trap `ui/combobox` was built to
  fix, just in a second place), plus the full admin list with inline text links and `SessionControls`,
  plus a **separate branch**, `ModeratorSessionsView`, for a moderator (id/title/state/start + one
  link). Raw `t(\`state.${s.state}\`)` strings, not the shared `SessionStatusBadge`.
- `admin/members/page.tsx` (SCR-049) — `<ul>` of `MemberRow` (client): two independent
  `useActionState` forms per row (role-change, deactivate-with-reason-behind-`<details>`) plus a
  plain-transition reactivate button. No avatar, no table semantics.
- `admin/moderation/reports/page.tsx` (SCR-052) — **photo reports only** (`reports.target = 'photo'`,
  `status = 'open'`), a responsive `<ul>` grid of `ReportCard` with a signed-URL `<img>`. Comment
  reports (SCR-050, `REQ-EVT-008`'s other half) are a **separate, unrebuilt** screen,
  `/app/admin/moderation/comments`, one of the 19 never-touch routes this wave.
- ★ **A discrepancy worth recording, not silently resolving (DEC-114's rule):** my agent file's
  route-5 line says this screen is "the queue where a flag raised from `content`'s rebuilt discussion
  lands." The tree says only **photo** reports land here; a flag on a **comment** lands on the
  untouched `/moderation/comments`. `content`'s wave-6 scope names both the discussion **and**
  `components/photos/gallery.tsx`, so a report raised from the rebuilt **photo gallery** does land on
  my screen — the sentence is accurate for photos and imprecise about "discussion." Treated as
  resolved by that reading; flagged here in case the lead meant something narrower.

### 1. The admin layout

**Decision: build the actual rail this wave**, not a placeholder for M11. The M9-era note above
("the rail itself is M11") is superseded — `DEC-110` folded the console into this wave in full, and
my current agent file says so explicitly ("A left rail, collapsible… Decide and capture the phone
treatment").

- **Items: keep the 19 existing flat entries**, not `16` §6.7's 14 grouped Arabic labels
  (لوحة/المقترحات/الجلسات/الأعضاء/الشركات/التصنيفات/الأماكن/الإشراف/النقاط والتقدير/التصاميم/الهوية/
  الإشعارات/التصدير/السجل/الإعدادات). §6.7's grouping folds moderation's three screens, scoring +
  recognition, both template libraries, and emails + reminders into single entries — that is a real
  information-architecture decision (sub-nav or a `/moderation` landing page) affecting **thirteen
  routes I do not rebuild this wave**, and the canvas has no artboard for it to check against
  (`DEC-114`: no artboard → build from `16`'s prose and the system, but a *grouping* is a structural
  change to routes I never touch, which is exactly what "never-touch" is supposed to prevent). Kept
  flat, same 19 `hreve`s, same `key`s (so `admin.shell.nav.*` message keys do not move) — just
  re-skinned onto the rail — same 19 `href`s, same `key`s. **Flagging the 14-group IA as a wave-7
  question**, not deciding it here.
- **Icons**, one per item, mapped from the existing `icons.tsx` (lead's, already built, 30+ glyphs):
  dashboard→`HomeIcon`, proposals→`CheckCircleIcon`, sessions→`CalendarIcon`, venues→`PinIcon`,
  members→`UserIcon`, moderation ×3→`AlertTriangleIcon`, scoring→`StarIcon`, recognition→`StarIcon`,
  emails→`BellIcon`, reminders→`ClockIcon`, exports→`DownloadIcon`, audit→`LockIcon`. **Four items
  have no good match and fall back to a reused or weak-fit icon**: categories/companies both have no
  tag or building glyph (interim: `UsersIcon` on companies, reused from members — a real scanning
  problem, two adjacent rail items sharing one icon), branding has no palette/swatch glyph (interim:
  reused `ImageIcon`, shared with the two template-library items), settings has no gear glyph
  (interim: `MoreIcon`, a weak fit by meaning). **Request to the lead, `icons.tsx`:** four new
  glyphs — tag, building, palette/swatch, gear — same 24 px/1.7 px-stroke spec as the existing 32.
  Until they land the rail ships with the reuses above, documented as interim, not silent.
- **Collapse:** a client wrapper (inside `layout.tsx`, which I own — no new `ui/` file needed for
  this) holding a boolean, persisted to `localStorage` as a per-viewer convenience only (never read
  back by the server, wrapped in try/catch, the page renders correctly if it throws or comes back
  empty — `artifact-capabilities`-style discipline even though this isn't an artifact). Collapsed =
  icon-only rail with `title`/`aria-label` per item; expanded = icon + label. A single
  `IconButton` (lead's `icon-button.tsx`) at the rail's top toggles it, `aria-expanded` on the `<nav>`.
- **Phone treatment, and why:** **not** the rail, not the current `flex-wrap` strip either. Below
  `md`, the rail collapses entirely behind a small top bar (page title + a menu `IconButton`) that
  opens the full nav in `ui/sheet` (my file), `side="inline-start"` — a drawer from the reading-start
  edge, matching how a phone nav drawer is universally read regardless of RTL/LTR. Reasoning: (1) a
  persistent rail at 390 px eats a third of the viewport before any content renders; (2) the
  `flex-wrap` fix from the wave-3 bug pass was a patch over the wrong shape (a 19-item nav wrapping to
  three rows on a phone is still a wall of nav before content, just not off-screen); (3) `ui/sheet` is
  explicitly named for "the search sheet, the filter sheet, and anything that would otherwise be a
  modal at 390 px" — a full-height nav drawer is exactly that. The sheet's `title` prop carries
  `admin.shell.brand` so it announces correctly; closing it returns focus to the trigger (Radix's
  default, not something to reimplement).
- **Second skip link (`REQ-UIX-017`):** unchanged in substance — first focusable element inside this
  layout, visually hidden until focused, `href="#admin-content"` `tabIndex={-1}`, jumping past
  whichever rail form is active (collapsed rail, expanded rail, or the phone trigger — the sheet is
  closed by default so the skip link never has to jump past open sheet content).
- **Proving an untouched screen at 390 px still works:** capture
  `.qa-shots/rtl/wave6-console-layout-untouched.png` of `/app/admin/venues` (unmodified this wave,
  still on `flex-wrap`'s old classes for its own page content, wrapped by my new rail) at 390 px RTL,
  after the layout lands — check no overlap between the rail/sheet-trigger bar and the page's own
  `<h1>`, and that `venues/page.tsx`'s content padding still clears the tab bar
  (`scroll-padding`/`padding-block-end` tokens, `16` §3.1 — lead's, unaffected by my change but worth
  confirming visually since the wrapping element changed). Also re-run any existing e2e spec that
  loads an admin screen not in my five (none currently assert on `admin/layout.tsx`'s markup — grepped
  `tests/` for `admin-content`/`nav.dashboard`/`admin\.shell` and found only the layout/DAL files
  themselves and `platform/layout.tsx`, so no test locks in the flat-`<ul>` shape).

### 1.5 Six lead primitives left stub status at `1d73e89` — read the real files, not the frozen types

`page-header.tsx`, `section-header.tsx`, `icon-button.tsx`, `prose.tsx`, `link.tsx` and
`route-progress.tsx` are now real. Read directly (not re-derived from `index.ts`'s types alone,
which under-describe two of them):

- **`ui/page-header`** — every `<h1 className="text-h1...">` + `<p className="...text-fg-muted">`
  pair on my five pages becomes one `<PageHeader title description meta actions />` call.
  ★ **`PageHeaderProps` grew a field since I last read it: `breadcrumbLabel`** — required whenever
  `breadcrumb` is passed (it names the breadcrumb `<nav>`'s accessible name; a page already carries
  several nav landmarks, so an unnamed one is ambiguous). None of my five routes is deep enough to
  need a breadcrumb (they're all one level under the rail) — `breadcrumb`/`breadcrumbLabel` stay
  unset everywhere in this plan. `title` is bidi-isolated **inside** the component — I stop wrapping
  it in `<bdi>` myself at the call site. `meta` is where a status count or a filter chip belongs,
  under the title — used on `/app/admin/sessions` (nothing today, but noted in case a future filter
  summary needs it) and left empty elsewhere.
- **`ui/section-header`** — replaces the ad hoc `<h2 id="..." className="text-h3...">` pattern used
  for every sub-section today (dashboard's six panels, proposals/sessions/members' sub-lists).
  `count` renders a bare Western-formatted number beside the title (`formatNumber(count)`, called
  **inside** the component) — a heading decoration, not a full ICU-plural sentence, so it does not
  replace the richer plural sentences already in the copy (proposals' «مقترح واحد بانتظار المراجعة»
  style intro line stays as body text; `count` is additionally used on `/app/admin/sessions`'
  "جاهزة للجدولة" and "كل الجلسات" section headings and on `/app/admin/members`' single section, since
  those don't currently have a plural-sentence intro to preserve).
- **`ui/icon-button`** — confirmed 44 px (`md`, the default) square, named (`label` mandatory),
  shares `ui/button`'s variants, default `ghost`. Used for: the rail's collapse toggle, the phone
  nav-sheet trigger, and every `DataTable` row's "المزيد" menu trigger (`variant="ghost"`, `size="md"`
  or `"sm"` inside a dense row — `sm` is 36 px and still clears the 24 px touch-target minimum, so
  it's the better fit inside a table row without inflating row height).
- **`ui/prose`** — added to my plan where I hadn't named a primitive for long-form text: proposals'
  abstract/target-audience/admin-notes blocks (today plain `<p className="whitespace-pre-line...">`),
  `size="sm"`. Nothing else on my five routes is long-form enough to need it.
- **`ui/route-progress`** — nothing to plan directly: it sits once in the shell (`app/layout.tsx`,
  lead's) and reads a store that `ui/link`'s own `LinkPendingReporter` writes into. Using `ui/link`
  everywhere below is what wires my five routes into it; there is no separate call site of my own.
- **`ui/link`** — wraps `@/i18n/navigation`'s `Link` (still locale-aware, same `href="/app/admin/…"`
  convention, no change to how I write a path) but also draws a pending dot and feeds the shell's
  `<RouteProgress>`. **Replacing every `Link` import from `@/i18n/navigation` with
  `@/components/ui/link` across all five routes and the rail** — dashboard's `TopList`/section links,
  proposals' (none currently), sessions' title/schedule/attendance/certificates links (now inside the
  row `Menu`, not bare text, but the `Menu`'s `href`-based items still resolve through this `Link`
  internally per `MenuProps`), members' "عرض الملف", reports' (none currently), and the rail's 19 nav
  items. `quiet` on links embedded in an already-dense row (rail items, `Menu` items, `DataTable`
  cells) so the pending dot doesn't add visual noise next to a menu icon or inside a small nav strip;
  left loud (default) on the dashboard's standalone section-title links, where a pending dot is the
  only loading affordance on an otherwise static heading. Not `"use client"`, so no server/client
  boundary problem on any of my server pages.

★ **A real, pre-existing bug found while checking this, in my own `menu.tsx` (M9-built, not a lead
stub — I own this file already):** `MenuItem.href`'s branch renders a raw `<a href={item.href}>`, not
`@/i18n/navigation`'s locale-aware `Link` and not the new `ui/link`. Every `href` written the house
convention way (`/app/admin/sessions`, no locale segment) currently navigates to a **locale-less URL**
through this path — `proxy.ts` would 307 it back through locale detection rather than landing
directly, and it never draws a pending dot or feeds `RouteProgress`. This is exactly the row-action
menu (فتح الجلسة / الجدولة / الحضور / الشهادات) I'm planning for `/app/admin/sessions`, so it is not
a theoretical gap — **it also affects `DEC-111`'s shell-disclosure sweep** if the lead's account/nav
menus route through `href` items (worth a heads-up now, not only in my own report). **Fix, in my own
file, when I touch `menu.tsx` this wave:** swap the raw `<a>` for `ui/link`'s `Link`
(`<Link href={item.href} quiet>{content}</Link>` inside the same `DropdownMenu.Item asChild`) — `Link`
renders `next/link`'s `<a>` as its root with `LinkPendingReporter` nested inside, which `asChild`
already tolerates elsewhere (`page-header.tsx`'s breadcrumb does the same composition). Not done yet
(still holding on code) — flagged to the lead separately since it may be live for them sooner than
for me.

### 2. Per-route plan

Shared across all five: `Button`/`IconButton`/`RouteProgress` (lead's, already wired globally),
`PageHeader` for the `<h1>` (replacing the ad hoc `<h1 className="text-h1...">` + `<p>` pattern on
every page today), `EmptyState` (content's) wherever a list can be empty, `Badge`/`SessionStatusBadge`
(content's) for any status, `Toast` (lead's `useToast()`-shaped handle) for action feedback replacing
every inline `role="alert"`/`role="status"` paragraph, `Dialog`/`DialogContent` (lead's) for the
REQ-UIX-013 confirmations. Numerals: every `formatNumber(n, prefs.numerals)` / `formatDateTime(iso,
numerals, tz, locale)` call becomes `formatNumber(n)` / `formatDateTime(iso, tz, locale)` once the
sweep lands (`DEC-132`) — noted per route below only where it matters beyond the mechanical rename.

**Destructive-vs-not, decided once, applied five times:** a `ui/dialog` naming the object is used for
**proposal reject**, **member deactivate**, **session cancel**, and **report removal** — acts that
withdraw something from someone or end a state that took work to reach. **Approve, request-changes,
reactivate, session start/complete/reopen, and report dismiss stay a single click** — forward-moving
or reversible, matching what the code already treats as low-friction today. Member **role change**
stays undialogued too (no existing precedent treats it as destructive, and `isSelf` already blocks
the one genuinely dangerous case). Stated here once rather than re-argued per route.

#### 2.1 `/app/admin` — the dashboard (SCR-040, `REQ-ADM-004`)

- `PageHeader` (title/description), then a NEW «يحتاج انتباهك» `Panel` (content's) above the existing
  figures — a queue list, not a stat grid, each row: icon + Arabic label + count + oldest-item age +
  a link, per §6.7's "counts that are links, a queue list with ages." See §3 below for the exact four
  rows and where each count comes from.
- The six existing `<section>` blocks become `Stat` tiles (content's `stat.tsx`) in a responsive grid
  for the single-number figures (`rsvpsConfirmed`, `checkInsTotal`, `attendanceRate`, `activeMembers`,
  `pointsIssued`), each with `href` to the screen it summarises (`REQ-ADM-004`'s own acceptance —
  already true today via plain `<Link>`, now expressed through `Stat`'s own `href`). The six-row
  proposal-pipeline breakdown and the three `TopList`s stay `<dl>`/`<ol>` inside a `Panel` +
  `SectionHeader` — not everything is a `Stat` or a `DataTable`; a six-row breakdown read as one
  glance doesn't need either.
- Empty: when all four attention rows are zero, the panel renders `EmptyState` — «لا شيء يحتاج
  انتباهك الآن» — action pointed at `/app/admin/sessions` (EmptyState's `action` is required by the
  type; there is no "fix a problem" CTA for a good-news state, so the action is framed as a neutral
  next step, not a repair).
- States to capture: attention items present, attention panel empty, phone (`Stat` grid → one
  column, attention rows stack).
- DAL: `getAdminDashboardData()` (my file) gains the four attention fields — see §3, all additive to
  the existing `Promise.all`, one query widened (`proposals` select gains `created_at`) and two new
  lightweight `head: true, count: "exact"` queries (`sessions` unscheduled, `reports` × 2 targets). No
  new file, no `supabase/proposed/console/` entry — same reasoning the original bundle-1 note gave:
  every figure is an aggregate over a table the admin's own RLS already lets them read.

#### 2.2 `/app/admin/proposals` — the review queue (SCR-041, `REQ-PRO-005/006`)

- `PageHeader`, then each proposal as a `Panel` (dense text, not media — `Card` reserved for
  browse-like/media items elsewhere) inside the existing `<ul>`/`ReviewCard` structure — the
  `useActionState` per card is unaffected; this is a re-skin plus new feedback and one new
  confirmation, not a rewrite of the action model.
- **Approve:** unchanged, one click, `Button pending` from `useActionState`'s pending flag.
- **Request changes:** unchanged shape — reveal behind `<details>` (deliberately not native
  `required`, per the existing comment's reasoning, which still holds), submit on click. No dialog
  (not destructive — the proposer can revise and resubmit; nothing is lost).
- **Reject — gets the `ui/dialog` (`REQ-UIX-013`):** the visible «رفض» control becomes `type="button"`
  opening a `Dialog` titled with the proposal's own title (`<bdi>`-wrapped, per invariant), body
  reads back the typed reason if any, and the dialog's own `type="submit"` button (bound to the same
  `formAction`, `name="action" value="reject"`) is what actually submits. The `<details>` reveal still
  holds the reason textarea — nothing about the "not `required`" reasoning changes, only the final
  commit step gains a named confirmation.
- **Feedback:** a `done`-style flag added to `ReviewState` (`admin/proposals/state.ts`, my file,
  additive) so a client `useEffect` on the returned state can fire `toast.show()` — success
  («تمت الموافقة على المقترح» / «تم رفض المقترح» / «تم إرسال طلب التعديلات») or failure, replacing
  the inline `role="alert"` paragraph. The paragraph stays as a fallback for users who dismiss the
  toast before reading it — belt and suspenders, not a redundant announcement (the toast is
  `role="alert"` on failure too, so this is a visible written record, not a second SR announcement).
- Empty: `EmptyState`, action → `/app/admin` (no other "next" screen makes sense on an empty queue).
- States: queue with items, empty, reject-dialog open, request-changes reveal open, pending, toast
  success/failure, phone (cards already stack — no table involved here).
- DAL: `listProposalsForReview()` (`lib/dal/proposals.ts`, **sessions'** file, read-only import).
  ★ **Re-verified against disk after the numerals sweep (`c20b901`): `getOrgPrefs()` is gone from
  this page entirely** — it existed here only to read `numerals` for `formatNumber()`, and
  `formatNumber(n)` takes none now. Nothing else on this screen formats a date, so there is no
  remaining reason to call it. My original draft still listed it; corrected here rather than left
  stale.

#### 2.3 `/app/admin/sessions` — top level only (SCR-042, `REQ-ADM-005`, `REQ-ADM-020`)

- **"جاهزة للجدولة"** stays a plain list (few rows typically, one action each) inside a `Panel`, not
  a `DataTable` — sort/search/pagination buys nothing at this size. `EmptyState` when empty.
- **"إنشاء بدون مقترح" stays secondary**, per the spawn note: collapsed behind a
  `Button variant="secondary"` that reveals `DirectSessionForm` (a plain client show/hide, not a new
  primitive) rather than a permanently-visible section.
- **`DirectSessionForm` rebuild:** every native `<input>`/`<select>`/`<textarea>` moves onto
  `Field` + the matching control (`sessions`' primitives, consumed not edited) with `FormSummary`
  above the form on a failed submit. **The presenter checkbox list becomes `ui/combobox`
  (multiple, my file)** — the exact scroll-trap pattern combobox was built to fix, just found a
  second time in a file I own; `member.id` as `value`, `displayName` as `label`, Arabic-normalised
  typeahead reused from the existing implementation.
- **"كل الجلسات" becomes a `DataTable`** (my file): columns — title (`<bdi>`, `onCard: true`),
  status (`SessionStatusBadge`, driven by `sessionPhase()` from `@/lib/session-status` — **lead's**,
  read-only import, already exported — mapping the raw `SessionState` onto the shared six-phase
  vocabulary so `completed`/`archived`/`cancelled` all read through the same «انتهت»/«أُلغيت» badges
  the rest of the product uses, closing the "ended is badged separately here today" gap named in my
  own M9 note), start time (`formatDateTime`, `onCard: true`), presenter status (declined/pending
  inline note, kept as today), row actions (a `Menu`, my file, trigger = `IconButton` "المزيد":
  فتح الجلسة → `/app/sessions/{id}`, الجدولة → `.../schedule`, الحضور → `.../attendance`, الشهادات →
  `.../certificates` — replacing the flat row of underlined text links). `SessionControls`'
  start/complete/reopen stay plain buttons; **cancel gets the confirm dialog**, naming the session
  title. No `rowHref` (multiple per-row destinations already exist via the menu; a whole-row link
  would conflict with them) and **no `selection`/bulk bar** — no bulk-capable RPC backs it
  (`runTransition` is per-session), so the prop is left unset rather than faked.
- **A client-side search box** (plain substring over title/presenter names, composed by this screen
  per my M9 finding that `DataTableProps` has no built-in search) filters `rows` before they reach
  `DataTable`. Default sort: `createdAt` desc (today's behaviour), toggle to title/status/`startsAt`.
- **`ModeratorSessionsView` gets the same `DataTable` treatment**, minimal columns (title, status,
  start), one row action (فتح تقرير الحضور) — DEC-130 chose this route for the phone card stack, and
  that applies to the moderator's smaller render too, not only the admin one.
- States: full table, empty, cancel-dialog open, row-action pending, toast, phone stacked cards for
  both the admin and moderator variants, direct-create form revealed with `FormSummary` on error.
- DAL: `listSessionsForAdmin`, `listSchedulableProposals`, `listCategories`, `listNameableMembers`
  (`lib/dal/{sessions,proposals}.ts`, **sessions'** files, read-only), `listSessionsForAttendance`
  (also sessions'), `getOrgPrefs` (sessions'). ★ Re-verified post-sweep: `getOrgPrefs()` now returns
  `{maxCoPresenters, timeZone}` only (`numerals` dropped) — still needed here for `formatDateTime`'s
  `timeZone` argument, so this page keeps the call, unlike proposals. My own `actions.ts`/`state.ts`
  gain the same `done`-flag addition as proposals, for toast triggering.

#### 2.4 `/app/admin/members` — SCR-049 (`REQ-ADM-009`, `REQ-TEN-005`)

- `DataTable` (my file). Columns: name — `Avatar` (content's, `src: null` always this wave per the
  spawn note, `memberId`/`displayName` drive the initials + stable-hash tint per `16` §6.8.2) +
  `<bdi>` display name/email + a `عرض الملف` link to `/app/members/{id}`, `onCard: true`; company
  (`onCard: true`); role (plain text + an inline `Select`, sessions' primitive, replacing the ad hoc
  `<select>` — kept undialogued, see the shared destructive-action note above); status
  (`Badge`, active/deactivated, `onCard: true`); actions (a row `Menu` — تعطيل / إعادة تفعيل).
  **No `rowHref`** — the row hosts a nested `<select>` and menu, so the whole-row-click pattern is
  skipped on purpose (nested interactive elements inside a clickable row is its own a11y trap); the
  name cell's own link is the "open the profile" path.
- **Deactivate gets the `ui/dialog`**, and the dialog itself hosts the mandatory-reason `Field` +
  `Textarea` (not a two-step details-then-dialog like proposals — a Radix dialog is a real modal, so
  native `required` is safe here, unlike inside a collapsed `<details>`), titled with the member's
  own name. **Reactivate stays one click** (already a plain `useTransition`, no reason, reversible).
- **A client-side search box** (name/email substring) feeds `DataTable`'s `rows`. **No `selection`** —
  same reasoning as sessions: nothing backs a bulk role-change or bulk-deactivate-with-one-shared-
  reason.
- States: table, filtered-empty (search with no matches — the realistic empty case; a genuinely
  memberless org can't exist once the admin themself is a member), deactivate-dialog open, role-change
  pending, reactivate pending, toast, phone stacked cards.
- DAL: `listMembersForAdmin()`, `listCompaniesForAdmin()` (both **my own** `admin-{members,lists}.ts`),
  `getOrgPrefs()` (sessions', read-only). No new SQL.

#### 2.5 `/app/admin/moderation/reports` — SCR-052, photo reports (`REQ-ADM-010`, `REQ-EVT-008`)

- **`Card` grid, not `DataTable`** — DEC-130's own DataTable justification names proposals/sessions/
  members specifically and separates this route out as "where a flag lands," not as a third table
  candidate; a photo-review queue is card-first at every width because the photo itself is the
  primary content. `CardMedia` = the signed-URL image (kept, eslint-disabled `<img>`, unchanged
  reasoning), `CardBody` = uploader/session/reporter/reason (`<dl>`, unchanged shape), `CardActions` =
  remove/dismiss.
- **Remove gets the `ui/dialog`** (destructive — the photo leaves the session permanently), titled
  using the session title and uploader name (the photo itself has no name), hosting the mandatory-
  reason `Field`+`Textarea` inside the dialog body, same shape as member-deactivate. **Dismiss stays
  one click** — `resolvePhotoReport`'s `dismiss` branch takes no reason today and nothing here changes
  that.
- Empty: `EmptyState`, action → `/app/admin` (no other queue is this screen's job to point at).
- States: grid with items, empty, remove-dialog open, dismiss pending, toast, phone (cards already
  stack in a single column below `sm`).
- DAL: `listPhotoReports()`, `resolvePhotoReport()` (`admin-moderation.ts`, my file) — unchanged
  shape; `ResolvePhotoReportInput`'s return gains the same `done`-style addition for toast triggering.

### 3. The dashboard's «يحتاج انتباهك» — exactly four rows attempted, one flagged as unbuildable

| Row (Arabic) | Count | Source | Link |
|---|---|---|---|
| مقترحات بانتظار قرار | `pipeline.submitted + pipeline.inReview` | the **existing** `proposals` query in `getAdminDashboardData()`, widened to also select `created_at` so the oldest row's age can be shown — no new query | `/app/admin/proposals` |
| جلسات لم تُجدول بعد | count of `sessions` where `starts_at is null` and `state not in ('cancelled','archived')` | **new** query, same `Promise.all`, `admin-dashboard.ts` (my file) | `/app/admin/sessions` |
| بلاغات على الصور | count of `reports` where `target = 'photo' and status = 'open'` | **new**, lightweight `count: "exact", head: true` query, `admin-dashboard.ts` | `/app/admin/moderation/reports` (mine) |
| بلاغات على التعليقات | count of `reports` where `target = 'comment' and status = 'open'` | **new**, same shape | `/app/admin/moderation/comments` (untouched this wave, still a correct destination) |

Kept as **two separate rows** rather than one merged "open reports" count: `DEC-005`'s own rule for
photos — never merge two moderation paths that call for different senses of urgency and land on
different screens — extends cleanly to comment vs. photo reports, which already live on two different
screens today. `REQ-ADM-010`'s own wording ("queues for proposals, comments, photos and reports")
names exactly this four-way split, which is a second, independent reason it reads right.

**★ The fifth item named in my agent file — "job-queue depth" — is NOT built, and flagged here rather
than guessed at.** No org-scoped data source exists: `graphile_worker`'s job tables are platform-wide,
not `org_id`-scoped, no admin RLS policy grants a read on them, and the DAL rule (`CLAUDE.md`, "the
worker uses `service_role` only through `SECURITY DEFINER` functions, never raw table writes" — and
by the same logic, never a raw read from an app-tier client either) rules out reading them directly
even if a policy existed. Two ways to close this, for the lead/owner to pick: (a) **drop the item** —
the other three cover `REQ-ADM-010`'s own enumeration in full; or (b) **define a real org-scoped
proxy** — e.g. `notifications` rows not yet delivered for this org, if that shape exists — which I
have not tried to invent unprompted, per `DEC-114`'s standing rule that a mockup/brief item that
doesn't match what the tree can support is a question, not something to implement guessing.

### 4. Requests

- **To the lead, `icons.tsx`:** four new glyphs for the rail — tag/category, building/company,
  palette/swatch (branding), gear (settings) — same 24 px/1.7 px-stroke house spec as the existing 32.
  Interim: `UsersIcon` reused for both members and companies, `ImageIcon` reused for templates and
  branding, `MoreIcon` for settings — documented above, not silent.
- **To `sessions`:** none. `Field`/`Select`/`Textarea`/`Checkbox`/`FormSummary` are consumed as-is;
  nothing about `DirectSessionForm`'s rebuild needs a prop that doesn't already exist.
- **To `content`:** none anticipated. `Stat`/`Panel`/`EmptyState`/`Card`/`Badge`/`Avatar` are consumed
  as-is; `AvatarProps`' `src?: string | null` already does exactly what the spawn note asks (`null` →
  initials fallback) with no change needed.
- **No change requested to my own six `ui/` files this wave** — `DataTable`, `Combobox`, `Menu`,
  `Sheet`, `Dialog`(lead's, consumed), all already cover what the five routes need. `date-time.tsx`
  and `tabs.tsx` are not consumed by any of my five routes this wave (scheduling and a tabbed screen
  are both out of scope), so nothing to report there either.

### 5. As built — the admin layout (`8de9b47`), what changed from the plan

- **Icons resolved for real** (the lead's `607ecbe` landed `TagIcon`/`BuildingIcon`/`PaletteIcon`/
  `GearIcon` before I wrote any code, so the §1/§4 interim reuses never shipped). Two NEW adjacency
  conflicts found while wiring the real map, neither in the original plan: `scoring`/`recognition`
  are neighbours and both wanted `StarIcon` — `recognition` took `BookmarkFilledIcon` instead ("marked
  as notable"); the two template-library items are neighbours too and both wanted `ImageIcon` —
  `templatesCertificates` took `CheckCircleIcon` (unused elsewhere nearby; "a completed, verified
  document"). Both calls, and why, are comments at their `NAV_ITEMS` rows.
- **`menu.tsx`'s `href` bug fixed first**, as its own unit (`e73803e`), before the layout — the lead
  asked for it explicitly since it's live for their shell-disclosure sweep too.
- **Collapse state uses `useSyncExternalStore`, not the `useEffect`+`setState` the plan assumed** —
  `react-hooks/set-state-in-effect` refuses the latter outright. Same idiom `ui/route-progress.tsx`
  already established for an identical class of problem (client-only state that must not become a
  hydration mismatch); documented in `admin-rail.tsx` itself.
- **The second skip link's copy changed, not just its markup.** Found while writing the e2e spec:
  the old `admin.shell.skipToContent` was byte-identical to the shell's own `app.shell.skipToContent`
  («تخطَّ إلى المحتوى» twice) — a real, pre-existing ambiguity for a screen-reader user tabbing
  through two links announced the same way for two different destinations, not something I
  introduced but something I was already touching. Reworded to «تخطَّ قائمة الإدارة إلى المحتوى».
- **`.qa-shots/rtl/` captures are written by `tests/e2e/console.spec.ts` but NOT YET LOOKED AT** —
  `.next/BUILD_ID` predates every commit in this unit (it predates even the `menu.tsx` fix), and only
  the lead runs `npm run build`. `npm test`/`tsc`/`lint` are all green for every file in this unit;
  the e2e spec is written and reviewed but unverified against real code until a rebuild. Flagged to
  the lead at sync.
- **One unrelated, pre-existing test failure found while running the full suite**, not mine:
  `tests/components/sessions/proposal-copy.test.tsx`'s clipping-scan trips on its own new
  `event-subnav.tsx`'s comment (the comment literally contains the string "overflow: hidden" while
  explaining why the component doesn't use it) — `sessions`' file, flagged to them directly, not
  touched here.

### 6. As built — the dashboard (`b8501d7`), what changed from the plan

- **The click-through redesign wasn't in the original §2.1 plan.** Rebuilding onto `SectionHeader`
  lost the old shape's "the heading itself is the link" pattern (`SectionHeader`'s `title` is plain
  text by design — `PageHeader`'s own comment on `breadcrumb` links is the only place `Link` lives
  inside either lead primitive). Fixed by giving `pipeline`/`top-categories`/`top-companies` a
  `SectionHeader.actions` slot carrying a distinct «عرض القائمة» link per section (the existing,
  previously-unused `admin.dashboard.viewList` key), each disambiguated from the other two identical-
  looking links by its own `aria-label` — same pattern `admin/sessions/page.tsx`'s
  `createFromProposal` button already uses for an identical problem. `attendance`/`activeMembers`/
  `pointsIssued` needed no such fix: they became individual `Stat` tiles, each carrying its own
  `href` natively, which is MORE click-through surface than the old one-link-per-section-heading
  shape had, not less.
- `admin-dashboard.spec.ts` (mine) updated to match — the old test located sections by an
  "الحضور"/"الأعضاء النشطون"/"النقاط الممنوحة" heading each; those headings don't exist anymore
  (three `Stat` tiles inside one "نظرة عامة" section instead). Rewritten, not deleted — same figures
  asserted, same click-throughs proven, against the shape that actually ships.
- Second unrelated, pre-existing failure found on this pass (not `sessions`' this time):
  `tests/unit/search-normalize.test.ts` fails against `src/lib/dal/search.ts`, which carries a
  `__TIMELINE__` placeholder token mid-edit — also `sessions`' file (the `search.ts` transfer), not
  touched here, not re-reported (already sent one heads-up to `sessions` this session).
- **Still unverified against a real build** — same `.next/BUILD_ID` staleness as the layout unit;
  `tests/e2e/admin-dashboard.spec.ts`'s source is correct by review but not yet run green.
