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
**Covers:** `REQ-PRF-008`, `REQ-PRF-009`, `REQ-PRF-010`, `REQ-PRF-011` · **M10** · **M**
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
**Covers:** `REQ-DSG-028`, `REQ-DSG-029`, `REQ-DSG-030` · **M12** · **L**
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
**Covers:** `REQ-DSG-031` · **M12** · **L**
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
**Covers:** `REQ-ADM-021`, `REQ-DSG-027` · **M11** · **M**
- **The mechanism is not invented** — `signExportUrl()` already mints a five-minute signed URL and
  three screens already consume it. This story is **reach**.
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

## 24. Coverage check

Regenerated by `scripts/traceability.mjs`; the table is in `TRACEABILITY.md`. The invariants this
backlog must satisfy:

1. **Every `REQ-*` in `01-prd.md` is covered by at least one story** — 301 of 301.
2. **Every story cites at least one `REQ-*`.**
3. **Every story names a milestone that exists in `14-roadmap.md`** — M0 … M13 since `DEC-069`.
4. **No story cites a requirement that does not exist.**

A violation of any of the four **fails CI** (`13` §10). That gate is the only thing that keeps this
document honest as the product changes.
