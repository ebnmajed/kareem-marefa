# notes — `notify` teammate (wave 2, M3)

Working notes for the NTF / CAL track. Not a plan document — `01-prd.md` defines, `08` is the
normative matrix, `09` describes the screens, `03` governs permissions, `11` owns the job keys.
This records how I am building it, and publishes the one contract the other two wave-2 tracks
call. Append as I go.

---

## 0. THE CONTRACT — `public.notify()` — read this before writing a call site

`scoring` and `content`: this is the only function you call to send anything. Do not insert into
`public.notifications`, do not enqueue `send_notification` yourself, do not call
`graphile_worker.add_job`. Published 2026-09-14 with
`supabase/proposed/notify/0001_notification_contract.sql`; the signature does not change without
the lead being told first.

```sql
public.notify(
  p_org      uuid,   -- the org the member belongs to
  p_member   uuid,   -- public.members.id of the RECIPIENT
  p_category text,   -- the PREFERENCE category (08 §2) — or null to derive it from the matrix
  p_payload  jsonb,  -- template variables; `session_id` inside it fills notifications.session_id
  p_key      text    -- the MSG-* key (08 §1) — this is public.notifications.key
) returns uuid       -- the notifications row id, or NULL when in-app is off for this member
```

**Which text goes in which parameter**, because the two are easy to swap:

| Parameter | Value | Example |
|---|---|---|
| `p_key` | the **message**, `MSG-*`, from `08` §1 — lands in `notifications.key` | `'MSG-badge_earned'` |
| `p_category` | the **preference category**, from `08` §2 | `'recognition'` |

`p_category` may be `null`; the matrix then supplies it. A **non-null value that disagrees with
the matrix raises `22023`** rather than sending under the wrong preference. Pass it when you want
the call site to state its own intent and be checked; pass `null` when you do not.

Worked call, from a definer RPC in your own proposed SQL:

```sql
perform public.notify(
  v_member.org_id,
  v_member.id,
  'recognition',
  jsonb_build_object('badge', v_badge.name_ar, 'session_id', v_session_id),
  'MSG-badge_earned');
```

**What it does, in the caller's transaction** (`02` §4.17 — there is no dual-write window):

1. Looks the key up in `public.notification_matrix()`. **A key that is not in `08` §1 raises
   `22023`** — that is `REQ-NTF-002`'s "no notification is sent that is not in the matrix",
   enforced rather than documented.
2. Reads the member's `notification_preferences` for `(category, channel)`. A missing row means
   **on** (`08` §2: every category defaults on). A message in the non-optional set (`08` §1.7)
   ignores the preference **on both channels**.
3. Writes the `notifications` row when in-app survives steps 1–2; `session_id` comes from
   `p_payload->>'session_id'` when that is a uuid.
4. Enqueues `send_notification` through `public.enqueue_job()` with job key
   `notify:{message_id}` (`08` §7), carrying org, member, key, category and payload plus the two
   channel booleans, when **either** channel survives. The job re-checks preferences at send time
   (`11` §2.6) — a member may change them between enqueue and send — so my check here is the
   inbox's authority and the job's is email's.
5. Returns the `notifications` id, or `null` when in-app was suppressed and only email is going.

**Not sending is not an error.** A member who has switched a category off makes `notify()` a no-op
returning `null`; nothing raises, nothing rolls back your transaction.

**It is not idempotent for you.** One call, one message. If your trigger can fire twice for the
same event, guard it on your side (the same source-event key you already use for the ledger); the
job key prevents a duplicate *send* of one message, not a duplicate *message*.

**Callers:** `security definer` functions (which run as the owner and so pass the grant) and
`service_role`. `execute` is revoked from `public`, `anon` and `authenticated` — a member who
could call it could write into another member's inbox.

**`public.notification_matrix()`** is the same data as `08` §1, as a table-valued function:
`(key, category, in_app, email, optional)`, 38 rows. Read it instead of hard-coding a category;
`select * from public.notification_matrix() where key = 'MSG-…'`.

### A doc nit for the lead, not a blocker

`08` §1.7 is headed "the eleven a member cannot switch off" and then lists **seventeen**
`MSG-*` keys (several rows pack two keys behind a slash). `REQ-NTF-003` names only four
explicitly and says "certain notifications", so the list is authoritative and the count in the
heading is off. The matrix function carries all seventeen. Worth a one-word fix in `08` when
something else touches it; I have not edited `08`.

---

## 1. What shipped

Every story on the track, in the order it landed. Each row's SQL was proposed
under `supabase/proposed/notify/` and promoted by the lead; the migration
numbers are theirs.

| Story | What | Migration | Test |
|---|---|---|---|
| the contract | the six M3 tables, RLS, grants, `notification_matrix()`, `notify()` | `0026` | `notify-contract` (22) |
| STORY-NTF-001 | two channels and only two, with the test that notices a third | — | `notify-channels` (6) |
| STORY-NTF-002 | SCR-026's preference matrix (`REQ-NTF-003`) | — | in `notify-contract` |
| STORY-NTF-004 | the inbox, `NotificationBell`, the mail transport, the 24 Arabic templates, `email_deliveries` | `0030` | `notify-send` (12), `mail-*` (39) |
| STORY-NTF-003 | reminders that MOVE, the nudge, the rating prompt | `0034`, `0035`, `0040` | `notify-reminders` (24), `notify-schedule-change` (5) |
| `REQ-SES-009` | change notices with both values, publish, cancel, complete | `0037` | `notify-session-notices` (8) |
| STORY-CAL-001/002 | the ICS at 75 octets, the add-to-calendar links | — | `ics` (16), `ics-links` (8) |
| STORY-CAL-002/003/004 | connect, disconnect, the three sync jobs, SCR-025 | `0038` | `calendar-sync` (12), `notify-calendar-api` (8) |
| the M2 deferrals | replies, mentions, decisions, co-presenters, the assigned presenter, removals, reports | `0039` | `notify-m2-notices` (12) |
| `REQ-ADM-014`/`016` | SCR-058 and the reminder schedule screen | — | — |
| — | the jobs' branching, against fake helpers | — | `notify-jobs` (14) |

**Screens:** SCR-026 (`/app/me/notifications`), SCR-025 (`/app/me/calendar`),
SCR-058 (`/app/admin/emails`), `/app/admin/reminders`, and the two slots the
lead wires — `NotificationBell` in the shell and `AddToCalendar` on SCR-012.

**Jobs:** `send_notification`, `schedule_reminders`, `send_reminder`,
`rating_prompt`, `rsvp_nudge`, `calendar_upsert`, `calendar_delete`,
`refresh_calendar_tokens` — all eight registered in `worker/src/index.ts`,
with `refresh_calendar_tokens` on an hourly crontab.

## 2. The tables (`02` §4.14, `03` §5.9)

Six, all with `org_id`, RLS, a full policy set and matching grants:

| Table | Pattern | The thing worth knowing |
|---|---|---|
| `notification_templates` | P1 read + `is_org_admin()`, P2 write | `unique (org_id, key, channel, locale)`; a `required_fields` gap fails **before** save (`REQ-NTF-007`) |
| `notifications` | P7 self-read, update of `read_at` only, self-delete | job-written: no insert policy or grant for anyone |
| `notification_preferences` | P7 + P3 | `(org_id, member_id, category, channel)` unique; absence means **on** |
| `email_deliveries` | `is_org_admin()` select only | 180-day retention (OQ-019); the sink writes rows exactly as Resend does |
| `calendar_connections` | **`03` §5.9c — the table nobody may read** | the token columns are in **no grant to any role**; disconnect **deletes** |
| `calendar_events` | P7 select only | `unique (member_id, session_id)` is `REQ-CAL-004`'s idempotency |

`calendar_connections` is the one to get right and the one to test hardest: `grant select` names
four columns and four only (`member_id`, `provider`, `connected_at`, `disconnected_at`), so
`select *` as the owning member is `42501`. That is `REQ-CAL-003`'s "tokens are never displayed to
anyone", expressed as a grant rather than as discipline in the DAL.

## 3. The mail transport (DEC-046)

`worker/src/mail/transport.ts` is an interface with `send(message): Promise<{ providerMessageId }>`
and three implementations behind one factory:

| Environment | Implementation | Where it goes |
|---|---|---|
| development | SMTP sink | Mailpit, `127.0.0.1:54325`; read it at `:54324` |
| CI and unit tests | in-memory | an array the test reads back |
| Launch | Resend | wired in PR C, never before |

`RESEND_API_KEY` is not read in development or CI — the factory refuses to select Resend unless
`MAIL_TRANSPORT=resend` is explicitly set. All three write `email_deliveries` identically, which
is what makes `REQ-NTF-008` testable now rather than after Launch.

Templates render in the worker (`08` §3): tables for layout, inline CSS, `dir="rtl"` on `<html>`
and on every cell, a declared fallback stack rather than a web font, numerals per the org setting,
and a plain-text alternative for every message.

## 4. Reminder job keys — `08` §4.1, `11` §2.6, verbatim

```
sched:{session_id}                          JOB-schedule_reminders
remind:{session_id}:{offset_minutes}:{member_id}   JOB-send_reminder
rate:{session_id}                           JOB-rating_prompt
nudge:{session_id}                          JOB-rsvp_nudge
notify:{message_id}                         JOB-send_notification
cal:{rsvp_id} · caldel:{rsvp_id}            JOB-calendar_upsert / _delete
caltok:{connection_id}                      JOB-refresh_calendar_tokens
```

`public.enqueue_job()` fixes `job_key_mode => 'replace'` (migration `0025`), so re-enqueueing a
reminder key **moves** the pending job to the new `run_at` instead of adding a second one. That is
the whole of `REQ-NTF-004`'s "reschedules rather than duplicates" and it is already proven by
`tests/rls/enqueue-job.test.ts`. Offsets come from `org_settings.reminder_offsets_minutes`
(default `{10080,1440,120}` = 7 d, 1 d, 2 h), so changing the org's schedule removes the
old-offset keys and adds the new ones.

## 5. Findings

Things the plan did not know, found by building. Each is either fixed here and
flagged, or left alone and flagged, and none is a re-litigation.

### 5.1 `08` §3.2 is two templates short of `08` §1

`08` §1 gives **24** messages an email channel; `08` §3.2 lists **22**
templates. **`MSG-proposal_submitted`** and **`MSG-presenter_assigned`** have
none, and `REQ-NTF-002`'s acceptance is "every matrix row has an Arabic
template". Both are written in `worker/src/mail/templates.ts`;
`tests/unit/mail-render.test.ts` reads the matrix out of migration `0026` and
diffs it against the template file, so the gap cannot reopen quietly. `08`
wants the two rows added.

### 5.2 `08` §1.2 defines three reminder messages for a free `int[]`

`org_settings.reminder_offsets_minutes` is org-configurable (`REQ-NTF-004`)
and `08` §1.2 names exactly three messages: 7 d, 1 d, 2 h. An org that sets a
3-day offset has no message of its own. `public.reminder_message_key()` gives
it the nearest by magnitude, so the subject reads «بعد أسبوع» above a body
carrying the real moment. Better than a reminder that is never sent; the
honest fix is a fourth, offset-agnostic message, which is a plan decision.

### 5.3 `08` §1.7's heading says eleven and its list names seventeen

Several rows pack two keys behind a slash. `REQ-NTF-003` names four
explicitly and says "certain notifications", so the list is authoritative and
the heading's count is wrong. The matrix function carries all seventeen and
`tests/rls/notify-contract.test.ts` pins them by name.

### 5.4 `MSG-rsvp_deadline_soon` has no job

It is in `08` §1.3 and `11` §7 defines no job key for it. Not implemented and
not faked; it needs a job name and key from `11`.

### 5.5 The numeral enum was spelled two ways

`public.numeral_system` (migration `0003`) is `western | arabic_indic`; the
shared `NumeralSystem` said `arabic`, so `formatNumber` never matched and an
org set to Arabic-Indic rendered Western digits everywhere. Found while
writing `notification_send_context`; fixed repo-wide during wave 2. The
worker and my DAL both use the database's spelling, with no mapping — a
mapping is a second place for the two to disagree.

### 5.6 `graphile_worker.jobs` has no `payload` column

In graphile-worker 0.18 `jobs` is a view; the payload lives on
`_private_jobs`, joined on `id`. Any test asserting what was enqueued needs
the join.

### 5.7 The single-runner check for the RLS suite gives false positives

`ps aux | grep 'vitest run --project rls'` matches another agent's **waiter**,
whose own command line contains that string — so two waiters block each
other. `pgrep -fl "node_modules/.bin/vitest"` matches the real runner only.
Adopted into the three agent definitions during wave 2.

### 5.8 Two byte-level traps, same shape, different formats

The RFC 2047 email subject and the RFC 5545 ICS fold are the same bug twice:
a length limit measured in **octets**, applied to text where one character is
two of them. Both split on characters and measure with `Buffer.byteLength`;
both have a test that a length-counting implementation fails. `ics` and
`ical-generator` both fold by string length, which is why neither is used.

### 5.9 `URLSearchParams` is wrong for an add-to-calendar link

It encodes a space as `+` (form encoding, not percent-encoding). Google
tolerates it; Outlook shows the member literal plus signs, and Arabic titles
are full of spaces. `08` §6.2's "naive encoding breaks" is this.

---

## 6. Handoff to wave 3

Written at the close of wave 2, for whoever picks this up. Everything below was
verified against the tree, not recalled.

### 6.1 What `console` inherits

`src/app/[locale]/app/admin/{emails,reminders}/**`, held by `notify` for wave 2
under DEC-042's pattern and yours from wave 3. Two screens, four files, and one
DAL module they share with the member-facing screens
(`src/lib/dal/notifications.ts` — its admin half is the last third of the file
and each of its functions returns `null` for a non-admin so the page can
`notFound()`, the same shape as `listVenuesForAdmin`).

**SCR-058, `/app/admin/emails`** — `REQ-ADM-014`, `REQ-NTF-007`, `REQ-NTF-008`.
The thing to preserve: **the editor validates nothing itself.** The
`notification_templates_validate` trigger (`0026`) refuses a body missing a
declared `required_fields` entry, and a key or channel `08` §1 does not list,
for every writer. The screen renders its errcodes (`23514`, `22023`). A second
copy of those rules in TypeScript is a second thing to keep in step, and the
copy that drifts is always the one the screen enforces.

**`/app/admin/reminders`** — `REQ-ADM-016`, `REQ-NTF-004`. One UPDATE. The
moving of every pending reminder is `org_settings_reschedule` (`0040`), not the
action, so it holds whatever writes the column.

### 6.2 The mail transport

`worker/src/mail/` — one interface, three implementations, one factory
(`index.ts`) that is the only place `RESEND_API_KEY` is read.

| Implementation | Selected when | Goes to |
|---|---|---|
| `SmtpSinkTransport` | the default | Mailpit, `127.0.0.1:54325`; read it at `:54324` |
| `MemoryTransport` | `VITEST`, `NODE_ENV=test` or `CI` | an array the tests read back |
| `ResendTransport` | `MAIL_TRANSPORT=resend`, and nothing else | Resend |

**The default is a sink, not a provider.** Getting that backwards once — a
missing variable falling through to Resend — sends real mail from a test run,
and there is no undo for a delivered email. `tests/unit/mail-transport.test.ts`
proves `RESEND_API_KEY` is not so much as *read* outside the `resend` branch,
using a recording `Proxy` over the environment rather than by inspection.

Two environment switches, both optional: **`MAIL_TRANSPORT`** (`resend` ·
`memory` · `smtp`) and **`MAIL_SMTP_HOST`/`MAIL_SMTP_PORT`**. Plus
**`MAIL_FROM_ADDRESS`**, defaulting to `08` §3.4's single platform-verified
sender.

The sink speaks SMTP over `node:net` in about forty lines rather than adding
`nodemailer`: six verbs against a server with no auth and no TLS did not
justify a package in the lock file and in the worker image.

**Templates** live in `worker/src/mail/templates.ts` — 24 Arabic defaults, one
per message `08` §1 gives an email channel. An org's row in
`notification_templates` wins where it exists. `tests/unit/mail-render.test.ts`
reads the matrix out of migration `0026` and diffs it against the file, so a
message added to `08` §1 with no template fails there rather than in a
member's empty inbox.

### 6.3 Jobs, keys and the crontab

All eight are in `worker/src/index.ts`'s `taskList`. Keys are `08` §7's,
verbatim; `public.enqueue_job()` fixes `job_key_mode => 'replace'`, so
re-enqueueing a key **moves** the job.

```
notify:{message_id}                                send_notification
sched:{session_id}                                 schedule_reminders
remind:{session_id}:{offset_minutes}:{member_id}   send_reminder
rate:{session_id}                                  rating_prompt
nudge:{session_id}                                 rsvp_nudge
cal:{rsvp_id} · caldel:{rsvp_id}                   calendar_upsert / _delete
caltok:{connection_id}                             refresh_calendar_tokens
```

**One crontab line is this track's:** `0 * * * * refresh_calendar_tokens`.
Hourly, not at expiry: Google's access tokens last an hour, so a sweep timed to
expiry leaves a window in which every sync job fails with a 401. With no
payload it refreshes every connection expiring within thirty minutes.

`schedule_reminders` is **reconciliation only**. The common paths call
`schedule_session_reminders()` inline, in the transaction that made the change,
because a member reserving ten minutes before the −2 h mark would otherwise
miss their own reminder.

### 6.4 `public.notify()` — unchanged since day one

The contract in §0 above is current. `scoring` and `content` both call it and
neither needed a change to it. Nothing else may write `public.notifications`:
the table has no insert policy and no insert grant for any role, `service_role`
included.

**Three `TODO(notify, M3)` comments survive in the migrations and are all
stale** — `0014` lines 75 and 144, and `0045` line 103, where `scoring`'s
`create or replace` of `reserve_seat()` carried the comment forward. Migrations
are forward-only, so they cannot be edited. **Do not implement them.** The
`rsvps_notify` trigger (`0034`) is at the table and already covers every writer,
which is exactly why a trigger was chosen over replacing the RPC. Verified
against the live schema: a plain `insert into public.rsvps (… 'confirmed' …)`
produces one `calendar_upsert` on `cal:{rsvp_id}`, three `send_reminder` jobs
and one `MSG-rsvp_confirmed` notification, with no RPC involved.

### 6.5 The fixture rows, and what they break

`tests/rls/fixture-m3.ts` (the lead's) seeds one row in every notify table on
**both** orgs, all for `members[0]`, so the generated isolation sweep is never
vacuous:

- one unread `notifications` row — `MSG-session_published`, `session_id = m2.published`
- one `notification_preferences` row — `social` / `email` / `enabled = false`
- one `calendar_connections` row with tokens set
- one `calendar_events` row — `members[0]` × `m2.published`, `synced`
- one Arabic email `notification_templates` row and one `delivered` `email_deliveries` row
  (both tables are on the sweep's admin-only exemption list)

**A per-policy case must therefore key its assertions by id or by org, never by
count**, or arrange its own world. Mine do the latter: `setup()` clears the six
tables. Two traps in that, both learned the hard way and both commented in
`tests/rls/notify-contract.test.ts`: deleting `calendar_connections` fires
`0038`'s disconnect notice **into the inbox just emptied**, so the inbox is
cleared once more, last; and since `0034` the fixture's RSVP inserts enqueue
jobs of their own, so `graphile_worker._private_jobs` is cleared too.

Use `members[1]` or the completed session for anything that would collide with
the fixture's `members[0]` × published row on `unique (member_id, session_id)`.

### 6.6 The two lead edits in this track's files

Both correct, both worth knowing about:

1. **`0038`, `calendar_disconnected()`** gains an early return when
   `old.member_id` no longer exists in `old.org_id`. An org deletion cascades
   into the trigger with the member already gone, `notify()` raises `not_found`
   and the whole cascade aborts. Nobody is left to tell, so nothing is lost.
   The M1 tenancy test caught it.
2. **`tests/rls/notify-contract.test.ts`'s `setup()`** gains the two extra
   cleanups described in §6.5.

### 6.7 Launch inputs

Recorded in `STATUS.md` and DEC-047; nothing here is decided by this track.

- **The Google OAuth client with calendar scopes**, and **its secret on
  Vercel** for the callback's code exchange. That is not the `service_role` key
  invariant 7 forbids. `08` §6.3 gives "Connect" no job and the authorization
  code is single-use and short-lived, so a queued exchange adds a window in
  which it expires unredeemed; the alternative is a worker-side exchange with a
  new job name, which is a change to `11`. The reasoning is written into
  `src/app/api/calendar/oauth.ts`, where PR C will find it. Until the client
  exists, `/api/calendar/connect` redirects to SCR-025 with a reason and the
  screen says so in Arabic.
- **The Resend account.** `RESEND_API_KEY` stays unset until then; see §6.2.
- The production host for the worker image is DEC-046's, not this track's.

### 6.8 The four `08` corrections, now under DEC-047

All four are recorded; none needs code from wave 3 except the third.

1. §1.7's heading says eleven above a list of seventeen keys. The list is
   authoritative; the matrix in `0026` carries all seventeen.
2. §3.2 lists 22 templates for 24 messages with an email channel.
   `MSG-proposal_submitted` and `MSG-presenter_assigned` have defaults now, and
   the test diffs the file against the migration.
3. §1.2 defines three reminder messages against `reminder_offsets_minutes` as a
   free `int[]`. `reminder_message_key()` picks the nearest by magnitude, so an
   org choosing three days reads «بعد أسبوع» above a body carrying the real
   moment. **The honest fix is a fourth, offset-agnostic message, left to
   M7-console.** That is the one piece of unfinished business on this track.
4. `MSG-rsvp_deadline_soon` (§1.3) has no job in `11` §7. Unimplemented and not
   faked; it needs a job name and key from `11` before anyone builds it.

---

# Wave 9 plan — one calendar entry and one reminder stream per day

**Written 2026-09-17, planning only, nothing built.** Serves `REQ-SES-015` («a member's calendar
gains one entry per day, and reminders fire per day»), `REQ-CAL-001` … `008`, `REQ-NTF-004`,
`REQ-SES-009`. Cites `DEC-119` (the `calendar_events` and `MSG-reminder_*` bullets), `DEC-120`,
`DEC-121`, `DEC-150`, contracts 1, 2, 3 and 8 of `STATUS.md`'s wave-9 block.

**Scope, stated once so it is not widened:** the calendar per day, reminders per day, and a
reschedule notice that names the day. **The email studio is wave 10** — no block model, no editor,
no template redesign. `/app/me/{calendar,notifications}` are not redesigned; they come back from
wave 7 as they are and gain the day.

---

## W1. The identity scheme — every key at `n` days, with `n = 1` beside today's

★ **Contract 2 in one line: at `n = 1` every key, `UID` and job is the one the row has today, so a
pending job is moved and an existing calendar entry is updated — never a second one.**

| Thing | today (`main`) | `n = 1` after this wave | `n` days |
|---|---|---|---|
| ICS `UID` | `session-{session}@kareem.pp.sa` | **identical** | position 1: identical · position `k >= 2`: `session-{session}-day-{k}@kareem.pp.sa` |
| calendar upsert job key | `cal:{rsvp_id}` | **identical** | **identical** — one job per reservation, fanning out over the days |
| calendar delete job key | `caldel:{rsvp_id}` | **identical** | **identical** — same reason |
| reminder job key | `remind:{session}:{offset}:{member}` | **identical** | position 1: identical · position `k >= 2`: `remind:{session}:{offset}:{member}:{k}` |
| nudge | `nudge:{session}` | **identical** | **identical** — once per session, `08` §4.2's restraint |
| rating prompt | `rate:{session}` | **identical** | **identical** — one rating per session |
| reminder sweep | `sched:{session}` | **identical** | **identical** |
| token refresh | `caltok:{connection}` | **identical** | **identical** — untouched |

**Why `cal:` and `caldel:` do not gain a day.** A per-day key would leave the pending
`cal:{rsvp_id}` jobs that exist in production at push time unreplaced: the new scheduler would add a
second job under a new key and the old one would still fire, which is precisely the duplication
`08` §4.1 exists to prevent. Keeping the key means **the job's subject is the reservation, and its
body is «make this member's calendar match the truth»** — it walks the days, creates what is
missing, updates what moved, and removes what should not be there. Idempotency stays where
`REQ-CAL-004` puts it: the unique constraint, now `(member_id, session_day_id)`. The cost is `n`
provider calls when one day moved; at the sizes in this product that is the right trade against a
key that can duplicate.

**Why the ICS `UID` and the reminder key suffix by POSITION and not by day id.** Position 1 carries
the session's own identity, which is what holds `n = 1`. Position is also the only suffix under
which **the key set depends on nothing but `n`**: reordering two days leaves the same set of keys
and re-enqueues each with the right payload, where an id suffix would orphan the key of the day that
moved out of first place. A day removed shrinks the set, and the tail is swept (`W3`).
The one oddity — after a reorder, «اليوم الأول» in a member's calendar holds whichever meeting is
now first — is the truth, not a defect.

**`SEQUENCE` stays `0`** (unchanged, contract 2). Clients update on a `UID` match; raising it is a
separate, testable change and not this wave's.

---

## W2. N1 — the calendar per day

### W2.1 What I need from the lead on `public.calendar_events` (I write no `alter table`)

```sql
alter table public.calendar_events
  add column session_day_id uuid,
  add constraint calendar_events_day_fk
      foreign key (session_id, session_day_id)
      references public.session_days (session_id, id)
      on delete set null;            -- ★ set null on the DAY column only
-- the backfill, below, runs here --
alter table public.calendar_events drop constraint calendar_events_member_id_session_id_key;
alter table public.calendar_events add  constraint calendar_events_member_day_key
      unique (member_id, session_day_id);
create index calendar_events_member_session_idx on public.calendar_events (member_id, session_id);
```

- The composite foreign key is `DEC-150`'s pattern for the content tables, for the same reason: a
  row can only name a day **of its own session**. It needs `session_days` to carry
  `unique (session_id, id)` — ★ **the lead's in-progress `0100` already has it**
  (`session_days_session_id_id_key`), and uses the same `on delete set null (session_day_id)` on the
  three content tables, so the syntax above is the foundation's own.
- ★ **`on delete set null`, never `cascade`.** A `calendar_events` row is the only record of the
  provider event id in a member's Google calendar. If the row died with its day, the event would
  stay in the member's calendar forever with nothing left that knows its id. **Null therefore has
  exactly one meaning: «the day this event belonged to is gone — remove the provider event».** No
  other writer ever produces a null day, so the meaning cannot be confused with anything else.
- `session_id` stays `not null` and keeps its own foreign key. Nothing is dropped or renamed.
- ★ **The one non-additive act in my area is the constraint swap**, and it is safe only because
  `record_calendar_sync()` is `create or replace`d **in the same file** (`W6`). Two files would give
  a window in which `main`'s worker calls a function whose `on conflict (member_id, session_id)`
  names a constraint that no longer exists — `42P10`, every calendar sync failing. **The migration
  order (row L9) must keep them in one file.**

### W2.2 The backfill — and why no member's calendar changes

```sql
update public.calendar_events ce
   set session_day_id = (select d.id from public.session_days d
                          where d.session_id = ce.session_id order by d.position limit 1)
 where ce.session_day_id is null;
```

`0100` gives every session with both ends exactly one day, and today's
`unique (member_id, session_id)` means at most one row per member per session — so the map is
one-to-one and the new unique constraint holds the moment it is created. **The row that exists today
IS the one day's row**: same `id`, same `provider_event_id`, same `state`. Nothing is inserted,
nothing is deleted, and the first `calendar_upsert` after the redeploy updates day 1's event with
day 1's window, which at `n = 1` is the session's window — the same body, so the provider records no
change.

Rows whose session has **no** day (a session that never had a time) cannot be produced by
`calendar_upsert`, which returns before recording when `starts_at` is null — but a `failed` row from
a historical path could exist. **Read before you write** (`DEC-023`): the lead runs the count first;
my recommendation is to leave those `session_day_id` null, which my code reads as «remove it» and is
the correct outcome for a session with no time (question Q2).

### W2.3 What each piece does at `n` days

- **`calendar_sync_target(p_rsvp)`** — `create or replace`, **every existing top-level key keeps its
  name and meaning** (`main`'s worker reads them): `rsvp_id`, `org_id`, `member_id`, `session_id`,
  `rsvp_status`, `connected`, `provider_event_id` (**day 1's**, so the old worker updates the event
  it created), `session.{title,description,starts_at,ends_at,time_zone,state,cancelled,location}`
  (the session's stored window and first venue — contract 1). **Added:**
  `days: [{ day_id, position, starts_at, ends_at, location, provider_event_id, state }]` and
  `orphans: [{ calendar_event_id, provider_event_id }]` for rows whose day is gone. The old worker
  ignores both.
- **`calendar_upsert`** — walks `days`: create where there is no `provider_event_id`, update where
  there is, `CalendarNotFound` still recreates (`REQ-CAL-006` cuts both ways). Then walks `orphans`
  and deletes. Every early return it has today is kept verbatim — no connection, not confirmed,
  cancelled session, no time — so at `n = 1` the log lines and the API calls are today's.
- **`calendar_delete`** — deletes **every** event of that member for that session, days and orphans
  alike; a `404` is still success.
- **`record_calendar_sync(...)`** — gains a **trailing** `p_day uuid default null`; null resolves to
  the session's day at `position 1`. The old 6-argument signature is **dropped in the same file**
  and re-created with 7, so `main`'s 6-argument call still resolves through the default and PostgREST
  never sees two overloads (`0085`'s lesson). A new `record_calendar_event_removed(p_event uuid)`
  addresses an orphan row, which has no day to key on.
- **`calendar_disconnected()`** — unchanged; it already works row by row.
- **ICS route** — one `VEVENT` per day, one `VTIMEZONE` for the file, taken from the first day.
  `buildIcs(event)` is **kept exactly as it is** and becomes a one-element call of a new
  `buildIcsDays(events)`, so `tests/unit/ics.test.ts` proves the byte-identity rather than being
  edited to accommodate it (rule 4).
- **`/app/me/calendar`** — one entry per day; at `n = 1` one entry, as today. `listSyncedEvents()`
  returns the day's window and position (question Q8 on how it reads them).
- **`AddToCalendar`** — the ICS carries every day in one download, unchanged in shape. Google and
  Outlook are per-event links, so `n` days is `n` links; the menu is `sessions`' file
  (`components/sessions/calendar-menu.tsx`) and grouping it is a request, not an edit (question Q7).

---

## W3. N2 — reminders per day, and which offsets repeat

### The rule I propose, and why it is a rule rather than a list

★ **An offset fires for day `k` only when its moment falls after day `k-1` has ended.** Day 1 always
fires. Formally, schedule at `day_k.starts_at - offset` when `k = 1` or
`day_k.starts_at - offset > day_{k-1}.ends_at`.

| Shape | −2 h | −1 d | −7 d |
|---|---|---|---|
| Three consecutive evenings, 6–8 p.m. | fires before each day | day 1 only — day 2's moment is 6 p.m. on day 1, during it | day 1 only |
| Three weekly meetings | fires before each day | fires before each day | day 1 only — day 2's moment is day 1's own start |
| Three monthly meetings | fires before each day | fires before each day | fires before each day |

It needs no threshold, no list of «long» offsets and no `if (isMultiDay)`: at `n = 1` there is no
previous day, every offset fires, and the three jobs under the three keys are exactly today's.
It is also the honest reading of `08` §4.2's restraint — a reminder is suppressed precisely when it
would land while the member is already at the workshop or has just been told the same thing.

The fallback, if the lead prefers something blunter: offsets below 12 hours repeat per day,
offsets of 12 hours and above fire once, before day 1. It is one line and it gets the three-evening
case right; it gets the monthly case wrong. **Question Q3.**

**The nudge stays once per session** (`nudge:{session}`, at the first day's start minus 7 days,
in-app only). A member is being asked whether they want the workshop, not whether they want
Wednesday. **The rating prompt stays once per session**, at completion.

### The sweep — how a key stops existing

`schedule_session_reminders(p_session)` today recomputes every offset every time rather than
diffing, which is why a session moved later gets its past offsets back. With days, the key **set**
can also shrink — a day removed, a day reordered, an offset suppressed by the rule above — and
`cancel_member_reminders()` already admits in its own comment that it guesses which offsets to
cancel by unioning the org's current array with the hard-coded defaults.

★ **Both are fixed by one function: after enqueueing, remove every pending job whose key matches
`^remind:{session}:[0-9]+:[0-9a-f-]+(:[0-9]+)?$` and is not in the set just built.** It reads
`graphile_worker.jobs` (the `key` column — the same table `tests/rls/notify-reminders.test.ts`
already reads) from a `security definer` function and removes through `graphile_worker.remove_job`,
never `add_job`. Exact, no tail margin, no memory of the past, and it makes the existing
"guessed offsets" comment untrue in the good direction. **Question Q4.**

### The send side

`send_reminder_notification(p_session, p_member, p_offset)` gains a **trailing**
`p_day uuid default null` (old signature dropped in the same file; null resolves to position 1, so
`main`'s worker's three-argument call is unchanged). It re-reads the conditions at send time as it
does today and adds one: the day must still exist. The payload keeps every key it has —
`session_id`, `title`, `startsAt`, `offset_minutes` — with **`startsAt` now the day's start**, which
at `n = 1` is `sessions.starts_at` (contract 1), and gains `dayPosition` and `dayCount`, `1` and `1`
at `n = 1`. `reminder_message_key(offset)` is untouched, so `MSG-reminder_7d` / `_1d` / `_2h` /
`_generic` and `0062`'s tolerance bands are exactly as they are.

★ **Risk to check when I build:** if an existing RLS case asserts the whole payload object rather
than individual keys, two added keys turn it red. That would be a finding for this note, not a test
to repair (rule 4). From reading them, `notify-reminders.test.ts` asserts keys and `run_at`, and
`notify-send.test.ts` asserts the notification rows — but I will name it here before I touch
anything.

`{{tasks}}` in the reminder templates stays unfilled, exactly as today. **Nothing I write this wave
names `session_tasks`, `task_completions` or `task_form_responses`** — `REQ-TSK-002` and the lead's
contract-10 guard are untouched by this track.

---

## W4. N3 — the reschedule notice names the day, and there is exactly one of it

### The problem, stated exactly

Moving day 2 of 3 changes neither `sessions.starts_at` (the first day's start) nor `sessions.ends_at`
(the last day's end), so the lead's day-to-session trigger writes nothing distinct, `sessions_notify`
never fires, and a member holding a seat is never told. Meanwhile at `n <= 1` the lead's
session-to-day carry trigger writes the day **inside the same statement** as the session, so a naive
trigger on `session_days` would send a second notice beside `sessions_notify`'s.

### The design — a positional split, with no flag and no deferral

★ **`sessions_notify()` keeps its time-and-venue diff exactly as it is today**, and a **new
`session_days_notify()` trigger sends a notice only for a day whose position is `>= 2` both before
and after the write.**

- At `n = 1` there is no day at position 2, so the new trigger **never fires**, and the member
  receives exactly one notice — `sessions_notify()`'s, byte-identical, because I do not change that
  branch. The double notice is impossible by construction rather than suppressed by a flag.
- At `n > 1`, day 1's window or venue moving changes the session's stored window or venue, so
  `sessions_notify()` fires — one notice, about the session's start, which is day 1's start.
- Day `k >= 2` moving fires only the day trigger — one notice, naming the day.
- A day inserted or deleted **before** day 1 renumbers everything and moves the session's window, so
  `sessions_notify()` covers it; one added or removed at position `>= 2` fires the day trigger.
- A multi-row day statement (two days added at once) is de-duplicated by a transaction-local guard
  so the member gets **one** notice carrying the new day set, not a delta and not one per row.

The trigger is `security definer`, `after insert or update or delete on public.session_days`, and is
tested **as a member**, not as the owner (the standing rule for a trigger that notifies).

### What the notice says

`MSG-session_changed` — the existing key, non-optional, both channels, to confirmed **and**
waitlisted members, exactly as today. The payload keeps `session_id`, `title`, `startsAt`, `venue`
and `changes`, and each `changes` entry gains two optional fields:

```jsonc
{ "field": "starts_at", "from": "...", "to": "...", "day": 2, "days": 3 }
```

`worker/src/mail/render.ts` already owns `CHANGE_LABELS` and builds the block; it renders «الموعد»
when `days` is absent or `1` — **byte-identical to today at `n = 1`** — and «موعد اليوم الثاني» when
`days` is greater than 1. The in-app string is mine, in `messages/ar/notifications.json`, with all
six ICU plural forms where a count appears and `<bdi>` on every interpolated value.

`sessions_notify()` gains the same two fields on its own entries, absent or `1` at `n = 1`, so a
one-day session's mail does not move a byte (question Q11).

★ **A day added or removed** has no `MSG-*` of its own in `08` §1.2 and `notify()` refuses a key
outside the matrix, so I propose reusing `MSG-session_changed` with a change entry
`{ "field": "days", "from": 3, "to": 4 }` rendering «الأيام: 3 ← 4». A new key would be a plan
change and the lead's (question Q5).

★ **A finding while reading this path:** `sessions_notify()` diffs `starts_at` and the venue but
**not `ends_at`**, so a session whose end time alone moves tells nobody, today. At `n >= 2` the new
day trigger covers the last day's end; at `n = 1` the silence is unchanged, which contract 2
requires. Recorded, not fixed here.

---

## W5. How I read days

- **In the app** — `listSessionDays(sessionId)` and `SessionDay` from `lib/dal/sessions.ts`
  (contract 3), `cache()`-wrapped. The ICS route, `AddToCalendar` and the calendar screen all read
  days through it. **No minimum or maximum is computed in TypeScript anywhere in this track**; the
  session's window comes from `sessions`, which stores it.
- **In SQL** — directly from `public.session_days` ordered by `position`, inside definer functions.
- The one place I want a ruling is `listSyncedEvents()`, which lists a member's rows and would embed
  `session_days(position, starts_at, ends_at)` in the same PostgREST query rather than fanning out a
  `listSessionDays()` call per row (question Q8).

---

## W6. What `main`'s OLD worker does with my SQL, job by job

The owner pushes migrations, then merges; Vercel deploys on the merge and Railway has to be
reconnected by hand, so there is a window in which **`main`'s worker runs against the new schema**.
Job by job:

| Job | What the old worker does | Correct? |
|---|---|---|
| `calendar_upsert` | reads `calendar_sync_target`, sees only the old top-level keys, writes **one** event with the session's stored window, calls `record_calendar_sync` with 6 arguments — the new body resolves day 1 | ★ yes at `n = 1`, byte-for-byte. At `n > 1` it writes day 1's row with an event covering the whole span — which is what it does today; the new worker reconciles on the next `cal:` |
| `calendar_delete` | deletes day 1's event, records `removed` on day 1's row | ★ yes at `n = 1`. At `n > 1` days 2+ keep their events until the new worker runs — the reconciliation below |
| `schedule_reminders` | calls `schedule_session_reminders(session)`; the body is the database's, so the **new** per-day scheduling happens | yes |
| `send_reminder` | calls `send_reminder_notification` with 3 arguments; the trailing `p_day` defaults to null and resolves to day 1 | ★ yes at `n = 1`. Pending jobs queued before the migration have no day in their payload and resolve the same way |
| `rsvp_nudge`, `rating_prompt`, `send_notification`, `refresh_calendar_tokens` | unchanged in shape and in body | yes |

★ **The reconciliation.** A multi-day session can only exist after the merge, so the exposure is the
minutes between the merge and the Railway redeploy — and the standing post-merge step is the owner
checking Railway anyway. I propose shipping `public.resync_calendars(p_session uuid default null)`,
definer, which enqueues `cal:{rsvp_id}` for every confirmed reservation (and `caldel:` for a
cancelled one whose rows are still `synced`), for the lead to run once after the redeploy and to name
in the migration order (question Q9).

★ **The riskiest single thing in this plan** is not any of the above: it is that
`record_calendar_sync()`'s `on conflict (member_id, session_id)` names the constraint I am asking
the lead to drop. **If the drop and the `create or replace` are in two different files, every
calendar sync in production fails with `42P10` between them.** One file, constraint swap and
function body together, backfill in between.

---

## W7. The `n = 1` proof — the files that already cover each path, none of them edited

Rule 4: an existing test file is evidence. **I change none of these**, and if one of them turns red
the assertion and the reason go in this note as a finding.

| Path | Covered today by | What proves `n = 1` |
|---|---|---|
| the three reminder keys, and that a reschedule moves them | `tests/rls/notify-reminders.test.ts` | it asserts the three keys by **exact string equality** and their `run_at`; the positional scheme leaves them untouched |
| a removed offset, a cancelled seat, a cancelled session | same file | the sweep is stricter than what it asserts, never looser |
| the org changing its reminder schedule | `tests/rls/notify-schedule-change.test.ts` | `org_settings_reschedule()` is untouched |
| the change notice with both values, publish, cancel, complete | `tests/rls/notify-session-notices.test.ts` | `sessions_notify()`'s branches are kept; the two new `changes` fields are absent at `n = 1` |
| the promotion notice, the reservation notices, `cal:` / `caldel:` enqueued in the transaction | `tests/rls/notify-m2-notices.test.ts`, `notify-reminders.test.ts` | the job keys do not change at any `n` |
| the matrix, the seventeen non-optional keys, `notify()`'s four properties | `tests/rls/notify-contract.test.ts` | untouched |
| send-time re-checks, the nudge, the rating prompt | `tests/rls/notify-send.test.ts` | the nudge and the prompt stay once per session |
| `calendar_sync_target`, `record_calendar_sync` idempotency, the disconnect notice | `tests/rls/calendar-sync.test.ts` | the old top-level keys keep their names and meanings |
| ICS folding at 75 octets, the `VEVENT`, `VTIMEZONE` | `tests/unit/ics.test.ts` | `buildIcs()` keeps its signature and becomes a one-element call of `buildIcsDays()` |
| the add-to-calendar links and their encoding | `tests/unit/ics-links.test.ts` | `calendarLinks()` keeps its signature |
| the templates against the matrix, the RTL HTML, the subject encoding, the transport | `tests/unit/mail-render.test.ts`, `mail-mime.test.ts`, `mail-transport.test.ts` | no template is added or removed |
| the worker tasks | `tests/unit/notify-jobs.test.ts`, `notify-calendar-api.test.ts` | the early returns and log lines are kept |
| the screens | `tests/components/notifications/notification-list.test.tsx`, `tests/components/me/calendar-page.test.tsx`, `tests/e2e/{notify-screens,wave7-content-calendar,wave7-content-notifications}.spec.ts` | one entry per day is one entry at `n = 1` |

**New behaviour gets new files:** `tests/rls/notify-days.test.ts`, `tests/rls/calendar-days.test.ts`,
`tests/unit/ics-days.test.ts` (including the byte-identity assertion against a one-day fixture and
three `VEVENT`s folded at 75 **octets**), `tests/unit/notify-jobs-days.test.ts`,
`tests/e2e/wave9-notify-days.spec.ts`.

---

## W8. Questions for the lead, numbered

1. **The constraint swap on `calendar_events`** — dropping `unique (member_id, session_id)` for
   `unique (member_id, session_day_id)` — approved, given `record_calendar_sync()` is replaced in the
   same file and no client role has a write grant on the table? (`unique (session_id, id)` on
   `session_days` is already in your `0100`, so the composite foreign key needs nothing new.)
2. **The backfill's edge**: `calendar_events` rows whose session has no day. Count them first; my
   recommendation is to leave `session_day_id` null so the next sync removes the provider event.
   Confirm, or tell me to fail the migration if the count is not zero.
3. **N2's rule** — «an offset fires for day `k` only when its moment falls after day `k-1` ended» —
   approved? Or the blunter «below 12 hours per day, 12 hours and above once»?
4. **The reminder sweep** reading `graphile_worker.jobs` from a definer function and removing by
   pattern, which also retires `cancel_member_reminders()`'s guessed offsets — approved?
5. **A day added or removed from a published session**: reuse `MSG-session_changed` with a `days`
   change entry, or does a new `MSG-*` key need a `DECISIONS.md` entry first? `notify()` raises
   `22023` for a key outside the matrix, so I cannot invent one.
6. **The day label in mail.** `worker/` is a standalone package and imports nothing from `src/`, so
   it cannot use `sessions`' formatter (contract 7). May I keep a small Arabic ordinal table in
   `worker/src/mail/render.ts`, or should `sessions` publish the ordinals somewhere both can read?
7. **`components/sessions/calendar-menu.tsx` is `sessions`'.** Per-day Google and Outlook links need
   a grouped shape on it, flat at `n <= 1`. Do I write the request to `sessions`, or do I render the
   multi-day case as the ICS download alone?
8. **`listSyncedEvents()`** — may it embed `session_days` in its own PostgREST query, or must every
   day read go through `listSessionDays()`? No minimum or maximum is computed in TypeScript either
   way.
9. **`public.resync_calendars(p_session uuid default null)`** for the window between the merge and
   the Railway redeploy — do you want it, and does it belong in row L9's order?
10. **A defect found while reading, not multi-day**: `{{startsAt}}` is interpolated raw, so a
    production mail renders `2026-10-01T18:00:00+03:00` rather than a formatted date —
    `tests/unit/mail-render.test.ts` passes a pre-formatted string and never catches it, and
    `formatChangeValue()` next door already does the right thing. Fix it in `render.ts` this wave
    (it becomes more visible with a day range), or record it and leave it?
11. **`sessions_notify()` is mine to `create or replace`** and I am adding two optional fields to its
    `changes` entries, absent or `1` at `n = 1`. Confirm that is within contract 2.

---

## W9. Order of work, once the plan is approved

1. The `calendar_events` columns to the lead (W2.1) — it is the only thing blocking anyone.
2. `supabase/proposed/notify/0101_calendar_per_day.sql` — the constraint swap, the backfill,
   `calendar_sync_target`, `record_calendar_sync`, `record_calendar_event_removed`,
   `resync_calendars`; `tests/rls/calendar-days.test.ts` with `applyProposed()`.
3. `supabase/proposed/notify/0102_reminders_per_day.sql` — `schedule_session_reminders`, the sweep,
   `send_reminder_notification`, `cancel_member_reminders`; `tests/rls/notify-days.test.ts`.
4. `supabase/proposed/notify/0103_day_change_notice.sql` — `session_days_notify()` and its trigger,
   `sessions_notify()`'s two fields; tested as a member.
5. The worker: `calendar_upsert`, `calendar_delete`, `send_reminder`, `render.ts`'s label.
6. The ICS route and `buildIcsDays()`; `AddToCalendar`; `/app/me/calendar`; the strings, `ar/` first.
7. The captures: `/app/me/calendar` with three entries, the add-to-calendar menu on a three-day
   session, the notice naming day 2 in the inbox and in Mailpit, and `/app/me/calendar` for a
   one-day session beside its wave-7 capture.

---

## W10. ★ CONTRACT 11 — `session_days_changed()`, published for `sessions`

**`DEC-151` supersedes W4's trigger.** A row trigger on `session_days` fires mid-write, so a guard
that de-duplicates a multi-row change announces the first row's partial truth and suppresses the
rest. The one day-aware writer holds the whole before and after, so it calls one function of mine.
**There is no trigger on `session_days` that notifies.** W4's positional rule is withdrawn with it;
what survives from W4 is the payload shape (`W10.4`) and the `MSG-session_changed` reuse.

### W10.1 The signature

```sql
public.session_days_changed(
  p_session uuid,     -- the session whose day set was written
  p_before  jsonb,    -- the day set as it was, BEFORE the first day write
  p_after   jsonb     -- the day set as it is, AFTER the last day write
) returns void
```

`security definer`, `set search_path = ''`, `revoke execute from public, anon, authenticated`,
`grant execute to service_role`. A `security definer` caller — `schedule_session()` — executes it as
the owner, the same way every M2 hook calls `public.notify()`.

### W10.2 The exact jsonb — an array, ordered by `position` ascending

```jsonc
[
  { "id":          "3f1a…",                       // uuid, session_days.id — the match key
    "position":    1,                             // int, the stored rank at the time of the snapshot
    "starts_at":   "2026-10-01T15:00:00+00:00",   // timestamptz, as to_jsonb renders it
    "ends_at":     "2026-10-01T17:00:00+00:00",
    "venue_label": "قاعة الابتكار" },             // text or null — session_venue_label()'s answer
  { "id": "9c04…", "position": 2, "…": "…" }
]
```

- **Exactly five keys, `snake_case`**, matching every other payload this track builds. An extra key
  is ignored; a missing one is read as null.
- **`[]` is the empty set** — a session that had no days, or has none left. **A null argument is
  tolerated and read as `[]`**, so a caller never has to special-case a first schedule.
- **`id` is the match key.** A day in both arrays under one `id` moved; in `p_after` only it was
  added; in `p_before` only it was removed. Position is never the match key: it is a derived rank
  and two different days can hold rank 2 before and after.
- **`venue_label`, not `venue_id` and the custom trio.** It is what the member reads and what the
  notice prints, and `sessions_notify()` already diffs the label rather than the columns, so the two
  announcements say the same thing in the same words.

**The one query that builds either snapshot** — run it before the first day write and again after
the last, and nothing else has to agree on anything:

```sql
select coalesce(
         jsonb_agg(
           jsonb_build_object(
             'id',          d.id,
             'position',    d.position,
             'starts_at',   d.starts_at,
             'ends_at',     d.ends_at,
             'venue_label', public.session_venue_label(d.venue_id, d.custom_venue_name))
           order by d.position),
         '[]'::jsonb)
  from public.session_days d
 where d.session_id = p_session
```

`session_venue_label(uuid, text)` is `0036`'s, `stable security definer`, granted to `authenticated`
and `service_role`. `0100`'s `session_days_derive()` renumbers in an `after` row trigger, so by the
time `schedule_session()` has finished its last day write the positions in `p_after` are final.

### W10.3 When `sessions` calls it, and what it may assume

- **Once**, at the end of the day-aware path, after the last day write and after `write_audit()`,
  inside the same transaction, with `kareem.days_writer` still `'on'`.
- **Always on that path, even when nothing changed.** The function diffs; equal snapshots send
  nothing, schedule nothing and enqueue nothing. `sessions` never has to decide whether a change is
  worth announcing.
- **Never on the legacy `p_days is null` path** — `sessions_notify()` covers that one, unchanged.
- **A second call in one transaction is a no-op**, guarded by a transaction-local marker, so a retry
  or a future second call site cannot double-send.
- It **writes no table of `sessions`'**: no `sessions` row, no `session_days` row, no audit row. It
  reads `sessions`, `session_days`, `rsvps` and `org_settings`, and it writes only `notifications`
  and the queue, through `public.notify()` and `public.enqueue_job()`.
- It raises nothing on a session that is `draft`, `cancelled` or `completed`; it returns.

### W10.4 What it does

1. **Guards.** Session missing, or `state not in ('published', 'in_progress')` → return. Nobody holds
   a seat in a draft to mislead, which is `0036`'s rule and stays it.
2. **Diffs `p_before` against `p_after` by `id`** and builds the `changes` array of
   `MSG-session_changed`, in `08` §3.3's shape with two optional fields added:

   | entry | when |
   |---|---|
   | `{"field":"starts_at","from":…,"to":…,"day":k,"days":n}` | a matched day's start moved |
   | `{"field":"ends_at","from":…,"to":…,"day":k,"days":n}` | a matched day's end moved |
   | `{"field":"venue","from":…,"to":…,"day":k,"days":n}` | a matched day's venue label moved |
   | `{"field":"days","from":n_before,"to":n_after}` | the count changed — a day added or removed |

   `day` is the day's position in `p_after` (its `p_before` position for a removed day) and `days` is
   `n_after`. **Both are omitted when `n_before` and `n_after` are both 1**, so a one-day session's
   payload is the one `0036` sends today, key for key.
   ★ **`ends_at` is emitted for day 1 as well**, because at `n >= 2` day 1's end is not the session's
   end and nothing else would ever mention it. That is `named difference`-shaped but it is not one:
   at one day `sessions_notify()` is the announcer and its silence on an end-only change is
   preserved (`DEC-151`, «carried out of the wave»).
3. **Sends** `MSG-session_changed` — the existing key, non-optional, both channels — to every
   `confirmed` and `waitlisted` member, with `session_id`, `title`, `startsAt` (the session's stored
   start), `venue` (the session's stored label) and `changes`. No notice when `changes` is empty.
4. **`schedule_session_reminders(p_session)`** — the per-day rule of `W3`, which re-enqueues by key
   and sweeps what it did not enqueue.
5. **`enqueue_job('calendar_upsert', …, 'cal:' || rsvp_id, …)` for every `confirmed` reservation** —
   one job per reservation at every `n`, which fans out over the days (`W1`).

Steps 4 and 5 are exactly what `sessions_notify()`'s change branch does today, moved to the one
place that can see a day-level change.

### W10.5 ★ One notice, at every `n` — `sessions_notify()` stands down for a day-aware writer

`sessions` writes the session **first** and its days second, so `0100`'s day→session trigger finds
nothing distinct and `sessions_notify()` fires exactly once, on that first write — **before** this
function is called. Left alone, a day-aware call that moves day 1 and day 2 sends two mails, and a
day-aware call on a **one-day** session sends two where `main` sends one.

So `sessions_notify()` gains one guard in its change branch — and only there:

```sql
if current_setting('kareem.days_writer', true) is not distinct from 'on' then
  return new;   -- a day-aware writer announces the whole change itself (contract 11)
end if;
```

Publish, cancel and complete are untouched and still fire under the flag. The flag is
transaction-local and set by one writer, so the rule it creates is exact and statable:

★ **A writer that sets `kareem.days_writer` must call `session_days_changed()` before it returns.**

This is why the byte-identity at one day does not depend on the form choosing to send a null
`p_days`. Either path sends **one** notice, and the day-aware path's payload at `n = 1` is the
legacy path's key for key, because `day` and `days` are omitted. **Lead: this is the only change to
`sessions_notify()` beyond the two optional fields you confirmed in question 11 — tell me if you
would rather rely on the null-`p_days` route alone, and I will drop the guard.**

### W10.6 The request to `sessions` (question 7, approved as a request)

`src/components/sessions/calendar-menu.tsx` — `CalendarMenu` takes
`links: { google, outlook, ics }` and renders three items. For a session with several days the ICS
stays **one** download carrying every day, while Google and Outlook are per-event and need one link
per day. **The prop I need:** a list of groups,
`groups: { label: string; links: { google: string; outlook: string } }[]`, plus the single `ics`,
**rendered flat when there is one group** so a one-day session's menu is exactly today's DOM.
`AddToCalendar` supplies the labels through `sessions`' day formatter and the links through
`calendarLinks()` per day. Nothing else about the component changes.

---

## W11. What landed, and what is open

**Five commits on `wave-9/multi-day`.** Every gate below was run on the last of them.

| Commit | Unit |
|---|---|
| `5444501` | N1 SQL and the two calendar worker tasks |
| `be12c0f` | N1's ICS, DAL and screen |
| `91c3734` | N2 — reminders per day and the sweep |
| `ee53f76` | the renderer: the day block, the day-qualified change label, named difference 4 |
| `1ff4732` | N3 — contract 11's `session_days_changed()` and `sessions_notify()`'s stand-down |

**To promote, in this order:** `supabase/proposed/notify/01_calendar_per_day.sql` (the lead's
`drop constraint` is carried at its top), `02_reminders_per_day.sql`, `03_day_change_notice.sql`.
Fifteen `03` §8.2 rows are in the three headers. Tests: `tests/rls/{calendar-days,notify-days,notify-day-notice}.test.ts`,
`tests/unit/{ics-days,notify-jobs-days,mail-day-words,mail-instants}.test.ts`,
`tests/components/calendar/synced-days.test.tsx`.

### W11.1 The untouched-suite ledger — one line, and it is not an expectation

`tests/components/me/calendar-page.test.tsx`. `SyncedEventDTO` gained `id`, `dayPosition` and
`dayCount` (one row per day, `REQ-SES-015`), so three fixture literals name them as the **one-day**
session they already described. **No assertion changed**, and none could have: a one-day calendar
screen renders no day label at all, which is the second case of the new
`tests/components/calendar/synced-days.test.tsx`.

**Nothing else that existed on `main` is edited.** The ten pre-existing notify and calendar RLS
files, `tests/unit/{ics,ics-links,mail-render,mail-mime,mail-transport,notify-jobs,notify-calendar-api,notify-channels,notify-i18n}.test.ts`
and `tests/components/notifications/notification-list.test.tsx` are all green as they stand — 125
RLS cases across the ten files in one run.

### W11.2 The request to `sessions` — `calendar-menu.tsx`

`src/components/sessions/calendar-menu.tsx` renders exactly three items, so only the first day's
Google and Outlook links reach it. **The prop:**

```ts
groups?: { label: string; links: { google: string; outlook: string } }[];
```

rendered **flat when there is one group**, so a one-day menu keeps today's DOM exactly; the single
ICS item is unchanged, because one file already carries every day. `AddToCalendar` already builds
the per-day list and labels it with `dayShortLabel()`; there is a `TODO(sessions, wave 9)` on the
one line that currently drops it. Nothing is needed from `ui/menu`.

### W11.3 Findings

1. ★ **Named difference 4 is real, and here is the measurement.**
   `select jsonb_build_object('startsAt', s.starts_at)` against the local database gives
   `"2026-09-19T06:37:03.319767+00:00"`. Fed through `renderEmail()` on the code as it stood, the
   reminder body read **`الموعد: 2026-09-19T06:37:03.319767+00:00`**. `interpolate()` is
   deliberately logic-free and calls `String(value)`; `tests/unit/mail-render.test.ts` never caught
   it because its fixture passes «الأحد 6:00 م», a value the product does not produce. Fixed in
   `render.ts` by applying `formatChangeValue()`'s existing rule — the org's zone, Western digits —
   to every top-level ISO instant. `tests/unit/mail-instants.test.ts` uses the database's own
   string as its input. **A Mailpit hop cannot change a rendered body; say the word and I will run
   one anyway.**
2. ★ **A candidate named difference 5, for the lead to rule on.** `08` §3.2's four reminder
   templates print «المكان: {{venue}}», and `send_reminder_notification()` has never put a `venue`
   in the payload — so every reminder mail since M3 has read «المكان: » and nothing. At several
   days it cannot stay missing, because the room can differ per meeting, so the payload now carries
   the **day's** venue. At one day that changes the mail from an empty line to the room's name. It
   is a fix by the same argument as difference 4; it needs a line in `STATUS.md`.
3. **`sessions_notify()` still does not announce an end-only change at one day** — carried out of
   the wave by `DEC-151` and preserved on purpose. At two days and more, `session_days_changed()`
   announces every day's end, including day 1's.
4. **`{{tasks}}` is still unfilled**, exactly as on `main`. Nothing in this track names
   `session_tasks`, `task_completions` or `task_form_responses`, so contract 10's guard is untouched
   by it.

### W11.4 ★ The promotion order, and a seam defect found by reading `0106`

**`03_day_change_notice.sql` must not land before `sessions` uncomments its call.**
`0106`'s day-aware `schedule_session()` sets `kareem.days_writer` and the contract-11 call is still
commented out (`0106:388`). My `03` makes `sessions_notify()` stand down for exactly that flag. So
promoting `03` alone means a day-aware `schedule_session()`:

- sends **no** `MSG-session_changed`, at one day as well as at three, and
- does **not** reschedule the reminders or enqueue the calendar jobs, because those moved into
  `session_days_changed()` with the announcement.

One line fixes it, in `sessions`' file: `perform public.session_days_changed(target.id, v_before, v_after);`.
**The two land together or `03` waits.** `0106`'s own `03` §8.2 row — «`sessions_notify` fires
exactly once for the whole change» — becomes «`sessions_notify` stands down and
`session_days_changed()` announces» on the day both are in.

**The seam defect, fixed in `a79f83b`.** `0106` builds its snapshots as `jsonb_agg(to_jsonb(d))` —
the whole `session_days` row, carrying `venue_id` and the custom-venue trio and **no**
`venue_label`, which is what §W10.2 published. The venue comparison would have read null against
null, so a day moving room would have reached nobody — the half of `REQ-SES-009` that actually sends
someone to the wrong room. `public.session_day_place(jsonb)` now reads the label when the caller
computed one and the columns when it did not. **`sessions` does not have to change its snapshot**;
both shapes name the same day and the seam should not care which arrives.

### W11.5 The promotion rehearsal — 95 cases, before the reset

The seven pre-existing notify and calendar RLS files were temporarily made to apply all three
proposed migrations in their own `setup()`, run, and restored — no edit committed, and `git status`
clean of them afterwards. **95 cases across the seven pass with the migrations applied**, every
assertion untouched: `notify-reminders`, `notify-session-notices`, `notify-schedule-change`,
`notify-send`, `notify-m2-notices`, `notify-contract`, `calendar-sync`. That is the `n = 1` proof
for this track, taken before promotion rather than after it.

### W11.6 The one path not yet proven against real PostgREST

`listSyncedEvents()`'s nested embed —
`sessions(title, starts_at, session_days(id)), session_days(position, starts_at)` on
`calendar_events`. The component tests mock the DAL and the embed needs the promoted column to
exist, so `tests/e2e/wave9-notify-days.spec.ts` is what proves it. It is the first thing to run
after promotion.
