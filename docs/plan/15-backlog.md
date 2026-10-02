# 15 — Backlog

**Status:** `draft` · **Owns:** the `STORY-*` ID space
**Cites:** `01-prd.md` (every story cites `REQ-*` IDs), `14-roadmap.md` (every story has a milestone)

> Every story **covers** at least one requirement, and **every requirement is covered by at least
> one story** — `scripts/traceability.mjs` fails the build otherwise (`13` §10). The coverage
> check is at §24.

**Sizing:** `S` ≈ up to a day · `M` ≈ 2–4 days · `L` ≈ a week · `XL` ≈ more than a week, and
should probably be split when it is picked up.

Format: **Covers** · **Milestone** · **Size**, then the acceptance criteria that are *not* already
in the PRD — the PRD's criteria apply automatically and are not restated.

---

## EPIC-TEN — Tenancy and orgs

#### STORY-TEN-001 — Orgs exist, and only a super admin creates one
**Covers:** `REQ-TEN-001`, `REQ-TEN-002` · **M1** · **M**
- Creating an org sets name, slug, certificate prefix and the first admin, and writes an audit row.
- No member- or admin-reachable route creates an org.

#### STORY-TEN-002 — Org isolation is structural and proven
**Covers:** `REQ-TEN-003`, `REQ-TEN-004` · **M1** · **L**
- The generated isolation sweep runs over every entity and passes.
- `members.org_id` is immutable by trigger; an update attempt raises even as `service_role`.

#### STORY-TEN-003 — Three roles, and suspension
**Covers:** `REQ-TEN-005`, `REQ-TEN-006` · **M1** · **M**
- A moderator calling a settings endpoint directly is rejected by policy.
- A suspended org's members see «هذه المؤسسة موقوفة حاليًا» and reach no app route; jobs stop.

#### STORY-TEN-004 — Domain list and org settings
**Covers:** `REQ-TEN-007`, `REQ-TEN-008` · **M1** · **M**
- Domains normalise to lowercase without `@`; removal does not deprovision existing members.
- Every setting change writes to the configuration history with old and new values.

## EPIC-AUT — Authentication

#### STORY-AUT-001 — Google sign-in, provider-agnostic
**Covers:** `REQ-AUT-001`, `REQ-AUT-002` · **M1** · **M**
- No column is named for or typed to Google; the member keys off `auth_user_id`.

#### STORY-AUT-002 — Domain-gated provisioning and the ambiguity picker
**Covers:** `REQ-AUT-003`, `REQ-AUT-004` · **M1** · **L**
- Concurrent first sign-ins create exactly one member.
- The picker appears only on a genuinely ambiguous domain, and never again after the choice.
- ★ The auth hook never raises, returns the event unchanged when no member row exists, and holds
  all three `supabase_auth_admin` grants.

#### STORY-AUT-003 — Destination preservation and the closed door
**Covers:** `REQ-AUT-005`, `REQ-AUT-006` · **M1** · **S**
- A poster QR scanned signed-out lands on that session after sign-in; an external `next` is discarded.
- A non-member domain sees an explanation naming no org and leaking no domain list.

#### STORY-AUT-004 — Claims, staleness and deactivation
**Covers:** `REQ-AUT-007`, `REQ-AUT-008` · **M1** · **L**
- Demoting an admin takes effect on their next privileged write, via `stale_claims`.
- Deactivation cancels future RSVPs, requires a reason, and never alters an existing snapshot.

## EPIC-PRF — Profiles

#### STORY-PRF-001 — Profile fields and the company list
**Covers:** `REQ-PRF-001`, `REQ-PRF-002`, `REQ-PRF-003` · **M1** · **M**
- A member without a company is prompted before reserving a seat or proposing.
- Renaming a company does not break existing leaderboard snapshots.

#### STORY-PRF-002 — Two visibility tiers, enforced below the UI
**Covers:** `REQ-PRF-004` · **M1** · **L**
- Selecting `email` on another member **errors on the column grant**.
- The `member` tier is enforced in RLS and the DAL, not the component — verified through search
  results and realtime payloads as well as the page.

#### STORY-PRF-003 — Member directory
**Covers:** `REQ-PRF-005` · **M2** · **M**

#### STORY-PRF-004 — Self data export and deactivation
**Covers:** `REQ-PRF-006`, `REQ-PRF-007` · **M8** · **L**
- The export contains no other member's personal data.
- After anonymisation no ledger row is deleted and every org total is unchanged.


#### STORY-PRF-005 — Avatars, stored by the platform
**Covers:** `REQ-PRF-008`, `REQ-PRF-009`, `REQ-PRF-010`, `REQ-PRF-011` · **M10** · the Google import in **M16** (`DEC-180`); the member upload and its moderation still unbuilt · **M**
- The value already travels the whole stack — column, provisioning, five DAL modules, CSP — and is
  discarded at the last step. This story draws it **and fixes how it got there**.
- Upload is sniffed on content, EXIF-stripped, PNG/JPEG only; derivatives at 96 and 192 px come
  from the existing job as a size list, not a new job.
- Google's photo is offered once and **copied**, never linked; the
  `lh3.googleusercontent.com` CSP entry is **removed**.
- Initials over a tint hashed from the **member id** are the default and the permanent fallback;
  there is no silhouette anywhere.
- An avatar takedown reverts to initials; `JOB-anonymise_members` clears the row **and deletes the
  object**; the data export includes it.

## EPIC-PRO — Proposals

#### STORY-PRO-001 — Propose a topic, and nothing schedule-shaped
**Covers:** `REQ-PRO-001`, `REQ-PRO-002` · **M2** · **M**
- ★ No date, time or venue field exists in the form **or the schema**.
- Arabic labels match the pre-launch registration form members have already seen.

#### STORY-PRO-002 — Co-presenters and draft materials
**Covers:** `REQ-PRO-003`, `REQ-PRO-004` · **M2** · **M**
- Only same-org members can be named; a decline notifies the proposer.
- Draft materials are admin-only until publication, then carry over with their phase.

#### STORY-PRO-003 — Admin review with reasons
**Covers:** `REQ-PRO-005`, `REQ-PRO-006` · **M2** · **M**
- Reject and request-changes both require a written reason the proposer receives.
- Approving does **not** publish.

#### STORY-PRO-004 — Admin-created sessions and proposal visibility
**Covers:** `REQ-PRO-007`, `REQ-PRO-008` · **M2** · **S**


#### STORY-PRO-005 — The proposal is the source of session content
**Covers:** `REQ-PRO-009`, `REQ-PRO-010` · **M11** · **L**
- `create_session()` copies **every** proposal field, including the two that are dropped on the
  floor today (`target_audience`, `expected_duration_minutes`) and objectives and tags.
- `expected_duration_minutes` pre-fills the schedule's duration; the admin is not asked again.
- SCR-043 is two tabs; an admin content edit is audited field by field and notified to the proposer,
  and the review card shows a diff.
- Creating a session without a proposal stays possible, as a secondary action.

## EPIC-SES — Sessions and venues

#### STORY-SES-001 — Schedule and publish
**Covers:** `REQ-SES-001`, `REQ-SES-002` · **M2** · **L**
- Publishing is blocked by a **database constraint**, not only by the form.
- `ends_at` is stored, derived at scheduling, independently editable.

#### STORY-SES-002 — The session state machine and its audit trail
**Covers:** `REQ-SES-003`, `REQ-SES-012` · **M2** · **M**
- Every transition writes an audit row; `full` is stored nowhere.

#### STORY-SES-003 — The clock moves sessions
**Covers:** `REQ-SES-004`, `REQ-SES-005` · **M2** · **M**
- Transitions are idempotent and never override a manual one.

#### STORY-SES-004 — Venues, list and one-off
**Covers:** `REQ-SES-006`, `REQ-SES-007` · **M2** · **M**
- A venue used by a future session cannot be deleted, only deactivated.

#### STORY-SES-005 — Changes propagate; cancellation preserves
**Covers:** `REQ-SES-009`, `REQ-SES-010` · **M3** · **L**
- The notification names **old and new values**.
- A cancelled session's page stays, materials stay, comments freeze, calendars clear.

#### STORY-SES-006 — Offline-only, language, and the event page ordering
**Covers:** `REQ-SES-008`, `REQ-SES-011`, `REQ-SES-013` · **M2** · **M**
- No remote-attendance affordance exists anywhere.
- At 375 px the primary action is above the fold and ≥ 44 px.


#### STORY-SES-007 — Learning objectives
**Covers:** `REQ-SES-014` · **M10** · **M**
- A `text[]` on `proposals` and `sessions` with two checks — **not** a fourth entity, which would
  buy a join, a policy set and a sweep line to model something with no identity (`DEC-089`).
- A ninth objective, an empty one or one over 140 characters is refused by the **database**.
- A session with none renders no «ماذا ستتعلّم؟» section and no heading.

#### STORY-SES-008 — A session spans days, and a day is a meeting in its own right
**Covers:** `REQ-SES-015` · **M9** · **XL**
- `ENT-session_days` with `org_id`, RLS, a full policy set and a generated-sweep row.
- `check_in_codes`, `check_ins`, `check_in_attempts`, `materials` and `calendar_events` move to the
  day; `rsvps`, certificates, ratings, comments, photos and tags stay on the session.
- `sessions.starts_at`/`ends_at` become derived from the first and last day and stay stored, so
  every existing index, sort and the `session_window` trigger keep working.
- `sessionPhase()` is `live` while ANY day runs and `ended` after the LAST; the check-in ceiling is
  per day.
- A one-day session is a session with one day — no second code path.

#### STORY-SES-009 — The scheduling form is quick for one day and honest about many
**Covers:** `REQ-SES-016` · **M9** · **L**
- Multi-day sits behind an explicit affordance; the one-day path is unchanged and costs nothing.
- The end follows the duration live, and stops following once explicitly edited (OQ-001).
- Each added day defaults to the previous day's time and place, both editable.
- Overlapping days, an end before a start and a deadline after day one are each said at the field
  on blur, never only on submit.

#### STORY-SES-010 — Points and certificates require every day
**Covers:** `REQ-SES-017` · **M9** · **L**
- ★ For a multi-day session the award moves from the check-in trigger to session completion, where
  the full day set is known; a one-day session is unchanged.
- The idempotency key is per member per session, so a re-run cannot double-pay an append-only ledger.
- Partial attendance earns nothing by default, and the member's history says which day they missed.
- The all-days rule is a per-session setting beside `certificate_mode`, which an admin may relax.

#### STORY-SES-011 — Content is scoped by where you add it, and never by a question
**Covers:** `REQ-SES-018` · **M9** · **M**
- One nullable `session_day_id` on `materials`, `session_tasks` and `photos`; null is the session.
- ★ A one-day session has no scope concept at all — no groups, no chips — and renders as today.
- The member reads one grouped list per content type, session content first, empty groups omitted.
- The add control sits in each group header: pressing it IS the choice. No picker, no modal.
- A photo is never scoped by hand, including by an attendee: it takes the day containing its
  upload time, and staff may re-scope it.
- Adding a second day re-scopes nothing; deleting a day with content asks and defaults to
  promoting it to the session.
- ★ `materials.phase` is relative to the SCOPE — a day-scoped «بعد» material releases when that day
  ends, so day 1's slides are not withheld until Friday.

## EPIC-RSV — RSVP

#### STORY-RSV-001 — Reserve a seat, with capacity in the transaction
**Covers:** `REQ-RSV-001`, `REQ-RSV-002`, `REQ-RSV-011` · **M2** · **L**
- N concurrent reservations against N−1 seats confirm exactly N−1.
- `rsvp` is absent from the scoring catalogue entirely.

#### STORY-RSV-002 — Waitlist and atomic promotion
**Covers:** `REQ-RSV-003`, `REQ-RSV-004` · **M2** · **L**
- Promotion is atomic with the cancellation that freed the seat, in join order.

#### STORY-RSV-003 — Deadline and cutoff
**Covers:** `REQ-RSV-005`, `REQ-RSV-006`, `REQ-RSV-007` · **M2** · **M**
- Promotion continues after the deadline, until the session starts.
- The UI says, before confirming, whether a cancellation will be recorded as late.

#### STORY-RSV-004 — Leaving the waitlist is free
**Covers:** `REQ-RSV-008` · **M2** · **S**

#### STORY-RSV-005 — Priority RSVP as a head start
**Covers:** `REQ-RSV-009`, `REQ-RSV-010` · **M4** · **M**
- No confirmed seat is ever revoked for a perk holder.

## EPIC-CHK — Check-in

#### STORY-CHK-001 — The host view and the rotating code
**Covers:** `REQ-CHK-001`, `REQ-CHK-002` · **M2** · **L**
- Legible at 3 metres; exactly one current code, at most one in grace.
- Changing the rotation period does not invalidate issued codes.

#### STORY-CHK-002 — Checking in
**Covers:** `REQ-CHK-003`, `REQ-CHK-004`, `REQ-CHK-005` · **M2** · **L**
- One tap from the event page; success is unambiguous.
- A second attempt is a no-op reporting the first.

#### STORY-CHK-003 — Rate limiting inside the transaction
**Covers:** `REQ-CHK-006` · **M2** · **M**
- ★ The attempt row is written **before** the limit is checked.
- Throttling is identical regardless of which serverless instance serves the request.

#### STORY-CHK-004 — Burn a leaked code; manual backup
**Covers:** `REQ-CHK-007`, `REQ-CHK-008` · **M2** · **M**
- Revocation takes effect on the next attempt; prior check-ins stand.
- A manual mark produces the **same event**, with a mandatory reason, flagged in exports.

#### STORY-CHK-005 — The single trigger, and who it is not for
**Covers:** `REQ-CHK-009`, `REQ-CHK-010`, `REQ-CHK-011` · **M2** · **M**
- Four rights derive from `has_checked_in()`; each is denied to an RSVP-without-check-in.
- A walk-in gets full rights; a presenter cannot check in to their own session.

#### STORY-CHK-006 — Reporting, overlap, host access
**Covers:** `REQ-CHK-012`, `REQ-CHK-013`, `REQ-CHK-014` · **M2** · **M**
- Overlapping attendance is rejected by the exclusion constraint, naming the conflict.
- A checked-in member requesting the host view is denied by **policy**.

#### STORY-CHK-006 — Check-in is open by default and closed by hand, with a two-hour ceiling
**Covers:** `REQ-CHK-015`, `REQ-CHK-016` · **M9** · **M**
- The switch starts **open** and is one tap from the host view to close and reopen.
- Presenter, moderator and admin may close it; the ceiling is `ends_at + 2h`, in the RPC.
- The floor is `REQ-CHK-004`'s unchanged code window, which is what stops an early check-in.
- The ceiling is `ends_at + 2h`, enforced in the RPC — a forged request past it is refused.
- Closing stops new check-ins and revokes none.
- Every open and close is audited with who and when.
- ★ `checkIn` leaves `GRANTING_AFFORDANCES`: once a stored switch is the gate, the clock can no
  longer grant it and there is nothing for the direction guard to protect against.

#### STORY-CHK-007 — An admin can edit the attendance list, and the reversal is the hard half
**Covers:** `REQ-CHK-017` · **M9** · **M**
- Admin-only: add and **remove**, each with a mandatory reason, each audited with actor and member.
- A removal is never a side effect of closing check-in, and never a bulk act without naming members.
- ★★ **Design the reversal before the UI.** `points_ledger` is append-only with `service_role`
  revoked, so a removal cannot delete the award: it needs a compensating entry with its own
  idempotency key. An issued certificate has a gapless serial and is revoked, not un-issued.
- The member's points history shows the reversal as an entry, never a number that quietly changed.

## EPIC-MAT — Materials

#### STORY-MAT-001 — Uploads belong to sessions and are sniffed
**Covers:** `REQ-MAT-001`, `REQ-MAT-002`, `REQ-MAT-012` · **M5** · **L**
- No route accepts an upload without a session; an SVG named `.png` is rejected on content.

#### STORY-MAT-002 — Conversion and the viewer
**Covers:** `REQ-MAT-003` · **M5** · **XL**
- ★ Arrow keys follow the reading direction in Arabic.
- The source file is never fetched to view.

#### STORY-MAT-003 — Keynote, download-only · **withdrawn by DEC-058**
**Covers:** `REQ-MAT-004` · **M5** · **S**
- Delivered in M5, then withdrawn at Launch: uploads are PDF-only, Keynote is refused at upload.

#### STORY-MAT-004 — Download control and phase gating
**Covers:** `REQ-MAT-005`, `REQ-MAT-006` · **M5** · **M**
- With download off, **no signed URL is ever minted**; an admin download is audited.
- Phase gating is in the read policy, so it closes every read path at once.

#### STORY-MAT-005 — Other media, ownership, limits, versions
**Covers:** `REQ-MAT-007`, `REQ-MAT-008`, `REQ-MAT-009`, `REQ-MAT-010` · **M5** · **L**
- Over-limit uploads name the limit **and** the file's actual size.

#### STORY-MAT-006 — Font substitution is surfaced
**Covers:** `REQ-MAT-011` · **M5** · **M**
- The warning names the missing family and appears **on the material**, not only in a job log.

## EPIC-TSK — Pre-session tasks

#### STORY-TSK-001 — Four kinds, reminder-only
**Covers:** `REQ-TSK-001`, `REQ-TSK-002` · **M5** · **M**
- No check-in path consults task completion; no task action exists in the scoring catalogue.

#### STORY-TSK-002 — Progress, responses, reminders
**Covers:** `REQ-TSK-003`, `REQ-TSK-004`, `REQ-TSK-005` · **M5** · **M**
- Form responses are visible to presenters and admins only — **not moderators**.

## EPIC-EVT — Event page

#### STORY-EVT-001 — The page and its ordering
**Covers:** `REQ-EVT-001` · **M2** · **M**

#### STORY-EVT-002 — Threaded comments
**Covers:** `REQ-EVT-002`, `REQ-EVT-003`, `REQ-EVT-005` · **M2** · **L**
- A reply to a reply attaches to the parent thread.
- A member with no RSVP and no check-in **can** comment.
- Deleting leaves a tombstone when replies exist.

#### STORY-EVT-003 — Reactions, mentions, reply notifications
**Covers:** `REQ-EVT-004`, `REQ-EVT-006`, `REQ-EVT-007` · **M2** · **M**
- Reactions are absent from the scoring catalogue.

#### STORY-EVT-004 — Report and flag
**Covers:** `REQ-EVT-008` · **M2** · **M**
- Reported items stay visible pending review; the reporter is never shown to the reported.

#### STORY-EVT-005 — Photos: the gate, EXIF, the notice
**Covers:** `REQ-EVT-009`, `REQ-EVT-010`, `REQ-EVT-011`, `REQ-EVT-013` · **M5** · **L**
- ★ The stored bytes carry **no EXIF**, asserted on the object itself.
- An RSVP-without-check-in cannot upload.

#### STORY-EVT-006 — Takedown, removal, realtime
**Covers:** `REQ-EVT-012`, `REQ-EVT-014`, `REQ-EVT-015` · **M5** · **L**
- ★ The takedown hides the photo **before any human sees the request**.
- The uploader is notified without being told who asked.

#### STORY-EVT-007 — The gallery and the lightbox
**Covers:** `REQ-EVT-016` · **M16** · **M**
- A tap opens a photograph whole; previous and next are always-visible tap targets and a swipe is only
  the enhancement (`DEC-093`'s sixth place). Built on `ui/dialog`.
- The grid's crop is deliberate and written down; the lightbox never crops.
- The gate is a Playwright case driving every photograph with `page.click()` alone.

## EPIC-RAT — Ratings

#### STORY-RAT-001 — Rate, gated by check-in
**Covers:** `REQ-RAT-001`, `REQ-RAT-002`, `REQ-RAT-003` · **M2** · **M**
- Supplying another member's `check_in_id` is rejected.
- ★ Stars fill **from the right** in RTL.

#### STORY-RAT-002 — Anonymity, and its honest limit
**Covers:** `REQ-RAT-004`, `REQ-RAT-005`, `REQ-RAT-006` · **M2** · **L**
- A presenter selecting from `ratings` gets **zero rows**, not redacted rows.
- Nothing shows below 3 ratings, and the rating form says so.
- An admin read of per-rater ratings is **audited**.

#### STORY-RAT-003 — The rating prompt
**Covers:** `REQ-RAT-007` · **M3** · **S**

## EPIC-PTS — Scoring

#### STORY-PTS-001 — The append-only ledger
**Covers:** `REQ-PTS-001`, `REQ-PTS-002` · **M4** · **L**
- `update` and `delete` raise for every role **including `service_role`**.

#### STORY-PTS-002 — Idempotent awards
**Covers:** `REQ-PTS-012` · **M4** · **M**
- Replaying a job writes zero additional rows; `on conflict do nothing` is the only conflict action.

#### STORY-PTS-003 — Configuration without a deploy
**Covers:** `REQ-PTS-004`, `REQ-PTS-005`, `REQ-PTS-014` · **M4** · **L**
- Changes apply forward only; each ledger row names the rule version that produced it.

#### STORY-PTS-004 — Caps, cooldowns, negatives
**Covers:** `REQ-PTS-006`, `REQ-PTS-007`, `REQ-PTS-008` · **M4** · **M**
- A capped action earns 0 and **says so**, without failing the member's action.
- With defaults, no member ever loses points.

#### STORY-PTS-005 — Manual adjustment, reversal, anti-gaming
**Covers:** `REQ-PTS-009`, `REQ-PTS-010`, `REQ-PTS-013` · **M4** · **L**
- An empty reason is rejected; the member sees the adjustment and its reason.
- Inserting `action_key = 'rsvp'` is rejected.
- Removal writes a compensating row; no row is edited.

#### STORY-PTS-006 — Recompute and the balance audit
**Covers:** `REQ-PTS-003`, `REQ-PTS-011` · **M4** · **L**
- A full rebuild reproduces every balance exactly; the nightly audit alerts and does not self-heal.
- ★ A member can explain every point they hold without asking anyone.

## EPIC-LDR — Leaderboards

#### STORY-LDR-001 — All-time, monthly, seasonal
**Covers:** `REQ-LDR-001`, `REQ-LDR-002` · **M4** · **M**
- The member's own rank is always visible; a closed period never changes.

#### STORY-LDR-002 — Per-topic
**Covers:** `REQ-LDR-003` · **M4** · **M**
- Points with no session context are **excluded**, not assigned arbitrarily.

#### STORY-LDR-003 — سباق الشركات
**Covers:** `REQ-LDR-004`, `REQ-LDR-005`, `REQ-LDR-008` · **M4** · **L**
- Both metrics visible at once, the ranking one marked.
- Company aggregates are unaffected by an opt-out.

#### STORY-LDR-004 — Frozen snapshots
**Covers:** `REQ-LDR-006`, `REQ-LDR-007` · **M4** · **L**
- ★ `active_member_count` is frozen; deactivating a member changes no published standing.

## EPIC-REC — Recognition

#### STORY-REC-001 — Badges and the default set
**Covers:** `REQ-REC-001`, `REQ-REC-002` · **M4** · **L**
- A new org has a working recognition system with no configuration.
- Retiring a badge does not revoke it.

#### STORY-REC-002 — Levels tied to privileges
**Covers:** `REQ-REC-003`, `REQ-REC-004` · **M4** · **M**
- Raising a threshold never demotes without an explicit admin action.

#### STORY-REC-003 — Streaks
**Covers:** `REQ-REC-005` · **M4** · **M**
- Month boundaries use the org's time zone; the bonus is awarded once per period.

#### STORY-REC-004 — Perks and their announcements
**Covers:** `REQ-REC-006`, `REQ-REC-007`, `REQ-REC-008`, `REQ-REC-009` · **M4** · **L**
- `can_host` ships **disabled**; a gated member is told what would qualify them.

## EPIC-CRT — Certificates

#### STORY-CRT-001 — Recipients and issuance modes
**Covers:** `REQ-CRT-001`, `REQ-CRT-002` · **M6** · **M**
- Attendee certificates require a `check_in_id`, by table constraint.
- The mode is visible on the event page.

#### STORY-CRT-002 — Automatic issuance and review-and-release
**Covers:** `REQ-CRT-003`, `REQ-CRT-004` · **M6** · **L**
- Re-running produces no duplicates; held certificates are invisible and unemailed.

#### STORY-CRT-003 — PDF, email, member list
**Covers:** `REQ-CRT-005`, `REQ-CRT-006`, `REQ-CRT-013` · **M6** · **L**
- Fonts are embedded; the PDF renders on a machine with no fonts installed.

#### STORY-CRT-004 — The gapless serial
**Covers:** `REQ-CRT-008` · **M6** · **M**
- ★ A rolled-back issuance leaves `next_value` unchanged. Two orgs both issue `…-000001`.

#### STORY-CRT-005 — Verification, by code only
**Covers:** `REQ-CRT-007`, `REQ-CRT-009`, `REQ-CRT-010` · **M6** · **L**
- ★ A **serial** at `/verify` returns not-found.
- Unknown and revoked-nonexistent are indistinguishable.
- The QR encodes an absolute URL, ≥ 25 mm, 4-module quiet zone, with both identifiers printed.

#### STORY-CRT-006 — Revocation, achievements, reproducibility
**Covers:** `REQ-CRT-011`, `REQ-CRT-012`, `REQ-CRT-014` · **M6** · **L**
- The public page shows revoked **without the reason**; the member's own list shows it with.
- Leaderboard certificates issue from the frozen snapshot.
- A v3 certificate still renders as v3 after v4 ships.

## EPIC-DSG — Designer

#### STORY-DSG-001 — Every published session has a poster, three ways
**Covers:** `REQ-DSG-001`, `REQ-DSG-002` · **M6** · **L**
- The automatic path produces every A12 variant with no design work.

#### STORY-DSG-002 — Live and detached
**Covers:** `REQ-DSG-003` · **M6** · **M**
- ★ Editing detaches, visibly and one-way; a detached poster is never auto-regenerated.

#### STORY-DSG-003 — One engine, one document model
**Covers:** `REQ-DSG-004`, `REQ-DSG-005`, `REQ-DSG-006` · **M6** · **XL**
- A layer-model change applies to posters and certificates without a branch.
- The editor previews with **real** data; an unbound field is a marked placeholder.

#### STORY-DSG-004 — Template versioning and two libraries
**Covers:** `REQ-DSG-007`, `REQ-DSG-008`, `REQ-DSG-024` · **M6** · **L**
- An org admin can read but **not update** a platform template.
- A locked region cannot be moved, resized, hidden or deleted.

#### STORY-DSG-005 — Presets, safe areas, auto-fit
**Covers:** `REQ-DSG-009`, `REQ-DSG-010`, `REQ-DSG-025` · **M6** · **L**
- Every A12 variant derives from the master with no manual step.
- Content crossing a safe area is flagged **before** export.

#### STORY-DSG-006 — The export pipeline
**Covers:** `REQ-DSG-011`, `REQ-DSG-012`, `REQ-DSG-013` · **M6** · **XL**
- The RGB-not-CMYK caveat is surfaced in the UI.
- Re-opening a session re-renders nothing; a template bump invalidates only its own artifacts.

#### STORY-DSG-007 — Shaping parity, three tiers
**Covers:** `REQ-DSG-014`, `REQ-DSG-015` · **M6** · **XL**
- ★ 28 assertions: seven cases × four export paths.
- Tier A fails the export on mismatch; goldens are never auto-refreshed.

#### STORY-DSG-008 — One font set, and the Google Fonts materialisation
**Covers:** `REQ-DSG-016`, `REQ-DSG-017` · **M6** · **XL**
- A font present in one renderer and absent in another is a **build failure**.
- A font failing the goldens is not selectable, and the admin is told which failed.
- The editor loads the stored binary, never Google's CDN.

#### STORY-DSG-009 — Image layers, no SVG, PPI guard
**Covers:** `REQ-DSG-018`, `REQ-DSG-019`, `REQ-DSG-020` · **M6** · **L**
- Rejection is on sniffed content; the PPI guard blocks below 200 and names the layer.
- Every variant exists after an upload, with a per-variant crop override.

#### STORY-DSG-010 — The brand kit and the feature set
**Covers:** `REQ-DSG-021`, `REQ-DSG-022` · **M6** · **XL**
- Replacing the logo updates every template at once; no colour is hard-coded anywhere.

#### STORY-DSG-011 — QR layers and the baseline library
**Covers:** `REQ-DSG-023`, `REQ-DSG-026` · **M6** · **L**
- The QR is inline SVG from our own runtime, vector at A3.
- Templates carry no books, caps, lightbulbs, icon libraries, emoji or photography.


#### STORY-DSG-012 — Direct manipulation, with a non-dragging path for every dragged operation
**Covers:** `REQ-DSG-028`, `REQ-DSG-029`, `REQ-DSG-030` · **M12** · delivered in **M15** (`DEC-176`) · **L**
- Drag, eight-handle resize, rotate, marquee, align/distribute and snapping — reusing the
  `snap`/`snapTargets` exports that are **already written and driven only by number entry today**.
- ★ The inspector's numeric fields are the `SC 2.5.7` conformance path: **demoted, never removed.**
- A Playwright case performs **every** studio operation with `page.click()` alone and asserts the
  document changed.
- Align, distribute and rulers follow the **document's** direction; arrow keys follow the visual
  axis. One unit test asserts an `ar` console and an `en` console store **byte-identical**
  documents for the same "align start".
- The overlay uses physical `left`/`top` computed from document geometry, with the exemption
  written down so nobody tidies it back to logical properties.
- Focal point defaults to the geometric centre, so an untouched document derives identically and no
  golden moves.

#### STORY-DSG-013 — Certificate issuance is three steps and a preflight
**Covers:** `REQ-DSG-031` · **M12** · the unbuilt remainder in **M15** (`DEC-176`) · **L**
- التصميم → من يستحق → الإصدار, with the resulting name list shown live and hold-backs made visibly.
- The preflight checks fonts resolved, bindings bound, Tier A green and the serial range reserved.
- Issuance is irreversible and serials are gapless, so it is a confirmed act with per-certificate
  status and an individual re-issue — not a button next to a dropdown.

## EPIC-NTF — Notifications

#### STORY-NTF-001 — Two channels and the matrix
**Covers:** `REQ-NTF-001`, `REQ-NTF-002` · **M3** · **L**
- No third-channel code path, dependency or field exists.

#### STORY-NTF-002 — Preferences, with the non-optional marked
**Covers:** `REQ-NTF-003` · **M3** · **M**
- The eleven non-optional categories render as fixed rows with an explanation.

#### STORY-NTF-003 — Reminders that move
**Covers:** `REQ-NTF-004`, `REQ-NTF-005` · **M3** · **L**
- ★ Rescheduling **moves** reminders; changing the org schedule replaces keys.

#### STORY-NTF-004 — Inbox, templates, delivery logging
**Covers:** `REQ-NTF-006`, `REQ-NTF-007`, `REQ-NTF-008` · **M3** · **L**
- A template missing a required field fails validation before saving.
- A bounce is visible to the admin with its reason.


#### STORY-NTF-005 — The email studio: blocks, the real renderer, and a live test
**Covers:** `REQ-NTF-009`, `REQ-NTF-010`, `REQ-NTF-011`, `REQ-NTF-012`, `REQ-NTF-013` · **M12** · **L**
- Nine typed blocks compile to table rows beside `render.ts`'s **existing** string path, so an org
  that has not touched its templates renders **byte-identical** output and no golden moves.
- ★ The first task is reconciling `08` §3.2's 22 against `DEFAULT_TEMPLATES`' **25** keys — a golden
  suite built to 22 silently misses three.
- The preview calls the production renderer in a sandboxed iframe, in phone, desktop and
  **plain-text** modes, with a forced-dark toggle.
- «أرسل اختبارًا» goes to the admin's **own** address through the live transport, and to no other.
- An unknown binding is refused by the **database**, for every writer.
- The text alternative is generated from the blocks; one edit changes both parts.

#### STORY-NTF-006 — Eight designed platform templates, seeded for every org
**Covers:** `REQ-NTF-014` · **M12** · **L**
- Seeded platform-owned on the A27 pattern: promotion adds, it never supplies the baseline.
- **Every** message key resolves to a designed template; no key falls back to unstyled text.
- An org duplicates one to own it; the original is never mutated.
- Changing the org logo restyles every message, which is what "one edit in one place" meant.

## EPIC-CAL — Calendar

#### STORY-CAL-001 — ICS and add-to-calendar
**Covers:** `REQ-CAL-001`, `REQ-CAL-002` · **M3** · **M**
- ★ Folding is at 75 **octets**; Arabic reads correctly in Outlook, Apple Calendar and Google.

#### STORY-CAL-002 — Connect, and the tokens nobody reads
**Covers:** `REQ-CAL-003`, `REQ-CAL-007` · **M3** · **L**
- No role can select a token column. Disconnect deletes immediately.

#### STORY-CAL-003 — Sync lifecycle
**Covers:** `REQ-CAL-004`, `REQ-CAL-005`, `REQ-CAL-006` · **M3** · **L**
- One event per member per session, by constraint. A 404 on delete is success.

#### STORY-CAL-004 — Failures never block
**Covers:** `REQ-CAL-008` · **M3** · **S**

## EPIC-DSC — Discovery

#### STORY-DSC-001 — Categories and tags
**Covers:** `REQ-DSC-001`, `REQ-DSC-002` · **M5** · **M**

#### STORY-DSC-002 — Search with Arabic normalisation
**Covers:** `REQ-DSC-003`, `REQ-DSC-004`, `REQ-DSC-005` · **M5** · **L**
- «معرفات» matches «مُعرِّفات»; «ادارة» matches «إدارة».
- Results respect phase gating and profile tiers.

#### STORY-DSC-003 — Bookmarks, and metadata-only material search
**Covers:** `REQ-DSC-006`, `REQ-DSC-007` · **M5** · **S**
- No job extracts text from PDFs.


#### STORY-DSC-004 — Tags become a UI
**Covers:** `REQ-DSC-008` · **M10** · **M**
- The data has been there since `0037` and **no screen creates, attaches or displays one**; this is
  unshipped UI over shipped data, not a new feature.
- A proposer adds tags through the combobox with Arabic-normalised matching and free creation,
  max 8, each a removable chip; chips link to a filtered browse.
- An admin renames, **merges** near-duplicates and deletes, with usage counts maintained by trigger.
- A merge moves every attachment, leaves no orphan, and is audited.

## EPIC-ADM — Admin consoles

#### STORY-ADM-001 — The super-admin console
**Covers:** `REQ-ADM-001`, `REQ-ADM-003` · **M8** · **L**
- Metrics are aggregate only; no member, session title or content is visible.

#### STORY-ADM-002 — No data plane, and break-glass
**Covers:** `REQ-ADM-002`, `REQ-ADM-019` · **M8** · **L**
- ★ A super admin gets zero rows from every data table.
- Impersonation expires on its own and appears in **the org's own** audit log.

#### STORY-ADM-003 — The org dashboard
**Covers:** `REQ-ADM-004` · **M7** · **L**
- Every figure clicks through to the list behind it.

#### STORY-ADM-004 — Managed lists
**Covers:** `REQ-ADM-005`, `REQ-ADM-006`, `REQ-ADM-007`, `REQ-ADM-008` · **M7** · **L**
- An entity referenced by history cannot be deleted; deactivation is offered.

#### STORY-ADM-005 — Members, roles, and the moderator scope
**Covers:** `REQ-ADM-009`, `REQ-ADM-020` · **M7** · **L**
- The last org admin cannot be removed.
- A moderator calling a scheduling or scoring endpoint directly is rejected by policy.

#### STORY-ADM-006 — Moderation queues
**Covers:** `REQ-ADM-010` · **M7** · **L**
- The **takedown** queue is distinct from the **report** queue.

#### STORY-ADM-007 — Configuration surfaces
**Covers:** `REQ-ADM-011`, `REQ-ADM-012`, `REQ-ADM-013`, `REQ-ADM-014`, `REQ-ADM-015`, `REQ-ADM-016` · **M7** · **XL**
- The branding screen states the **minimum logo resolution** up front.

#### STORY-ADM-008 — Exports and the audit log
**Covers:** `REQ-ADM-017`, `REQ-ADM-018` · **M7** · **L**
- UTF-8 **with BOM**; Arabic headers; org numerals; **every export audited**.
- The log is append-only; a moderator sees only their own actions.


#### STORY-ADM-009 — Downloads reach the screens that need them, and are audited
**Covers:** `REQ-ADM-021`, `REQ-DSG-027` · **M11** · the poster half in **M15** (`DEC-176`); the photo half in **M16** (`DEC-180`) · **M**
- **The mechanism is not invented** — `signExportUrl()` already mints a five-minute signed URL. ★ `DEC-176`:
  one screen consumes it, not three, and two more functions mint the same URL — they fold into one.
  This story is **reach**.
- The poster menu lists every ready artifact on the event page and SCR-043, for staff and the
  session's own presenters.
- Photos need their own signer; **«تنزيل الكل»** is `JOB-zip_session_photos`, because zipping 300
  photographs in a request blocks a function.
- Every download writes an audit row; the served file is the EXIF-stripped one, the only one there
  is.

## EPIC-INT — i18n and RTL

#### STORY-INT-001 — Arabic-first, RTL by default
**Covers:** `REQ-INT-001`, `REQ-INT-004` · **M1** · **L**
- A lint rule fails on physical directional properties.
- No `rtl:` variant is paired with a physical utility for the same property.

#### STORY-INT-002 — Externalised strings and locale formatting
**Covers:** `REQ-INT-002`, `REQ-INT-003` · **M1** · **L**
- A date renders identically on `ar-EG`, `ar-SA` and `ar-MA`.
- `ar-SA` does not silently produce Hijri dates.
- Arabic plurals use all six ICU forms.

#### STORY-INT-003 — Typography tokens, numerals, bidi
**Covers:** `REQ-INT-005`, `REQ-INT-006`, `REQ-INT-007` · **M1** · **L**
- Letter-spacing on Arabic fails review; no text line has `overflow: hidden`.
- One screen never mixes numeral systems.
- «جلسة عن Next.js 16» renders correctly in UI, email and every export.

#### STORY-INT-004 — Font loading, subsetting, and the English switch
**Covers:** `REQ-INT-008`, `REQ-INT-009` · **M1** · **M**
- ★ Subsetting preserves `rlig`, `mark`, `mkmk` — verified by the goldens, per font, per build.
- `/en/app/*` redirects until the catalogue is complete; the marketing `/en` is untouched.


#### STORY-INT-005 — Display follows the org; machine-readable surfaces never do
**Covers:** `REQ-INT-010` · **M11** · **S**
- CSV exports, certificate serials, verification codes, URLs and filenames are **always** `nu-latn`.
- A CSV opens in Excel and Sheets with numeric columns parsed as numbers, Arabic intact.
- A printed serial verifies against `/verify/[code]` character for character.

## EPIC-NFR — Non-functional

#### STORY-NFR-001 — RLS everywhere, with tests
**Covers:** `REQ-NFR-001`, `REQ-NFR-006` · **M1** · **XL**
- A table without RLS fails CI; a policy without a test fails review.
- `policy-diff` blocks on any drift between the migrations and `03`.

#### STORY-NFR-002 — Validation and CSP
**Covers:** `REQ-NFR-002`, `REQ-NFR-003` · **M1** · **M**
- Authority is re-derived server-side; a valid shape naming someone else's row is rejected.

#### STORY-NFR-003 — Server-side data access and rate limits
**Covers:** `REQ-NFR-004`, `REQ-NFR-005` · **M1** · **L**
- ★ `getClaims()` narrowing is on `data`, not `error` — asserted by a test that would otherwise
  let an unauthenticated request through.
- Limits live in a shared store, never in process memory.

#### STORY-NFR-004 — Accessibility and performance budgets
**Covers:** `REQ-NFR-007`, `REQ-NFR-008`, `REQ-NFR-009` · **M8** · **XL**
- Every interactive element is keyboard-operable with visible focus at 3:1.
- The check-in screen meets the strictest budget in the product.

#### STORY-NFR-005 — Scale and PWA-readiness
**Covers:** `REQ-NFR-010`, `REQ-NFR-011` · **M8** · **M**
- No plan degrades to a sequential scan at 10× the target row counts.
- No decision assumes the absence of a service worker — **and none is built**.

#### STORY-NFR-006 — Retention, export, deletion, PDPL
**Covers:** `REQ-NFR-012`, `REQ-NFR-013`, `REQ-NFR-014`, `REQ-NFR-015` · **M8** · **XL**
- Every retained class has a period and a job.
- Post-deletion assertions find no row and no storage object for a deleted org.
- The hosting region is recorded as a fact to revisit (OQ-026).

#### STORY-NFR-007 — Observability and environments
**Covers:** `REQ-NFR-016`, `REQ-NFR-017` · **M0** · **L**
- Every alert in `11` §3.2 fires in a drill.
- Three Supabase projects exist; nobody runs migrations against production by default.

#### STORY-NFR-008 — Testing, the frozen contract, forward-only migrations
**Covers:** `REQ-NFR-018`, `REQ-NFR-019`, `REQ-NFR-020` · **M0** · **XL**
- Playwright, jsdom and `@testing-library` installed and wired into CI.
- `scripts/qa.mjs` stays green; `main` stays deployable; `registrations` is never altered.

## EPIC-UIX — The interface system

*Added with the design milestone (`DEC-069`, `DEC-070`). `16-ui-redesign.md` §15 and §16 carry the
file-level split; these are the stories the traceability gate counts.*

#### STORY-UIX-001 — The component system exists and is the only source of primitives
**Covers:** `REQ-UIX-001` · **M9** · **L**
- `src/components/ui/index.ts` lands in **hour one** carrying every signature with stub
  implementations that render plain semantic HTML; four tracks typecheck against it immediately.
- It exports **types only** — a runtime barrel would drag three `"use client"` primitives into the
  client graph of every server page that imports `Card`.
- `ui-lint` fails a control class string declared outside the system, and a `<form>` holding an
  `<input>` outside `<Field>`; **it excludes `src/components/ui/` for both rules**, or it fails the
  primitives it exists to protect.
- Its allowlist is committed, shrinking, and flips to hard-fail in M13 — 65 files carry the copied
  string today.
- Every primitive has a jsdom test, an axe assertion, an RTL check and a gallery entry.

#### STORY-UIX-002 — One shell, and a tab bar that knows when to hide
**Covers:** `REQ-UIX-002` · **M9** · **L**
- Search, catalogue, bell and account menu on desktop; a contextual bottom tab bar below `md`.
- The tab bar hides on detail and immersive screens, replaced by a bottom **action** bar.
- **`main`'s `padding-block-end` ships in the same commit as the bar**, and the proof capture is a
  390 px screenshot of an **old, untouched** screen — not a new one.
- A test asserts no screen ever carries two fixed bottom bars.
- The `<details>` disclosure is gone; a moderator can find their queue.

#### STORY-UIX-003 — One status vocabulary, everywhere a session appears
**Covers:** `REQ-UIX-003`, `REQ-UIX-004` · **M9** · **M**
- `sessionPhase()`, `seatState()` and `viewerRelation()` are pure, unit-tested and use the
  database's own spellings.
- A totality test feeds `sessionPhase()` every state × null-schedule combination and asserts it
  never returns undefined.
- A direction test asserts the derived phase **only ever removes** an affordance, for every phase
  pair.
- One badge renders on all eight surfaces; `completed` is visible to a **member**, not only staff.

#### STORY-UIX-004 — The loading model
**Covers:** `REQ-UIX-005`, `REQ-UIX-006`, `REQ-UIX-007` · **M9** · **M**
- ~12 `loading.tsx` at meaningful boundaries cover all 49 pages; `loading-coverage` enforces "at or
  above", not one per route.
- No skeleton calls `getTranslations`; each is `aria-hidden` and direction-agnostic.
- The progress bar appears only past ~150 ms, driven by `useLinkStatus()` inside `ui/link` — not by
  a router-events shim that does not exist in the App Router.
- The splash is CSS-only, cross-fades over content already painted, and is dropped rather than the
  budget if it costs LCP.
- No pending control blanks its label; a seat is never optimistically confirmed.

#### STORY-UIX-005 — The failure model
**Covers:** `REQ-UIX-016` · **M9** · **S**
- An `error.tsx` at every boundary that has a `loading.tsx`, each rendering the shared `RouteError`;
  `error-coverage` fails a boundary with a skeleton and no error boundary.
- A `not-found.tsx` per dynamic segment — `notFound()` is already called in six places with no
  boundary to catch it.
- `global-error.tsx` exists, hard-codes Arabic and `dir="rtl"`, and is asserted to contain it.
- No member ever sees Next's default English left-to-right error page.

#### STORY-UIX-006 — The form model answers "which fields did I miss"
**Covers:** `REQ-UIX-009`, `REQ-UIX-010`, `REQ-UIX-011` · **M9** · **L**
- `<Field>` is the only wrapper and wires `htmlFor`, `aria-describedby`, `aria-invalid` and
  `aria-required` itself.
- `<FormSummary>` is focused on failure and each item is **a link that focuses its control** — and
  the control lands **below** the sticky header, not behind it.
- Required is «مطلوب» on the label, never an asterisk, which collides with the RTL run.
- Values survive a failed round trip through `formStateFrom()`; inline validation runs on blur only
  after the first submit attempt.

#### STORY-UIX-007 — Never a dead end, and never an unconfirmed destruction
**Covers:** `REQ-UIX-012`, `REQ-UIX-013` · **M9** · **S**
- Every list surface has an empty state naming the next action; a filtered-empty state names the
  filter that emptied it.
- Every destructive action confirms in a house dialog **naming the object**, never `confirm()`.
- The one-way poster detach is a confirmation dialog, not a sentence above a link.

#### STORY-UIX-008 — Focus is never obscured, and the shell can be skipped
**Covers:** `REQ-UIX-017` · **M9** · **S**
- A skip link is the first focusable element; console pages carry a second past the rail.
- `scroll-padding` and `scroll-margin` derive from the fixed layers' heights.
- A Playwright spec tabs every focusable element on the event page and the proposal form, at 390 px
  and desktop, and **fails when a fixed or sticky element intersects the focused one**.

#### STORY-UIX-009 — The searchable member picker, everywhere a member is chosen
**Covers:** `REQ-UIX-008` · **M10** · **S**
- `ui/combobox` is **promoted and generalised** from `src/components/admin/member-picker.tsx`, not
  built from nothing — it is already a filtered listbox with `useId` wiring and keyboard handling.
- What is new is Arabic normalisation, multi-select, and adoption on the proposal form.
- No screen renders every org member as a checkbox list; it is usable at 400 members.

#### STORY-UIX-010 — The affordance rule, and the five live bugs
**Covers:** `REQ-UIX-015` · **M9** · **M**
- The 49-cell matrix (7 phases × 7 relations) has one assertion per cell.
- The five shipped defects are fixed: the calendar slot, the tasks slot, the check-in link at
  `page.tsx:225`, the check-in screen that does not know which session it is, and the ungated host
  and admin links.
- `getSessionForEvent()` returns `viewerRelation` **once**; `SlotProps` gains it (`DEC-092`) rather
  than four slots each re-reading the RSVP.
- A gated slot's `<section>` and heading are gated with it, proven by one component test per slot.

#### STORY-UIX-011 — The motion system
**Covers:** `REQ-UIX-014`, `REQ-UIX-018`, `REQ-UIX-019`, `REQ-UIX-020` · **M10** · **M**
- The twelve keyframes already in `globals.css` are **reused**, not replaced; `package.json` gains
  no animation dependency.
- Two Tier-1 moments, five Tier-2, and nothing at all on errors, queues, tables or exports.
- Each Tier-1 moment names its own **static** state, and the 390 px review looks at both.
- A reduced-motion pass asserts the end state is reached and nothing is mid-transition; a throttled
  CPU trace shows **no frame over 16 ms**.

#### STORY-UIX-012 — The landing screen is the sessions timeline
**Covers:** `REQ-UIX-021`, `REQ-UIX-022` · **M9** · **L**
- `/app` renders the sessions a member can attend, one column, grouped by date.
- Their next committed session is the first item, not a hero above the list.
- The active filter set is visible without opening anything; each is individually removable.
- Below `md` the controls open as a sheet rather than pushing the list sideways.
- The empty case is the same screen with an invitation to propose.

#### STORY-UIX-013 — Every disclosure closes when it has been used
**Covers:** `REQ-UIX-023` · **M9** · **S**
- Following a link inside a menu leaves no panel over the destination — the defect the owner hit,
  and one a test must hold, because under Partial Rendering the layout does not re-render.
- Outside click and `Escape` both close; `Escape` returns focus to the trigger.
- No two disclosures are open at once.
- The sweep covers every interactive element in the shell and the primitives at 390 px and desktop.

#### STORY-UIX-014 — The discussion becomes a composition surface
**Covers:** `REQ-UIX-024` · **M10** · **L**
- A real editing affordance, not a bare textarea; visible upload controls, not a hidden input.
- Pending, success and failure on every action.
- The reaction is `dot-pulse` + `ripple-ring` — a whisper, because `REQ-EVT-004` earns nothing.
- The server still sniffs the bytes and still refuses SVG.

#### STORY-UIX-015 — The public site gets a door into the platform
**Covers:** `REQ-UIX-025` · **M13** · **M**
- «تسجيل الدخول» is persistent and visible on every marketing page, phone and desktop, and never
  sits only in the footer. Today the header and **both** CTAs point at `/register` alone, so a
  member with an account has to type `/sign-in` (`DEC-126`).
- It is visually distinct from «سجّل اهتمامك» and does not replace it — the interest list is not a
  sign-up (`DEC-002`, invariant 2), and `registrations` is not touched.
- The copy says the platform exists and what it is for; the landing page is no longer only a
  pre-launch interest page.
- **Nothing lands before M13.** The routes are a frozen public contract until then
  (`REQ-NFR-019`); `npm run qa` stays 44/44 and the visual baseline is re-cut in the same commit
  as the rebuild, never ahead of it.

#### STORY-UIX-016 — The three `(auth)` screens on the design system
**Covers:** `REQ-UIX-001`, `REQ-NFR-007`, `REQ-AUT-001` · **M10** · **M**
- `DEC-097` put `sign-in`, `choose-org` and `no-access` in M9; M9 shipped and **all three import
  zero `ui/` primitives** (`DEC-129`). Their functional stories — `STORY-AUT-001`, `STORY-AUT-003` —
  are M1 and **done**, so nothing scheduled the redesign and no gate noticed.
- `sign-in` carries **`SC 3.3.8` Accessible Authentication**, tested: paste is allowed into the code
  field, `autocomplete="one-time-code"` is present, no handler blocks a password manager.
- The one-time code is **Western digits** (`REQ-INT-006`, `DEC-124`).
- `no-access` names the next action (`REQ-UIX-012`) — a dead end that explains nothing is the
  failure this screen exists to prevent.
- ★ `DEC-126`'s «تسجيل الدخول» on the public site **lands here**, so this ships no later than the
  marketing door.

## EPIC-SUR — The survey

#### STORY-SUR-001 — The survey entities and their policies
**Covers:** `REQ-SUR-001`, `REQ-SUR-002` · **M11** · **L**
- Four tables, each with `org_id`, RLS and a full policy set; the generated isolation sweep covers
  them the day they exist.
- Questions are ordered and reorderable **without dragging**, through the shared
  `ui/reorderable-list`.
- A template is reusable across sessions without copying questions by hand.

#### STORY-SUR-002 — One screen, two decorrelated writes
**Covers:** `REQ-SUR-003`, `REQ-SUR-004`, `REQ-SUR-009` · **M11** · **M**
- Eligibility is check-in inside the rating window; a second response is refused, not duplicated.
- The rating is written by the action; the survey response is enqueued with a **jittered delay**,
  with no shared request id, correlation id or client key.
- `ratings.submitted_at` is coarsened to the **day**.
- The test: for any member, the set of ratings within ±N minutes of their survey response is **not
  of size 1**.

#### STORY-SUR-003 — Results are staff-only, withheld at small N, exported in Western digits
**Covers:** `REQ-SUR-005`, `REQ-SUR-006`, `REQ-SUR-007`, `REQ-SUR-008` · **M11** · **M**
- An explicit RLS case proves **a presenter reading their own session's survey results is refused**.
- The withhold covers scale means and choice distributions, not only free text.
- The CSV is UTF-8 with BOM, **Western digits**, and audited.
- Response rate is against **eligible attendees**, and a session with none says so.

---

## 23a. Wave 12 — `M14`, new scope (`DEC-172`)

#### STORY-SES-012 — An admin changes a session's presenters after it is created
**Covers:** `REQ-SES-019` · **M14** · **M**
- `add_session_presenter()` and `remove_session_presenter()`, admin only and audited. The same-org
  guard, the presenter limit, the notifier and the poster hook run unchanged, because both write
  the table.
- An added presenter is assigned (`accepted = true`), and removing the last one is refused.
- The control is on SCR-043, composed from the member picker and `RemovePresenter`.

#### STORY-PTS-007 — Every session award pays at completion
**Covers:** `REQ-PTS-015` · **M14** · **L**
- `attendance_recorded()` evaluates only a session that has already completed. `award_points()`
  loses its multi-day-only clause, and `proposal_accepted` moves to the completion fan-out under
  its old key.
- Presenter awards follow the presenter after completion: paid on becoming an accepted presenter,
  reversed by a compensating row on leaving, and re-payable under an epoch.
- A pending amount is computed by one function and one DTO, and never stored.
- Streaks and badges count completed sessions.

#### STORY-CHK-008 — Check-in acknowledges what is pending
**Covers:** `REQ-CHK-018` · **M14** · **M**
- SCR-014 and the attendance outcome on SCR-012 show nothing earned, pending, paid or incomplete,
  read from `scoring`'s DTO, and show the same after a reload.

#### STORY-UIX-017 — A poster is shown whole
**Covers:** `REQ-UIX-026` · **M14** · **S**
- `CardMedia` never crops a designed artefact; each surface's aspect is decided and written down;
  the public card's visual pair and the gallery are re-baselined in the same commit.

---

## 23b. Wave 13 — `M15` (`DEC-176`)

#### STORY-SES-013 — A session's settings are reached from one place
**Covers:** `REQ-SES-020` · **M15** · **M**
- One sub-nav over the session's existing admin screens, not a new screen that copies them.
- The certificate mode has one writer and is only shown elsewhere.
- Materials, tasks and photos are reachable from it. This is the first thing shed if the wave must
  shed anything.

---

## 23c. Wave 14 — `M16` (`DEC-180`)

#### STORY-UIX-018 — Inside the platform, the wordmark leads home
**Covers:** `REQ-UIX-027` · **M16** · **S**
- An additive `href` prop on `Wordmark`, defaulting to `/`; the app shell passes `/app`.
- `qa:contract` and the visual baseline do not move — not re-baselined.

---

## 23d. Wave 15 — `M17`, the visual direction's foundation (`DEC-183`)

*The first wave of a programme. **No screen adopts any of this in M17**: the app and the public site
look as they did, and the gallery is where the playground is seen. The stories for the five
moments, session stories, the timeline's new items, proposal voting and the weekly leaderboard are
written by the wave that builds each.*

#### STORY-UIX-019 — The playground's tokens land as a scope
**Covers:** `REQ-UIX-028` · **M17** · **M**
- `tokens.css`'s palette, radii, type scale and durations are added under names that collide with
  nothing; the five colliding names and the two colliding utilities of `DEC-183` §4.2 keep today's
  values.
- The semantic layer is on a scope class with a light variant; the gallery applies it and the shell
  does not.
- Proof: the four public routes at 0.000 % against a capture of `main`, and `/app` at 390 px before
  and after the token commit, opened by the lead.

#### STORY-UIX-020 — Baloo Bhaijaan 2 enters through the font door
**Covers:** `REQ-UIX-029` · **M17** · **M**
- Declared in `src/lib/fonts.ts`, never preloaded on a public route; extracted, derived and checked
  by the three `fonts:*` scripts.
- The extracted `.woff2` and the derived `.ttf` are compared, feature by feature, with the reference
  files in `docs/design/assets/fonts/`; `rlig`, `mark` and `mkmk` are present in both.
- A lam-alef with tashkeel is rendered in the app's Chromium and in the worker's, and looked at.
- No parity golden moves.

#### STORY-UIX-021 — The 37 primitives move onto the scope, each by its owner
**Covers:** `REQ-UIX-030` · **M17** · **L**
- The order is `docs/design/07-tasks.md`'s: the button, the chip, the status badge, the avatar, the
  card, the form set, the sheet, the tabs, the toast, the skeleton, then the console's primitives.
- One commit per primitive, each with its gallery capture at 390 px and at desktop width.
- Outside the scope nothing moves: the existing component tests pass with their assertions
  untouched, and a changed assertion is a ledger line in `STATUS.md`.

#### STORY-UIX-022 — The session post's primitives
**Covers:** `REQ-UIX-031`, `REQ-UIX-032`, `REQ-UIX-034`, `REQ-UIX-040` · **M17** · **L**
- `sticker`, `poster`, `reaction-bar` and `story-ring`, each rendering every state from props, with
  a jsdom test, an RTL check and a gallery entry.
- None is placed on a screen, and none reads the DAL.

#### STORY-UIX-023 — The session's one action, and the code it asks for
**Covers:** `REQ-UIX-033`, `REQ-UIX-035` · **M17** · **M**
- `session-cta` renders its six states from props; the affordance matrix is not touched and its 42
  assertions pass unchanged.
- `code-input` takes a pasted code, reads left to right inside the Arabic page, and ties its error
  to the group.

#### STORY-UIX-024 — The game layer's primitives
**Covers:** `REQ-UIX-036`, `REQ-UIX-037`, `REQ-UIX-038`, `REQ-UIX-039` · **M17** · **L**
- `progress-bar`, `rank-row`, `race-bar` and `level-card`, each rendering every state from props.
- The rank change and the level's flip are **states** this wave; the orchestration is the next
  wave's.
- A falling row is asserted to carry no colour, no icon and no motion.

#### STORY-UIX-025 — Nine glyphs, six objects and the wordmark
**Covers:** `REQ-UIX-041`, `REQ-UIX-042` · **M17** · **M**
- The nine glyphs are drawn into `ui/icons.tsx`'s own shape; the seven that already exist are not
  drawn twice.
- The objects and the wordmark are installed as `docs/design/08-assets.md`'s table says, except the
  three rows `DEC-183` §4.8 – §4.10 rule on: the favicon, the shell's wordmark and the first org's
  logo do not change.
- The coin's numeral is settled at sync 1 (`DEC-183` §4.14).

#### STORY-UIX-026 — A company's team colour
**Covers:** `REQ-UIX-043` · **M17** · **M**
- `companies.team_color` in `0160`: nullable, checked, with its grant; `main`'s app and worker on
  the new schema do nothing different.
- The field on SCR-048, with a swatch **and** the colour's value in words; the avatar takes a team
  ring and keeps its tint.
- An RLS case: a moderator and a member cannot write it; another org cannot read it.

## 23e. Wave 16 — `M18`, the five moments (`DEC-195`)

*The moments land on the real screens, and `DEC-195` §1.1 names the five surfaces that move and §1.2 everything that
does not. The five public routes do not move. Every moment has a re-render test and a static state captured at
390 px beside its animated counterpart.*

#### STORY-UIX-027 — The moments' shared mechanism
**Covers:** `REQ-UIX-044` · **M18** · **M**
- `src/lib/ui/confetti.ts`, `useCountUp` and the once-per-occurrence keying land before any track uses them, each
  with a jsdom test that covers reduced motion.
- The keying is proved by mount, play, unmount, mount again — silence.
- The public-graph test still finds no scope, and `qa:contract`, `visual`'s public pairs and the register form's
  fingerprint are unchanged at every commit of the wave.

#### STORY-UIX-028 — الحجز on the event page's action card
**Covers:** `REQ-UIX-045`, `REQ-UIX-044` · **M18** · **L**
- The reserve action returns what the moment is keyed on; a redirect that drops it is the defect.
- The ticket, the stamp, the thud, the capacity chip, `session-cta`'s booked state, the calendar whisper; the
  waitlisted variant in the waitlist's status tone.
- A reload shows the static state. A throttled-CPU trace: no frame over 16 ms.

#### STORY-UIX-029 — تسجيل الحضور on the check-in screen
**Covers:** `REQ-UIX-046`, `REQ-UIX-044`, `REQ-UIX-035` · **M18** · **L**
- Confetti, the coin, the three lines; the amount from the pending state, and no number when nothing is earned.
- The code entered in `code-input`, the posted field and the no-JS path unchanged.
- The event page's action reads «حضرت» afterwards; the matrix's changed answer is a ledger line.
- A reload shows the static state. A throttled-CPU trace: no frame over 16 ms.

#### STORY-UIX-030 — انتهت الجلسة and ترقية المستوى on the points screen
**Covers:** `REQ-UIX-047`, `REQ-UIX-044` · **M18** · **L**
- The head of `SCR-022`: the balance counting up with its delta, the flame, the level bar, `level-card`.
- Keyed on the ledger rows and the level, played at first sight and never again; what was seen is recorded as sync
  1 rules.
- The history and the catalogue do not animate.

#### STORY-UIX-031 — تغيّر الترتيب on the two boards
**Covers:** `REQ-UIX-048`, `REQ-UIX-044` · **M18** · **L**
- The boards' rows on `rank-row` and `race-bar`; the swap by FLIP; the arrow shown, not pulsed (`DEC-197` §2); a bar by `scaleX`.
- «Since last view» has a data source, ruled at sync 1; a table is the lead's, with its RLS case.
- A falling row is asserted to carry no colour, no icon and no motion of its own.

#### STORY-UIX-032 — A company's colour, chosen when it is created
**Covers:** `REQ-UIX-043` · **M18** · **S**
- The add form on `SCR-048` carries the named-colour picker; the insert carries the colour, or none.
- Whether an insert with a colour is audited is measured, and the answer is written down.
- A 390 px capture of the add form, looked at. **No logo, anywhere** (`DEC-195` §4).

## 23f. Wave 17 — `M19`, every primitive, and one visual language (`DEC-199`)

*The playground becomes the only visual language: every surface but the five public routes enters the scope at the
root of its layout, and the eight primitives the design's task list never named take their design. **No screen is
rebuilt in this wave** — a screen is rebuilt to its design in its own wave, never restyled (`DEC-199` §2).*

#### STORY-UIX-033 — The gate that reads the directory
**Covers:** `REQ-UIX-050` · **M19** · **M**
- `tests/unit/ui-playground.test.ts` enumerates `src/components/ui/*.tsx` against a registry; it lands red and
  names every file with no treatment, no scope test or no demo.
- Each declared treatment is checked against the source; there is no «pending» kind.
- It is green over all 49 files before the wave closes.

#### STORY-UIX-034 — The token move: the scope at the root of every layout but the public site's
**Covers:** `REQ-UIX-049` · **M19** · **L**
- `PlayScope` at the root of the shell, `(auth)`, `legal`, `s`, `verify` and the gallery; the five moment surfaces
  lose their own; the document's ground follows the scope.
- `.theme-dark` leaves every scoped layout; the toast region enters; the shell stops emitting the org theme layer.
- `qa:contract`, `qa:appearance`, `visual`'s public pairs and the register-form fingerprint are unmoved, and the
  public-graph test still finds no scope.

#### STORY-UIX-035 — Seven primitives the list never named
**Covers:** `REQ-UIX-051` · **M19** · **M**
- `page-header`, `section-header`, `prose`, `link`, `icon-button`, `submit-button`, `reorderable-list`: a
  `-scope` test, an RTL check and a gallery entry each; no behaviour, prop or name changes.
- The missing scope tests on `dialog`, `skeleton`, `toast`, `route-progress` and `route-error`, and `button`'s demo.

#### STORY-UIX-036 — The glyphs, last
**Covers:** `REQ-UIX-052` · **M19** · **M**
- `icons` inside the scope, with a gallery entry of the whole set.
- One commit, after everything else, with `qa:contract`, `visual` and the fingerprint proved equal on both sides.

#### STORY-UIX-037 — The raw palette leaves the app
**Covers:** `REQ-UIX-049` · **M19** · **M**
- Every raw palette class outside the public site's files is replaced by a semantic name: the member side by
  `content`, the staff side by `console`, the shell by the lead; a test holds the count at zero.
- The accessibility sweep over every route inside the scope: 0 findings.
- The gallery captured at 390 px and at desktop width, for the owner's review on a phone.

#### STORY-UIX-038 — The console's register
**Covers:** `REQ-UIX-053` · **M19** · **S**
- A test walks the console's import graph and finds no moment, confetti, object or sticker.
- The six data-dense primitives under the new values: tokens only, no animation; the console's screens captured at
  390 px.

## 23g. Wave 18 — `M20`, the member screens, batch A (`DEC-205`, `DEC-206`)

*Nine screens rebuilt from thirteen artboards. ★★ **Every story below is a REBUILD** (`DEC-199` §2): the screen is
built from its artboard — its regions in the artboard's order, its copy from `messages/ar/` first, its primitives
by name. **Nothing in the current page file survives by default**; the data layer, the server actions, the
behaviour tests and every requirement the screen already meets do. A story that reads «restyle X to match» is
written wrong. ★★ **From PR B on (`DEC-208`): the page file is DELETED first, then written from its artboard — two commits — and each story's note carries a table of what it kept and the `REQ-*` that made it keep it, re-derived from the requirements and the DAL, never from memory.** Each screen's definition of done: **it matches its artboard at 390 px, and at 1280 where one is
drawn, in a capture the lead opened**; `ui-lint --strict` passes; its scope tests pass; `qa:contract` is untouched.
PR A is stories 039 – 047; PR B is 048 – 050.*

#### STORY-UIX-039 — The shell: five tabs, and two rails on desktop
**Covers:** `REQ-UIX-054` · **M20** · **L** · PR A · lead
**Built from:** `Home.dc.html` (the phone's top row and tab bar), `HomeDesktop.dc.html` (the bar and the three columns); `M10a.md` §0.
- The tab bar is rebuilt with five links, the third raised; `main`'s `padding-block-end` moves in the same commit.
- From `lg`: the top bar; a sticky navigation rail with «اقترح جلسة», the four destinations that exist and a ruled
  staff section with its count; the content column; a named game-rail region that screens fill through a slot.
- ★ **Not drawn, and built:** the account menu on the phone (`DEC-206` §4.33 — measured first); the frame at
  `md`, between the phone and `lg`; the rail with no staff role; an immersive route, which renders neither bar nor
  rails (`shell-routes.ts`, unchanged); the bell with no unread; the shell's disclosures closing (`REQ-UIX-023`).
- **Primitives:** `icon-button`, `button`, `avatar`, `link`, `menu`, `badge`.
- The scope stays the layout's and nothing under it is transformed (`scope-root`); the shell specs that exist are
  evidence, each changed assertion a ledger line.

#### STORY-UIX-040 — `0164`: the announcements table, with all five parts
**Covers:** `REQ-UIX-056` · **M20** · **M** · PR A · lead
- ★★ **Named one by one, because `0002` exists solely because `0001` forgot the fourth:**
  1. **`org_id`**, not null, referencing `orgs`, cascading;
  2. **RLS enabled** on the table;
  3. **the full policy set** — a member of the org selects a published, unexpired row; an admin of the org selects
     every row of it, and inserts, updates and deletes with the author held to the caller; a moderator and a member
     are refused every write; `anon` and `service_role` are revoked; no super-admin disjunct;
  4. ★ **a matching `grant` for every policy**, in the same file — `select, insert, update, delete` to
     `authenticated`, and nothing else;
  5. **its test**, `tests/rls/feed-announcements.test.ts`, one case per policy as the role it names, a `42501`
     for each refused write — **and a fixture row in `tests/rls/fixture.ts`, so the generated isolation sweep is
     non-vacuous over the table**, with the sweep's own line for it read in the run's output.
- `02` gains `feed_announcements`; `03` §8.2 gains its row and its policy block; `policy-diff` is green.
- Additive: nothing on `main` names the table, so `main`'s app and worker on the new schema do nothing different.
  The owner rehearses on a production schema dump, pushes, then merges.

#### STORY-UIX-041 — Four new primitives, and two add-only props
**Covers:** `REQ-UIX-057` · **M20** · **L** · PR A · `scoring` (`week-hud`), `content` (`feed-item`, `attendee-stack`, `card`'s `post`), `sessions` (`action-bar`, `session-cta`)
- Each new file: its signature in `ui/index.ts` (the lead's, types only), a registry entry, a test inside the
  scope, an RTL check, and **a gallery section showing every state in Arabic from fixture data**.
- `week-hud`: three figures and the way to the next level; a missing rank and a disabled streak as absences.
- `feed-item`: achievement, announcement and recap; none takes a reaction.
- `action-bar`: one primary and up to two icon buttons, safe-area padded.
- `attendee-stack`: the people it is given, with team rings, and a count in words.
- `card`'s `post` and `session-cta`'s phases are add-only: the existing suites pass with no assertion changed.
- The gate's floor moves from 49 to 53 in the commit that adds the fourth file (`DEC-206` §1.3).

#### STORY-UIX-042 — The door: sign-in, choose-org and no-access, rebuilt
**Covers:** `REQ-UIX-058` · **M20** · **M** · PR A · lead
**Built from:** `Main.dc.html` · `ChooseOrg.dc.html` · `NoAccess.dc.html`; `M10a.md` §1 – §3.
- `SCR-002`: the wordmark lockup, the card with the one Google action and its explanatory line, the panel about
  the carried destination, the sticker, the legal links. **No org is named** (`DEC-206` §4.37).
- `SCR-003`: the radio group of names with an initial in a tile, the panel saying why the choice is permanent, the
  submit, «الدخول بحساب آخر».
- `SCR-004`: the lock tile, the explanation, the visitor's own address masked, the two actions, the way home.
- ★ **Not drawn, and built:** `SCR-002`'s error in the page and its redirecting state; `SCR-003` pending, its
  error, three or more orgs; `SCR-004`'s suspended, deactivated and platform variants and the impersonation banner.
- **Primitives:** `card`, `button`, `panel`, `sticker`, `radio-group`, `submit-button`, `route-error`, `link`.
- The new strings are written in `messages/ar/auth.json` first. The `auth*` specs pass with no expectation changed.

#### STORY-UIX-043 — The public session card, rebuilt
**Covers:** `REQ-UIX-059` · **M20** · **S** · PR A · `sessions`
**Built from:** `PublicCard.dc.html`; `M10a.md` §4.
- The brand row, the poster whole at 4:5, the clock's badge, the title, the date and the place, the one action
  into sign-in with the session carried, the members-only line, the legal footer.
- ★ **Drawn, and not built** (`DEC-066`, `DEC-206` §4.42): seats, the presenter, the company.
- ★ **Not drawn, and built:** a session that is unlisted or a draft; cancelled; live; ended; several days; no
  rendered poster (the typographic placeholder, with no amount).
- **Primitives:** `poster`, `badge`, `button`, `link`. `session_public_card()` is not changed.
- ★ Confirmed before the first edit: `/s/[id]` is not one of the five frozen routes and `public-graph` does not
  root at it; the file it shares with them, `ui/button`, is not edited.

#### STORY-UIX-044 — Home is the feed, phone and desktop
**Covers:** `REQ-UIX-055`, `REQ-UIX-056` · **M20** · **L** · PR A · `content` (the page and the feed), `scoring` (the week, the race, the achievements), `sessions` (the session post's data)
**Built from:** `Home.dc.html` · `HomeDesktop.dc.html`; `M10a.md` §5.
- `/app` is a new page; `SessionsTimeline` stays `/app/sessions`' alone. Regions, in the artboard's order: the ring
  row · the week · the feed by date — session post, the company race, achievement, announcement, recap · the
  propose band. On desktop the post lays the poster beside the copy and the week becomes the game rail's cards
  with «التالية لك».
- One read model, `src/lib/dal/feed.ts`, merging four sources by date, committed-first within a day.
- ★ **Drawn, and not built** (`DEC-206` §4.47 – §4.57): a weekly rank, a skip, a round, a level-up item, a
  reaction on an achievement, a second reaction kind, faces of who attends, a reservation made from the feed.
- ★ **Not drawn, and built:** an empty feed; no company set; the staff strip; a member opted out of
  leaderboards; streaks switched off; no poster; a cancelled session; a waitlisted member; loading, as skeletons
  in the feed's own shape; an error.
- **Primitives:** `story-ring`, `week-hud`, `stat`, `progress-bar`, `card` (`post`), `avatar`, `badge`, `poster`,
  `reaction-bar`, `session-cta`, `race-bar`, `feed-item`, `button`, `empty-state`, `panel`.
- Moments 3 and 5 play on the week once per occurrence and share their mark with `SCR-022` and the boards: a test
  opens both surfaces and asserts the second is silent.

#### STORY-UIX-045 — Browse, rebuilt
**Covers:** `REQ-UIX-060` · **M20** · **M** · PR A · `sessions`
**Built from:** `Browse.dc.html`; `M10a.md` §6. **No 1280 artboard exists**: it is built in the shell's content column and captured there (`DEC-206` §4.36).
- The title, the search field in the page, the chip row with «المزيد», the eight tags, the date groups with their
  counts, the row card, the ended sessions behind one link.
- ★ **Drawn, and not built** (`DEC-206` §4.63): a sort, «الأعلى تقييمًا».
- ★ **Not drawn, and built:** empty by filter, naming the filter; search results as one group; loading as six row
  skeletons; the «later» group; a row that is full, waitlisted, closed, cancelled, multi-day, with no poster.
- **Primitives:** `page-header`, `input`, `tag-chip`, `sheet`, `section-header`, `card` (`row`), `poster`, `badge`,
  `avatar`, `icon-button`, `empty-state`, `skeleton`.
- `getTimeline()`'s filters, the query string and the bookmark action are unchanged; a field the row needs is
  add-only on the DTO.

#### STORY-UIX-046 — The design files never reach the build
**Covers:** `REQ-UIX-063` · **M20** · **S** · PR A · lead
- `tests/unit/design-files.test.ts`: no import from `docs/` under `src/`; no `.dc.html` under `src/` or `public/`;
  no class name an artboard or a prototype declares anywhere in `src/`. It is shown to bite on a planted case.
- After a production build, the output is searched for `.dc.html` and the count, zero, is recorded.

#### STORY-UIX-047 — The hard-load duplicate, re-measured on the rebuilt home
**Covers:** `REQ-UIX-055` · **M20** · **S** · PR A · lead
- `DEC-204`'s probe, on a production build, on the rebuilt `/app` alone, with `main` as the control in the same
  sitting: the rate the page stands twice in the DOM, beside the old 24 % and 6 %.
- ★ The accessibility tree is read in that window, as `DEC-204` asked: how many `h1`s, and what an id resolves to.
- **Recorded as still owed:** `/app/me/points` and `/app/leaderboards`, by the wave that rebuilds them. The defect
  is not fixed here and is not allowed to vanish into a rewrite.

#### STORY-UIX-048 — The event page, rebuilt around the whole poster
**Covers:** `REQ-UIX-061` · **M20** · **L** · PR B · `sessions`, with `content` for the materials, photos and discussion slots
**Built from:** `Event.dc.html` · `EventLive.dc.html` · `EventDone.dc.html` · `EventDesktop.dc.html`; `M10a.md` §7.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`.
- The top row, the poster whole at 4:5, the chip row, the title, the presenter card, the action card in flow, the
  sub-nav of sections that exist, then the sections in the artboard's order; the bottom `action-bar` on a phone;
  on desktop the hero band, the full-width action row that sticks once scrolled past, and the 1fr / 380 body.
- The slot contract stands: the page owns every `<section>` and `<h2>`; a slot renders no heading.
- ★ **Drawn, and not built** (`DEC-206` §4.66 – §4.74): objectives, «قدّمت N جلسات», a composer photo button, a map
  embed, faces of who attends for a plain member, «أعلى تفاعل».
- ★ **Not drawn, and built:** full → waitlist and the position; reserved, with its calendar and its cancel and
  the late-cancel warning; the deadline passed; did not attend; the presenter viewing; cancelled; several days;
  the matrix's every cell, asserted by the suite that already does.
- Moment 1 on the action card and moment 3 on the outcome card, each once, each with its static state.

#### STORY-UIX-049 — Check-in, rebuilt
**Covers:** `REQ-UIX-062` · **M20** · **M** · PR B · `checkin`
**Built from:** `CheckIn.dc.html`; `M10a.md` §8.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`.
- The close control, the title, the session's mini-row, the prompt, `code-input`, the rules line, the earn panel,
  the bottom bar with the one submit.
- ★★ **The wrong-code shake is NOT built until the owner rules** (`DEC-206` §4.75). `M10a.md` calls it input
  feedback rather than a system failure animating; `REQ-UIX-046` says a refused code does not animate. If the
  owner says yes, this story's text says why it is not `REQ-UIX-053`'s business — it is feedback on one input, on
  a member screen — and its reduced-motion form is the coral border and the message.
- ★ **Not drawn, and built:** rate-limited (10 in 10 minutes); already checked in; success, moment 2 and the
  1.4 s return; not open; a reservation required; the presenter, who is not offered it; an overlapping session.
- The posted field and the no-JS path are byte-identical.

#### STORY-UIX-050 — The host view, rebuilt
**Covers:** `REQ-UIX-062` · **M20** · **M** · PR B · `checkin`
**Built from:** `Host.dc.html`; `M10a.md` §9.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`.
- The code in two groups of three, the time to rotation, the count with the walk-ins, the open switch and its
  ceiling, the revoke action in coral outline, marking by hand in a `sheet` with a `combobox` and its reason.
- Projection: the code alone, as large as the viewport allows, the screen kept awake while live.
- ★ **Not drawn, and built:** before the session is live; after check-in closed; a rotation, by a cut and never a
  fade; a day of a multi-day session; a presenter who is not staff, who is not offered marking by hand.


## 23h. Wave 19 — `M21`, the member screens, batch B (`DEC-213`)

*Six screens rebuilt from eight artboards in `docs/design/screens/m10b/`, specified by `M10b.md`. ★★ **Every story
below is a REBUILD** (`DEC-199` §2), and ★★ **every screen is DELETED first, then written from its artboard**
(`DEC-208`) — two commits — with a kept-behaviour table in the owner's note. What `DEC-213` §5 says is not built is
absent; what it says is built, drawn or not, is built. Each screen's definition of done: **it matches its artboard
at 390 px, and at 1280 for `SCR-013` and `SCR-020`, in a capture the lead opened beside it**; `ui-lint --strict`
passes; `qa:contract` is untouched. One PR, `wave-19/m10b`.*

#### STORY-UIX-051 — The frame's four additions for batch B
**Covers:** `REQ-UIX-054` · **M21** · **S** · lead
- A full-screen route for the viewer: no bar, no rail, no tab bar and no footer, at every width (`DEC-213` §3.1).
- The phone's top row is the page's own on rate, propose, the proposal, the directory and the profile; from `lg` the
  shell's bar stands.
- The rail links «الأعضاء», current on the directory and on a profile; «حسابي» is no longer current on another
  member's profile; the account menu on the phone links the directory.
- The raised «اقترح» tab shows it is current — bone, the drawn muted shadow — with `aria-current` unchanged.
- `PageFrame` gains an add-only way for a page with no game rail to own its width.
- The shell's existing specs are evidence; each changed assertion is a ledger line.

#### STORY-UIX-052 — Four new primitives
**Covers:** `REQ-UIX-064` · **M21** · **L** · `event` (`star-input`), `sessions` (`stepper`), `content` (`page-viewer`), `scoring` (`badge-medallion`)
- Each: its signature in `ui/index.ts` (the lead's, types only, after sync 1), a registry entry, a test inside the
  scope, an RTL check, a gallery section with every state in Arabic from fixture data.
- ★ `page-viewer` is written in `ui/` and `src/components/viewer/page-viewer.tsx` is deleted (`DEC-213` §4); its
  behaviour cases are re-asserted against the primitive, each a ledger line.
- The gate's floor moves from 53 to 57 in the commit that adds the fourth file.

#### STORY-UIX-053 — The viewer, rebuilt
**Covers:** `REQ-UIX-065` · **M21** · **M** · `content`
**Built from:** `Viewer.dc.html` · `ViewerDesktop.dc.html`; `M10b.md` §1.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- Phone: the chrome bar (close, title, «صفحة N من M», download only when allowed), the page whole on black, the
  bottom chrome (previous, the scrubber with «N من M», next — the accent one, at the inline-end). Desktop: the bar
  with the presenter line and the keys, the rail at the inline-start, the page between previous and next, the footer
  line saying the original is never fetched.
- ★ **The direction test** (`DEC-213` §4): «next» advances and sits at the inline-end in `ar`; ← is next on desktop.
  Today's buttons are mirrored in behaviour and not in name — the rebuild fixes it and the test holds it.
- ★ **The URL test**: a member denied the download receives no signed URL.
- ★ **Drawn, and not built** (`DEC-213` §5.85): the Keynote state.
- ★ **Not drawn, and built:** loading (its own skeleton), rendering, failed with the PDF guidance, the font
  substitution notice, a single page, hidden chrome, reduced motion.

#### STORY-UIX-054 — Rate, rebuilt
**Covers:** `REQ-UIX-066` · **M21** · **M** · `event`
**Built from:** `Rate.dc.html`; `M10b.md` §2.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- The back control and the title, the session's mini-row with «حضرت», two `star-input` rows with the count read
  back, the comment with «N من 2000», the anonymity panel, the bottom `action-bar` with the submit and the window
  line.
- ★★ **The survey stays** (`DEC-213` §5.90, `REQ-SUR-004`): its section after the panel, its own write, the bar's
  label following its state; `wave10-event-rate-survey.spec.ts` is evidence.
- ★ **Not drawn, and built:** submitted (the in-page receipt), editing within the window, closed (read-only stars, no
  bar), not checked in and not completed (the explanation, not a 404), the error summary with what was typed kept.

#### STORY-UIX-055 — Propose, rebuilt
**Covers:** `REQ-UIX-067` · **M21** · **M** · `sessions`
**Built from:** `Propose.dc.html`; `M10b.md` §3.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- The title with «مقترحاتي N», the list above the form when non-empty, the lead line in the display face, the body,
  the no-schedule panel, the remaining count, section 1 (title, abstract, category, level as three chips, audience,
  duration), section 2 (co-presenters with their team rings, notes, the materials note), the earn panel read from
  the rules, the sticky `action-bar` with submit and save as draft. The tab bar's raised tab current.
- ★ **Drawn, and not built** (`DEC-213` §5.93, §5.97): autosave and its «saved» line; the hosting-gated card.
- ★ **Not drawn, and built:** the error summary with focus; the co-presenter limit reached; resubmit, with the
  reason pinned above section 1; the submitted confirmation; a draft saved.

#### STORY-UIX-056 — My proposal, rebuilt
**Covers:** `REQ-UIX-067` · **M21** · **M** · `sessions`
**Built from:** `Proposal.dc.html`; `M10b.md` §4.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- The back control, «مقترحي» and the date, the `stepper`, the reason card with the one primary, the summary, the
  presenters with their reply states and «+ أضف مُقدِّمًا مشاركًا», the draft materials (PDF only), the bottom bar.
- ★ **Drawn, and not built** (`DEC-213` §5.99 – §5.101): the reviewer's name, «السجل», «اسحب المقترح».
- ★ **Not drawn, and built:** submitted and in review, approved, scheduled (derived, with the session's poster and
  «افتح الجلسة»), rejected, a draft; the co-presenter's own view, answering an invitation.

#### STORY-UIX-057 — The directory, built
**Covers:** `REQ-UIX-068` · **M21** · **M** · `scoring`
**Built from:** `Directory.dc.html`; `M10b.md` §5. **A new page**: `/app/members` had boundaries and no page.
- The title with the count and the order («الأنشط أولًا» — sessions presented — or the name), search, the company
  chips with their dot, the rows, the «more» link with «N من M».
- One add-only DAL function: tier-1 fields only, the org's members, active by default, paged.
- ★ **Not drawn, and built:** an empty search with «clear», a member with no company, an opted-out member (level,
  never a rank), an interests row when the org has any, deactivated members marked for an admin, loading as a list.

#### STORY-UIX-058 — The profile, rebuilt
**Covers:** `REQ-UIX-069` · **M21** · **L** · `scoring`, with `content` (photos) and `sessions` (the presented count)
**Built from:** `Profile.dc.html` · `ProfileDesktop.dc.html`; `M10b.md` §6.
- ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, `?next=`, phase gates, the no-JS path, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- The top row (back, the breadcrumb, share), the header card, the standing card (`level-card`, the progress line,
  the month's rank, the all-time rank, the streak), the badges as `badge-medallion`s with «N من M», the sessions
  presented, the photos uploaded; desktop at 964 px with a 1fr / 380 body.
- ★ **Drawn, and not built** (`DEC-213` §5.114 – §5.117): a weekly rank, a colleague's average rating, points for an
  opted-out member, the level-up moment.
- ★ **Not drawn, and built:** the self tier (the note, the two actions, the six sections as links), the admin tier
  («للمشرفين»), opted out, no badges, no bio, nothing presented, no photos.

#### STORY-UIX-059 — The hub frame
**Covers:** `REQ-UIX-070` · **M22** · **M** · lead, with `scoring` (the standing card and band)
**Built from:** `Me.dc.html` · `HubDesktop.dc.html`; `M10c.md` §0.
- ★★ **Deleted first** (`DEC-208`): `me/layout.tsx` and `components/me/tab-strip.tsx` removed in one commit, the frame
  written from its artboards in the next; the kept-behaviour table in the lead's note.
- The phone's top row is the page's own on every hub page and on `/app/me/settings` and `/app/leaderboards/**`
  (`shell-routes.ts`); the tab bar stays, «حسابي» current under `/app/me` and «الترتيب» under `/app/leaderboards`.
- The strip: six links on a phone, seven from `lg` with «بياناتي وخصوصيتي»; `aria-current="page"`; sideways scroll,
  never clipped.
- Desktop: no game rail, and the standing band drawn once by the frame from `scoring`'s component.
- The shell's existing specs are evidence; each changed assertion is a ledger line.

#### STORY-UIX-060 — Three new primitives
**Covers:** `REQ-UIX-081` · **M22** · **M** · `scoring` (`podium`, `ledger-row`), `notify` (`settings-group`)
- Each: its signature in `ui/index.ts` (the lead's, types only, after sync 1), a registry entry, a test inside the
  scope, an RTL check, a gallery section with every state in Arabic from fixture data.
- The gate's floor moves from 57 to 60 in the commit that adds the third file. All three land in PR A.

#### STORY-UIX-061 — `0169`: the week's seen mark
**Covers:** `REQ-UIX-078` · **M22** · **S** · lead
- `weekly_period date` and `weekly_rank int check (weekly_rank > 0)` on `member_seen_marks`, both nullable,
  mirroring the monthly pair (`DEC-216` §2.2). No new table, policy or grant: the grant at `0162:66` is table-level
  and covers the columns, which the migration's header says so invariant 6 is not left assumed.
- Cases in `tests/rls/scoring-seen.test.ts`: a member writes and reads their own weekly mark, cannot write another's,
  and cannot write a rank of zero.
- `main`'s app and worker on the new schema do nothing different.

#### STORY-UIX-062 — My profile, rebuilt
**Covers:** `REQ-UIX-071` · **M22** · **L** · `content`, with `scoring` (the standing card)
**Built from:** `Me.dc.html` · `MeEdit.dc.html` · `HubDesktop.dc.html`; `M10c.md` §1.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table — `saveProfile`'s fields and validation, the
  company choice, the avatar consent, the opt-out until `SCR-029` exists, the pinned names.
- Read mode as label/value rows and one «عدّل ملفك»; edit mode with its header, the count, the changed borders and a
  bottom `action-bar`; Cancel restores; leaving with changes asks.
- States: no company, errors, saved once.

#### STORY-UIX-063 — My points, rebuilt
**Covers:** `REQ-UIX-072` · **M22** · **L** · `scoring`
**Built from:** `Points.dc.html` · `HubDesktop.dc.html`; `M10c.md` §2.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table — `MissedAttendance`, the filters, the CSV, the
  presenter net, the catalogue's live read.
- `ledger-row`; the reversal pair through an add-only `sourceId` on the ledger DTO; the cap explanation computed, never
  stored; the manual adjustment with its reason and name; desktop as a `data-table`.
- ★ The hard-load duplicate re-measured after the rebuild (`DEC-204`) — recorded, not fixed.

#### STORY-UIX-064 — My certificates, rebuilt
**Covers:** `REQ-UIX-073` · **M22** · **S** · `content`
**Built from:** `Certificates.dc.html`; `M10c.md` §3.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table — the audited download route (`DEC-177`), the
  revoked state, the not-yet-issued state.
- One list: title, kind, date; revoked struck and dimmed with «ملغاة»; not issued dimmed with «قريبًا».

#### STORY-UIX-065 — Bookmarks, rebuilt
**Covers:** `REQ-UIX-074` · **M22** · **S** · `content`
**Built from:** `Bookmarks.dc.html`; `M10c.md` §4.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table.
- Browse's row with its badge, the filled bookmark at the end, an optimistic removal with undo.

#### STORY-UIX-066 — The calendar page, rebuilt
**Covers:** `REQ-UIX-075` · **M22** · **S** · `notify`
**Built from:** `Calendar.dc.html`; `M10c.md` §5.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table — connect, disconnect and its token deletion, the
  failure state.
- One row for the connection; the failed sessions with «أعد المحاولة» only when there are any.

#### STORY-UIX-067 — No explainer copy
**Covers:** `REQ-UIX-080` · **M22** · **M** · lead, with each owner for its own namespace
- The list: every line the built M10a and M10b screens render that their committed artboards no longer draw, and
  that does not change what the person does next. ★ `M10c.md` cites a «§0b» list that does not exist (`DEC-217`), so
  the lead derives the list from the artboards and the owner confirms it before any string is removed.
- Each removed line is named in the story with its key; a fact that is still needed moves to its state.

#### STORY-UIX-068 — The inbox, rebuilt
**Covers:** `REQ-UIX-076` · **M22** · **M** · `notify`
**Built from:** `Notifications.dc.html`; `M10c.md` §6.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table — mark one read, mark all read, unread-only, a
  change notice, the session link.
- The page holds no preference; «ما يصلني» opens `/app/me/settings`.

#### STORY-UIX-069 — Settings, a new route
**Covers:** `REQ-UIX-077` · **M22** · **M** · `notify`
**Built from:** `Settings.dc.html`; `M10c.md` §6b.
- ★★ `preference-matrix.tsx` is **deleted** and its behaviour goes in this story's kept-behaviour table with the
  `REQ-*` that keeps each row; its test is evidence and each changed assertion a ledger line (`DEC-216` §5.16).
- `settings-group`s: the email master switch, `08` §2's optional categories, the leaderboard visibility; the
  links; sign-out and the email. The non-optional categories are one sentence.
- ★ The opt-out leaves `SCR-021`'s edit mode in the same commit it appears here (`REQ-UIX-071`).
- Its `loading.tsx` and `error.tsx`, its route in `09` §8.

#### STORY-UIX-070 — The boards, rebuilt, with this week live
**Covers:** `REQ-UIX-078` · **M22** · **L** · `scoring`
**Built from:** `Board.dc.html`; `M10c.md` §7.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table — own rank always visible, opt-out, the
  provisional chip, the category, moment 5's keying.
- This week summed live from `points_ledger` over the org's calendar week, by an add-only definer function; the
  movement read against `member_seen_marks`' weekly pair; ★ `leaderboards.ts:512`'s «week» stops reading the month.
- The «ترتيبك» card, the static `podium`, `rank-row`s 4 – 10, the own row in place or pinned, the category `menu`.
- ★ The hard-load duplicate re-measured after the rebuild (`DEC-204`) — recorded, not fixed.

#### STORY-UIX-071 — The company race, rebuilt
**Covers:** `REQ-UIX-079` · **M22** · **M** · `scoring`
**Built from:** `Companies.dc.html`; `M10c.md` §8.
- ★★ **Deleted first** (`DEC-208`), with the kept-behaviour table.
- The cup card, both metrics with the ranking one marked, the `race-bar`s, the own company, the breakdown; no company;
  below the minimum.

#### STORY-UIX-072 — «بلا ترتيب»: a minimum of active members, frozen into each snapshot
**Covers:** `REQ-UIX-082` · **M22** · **M** · lead (the columns), `scoring` (the ranking and the reads) · PR C
- `org_settings.company_min_active_members` (default 3) and a nullable `leaderboard_snapshots.min_active_members`, from
  `0175`, additive, with their RLS cases; the company branch of `snapshot_leaderboard()` freezes the value and ranks
  eligible companies first.
- `SCR-028` and the home's race draw «بلا ترتيب» for an ineligible company. ★ The admin control is carried to the
  console wave (`DEC-220` §1.3).

#### STORY-UIX-073 — The photo award and its reversal
**Covers:** `REQ-UIX-083` · **M22** · **L** · `scoring` (the award and reversal functions), `content` (the trigger on `photos`) · PR C
- ★ The reversal is designed first, in `0149`'s shape; the award's key carries an epoch so a restore nets one award; a
  restore pays only what a takedown reversed. The cap is the rule's.
- A case drives one photograph past the cap on one session and sees `SCR-022`'s cap row.
- Built only after `0174` is in production (`DEC-221`).

#### STORY-UIX-074 — The console frame
**Covers:** `REQ-UIX-084` · **M23** · **M** · lead · PR A
**Built from:** `AdminDashboard.dc.html` (the bar and the rail); `M11a.md` §0.
- - ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it. ★ `src/components/admin/admin-rail.tsx` is deleted, not left beside its successor (`DEC-213` §4); its table
  names `AdminRailChild` and the disclosure groups with what replaced them.
- The 52 px bar, the 220 px rail of twenty items in six ruled groups with queue badges, the sheet under `lg` keeping the
  groups; the page at 24 px padding.
- ★ **The count**: a test that an admin's rail holds twenty items, a moderator's only `REQ-ADM-020`'s, a member's none,
  and no unbuilt item (`DEC-226` §2).
- ★ `console-register.test.ts` amended once — the rail's path, and the three new primitives in the no-animation case
  (`DEC-227` §2), with a ledger line; «التصنيفات» (`DEC-227` §3).

#### STORY-UIX-075 — Three primitives for the console
**Covers:** `REQ-UIX-085` · **M23** · **M** · lead (`admin-rail`), `sessions` (`split-view`, `kv-card`) · PR A
- Each: its signature in `ui/index.ts` (the lead's, types only, after sync 1), a registry entry, a test inside the
  scope, an RTL check, a gallery section with every state in Arabic from fixture data, no animation.
- The gate's floor moves from 60 to 63 in the commit that adds the third file. All three land in PR A.

#### STORY-UIX-076 — The dashboard, rebuilt
**Covers:** `REQ-UIX-086` · **M23** · **M** · `console` · PR A
**Built from:** `AdminDashboard.dc.html`; `M11a.md` §1.
- - ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- «يحتاج انتباهك» from `admin-dashboard.ts`'s four `attention` rows — count, label, oldest age, a link to the queue;
  the one line when nothing waits. The same read feeds the rail's badges (contract 3).
- The six figures, the pipeline bar, the next sessions on `data-table`, the three top lists — every figure a link.
- ★ **Not drawn, and built:** an org with no sessions yet, nothing waiting, a short top list. A moderator keeps today's
  streamed not-found at `/app/admin` (`DEC-228` §3.1).

#### STORY-UIX-077 — The sessions table, its bulk bar and its phone stack
**Covers:** `REQ-UIX-087` · **M23** · **L** · `console` · PR A
**Built from:** `AdminSessions.dc.html` · `AdminSessionsPhone.dc.html`; `M11a.md` §3.
- - ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- ★ **`data-table`'s phone stack and selection are built — they are composed, not rebuilt** (`data-table.tsx:10-13`,
  `:70-83`). The primitive changes add-only, if at all.
- The toolbar, the chips with their value, the sticky header, sorting, the pager, the row menu, the avatar with its team
  ring; «جلسة جديدة».
- ★ **The bulk bar** — «N محدّدة», the actions, clear — composing the existing selection; each action the single-row
  action's authority; the CSV through the audited export path.
- ★ **Not drawn, and built:** an empty org, a search with no result, a moderator's read-only list, a failed bulk action.

#### STORY-UIX-078 — The proposal queue as a split view
**Covers:** `REQ-UIX-088` · **M23** · **L** · `sessions` · PR B
**Built from:** `AdminProposals.dc.html`; `M11a.md` §2.
- - ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- ★ **The diff measured first** (`DEC-227` §5.1): what is recorded of a proposal's edits today; a migration, if one
  is needed, named in the plan and written by the lead from `0179`. No member-readable history (`DEC-215`).
- `split-view`: the state chips with counts, the rows, ↑↓ and Enter, the detail, the decision card; «افتح كجلسة» for
  an approved one; the detail at `/app/admin/proposals/[id]` under `lg`.
- ★ **Not drawn, and built:** an empty queue, a decision failing, the last proposal decided, no materials.

#### STORY-UIX-079 — The session hub: its header and الجدولة, read by default
**Covers:** `REQ-UIX-089` · **M23** · **L** · `sessions` · PR B
**Built from:** `AdminSessionHub.dc.html`; `M11a.md` §4.
- - ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it. ★ The hub layout and its strip included.
- The header above the tabs, the lifecycle action by state; the five tabs, «المحتوى» to the event page; `DEC-178`'s
  redirect named and unchanged.
- The `kv-card` with «عدّل» and «أعد الجدولة»; edit mode over the schedule's existing fields and actions; the side
  column — reservations, the poster's formats through the audited route, the log.
- ★ **Not drawn, and built:** edit mode, a draft, a completed session, a multi-day session's days.

#### STORY-UIX-080 — Attendance, live
**Covers:** `REQ-UIX-090` · **M23** · **L** · `checkin` · PR B
**Built from:** `AdminAttendance.dc.html`; `M11a.md` §5.
- - ★★ **Deleted first** (`DEC-208`): the page file and the screen's own markup files removed in one commit, the screen written from its artboard in the next; the note's kept-behaviour table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names — each with its `REQ-*`, written before the create commit and read against the new file after it.
- The figures, the code card with the countdown, «أبطل» and the switch; the chips, «تسجيل يدوي» in a sheet with the
  member picker and the reason, the CSV; the table with faces.
- ★ The revoke calls the existing removal (`REQ-CHK-017`) and its `DEC-172` reversal; no new mechanism.
- ★ **Not drawn, and built:** a completed session's final rate, a multi-day session's days, before the window opens, a
  moderator.

---

## 23i. Wave 22 — `M24`, the console, batch B (`DEC-230`, `DEC-231`)

**Fifteen screens from fourteen artboards** in `docs/design/screens/m11b/`, specified by `M11b.md` and corrected by
`DEC-230` and `DEC-231`. **No new primitive.** Three PRs: **A** the tables, reminders, exports, the audit log, the
cells, `0180` and the audit migration; **B** the points, recognition and settings pages; **C** moderation and the
survey. ★★ **Every screen story below is deleted first** (`DEC-208`): the page file and the screen's own markup files
removed in one commit, the screen written from its artboard in the next, the owner's note carrying the kept-behaviour
table — data calls, auth boundary, `<bdi>`, the no-JS path, the role gates, pinned names, **and every audit row the
screen writes** — each with its `REQ-*`, written before the create commit and read against the new file after it.

#### STORY-ADM-010 — `0180`: a venue names the company that owns it
**Covers:** `REQ-ADM-022` · **M24** · **S** · lead · PR A
- `venues.company_id uuid references public.companies(id)`, nullable, with a same-org trigger in the shape of
  `sessions_host_company_same_org()` (`0081`) and its RLS case; the grant follows the table's existing update policy.
- Rehearsed by the owner on a dump taken at `0179` before the push. No backfill: **the owner sets each venue's company on
  `046`** (`DEC-230` §2.4).

#### STORY-PTS-008 — Hosting points follow the venue's owner
**Covers:** `REQ-PTS-016` · **M24** · **M** · `scoring` · PR A
- `evaluate_company_points()` reads the venue's company; a venue with none awards nothing, **by rule** — the story says
  so, so nobody later «fixes» it.
- `sessions.host_company_id` stops being read; ★ **the stopgap form on `/app/admin/scoring` and
  `setSessionHostCompany()` are removed in the same PR**. The column stays (`DEC-230` §2.3).
- ★ A multi-day session at venues of different owners: the plan's answer, brought to the owner if needed (`DEC-231` §6.3).
- `05` §6.3 written (`DEC-231` §6.2); what `main`'s worker does in the gap is named (`DEC-231` §7).

#### STORY-ADM-011 — The audit gaps closed in the database
**Covers:** `REQ-ADM-023` · **M24** · **M** · lead (the triggers), `content` (report resolution as one function) · PR A
- A `security definer` trigger per table on `0161`'s pattern for venues, categories, companies, report resolution and
  survey templates, with the action strings `DEC-231` §4 fixes; a test per action, written as a member.
- Reports' resolution moves from two DAL writes into one audited function (`DEC-231` §4.2).

#### STORY-UIX-081 — The read-mode pattern, four times, one test
**Covers:** `REQ-UIX-091` · **M24** · **M** · `scoring`, `notify`; the spec, lead · PR B (and `060` in A)
- Each read-mode page implements `M10c.md` §1 against `profile-edit.tsx` as its reference, never importing it.
- The saved mark from the server's answer and the history row; leaving with changes asks.
- ★ `wave22-lead-read-mode` walks `053`, `054`, `060`, `063` with the same steps.

#### STORY-UIX-082 — Three cells on `data-table`
**Covers:** `REQ-UIX-092` · **M24** · **S** · `console` · PR A
- A switch cell, a two-button action cell, a swatch cell — add-only, each in the gallery demo, each with a case in the
  scope test; every existing `data-table` suite untouched. **No new file; the floor stays 63.**

#### STORY-UIX-083 — Venues, rebuilt
**Covers:** `REQ-UIX-093`, `REQ-ADM-022` · **M24** · **M** · `console` · PR A
**Built from:** `AdminVenues.dc.html`; `M11b.md` §046.
- The table with the owning company; the edit sheet's company `select`, «لا شركة» a real choice.
- ★ **Not drawn, and built:** a venue with no company, a deactivated venue, an empty org.

#### STORY-UIX-084 — Categories, rebuilt
**Covers:** `REQ-UIX-094` · **M24** · **S** · `console` · PR A
**Built from:** `AdminCategories.dc.html`.
- No tags. Delete only when unused, the menu saying why otherwise.

#### STORY-UIX-085 — Companies, rebuilt
**Covers:** `REQ-UIX-095` · **M24** · **M** · `console` · PR A
**Built from:** `AdminCompanies.dc.html`.
- The swatch cell, the quarter's points read; no logo, no domain (`DEC-231` §6.1).

#### STORY-UIX-086 — Members, rebuilt
**Covers:** `REQ-UIX-096` · **M24** · **M** · `console` · PR A
**Built from:** `AdminMembers.dc.html`.
- Chips, the row menu, the last-admin guard said in the menu; the CSV through the audited path.

#### STORY-UIX-087 — Reminders, rebuilt
**Covers:** `REQ-UIX-097` · **M24** · **S** · `notify` · PR A
**Built from:** `AdminReminders.dc.html`.
- `08`'s set, read by default; the offsets written by the function that writes them today.

#### STORY-UIX-088 — Exports, rebuilt
**Covers:** `REQ-UIX-098` · **M24** · **S** · `console` · PR A
**Built from:** `AdminExports.dc.html`.
- One row per export, its last run read from the audit row; a test opens one file's bytes and finds the BOM.

#### STORY-UIX-089 — The audit log, rebuilt
**Covers:** `REQ-UIX-099` · **M24** · **M** · `console` · PR A
**Built from:** `AdminAudit.dc.html`.
- Both stores, marked by kind (`DEC-231` §4.3); the CSV a new export type through the audited path.

#### STORY-UIX-090 — The points catalogue, rebuilt
**Covers:** `REQ-UIX-100` · **M24** · **L** · `scoring` · PR B
**Built from:** `AdminScoring.dc.html`.
- Read mode, «عدّل», the manual adjustment sheet; ★ a test that edits a rule and reads `SCR-022`'s explanation after.

#### STORY-UIX-091 — Badges and levels, rebuilt, with the held certificates
**Covers:** `REQ-UIX-101` · **M24** · **L** · `scoring` (`held-achievements.tsx` presentation-only) · PR B
**Built from:** `AdminRecognition.dc.html`.
- Levels and badges read by default; the held certificates with «أصدر» and «أوقف» through `designer`'s functions.

#### STORY-UIX-092 — Settings, rebuilt
**Covers:** `REQ-UIX-102` · **M24** · **M** · `notify` · PR B
**Built from:** `AdminSettings.dc.html`.
- Four `kv-card`s, read by default; every value read; the org domains through their audited path.

#### STORY-UIX-093 — Reports, rebuilt
**Covers:** `REQ-UIX-103` · **M24** · **M** · `content` · PR C
**Built from:** `AdminModerationReports.dc.html`.
- Comment reports, moved here from `/comments` (`DEC-231` §5); the redirect; the counts the rail's badge reads.

#### STORY-UIX-094 — Photos, rebuilt as a split view
**Covers:** `REQ-UIX-104` · **M24** · **M** · `content` · PR C
**Built from:** `AdminModerationPhotos.dc.html`.
- Takedown requests and photo reports — the latter moved here from `/reports` — on `split-view`.

#### STORY-UIX-095 — The survey tab, rebuilt
**Covers:** `REQ-UIX-105` · **M24** · **M** · `event` · PR C
**Built from:** `AdminSurveyResults.dc.html`.
- The withhold for every question type, on the screen and in the CSV; the hub's header untouched.

#### STORY-UIX-096 — Survey templates, rebuilt
**Covers:** `REQ-UIX-106` · **M24** · **M** · `event` · PR C
**Built from:** `AdminSurveys.dc.html`.
- The templates, then the selected template's questions below them, as drawn; reordering by buttons; every template
  mutation audited.

## 24. Coverage check

Regenerated by `scripts/traceability.mjs`; the table is in `TRACEABILITY.md`. The invariants this
backlog must satisfy:

1. **Every `REQ-*` in `01-prd.md` is covered by at least one story** — 336 of 336 since `DEC-183`, 346 of 346 since `DEC-199`, 356 of 356 since `DEC-206`, 362 of 362 since `DEC-213`.
5. ★ **A story may cover a REQ that an EARLIER milestone already satisfied** — `STORY-UIX-016`
   redesigns screens `STORY-AUT-001` built. `trace` cannot see that gap, because it checks
   REQ→story, not decision→story; `DEC-129` is why it is written down.
2. **Every story cites at least one `REQ-*`.**
3. **Every story names a milestone that exists in `14-roadmap.md`** — M0 … M13 since `DEC-069`, M14 since `DEC-172`, M15 since `DEC-176`, M16 since `DEC-180`, M17 since `DEC-183`, M18 since `DEC-195`, M19 since `DEC-199`, M20 since `DEC-205`, M21 since `DEC-213`, M22 since `DEC-216`, M23 since `DEC-225` and M24 since `DEC-230`. ★ Since `DEC-183` the gate **checks** it: a story citing a milestone with no `## M<n> —` heading in the roadmap fails.
4. **No story cites a requirement that does not exist.**

A violation of any of the five **fails CI** (`13` §10). That gate is the only thing that keeps this
document honest as the product changes.
