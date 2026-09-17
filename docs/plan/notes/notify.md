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

### W11.7 The embed is proven, without the build

`0109`–`0112` are promoted, and all **126** cases across the ten notify and calendar RLS files pass
against the promoted schema — the six pre-existing ones with their assertions untouched. That
supersedes §W11.5's rehearsal: it is the real thing rather than a stand-in.

`listSyncedEvents()`'s nested embed (§W11.6) is proven too, without a build. Asked of local
PostgREST as `service_role`:

| select | answer |
|---|---|
| `id,not_a_table(x)` | `PGRST200` — «could not find a relationship … in the schema cache» |
| `id,sessions(title,starts_at,session_days(id)),session_days(position,starts_at)` | `42501` — permission denied on `calendar_events` |

An unresolvable embed is refused at schema-cache time, **before** privileges. Mine gets past that
stage and fails only on the grant — which is `service_role`'s by design (`0026` revokes it; the DAL
runs as `authenticated`). So both relationships resolve, including the nested one.

**What still needs the lead's build:** `tests/e2e/wave9-notify-days.spec.ts` and its four captures.
`.next` predates the whole wave, so a run now would serve yesterday's server components.

### W11.8 `DEC-152`'s venue-label finding — what I closed, and the one-liner I did not

**Closed:** `0111` granted `session_day_place(jsonb)` to `authenticated`, copying the grant on
`session_venue_label()` beside it — and so inherited the same hazard: it reads `venue_id` out of a
snapshot and returns the venue's name with no check that the caller may see that venue. It has no
client caller and cannot acquire one by accident, because its argument is a `session_days` snapshot
only a day-aware writer builds. `supabase/proposed/notify/04_narrow_day_place_grant.sql` revokes it,
with a `RPC-session_day_place.definer_only` case in `tests/rls/notify-day-notice.test.ts` that reads
**another org's** venue uuid and expects `42501`.

**Not closed, and ready to take.** `session_venue_label(uuid, text)` (`0036`, mine) has the finding
proper. The caller audit: **seven call sites, every one inside a `SECURITY DEFINER` function**
(`0036`, `0038`, `0039`, `0109`, `0110`, `0111`, `0112`), which execute as the owner — **no
application code calls it at all**, and the three test call sites run as the owner or as the
superuser. So both fixes are available:

```sql
-- the narrow one: nothing loses anything, because no client caller exists
revoke execute on function public.session_venue_label(uuid, text) from authenticated;

-- or the guarded one, which keeps the grant for a future client caller:
create or replace function public.session_venue_label(p_venue uuid, p_custom text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select v.name from public.venues v
                    where v.id = p_venue
                      and (public.auth_org_id() is null or v.org_id = public.auth_org_id())), p_custom)
$$;
```

The guard is null-safe for the worker (`service_role` carries no JWT, so `auth_org_id()` is null and
the read is unfiltered, as every definer caller needs) and exact for a member (the session's venue is
always in their own org). **Neither is shipped.** `0036` is promoted and read by `sessions`' `0112`
as well as by this track, so narrowing it is a change whose blast radius the lead should schedule —
not one a teammate slips in beside a feature.

### W11.9 §W11.6 is closed — the embed, as a real member, on the promoted schema

Not the schema-cache contrast of §W11.7 but the query itself: `listSyncedEvents()`'s select string,
character for character, run with a **member's own JWT** through PostgREST against `0109`–`0112`.
A member with a confirmed seat on a three-day workshop and one `calendar_events` row per day:

```
rows: 3
  position=1 dayStart=2026-10-17T07:28:08+00:00 title=ورشة ثلاثة أيام dayCount=3
  position=2 dayStart=2026-10-18T07:28:08+00:00 title=ورشة ثلاثة أيام dayCount=3
  position=3 dayStart=2026-10-19T07:28:08+00:00 title=ورشة ثلاثة أيام dayCount=3
```

Three rows, the day's own window on each, and the nested
`sessions(title, starts_at, session_days(id))` giving the session's true day count — through RLS,
which lets the member read their own sync rows and the days of a session they can see. The probe
builds and tears down its own org; it is in the scratchpad, not the repo, because it duplicates the
e2e's fixture and the e2e is where it belongs once there is a build.

**What still needs the lead's build:** only the rendered screen and the four captures. Every
assertion in `tests/e2e/wave9-notify-days.spec.ts` below the browser — the day-2 payload, the
session window not moving, the per-day rows — is now proven by `tests/rls/notify-day-notice.test.ts`
and by this probe.

### W11.10 `DEC-154` — the guard I got wrong, and where it is pinned

The lead corrected `session_days_changed()`'s transaction mark inside the promotion: it was keyed on
the session alone and **set on entry**, before the state guard, so a call that returned early —
scheduling a session not yet published — consumed the session's one mark and silenced the real
change later in the same transaction. `sessions`' «ONE reschedule notice» case caught it at the
seam; neither track's suite could see it alone, and mine was green because every case I wrote
announced something.

Three cases now pin both halves in `tests/rls/notify-day-notice.test.ts`, because the behaviour is
this function's and a future edit of mine is what would reintroduce it: a call that announces
nothing consumes nothing; a draft's early return consumes nothing and the change after publication
is still told; two different changes in one transaction are two notices. The retry case that was
already there still passes, which is the half the guard has to keep.

**The lesson for the next seam**: a guard whose failure mode is «a member is never told» must be set
where the telling happens, not where the function starts.

---

# W12. THE CLOSING SECTION — what is done, and what is carried

**Written at the wave-9 freeze.** Everything below the line is the state of this track for whoever
reads it next. Nothing here is a plan.

## W12.1 Done, and where the evidence is

| Contract 8's half | Where it lives | What proves it |
|---|---|---|
| One calendar entry per **day** | `0109`; `worker/src/tasks/calendar_{upsert,delete}.ts`; `src/lib/dal/calendar.ts`; `/app/me/calendar` | `tests/rls/calendar-days.test.ts` (8) · `tests/unit/notify-jobs-days.test.ts` · `tests/components/calendar/synced-days.test.tsx` · the capture `wave9-notify-calendar-three-days.png` |
| One `VEVENT` per day, folded at 75 **octets** | `src/components/calendar/ics.ts`, `src/app/api/sessions/[id]/ics/route.ts` | `tests/unit/ics-days.test.ts`, with `tests/unit/ics.test.ts` unmodified as the one-day byte-identity |
| A link set per day in the add-to-calendar menu | `src/components/calendar/add-to-calendar.tsx` + `sessions`' `groups` prop | the spec asserts a Google and an Outlook item per day and exactly one ICS · `wave9-notify-add-to-calendar.png` |
| One reminder stream per day, with the offset rule | `0110` | `tests/rls/notify-days.test.ts` (12) |
| A reschedule notice that names the day, in the inbox and in the mail | `0111`, `0112`'s call site; `src/components/notifications/notification-list.tsx`; `worker/src/mail/render.ts` | `tests/rls/notify-day-notice.test.ts` (15) · `tests/components/notifications/change-lines.test.tsx` (8) · `tests/unit/mail-day-words.test.ts` · `wave9-notify-notice-day-2.png` |
| A one-day session's identities unchanged | everywhere | the ten pre-existing notify and calendar RLS files green **unmodified** (130 cases) · `wave9-notify-calendar-one-day.png` |

**The `03` §8.2 rows** are in the headers of `0109`, `0110`, `0111` and `0117`. **The four named
differences** this track owns are `DEC-151`'s 4 (`{{startsAt}}` formatted rather than printed raw)
and `DEC-154`'s 5 (a reminder mail names its venue); both are approved and in `STATUS.md`.

**The one ledger line** is `tests/components/me/calendar-page.test.tsx` — `SyncedEventDTO` gained
`id`, `dayPosition` and `dayCount`, so three fixture literals name them as the one-day session they
already described. **No assertion changed**, and none could: a one-day card renders no day label,
which `tests/components/calendar/synced-days.test.tsx` asserts as an absence.

## W12.2 ★ Carried out of the wave — each with where it goes

1. **`REQ-NTF-007` — admin-editable required fields.** `notification_templates` is org-editable and
   `renderEmail()` already prefers an org row over the built-in default, but **nothing validates that
   an edited template still carries the fields its message needs**. The comment in `render.ts` above
   `interpolate()` says «`REQ-NTF-007`'s validation already refuses to SAVE a template whose body
   omits a declared required field» — **that validation does not exist**. Until it does, an admin can
   save a `MSG-session_changed` body with no `{{changes}}` and the notice goes out with the diff
   missing. **Wave 10, with the email studio** (`16` §11), because the studio is where a template is
   edited and the check belongs beside the editor. Raised at wave 8's sync 1 and carried again here.
2. **`REQ-NTF-008` — the bounce webhook.** `email_deliveries` is written on every send and
   `/api/webhooks/` exists, but **the Resend webhook handler was never written**, so a bounce or a
   deferral never reaches the row and `/app/admin/emails`' delivery log shows `sent` forever. The
   spike alert in `0075` counts `bounced` and `failed` rows that nothing currently produces.
   **Wave 10**, with the studio and the same `admin/emails` route (`DEC-085` returns it to this
   track then).
3. **`sessions_notify()` stays silent on an END-ONLY change at one day.** It diffs `starts_at` and
   the venue label and has never diffed `ends_at`, so a one-day session whose end time alone moves
   tells nobody — **on `main` today and on this branch, deliberately**. Contract 2 requires that
   silence to be preserved, and `DEC-151` carried it out of the wave rather than fixing it. At two
   days and more it **is** covered: `session_days_changed()` announces every day's end, including
   day 1's, which is the only place a middle day's end could ever be mentioned. **Whoever fixes it
   makes it a named difference first** — it changes a one-day mail, which is exactly the class of
   change this wave measured.
4. **`{{tasks}}` is still unfilled** in the four reminder templates, exactly as on `main`.
   `REQ-TSK-005` says a reminder carries outstanding preparatory tasks; the placeholder renders
   empty because no payload has ever carried one. Nothing in this track names `session_tasks`, so
   contract 10's guard is untouched by it — and whoever fills it must stay off the check-in path.
5. **`session_venue_label(uuid, text)`'s guarded body**, if a client caller is ever wanted.
   `0119` took the plain revoke, which is right while no application code calls it. §W11.8 keeps the
   guarded alternative and the caller audit that made the choice cheap.

## W12.3 What the next reader should not have to rediscover

- **The identity scheme is positional** (§W1): position 1 carries the key, `UID` and job a one-day
  session has had since M3; later days are suffixed by **position**, never by day id, so the key set
  depends on nothing but the day count and a reorder rewrites in place.
- **`cal:{rsvp_id}` and `caldel:{rsvp_id}` are per RESERVATION at every `n`** — one job that fans out
  over the days. A per-day key would have left production's pending jobs unreplaced.
- **A `calendar_events` row outlives its day on purpose** (`0101`'s `on delete set null`): it is the
  only record of the provider event id, and a null day means exactly «remove it».
- **A guard whose failure mode is «a member is never told» is set where the telling happens**
  (§W11.10, `DEC-154`).
- **`session_days_changed()` reads either snapshot shape** (§W11.4): the five published keys or a
  whole `session_days` row. `0112` sends the latter.

---

# Wave 10 plan — the email studio (`REQ-NTF-009` … `014`, `16` §11, `DEC-160` §4)

Planning only. Nothing below is built until the lead approves at sync 1. Everything in it was read
from the tree at `2665627`, not remembered: `worker/src/mail/**`, `worker/src/tasks/send_notification.ts`,
`supabase/migrations/{0026,0030,0055,0062,0068,0073,0082,0093,0110,0119}`, `src/app/[locale]/app/admin/emails/**`,
`src/lib/dal/notifications.ts`, `src/proxy.ts`, `packages/designer-runtime/{package.json,tsconfig.json}`,
root `package.json`, `worker/{package.json,tsconfig.json,Dockerfile}`, the five `tests/unit/mail-*.test.ts`,
`tests/components/admin/emails-page.test.tsx`, `tests/unit/admin-emails.test.ts`,
`tests/e2e/wave8-console-emails.spec.ts`, `tests/rls/definer-exposure.test.ts`.

## X0. The two contracts I own, published

**Contract 4 — pin, then move, then build.** `renderEmail(input)` keeps its signature. `RenderInput`
gains **optional, trailing** fields only (`appUrl?`, a widened `brand?`); no caller changes shape.
The order is N1 → L3 → N2 and it is not negotiable, because the move has no proof without the pin.

**Contract 5 — `public.notify()` and every `MSG-*` key unchanged.** `notify()`'s signature, its four
properties, the 39-row matrix and the 25 email keys are untouched by this wave. **An org with no
block template renders the pinned bytes** — see `Q2`, which is the one place that promise is in
tension with a settled document, and the only question in this plan I cannot answer alone.

## X0.1 ★ SYNC 1 — the plan is approved, with two paper defects corrected. This section wins

The lead read all 915 lines and approved with two corrections and nine rulings. **Where anything
below in this plan disagrees with this section, this section is what I build.** The sections it
supersedes are marked at their head.

**D1 — storage: no `email_designs` table.** My shared-design model had three defects, each fatal on
its own. (i) **Bindings**: a design bound to `reminder_1d` (which offers `venue`) and to
`rsvp_promoted` (which does not) cannot be policed by a trigger on `notification_templates` alone —
editing the **design** later fires nothing there, and `REQ-NTF-012` says *every writer*. (ii) **A
stale `body`**: the generated text on each bound row goes stale the moment the shared design is
edited — two sources for one text, which is the drift `REQ-NTF-013` exists to prevent. (iii)
**Copy**: a family is a **shape**, and the words differ per key — `reminder_7d`, `_1d` and `_2h` say
different things — so one shared row cannot carry them.
**The ruling.** `notification_templates` gains two nullable columns and no table is created:
`blocks jsonb` (**null = a string template**, today's row, byte for byte) and
`source_family public.email_design_family` — a **Postgres enum**, because the naming rule forbids
`text` + check — carrying provenance. Both go into the **column-level update grant** beside
`subject`, `body` and `required_fields`. One row per `(org_id, key, channel, locale)` as today, the
four existing policies, and **one trigger — mine** — validating `subject`, `body` **and** `blocks`
for every writer. The **subject stays `notification_templates.subject`**, so `subject` comes out of
`EmailDesign`. The platform library is constants (`Q3` upheld), **per key**: a default block document
is its family's shape plus that key's copy, and «duplicate» writes that document into the key's row.
`Q1` upheld — jsonb — and the lead records the narrowing of `02`, `DEC-081` and `16` §11.6.
`notification_send_context()` gains `blocks` in its `template` object, **same signature**, through
`create or replace`. §X9's convert-and-clear works unchanged, on one row.
**Supersedes §X3.3 entirely**, and the `EmailDesign.subject` field in §X3.1.

**D2 — the preview: a form posting into a named iframe.** §X7.1 said POST with a body and §X7.2
framed it with `src=`, which is a GET — and unsaved blocks do not fit a query string. The pattern is
`<form method="post" target="mail-preview">` posting into the **named** sandboxed iframe; the
response carries its own headers because it is a real navigation. **Never `blob:` and never
`srcdoc`** — both inherit the parent's CSP, which is my own argument in §X7.2. The handler adds
**`sandbox`** to its own CSP header as well, so the document is sandboxed even if someone opens it
top-level. My `proxy.ts` finding is accepted: no change to that file.
`/api/admin/emails/preview` goes into `04` §4 with `DEC-161`, and **I do not create the route until
the lead says it is there.** **Supersedes §X7.1's transport and §X7.2's `src=`**; the rest of §X7
stands.

**R3 — `Q2` ruled: adoption is EXPLICIT, for every org, new or old.** No org-creation hook and no SQL
copy of the designs — a seed would be a second copy of the constants plus a drift test, for nothing
this wave. **A key with no row, or a row whose `blocks` is null, renders the pinned string bytes.**
`DEC-081` already schedules the flip: the string path leaves in **M13**, and that is when
`REQ-NTF-014`'s «no key falls back to unstyled text» becomes true for an untouched org. The lead
amends the requirement's acceptance to say so. **Supersedes my `Q2` recommendation**, which proposed
seeding at org creation.

**R4 — contract 3, corrected against `renderEmail()`'s real assembly.** I had the value of `body`
right and its **form** wrong. The greeting is **part of `body`** in every default template, and the
string path appends «—\n{org} · SIGNATURE» **itself** (`render.ts:330`). So the `body` written into a
block row is the blocks' text **in template form — `{{bindings}} intact, never rendered`** (a
rendered text would send one member's name to everyone) and **without the composed footer's
signature**, or `main`'s worker signs twice. A line whose only content is a binding the old worker
cannot supply renders empty and `toParagraphs()` drops it — exactly what `{{url}}` does today, which
the pinned files now show as bytes. **To pin: one unit case that feeds a block row's
`{subject, body}` to the STRING path and asserts a sane mail** (lands with N2).
**Supersedes §X6 step 3.**

**R5 — `Q7` granted: `{{url}}` is named difference 1.** The broken bytes are pinned first (done,
`38a6f46`); the fix is a reviewed diff over them. `RenderInput.appUrl?`, trailing. The worker reads
**`APP_URL`** — an owner's step on Railway, which the lead puts in the order. ★ **When it is unset
the renderer behaves exactly as today** and produces the pinned bytes: never a relative link, never
`localhost`. `{{tasks}}` stays empty and carried — **but `tasks` is declared as OFFERED** for the
three reminder keys that interpolate it (`7d`, `1d`, `generic`; `2h` does not), or X5's rule 4
refuses the platform's own default text.

**R6 — N8: the signature is verified IN THE DATABASE.** My §X12 relied on the route checking the
signature before calling the function — and a function `anon` may execute cannot rely on a caller it
does not control: anyone holding the publishable key calls `rpc/record_delivery_event` directly and
never meets the route's check. So the route forwards `svix-id`, `svix-timestamp`, `svix-signature`
and the **raw body**; the function recomputes the HMAC with pgcrypto's `hmac()`, enforces a
**5-minute** tolerance, and only then calls the inner function; `void` either way.
★ **Confirmed against the local database rather than assumed**: `pgcrypto` is installed in the
`extensions` schema and `extensions.hmac('abc','key','sha256')` returns a digest; **`supabase_vault`
is installed too**, in schema `vault`. Every definer function here carries `set search_path = ''`, so
the call is written **`extensions.hmac(...)`** — unqualified it resolves to nothing and the webhook
would fail closed on every event, which is the quiet way this design dies.
**The secret lives in the database** — Vault or a no-grant table —
set by the owner with one statement, **not on Vercel**, which is also truer to invariant 7. If that
is heavier than the wave has room for, **N8 is carried with this design rather than shipped with the
weaker one**. `Q4` granted on that basis. **Supersedes §X12's verification step and its owner's
step.**

**R7 —** `Q5` granted (the lead adds «أُرسلت رسالة اختبار» / "Test email sent" to `admin.json`);
`Q6` closed; `Q8` granted — the eight names stay as the owner wrote them.

**R8 — the logo (contract 9) is decided at sync 2**, with `designer`'s contract-8 answer:
`REQ-NTF-014` says «changing the org logo restyles every message», so a logo must reach a mail. Two
candidates: a proxied public URL of `/api/s/[id]/og`'s shape, or a **CID inline attachment**, which
needs no public surface at all and which I had not considered. N1–N3 do not wait on it, and every
design renders correctly with no image.

**R9 — `send_test_email(p_key text, p_locale text default 'ar')`**, under D1: it sends **the saved
row**, or the platform default when there is none. «Save, then test.» **No design argument**, and
still **no address argument**. **Supersedes §X8.1's signature.**

**R10 — `dist` staleness, a trap the pin creates.** After L3 the tests import
`@kareem/mail-runtime` **by name**, which resolves to `dist` — so a stale `dist` makes the pin pass
**falsely**. Whenever the package's `src/` changes I run `npm run build -w @kareem/mail-runtime`
before `npm test` (a **workspace** build is mine; the **root** build is the lead's). The lead adds a
guard at L3.

**R11 — a standing trap `event` found**, recorded because of why it does not bite me:
`tests/rls/isolation.test.ts`'s last assertion fails for any **new table** a plain member may select
but sees zero rows of. Under D1 I add no table.

§X13's ledger lines are accepted as written, as are the three import-line edits after L3.

## X0.2 ★ N3's blocking finding — rule 4 refuses three fixtures, one of them the lead's

`38ccd25` landed `notification_bindings()` and rule 4. **Before it can be promoted, one line of
`tests/rls/fixture-m3.ts` has to change**, and that file is lead-only. Measured, not read: the
proposed file applied in a rolled-back transaction, then each existing template insert attempted
against it.

| Where | The insert | Under rule 4 |
|---|---|---|
| ★ `tests/rls/fixture-m3.ts:53` | `MSG-session_published`, body and subject use **`{{session.title}}`** | **REFUSED** — `unknown_binding: session.title` |
| `tests/rls/notify-contract.test.ts:283` | `MSG-rsvp_promoted`, body uses **`{{name}}`** | **REFUSED** — `unknown_binding: name` |
| `tests/rls/notify-contract.test.ts:304` | `MSG-session_changed`, body uses **`{{new.startsAt}}`** | **REFUSED** — `unknown_binding: new.startsAt` |
| `tests/rls/notify-contract.test.ts:320` | `MSG-photo_hidden`, channel `in_app` | passes — rule 4 is email-only |
| `tests/rls/notify-send.test.ts:105` | `MSG-badge_earned`, `{{badge}}` and `{{member.name}}` | passes |
| `tests/e2e/wave8-console-emails.spec.ts:166` | `MSG-reminder_1d`, `{{title}}` | passes, **unchanged** |

★ **None of the three is a case the rule breaks; each is a binding that does not exist.**
`{{session.title}}`, `{{name}}` and `{{new.startsAt}}` are supplied by no caller and have rendered
**blank** in every mail they were in since M3. Rule 4 found three more instances of finding 1's
family, in the fixtures rather than in the templates.

**The two in `notify-contract.test.ts` are mine and are fixed** (`38ccd25`), with the corrected text
re-measured as passing. Ledger lines, as proposed for `STATUS.md`:

> `tests/rls/notify-contract.test.ts` · `38ccd25` · *two fixture texts, not two expectations:
> `MSG-rsvp_promoted` never carried `{{name}}` and `MSG-session_changed` never carried
> `{{new.startsAt}}` — both rendered blank in every mail they were in, and `REQ-NTF-012`'s binding
> rule refuses a placeholder the key does not offer. The `select.admin` case still asserts who may
> read a template; the `required_fields` case still asserts `23514` on a missing declared field, a
> save when present, and `23514` on an update that removes it.* · **Expectation changed: no**

**The request to the lead — one line of `tests/rls/fixture-m3.ts`**, measured as passing before it is
asked for:

```
-               'جلسة جديدة: {{session.title}}',
-               'مرحبًا {{member.name}}، نُشرت جلسة {{session.title}}.', '{member.name,session.title}')
+               'جلسة جديدة: {{title}}',
+               'مرحبًا {{member.name}}، نُشرت جلسة {{title}}.', '{member.name,title}')
```

`MSG-session_published`'s payload carries `title`, `startsAt`, `venue` and `session_id` (`0036`,
`0111`) and has never carried `session.title`. **This is a promotion blocker, not a nicety**: most of
the RLS suite seeds M3, so promoting rule 4 before this line changes turns far more red than one
file. Until it lands, `tests/rls/notify-bindings.test.ts` calls `applyProposed()` **after**
`seed()` — the ordering stops mattering the moment the fixture is corrected, and the file says so at
its head.

**Gates on `38ccd25`:** `tsc` clean · lint 0 errors · the new file 9 green · **the whole RLS suite,
104 files, 1079 passed** with the proposed file applied in the one test that applies it.

## X1. N1 — pinning today's output, before anything else changes

### X1.1 The files

```
tests/unit/mail-pinned/<case>.subject.txt     the subject, one line, no trailing newline
tests/unit/mail-pinned/<case>.txt             the text/plain part, verbatim
tests/unit/mail-pinned/<case>.brand.html      renderEmail({ …, brand: BRAND })
tests/unit/mail-pinned/<case>.plain.html      renderEmail({ …, brand: null })
```

Four files per case. **The subject and the text part do not depend on the brand** — `renderEmail()`
computes both before `toHtml()` and passes `brand` only to `toHtml()` — so pinning them once is
correct, and a test asserts that fact rather than assuming it (`subject` and `text` are equal with
and without a brand, for every case). The directory sits under `tests/unit/mail-*`, which is mine;
vitest's `unit` project includes `tests/unit/**/*.test.ts` only, so the `.txt` and `.html` files are
data, not tests.

**A case is not a key.** It is `{ id, key, payload }`, because three renderer branches are worth
freezing separately and each is a one-line fixture rather than a second key:

| Extra case | Why |
|---|---|
| `MSG-reminder_1d.day2of3` | `dayBlock()` at `dayPosition = 2`, `dayCount = 3` — wave 9's «اليوم الثاني من 3». The plain `MSG-reminder_1d` case carries `dayCount = 1`, which must render **without** the day line. |
| `MSG-session_changed.day2of3` | `changeLabel()`'s «الموعد · اليوم الثاني», and `changesFromPayload()` dropping an unchanged field. |
| `MSG-rating_prompt.no-display-name` | `member.name ?? member.email` — the greeting's fallback, which no existing test renders end to end. |
| `MSG-badge_earned.hostile` | `escapeHtml()` over `<script>alert(1)</script>`, so the escaping is bytes and not a `toContain`. |

29 cases × 4 files = 116 files, each small. The test asserts the **set of case ids covers all 25
keys of `notification_matrix()` with `email = true`**, so a deleted file fails rather than silently
passing, and a key added to the matrix fails until it is pinned.

### X1.2 The fixed org, member and brand

```ts
const ORG    = { name: "كريم معرفة", timeZone: "Asia/Riyadh" };
const MEMBER = { name: "سارة العتيبي", email: "sara@kareem.example" };
const BRAND  = { fgBody: "#2b3a55", fgMuted: "#6f7d93", surface: "#fffdf7" };  // deliberately none
                                                                              // of render.ts's three
                                                                              // fallbacks
```

`ORG` and `MEMBER` are the existing suite's, so a reader who knows `mail-render.test.ts` recognises
the pinned bytes. `BRAND`'s three values differ from `#1a1a1a` / `#6b6b6b` / `#ffffff` in every
digit, so `<case>.brand.html` and `<case>.plain.html` differ visibly and a brand that stopped being
read would fail rather than produce two identical files.

### X1.3 The payload per key — what the call site actually sends today

★ **The pin freezes the mail members receive, so each payload is what the caller really passes**,
read out of the migrations, not what the template happens to reference. Two bindings are in the
default templates and in **no** payload anywhere in the product — `{{url}}` in all 25 and `{{tasks}}`
in three reminders (§X15, finding 1) — so they render empty in the pinned files, on purpose. The
fixture file names them in a comment; when `url` is fixed (`Q7`) the pinned files change as a
reviewed diff, which is the mechanism doing its job.

Fixed ids: session `11111111-1111-4111-8111-111111111111`, proposal `22222222-…`, comment
`33333333-…`. Fixed instants in the local database's own shape, microseconds and offset included:
`2026-10-01T15:00:00.123456+00:00` (→ Thursday 6:00 PM in Riyadh, Western digits), and
`2026-10-02T16:00:00.123456+00:00` for a «to» value.

| `MSG-*` | payload (fixed) |
|---|---|
| `proposal_submitted` | `proposal_id`, `proposer: "خالد المطيري"`, `title: "الذكاء الاصطناعي في العمل"` |
| `proposal_approved` | `proposal_id`, `title` |
| `proposal_rejected` | `proposal_id`, `title`, `reason: "الموضوع قريب من جلسة قادمة"` |
| `proposal_changes` | `proposal_id`, `title`, `reason: "نحتاج تفصيل المحاور الثلاثة"` |
| `copresenter_invited` | `proposal_id`, `title`, `inviter: "خالد المطيري"` |
| `session_published` | `session_id`, `title`, `startsAt`, `venue: "قاعة الابتكار"` |
| `presenter_assigned` | `session_id`, `title`, `startsAt`, `venue` |
| `session_changed` | `session_id`, `title`, `startsAt`, `venue`, `changes: [{field:"venue",from:"قاعة أ",to:"قاعة ب"},{field:"starts_at",from:<A>,to:<A>}]` — the second is **unchanged** and must not print |
| `session_changed.day2of3` | the above plus `{field:"starts_at",from:<A>,to:<B>,day:2,days:3}` |
| `session_cancelled` | `session_id`, `title`, `startsAt`, `reason: "ظرف طارئ للمقدّم"` |
| `rsvp_promoted` | `session_id`, `rsvp_id`, `title`, `startsAt` — **no `venue`**, as the call site sends none |
| `reminder_7d` · `reminder_1d` · `reminder_2h` · `reminder_generic` | `session_id`, `title`, `startsAt`, `venue`, `offset_minutes`, `dayPosition: 1`, `dayCount: 1` |
| `reminder_1d.day2of3` | the above with `dayPosition: 2`, `dayCount: 3`, `startsAt` = day 2's |
| `rating_prompt` | `session_id`, `title` |
| `rating_prompt.no-display-name` | the same, rendered with `member.name = null` |
| `materials_added` | `session_id`, `title` |
| `comment_reply` | `session_id`, `comment_id`, `title`, `author: "نورة القحطاني"` |
| `mentioned` | `session_id`, `comment_id`, `title`, `name: "نورة القحطاني"` |
| `badge_earned` | `badge: "أول جلسة"` |
| `badge_earned.hostile` | `badge: "<script>alert(1)</script>"` |
| `level_reached` | `level: 7` — a **number**, so `formatNumber()`'s Western digits are pinned |
| `certificate_issued` | `certificate_id`, `serial: "KM-000001"`, `kind: "attendance"` |
| `certificate_revoked` | `serial: "KM-000001"`, `reason: "أُلغي الحضور بعد المراجعة"` |
| `role_changed` | `role: "منظّم"` |
| `account_deactivated` | `reason: "بناءً على طلبك"` |
| `export_ready` | `request_id` |

`{{org}}` and `{{member.name}}` are injected by the renderer for every key and need no payload entry.

### X1.4 How the files are produced, and why they can never be refreshed quietly

`tests/unit/mail-pin-write.test.ts` — a file that is **skipped unless `MAIL_PIN_WRITE=1`**
(`describe.runIf(process.env.MAIL_PIN_WRITE === "1")`). It imports `renderEmail` **as it stands on
`main`** (`../../worker/src/mail/render`, before L3; `@kareem/mail-runtime` after) and writes the 116
files. It asserts nothing.

`tests/unit/mail-pinned.test.ts` — always runs, and compares byte for byte with `toBe()` after
`readFileSync(…, "utf8")`, one `it` per case so a failure names the case and the part.

Five reasons it cannot drift:

1. **`MAIL_PIN_WRITE` is set in no script, no `package.json` entry and no workflow.** `npm test`,
   the `TaskCompleted` hook and CI all run the comparison and cannot run the writer. There is no
   `--update` flag to pass by habit, because there is no flag.
2. **The writer is a different file from the test.** Nothing that fails can be made to pass by
   re-running it.
3. **The file set is asserted**, so deleting a pinned file is a red test, not a green one.
4. **Every pinned file is committed**, so a change is a diff a person reads — the rule
   `scripts/parity/goldens/**` already lives under, and `STATUS.md`'s untouched-suite ledger covers
   `tests/**` by path.
5. **The definition of done checks it mechanically**: `git diff --stat <N1's commit> -- tests/unit/mail-pinned/`
   is empty on the final commit, unless a named difference says otherwise in this note.

The moment N1 is committed I tell the lead, because L3 is blocked on it.

## X2. The package boundary (contract 4)

### X2.1 What moves, and the proof that it can

Into `packages/mail-runtime/src/`, **mechanically, by the lead**:

| From | To | Verified |
|---|---|---|
| `worker/src/mail/render.ts` (333 lines) | `src/render.ts` | imports `./templates.js` and nothing else; no `node:`, no `process`, no `Buffer`, no `fs` |
| `worker/src/mail/templates.ts` (155 lines) | `src/templates.ts` | imports **nothing**; a const table and one lookup |

Both use `Intl.NumberFormat("ar-u-nu-latn")` and `Intl.DateTimeFormat` with a `timeZone`, at module
scope. Both are available in Node 22 (full ICU by default) and in every browser we target, so the
package is isomorphic in fact and not only by intent. `grep -n "node:\|require(\|process\.env"` over
the two files returns nothing.

The lead also writes `src/index.ts`, re-exporting exactly the surface anything outside uses today:

```ts
export { renderEmail, interpolate, changeBlock, changesFromPayload, dayBlock, dayPhrase,
         DAY_ORDINALS, TemplateMissingError } from "./render.js";
export type { RenderInput, RenderedEmail, ChangedField } from "./render.js";
export { DEFAULT_TEMPLATES, SIGNATURE, defaultTemplate } from "./templates.js";
export type { EmailTemplate } from "./templates.js";
```

### X2.2 What stays in `worker/src/mail/`, and why each one has to

| File | Why it cannot move |
|---|---|
| `transport.ts` | `process.env` in `fromAddress()` and `selectTransportName()` |
| `index.ts` | the factory; the **one** place `RESEND_API_KEY` is read (`DEC-046`) |
| `mime.ts` | `Buffer.byteLength` / `Buffer.from` at three call sites |
| `smtp.ts` | `import net from "node:net"` |
| `resend.ts` · `memory.ts` | transports; they belong with the factory and the app must never hold either |

The app must not be able to import a transport at all. Keeping the five in `worker/` is that rule as
a file boundary rather than as a comment.

### X2.3 What the build must emit — the `.js` suffix question

`render.ts` writes `from "./templates.js"` because `worker/tsconfig.json` is `module: NodeNext`,
`moduleResolution: NodeNext`, where the suffix is **required**. The app is `moduleResolution: bundler`,
where the suffix is **permitted and ignored**. So the suffixes stay exactly as they are and the
package follows `packages/designer-runtime` verbatim:

- `package.json`: `"type": "module"`, `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`,
  `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`,
  `"files": ["dist"]`, `"scripts": { "build": "tsc -p tsconfig.json" }`.
- `tsconfig.json`: `target ES2022`, `module ESNext`, **`moduleResolution: bundler`**, `declaration: true`,
  `outDir: dist`, `rootDir: src`, `strict`, `noUncheckedIndexedAccess`, `skipLibCheck`.
  `lib: ["ES2022"]` — **not `DOM`**; the mail runtime touches no DOM and saying so in the compiler
  is the cheapest guard against someone reaching for `document` in the block compiler.

The emitted `import … from "./templates.js"` is extension-ful ESM, which resolves under the worker's
`NodeNext` **and** under Turbopack/Vite. `designer-runtime` is already consumed by both this way, so
this is a precedent and not an experiment.

The lead's four edits, named so they are one commit:

1. root `package.json` — `build` and `prepare` gain `npm run build -w @kareem/mail-runtime` **before**
   `next build` (order matters: the app imports it).
2. `worker/package.json` — `"@kareem/mail-runtime": "0.1.0"` in `dependencies`.
3. `worker/Dockerfile` — `COPY packages/mail-runtime/package.json packages/mail-runtime/` in **both**
   stages (npm workspaces need every manifest to reconcile the lock), the build stage's
   `COPY packages/mail-runtime/ …` + `npm run build --workspace @kareem/mail-runtime`, and the runtime
   stage's `COPY --from=build /app/packages/mail-runtime/dist packages/mail-runtime/dist`.
4. `npm run lockfile` (in the container, `CLAUDE.md`'s rule).

### X2.4 What imports it afterwards

| File | Before | After | Mine? |
|---|---|---|---|
| `worker/src/tasks/send_notification.ts` | `from "../mail/render.js"` | `from "@kareem/mail-runtime"` | yes |
| `tests/unit/mail-render.test.ts` | two imports, `…/mail/render` + `…/mail/templates` | one, `@kareem/mail-runtime` | yes — **ledger line** |
| `tests/unit/mail-day-words.test.ts` | `…/mail/render` | `@kareem/mail-runtime` | yes — **ledger line** |
| `tests/unit/mail-instants.test.ts` | `…/mail/render` | `@kareem/mail-runtime` | yes — **ledger line** |
| `tests/unit/mail-transport.test.ts` · `mail-mime.test.ts` | — | **unchanged** | — |
| `tests/unit/mail-pinned*.ts` | `…/mail/render` | `@kareem/mail-runtime` | new files, no ledger line |

Three ledger lines, each «an import moved with the module; no assertion touched». I considered
leaving `worker/src/mail/render.ts` behind as a one-line re-export so **nothing** changed — and
reject it: two names for one module is the drift the package exists to prevent, and contract 4 says
`send_notification.ts` changes an import.

`npm test` needs `packages/mail-runtime/dist` to exist, exactly as it already needs
`designer-runtime`'s — `prepare` builds it on install.

## X3. The block model, and where it is stored

### X3.1 As types (`packages/mail-runtime/src/blocks.ts`, mine after L3)

```ts
export const SCHEMA_VERSION = 1;

export type BlockId = string;                      // stable within a document; the checks panel
                                                   // selects by it
export type EmailBlock =
  | { type: "heading";      id: BlockId; text: string; level: 1 | 2 }
  | { type: "paragraph";    id: BlockId; text: string }                    // {{bindings}} allowed
  | { type: "button";       id: BlockId; label: string; urlBinding: string;
                                         style: "primary" | "secondary" }
  | { type: "session_card"; id: BlockId }                                  // binds `session_id`
  | { type: "detail_list";  id: BlockId; items: { label: string; value: string }[] }
  | { type: "divider";      id: BlockId }
  | { type: "spacer";       id: BlockId; height: "sm" | "md" | "lg" }
  | { type: "image";        id: BlockId; src: ImageSource; alt: string; width: number };

/** PNG and JPEG only — invariant 11 — and a URL a client with no session can fetch (X10). */
export type ImageSource = { kind: "org_logo" } | { kind: "session_card_image" };

export interface EmailDesign {
  schemaVersion: typeof SCHEMA_VERSION;
  subject: string;             // a string with bindings, exactly as today
  blocks: EmailBlock[];        // the footer is NOT in here
}
```

★ **Eight typed members, nine blocks.** `footer` is **composed, not typed** (`REQ-NTF-009`): the
compiler appends it to every document, always, so `REQ-NTF-005`'s preference link cannot be deleted
by an admin or forgotten by a design. It is not in the union, it has no id, and it is not reorderable.
That is the requirement read literally and it is also the only shape in which «can never be
forgotten» is true. It is still **shown** — as a fixed last row outside the reorderable set, so the
pane does not tell an admin the mail ends where it does not (`Q6`).

`alt` is `string` and not `string | undefined`: a mandatory field is mandatory in the type, and the
checks panel's «an image with no `alt`» fires on the empty string.

### X3.2 The compiler and the generated text (`REQ-NTF-013`)

One function, two outputs, one walk:

```ts
compileDesign(design: EmailDesign, ctx: RenderContext): { html: string; text: string }
```

Each block emits **one `<tr><td …>`** of the existing shell — `render.ts`'s `toHtml()` is correct
and stays; the compiler produces its `rows` instead of `paragraphs.map(...)`. Every cell carries
`dir="rtl" align="right"` and inline CSS, because Outlook ignores inherited direction. The text part
comes from the same walk: a heading is a line, a paragraph is a paragraph, a button is `label: url`,
a session card is four lines (title, day, time, venue), a detail list is `label: value` per line, a
divider is a blank line, a spacer is nothing, an image is its `alt`. One edit, both parts, and they
cannot drift because there is one traversal.

The `button` is bulletproof — a VML `<v:roundrect>` behind a conditional comment, the anchor inside —
which is the one place mail HTML needs something the web does not.

**The string path stays beside it** (`DEC-081`; removing it is M13). `renderEmail()` branches once:
a design present → `compileDesign`; absent → today's `toParagraphs` + `toHtml`, byte for byte.

### X3.3 Storage — the columns I need from the lead

> ★★ **SUPERSEDED BY D1 (§X0.1).** A design shared across keys cannot be policed by a trigger on
> `notification_templates`, leaves a stale generated `body` on every bound row, and cannot carry copy
> that differs per key. **There is no `email_designs` table.** `notification_templates` gains
> `blocks jsonb` and `source_family public.email_design_family`, both nullable, both in the
> column-level update grant; one row per `(org_id, key, channel, locale)` as today. The section below
> is kept as the record of what was proposed and why it was wrong.

★ I write no `alter table` or `create table`. Here is every column, with the reason it exists.

**New table `public.email_designs`** — the org's designs. `org_id not null`, so **no eighth exception
to invariant 5** (see `Q3`).

| Column | Type | Why |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `org_id` | `uuid not null references orgs(id) on delete cascade` | invariant 5 |
| `name` | `text not null check (char_length(btrim(name)) between 1 and 120)` | what the library list shows — «تذكير قبل الجلسة» |
| `family` | `text not null check (family in ('announcement','reminder','rsvp','rescheduled','cancelled','rating','certificate','recognition'))` | which of `DEC-082`'s eight it is or came from; `design_templates.family`'s shape |
| `locale` | `text not null default 'ar' check (locale in ('ar','en'))` | `REQ-NTF-014` — Arabic and English |
| `blocks` | `jsonb not null check (blocks ? 'schemaVersion' and jsonb_typeof(blocks -> 'blocks') = 'array')` | the document; `design_documents`' own constraint, verbatim in shape |
| `source_family` | `text` | the platform design it was duplicated from, `null` when built from scratch. **Text, not a uuid**, because the original is a constant (`Q3`) |
| `retired_at` | `timestamptz` | `design_templates`' pattern; a design a key still points at is hidden from the picker rather than deleted |
| `created_by` | `uuid references members(id)` | |
| `created_at` · `updated_at` | `timestamptz not null default now()` + `set_updated_at()` trigger | repo-wide |

RLS on; `revoke all from anon, authenticated, service_role`; four policies, each
`org_id = public.auth_org_id() and public.is_org_admin()` (select, insert, update, delete), with the
matching grants — invariant 6. In the generated isolation sweep, which covers it the day it exists.
`03` §8.2 rows: `POL-email_designs.select.admin` (a plain member reads none), `POL-email_designs.write.admin`,
`POL-email_designs.isolation` (another org's design is invisible and unwritable).

**On `public.notification_templates`, one nullable column**:

| Column | Type | Why |
|---|---|---|
| `design_id` | `uuid references public.email_designs(id) on delete set null` | when set, this key renders from the design's blocks. `on delete set null` so deleting a design degrades the key to its string row rather than deleting the binding's history |

Everything else on that table is untouched: `org_id` stays `not null`, `body` stays `not null`,
`subject`, `required_fields`, the unique constraint and the validate trigger's existing rules all
stand. **That is what makes the whole change additive** (X6).

I considered `notification_template_blocks` (`02`, `DEC-081`, `16` §11.6 name it) — `Q1`.

## X4. The 25 keys onto the 8 designs

`DEC-082`'s eight names are fixed by `REQ-NTF-014`. Each is a **shape**, and six messages that have
no session stretch the name they land under; the table says where and why, so the stretch is a
decision and not an accident. The map lives in `packages/mail-runtime/src/designs.ts` as
`DESIGN_FAMILY: Record<string, Family>`, and a unit test diffs it against `notification_matrix()`'s
25 email rows — the same treatment `mail-render.test.ts` already gives the template table.

| Design | Shape | Keys | n |
|---|---|---|---|
| **إعلان جلسة** `announcement` | logo band · heading · session card · one primary button | `session_published`, `presenter_assigned`, `proposal_approved`, `copresenter_invited` | 4 |
| **تذكير** `reminder` | heading · session card · the day line · the tasks list · button | `reminder_7d`, `reminder_1d`, `reminder_2h`, `reminder_generic`, `materials_added` | 5 |
| **تأكيد حجز** `rsvp` | heading · session card · «أضف إلى تقويمك» · a quiet cancel link | `rsvp_promoted` | 1 |
| **تغيّر موعد** `rescheduled` | heading · **detail list of old ← new** · session card · button | `session_changed` | 1 |
| **إلغاء** `cancelled` | heading · a reason detail · **no primary button** | `session_cancelled`, `proposal_rejected`, `role_changed`, `account_deactivated` | 4 |
| **طلب تقييم** `rating` | heading · a short paragraph · **one** primary button, nothing else | `rating_prompt`, `proposal_submitted`, `proposal_changes`, `comment_reply`, `mentioned` | 5 |
| **شهادة** `certificate` | heading · a detail list carrying the serial · button | `certificate_issued`, `certificate_revoked`, `export_ready` | 3 |
| **تكريم** `recognition` | a celebratory heading · the badge or level · button | `badge_earned`, `level_reached` | 2 |

25 of 25. The three stretches, stated: `proposal_approved` and `copresenter_invited` sit under
**إعلان جلسة** because both are «good news with one thing to open» — and the design **omits the
session card when the payload carries no `session_id`**, which is a compiler rule, not a second
design. `role_changed` and `account_deactivated` sit under **إلغاء** because its shape is «a change
with a reason and no action», which is what they are. `export_ready` sits under **شهادة** because its
shape is «something of yours is ready, here is the link».

## X5. Bindings per key (`REQ-NTF-012`)

### X5.1 Where they are declared — the database, beside the matrix

```sql
create function public.notification_bindings()
  returns table (key text, binding text)
  language sql immutable parallel safe set search_path = '' as $$ values … $$;
grant execute on function public.notification_bindings() to authenticated, service_role;
```

A **function, not a table**, for `0026`'s own stated reason about `notification_matrix()`: «the
matrix is part of the specification, not org data: it has no `org_id`, nobody edits it at runtime,
and a row appearing in it is a plan change that goes through a migration.» Every word of that is
true of the bindings. It also means the editor and the trigger read **one** list, and the app reads
it through the DAL rather than carrying a second copy in TypeScript.

The rows are derived from what the call site actually sends (§X1.3), **union** the three the renderer
injects for every key — `member.name`, `member.email`, `org` — and `day` where the payload carries
`dayPosition`/`dayCount`. A unit test renders every `DEFAULT_TEMPLATES` entry and fails on any
`{{binding}}` the key does not offer, so the platform's own defaults cannot contradict the
declaration. ★ Today that test **fails on `url` and `tasks`** — see finding 1 and `Q7`; the
declaration is what makes a binding nobody supplies visible for the first time.

### X5.2 How the trigger reads them

`public.notification_templates_validate()` is **re-created whole** in my proposed file (one writer;
`create or replace` of a function whose owner I am), keeping every existing rule and adding one:

1. unknown key → `22023` — **unchanged**.
2. channel not in the matrix → `22023` — **unchanged**.
3. every entry of `new.required_fields` appears in `subject || body` → `23514` — **unchanged**,
   including its message shape `missing_required_field: <field>`, which
   `saveTemplateChecked()` parses.
4. ★ **new** — every `{{binding}}` appearing in `new.subject`, `new.body` **and, for a block
   template, in the compiled text of `new.design_id`'s blocks**, is offered by the key:
   `raise exception 'unknown_binding: %', b using errcode = '22023'`.

The regex is the renderer's own, `\{\{\s*([\w.]+)\s*\}\}`, written once in a small
`public._template_bindings(text) returns setof text` helper — revoked from every client role, so
`definer-exposure.test.ts`'s underscore rule is satisfied in the file that creates it (`DEC-152`).

For a **block** template the trigger reads the design's blocks through `email_designs.blocks` by
`new.design_id`, extracting the text of `paragraph`, `heading`, `detail_list` and `button.urlBinding`.
For a **string** template it reads `subject || body`, exactly as today. One trigger, both writers,
which is `REQ-NTF-012`'s «for every writer, not by the form».

### X5.3 What happens to today's free-typed `required_fields`

**The column and rule 3 stay exactly as they are** — `REQ-NTF-012`'s second acceptance line is «a
template missing a required field stays refused, **as today**», and `main`'s app writes the column in
the merge → Railway window. What changes is the **input**: the `<input name="requiredFields" dir="ltr">`
that an admin types a comma-separated list into becomes a **checkbox list of the key's offered
bindings**, read from `notification_bindings()`. The admin still declares; they can no longer declare
something that does not exist. That is the whole of `REQ-NTF-007`'s carried «the required fields are
what the admin declares, not what the message needs» (the note `template-editor.tsx:32-35` leaves for
this wave), closed without changing the column, the trigger rule or the stored value's shape.

## X6. Contract 3 — what a block template's row gives `main`'s OLD worker

The window: the owner pushes `0123`+ to production, Vercel and Railway are still on `f2ead54`, and
an org admin saves a block template in that window.

**What `main`'s worker does, step by step.**

1. `public.notify(...)` → unchanged. The matrix, the key, the payload and the `notify:{message_id}`
   job are identical; `notify()` is not touched by any file of this wave.
2. `send_notification.ts` (old) calls
   `public.notification_send_context($1,$2,$3)` — three arguments, positional. The new
   `notification_bindings()` and `email_designs` do not appear in its signature, and I re-create
   `notification_send_context` **only** if X5's work needs it, with any new argument **trailing and
   defaulted** and the old signature dropped in the same file (`0085`'s lesson). Its return shape
   keeps every key the old worker reads: `{key, category, optional, member{…}, org{name, from_name,
   reply_to, time_zone}, template{subject, body, locale, required_fields}, email_allowed, in_app_allowed}`.
   The old worker's `SendContext` interface types `template` as `{subject, body, locale}` and ignores
   any extra key, so adding `design` to that object is invisible to it.
3. `ctx.template` is **not null** — the org saved a row. `body` is `not null` on the table and the
   row I write carries **the generated plain-text alternative of the blocks** (`REQ-NTF-013`'s
   output, which the compiler produces anyway). `subject` is the design's subject string.
4. The old `renderEmail()` takes that `{subject, body}` down the **string path** — `interpolate`,
   `toParagraphs`, `toHtml` — and sends a correct, legible, Arabic, RTL mail with the org's brand
   colours. It is unstyled relative to the design, and it carries the footer's preference link,
   because the footer is in the generated text.
5. `record_email_delivery` / `update_email_delivery` — unchanged.

So the answer is: **a block template's row degrades to today's mail, not to a blank one**, and it
does so because `body` keeps its meaning rather than being repurposed. Writing the text alternative
into `body` is not a trick for the window; it is the right value for that column forever, and it is
what makes `REQ-NTF-013` testable from SQL.

**Two things the owner's order (L7) must carry.**

- A production read **before** the migrations: `select count(*) from public.notification_templates;`
  and, if non-zero, `select key, subject, body from public.notification_templates` — because X5's
  rule 4 refuses an **existing** row with an unknown binding on its next update. I expect zero rows
  (the one org at launch has never opened SCR-058 for a save; `wave8-console-emails.spec.ts` asserts
  its own org ends with zero). If it is non-zero, the binding list for those keys is widened before
  the trigger lands, or the rule is deferred to the second window.
- The sentence wave 9 used: **nobody edits an email template between the push and the Railway
  redeploy.** Not because anything breaks — step 4 shows it does not — but because an admin who
  designs a template in that window and receives a text mail will reasonably think the feature is
  broken.

## X7. The preview (`REQ-NTF-010`)

> ★★ **§X7.1's transport and §X7.2's `src=` are SUPERSEDED BY D2 (§X0.1)**: a POST with a body cannot
> be framed by `src=`, and unsaved blocks do not fit a query string. It is a
> `<form method="post" target="mail-preview">` posting into the **named** sandboxed iframe, and the
> handler's own CSP carries `sandbox` as well. Everything else in §X7 — the reasoning against
> `srcdoc`, the `proxy.ts` finding, the four modes, the checks panel, the blocks pane — stands.

### X7.1 Where the renderer runs — the server, through a Route Handler

`POST /api/admin/emails/preview` → `text/html` (phone, desktop, dark) or `text/plain` (the text mode).
Body: `{ key, blocks?, subject?, designId? }`, Zod-validated, admin-checked through the DAL exactly
as every other admin surface. It calls **`renderEmail()` from `@kareem/mail-runtime`** over the
**sample payload for that key**, which lives in `packages/mail-runtime/src/samples.ts` and is the
same object `tests/unit/mail-pinned.fixtures.ts` imports. One renderer, one sample set: the preview
shows the bytes the pin pins.

A Route Handler and not a Server Action, for three reasons: the iframe needs a **URL**, not a string;
`04` §4.3 puts «anything a browser must fetch» here; and — the load-bearing one —

### X7.2 The iframe, the `sandbox`, and why `src` beats `srcdoc`

```html
<iframe src="/api/admin/emails/preview?…" sandbox="" referrerpolicy="no-referrer"
        loading="eager" title="معاينة الرسالة" />
```

`sandbox=""` — **every** capability denied, including `allow-same-origin`. The mail has no script and
needs no origin; an opaque origin is the correct one. `loading="eager"` because a lazy iframe was a
wave-8 capture trap (a capture of an unloaded frame proves nothing).

★ **Not `srcdoc`.** A `srcdoc` document **inherits the parent's CSP**. `src/proxy.ts` ships
`style-src 'self' 'nonce-…'`, and the mail's every cell is an inline `style=` attribute **by
constraint** (`08` §3.1, `render.ts`'s first rule). The policy is report-only today, so a `srcdoc`
preview would render — and spew reports at `/api/csp-report` — until M13 enforces it, at which point
**the preview would silently render unstyled** and an admin would approve a message that is not the
one that ships. That is exactly the «a preview drawn any other way is a second renderer and the one
an admin approves is the one that would be wrong» failure `16` §11.4 names.

**No change to `src/proxy.ts` is needed**, and I checked rather than assumed:

- `config.matcher` is `"/((?!_next|_vercel|api/|.*\\..*).*)"` — `/api/` is **excluded**, so the
  handler's response carries neither the proxy's CSP nor its `x-frame-options: DENY`. It sets its own.
- The parent page has `default-src 'self'` and **no `frame-src`**, so `frame-src` falls back to
  `default-src` and a same-origin frame is permitted.

The handler's own headers:

```
Content-Type: text/html; charset=utf-8
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' <supabase-origin> data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'
X-Frame-Options: SAMEORIGIN
Cache-Control: no-store
```

`frame-ancestors 'self'` plus `SAMEORIGIN` is the pair that lets our page frame it and nobody else's.
A CSP question about this iframe is a request to the lead (`src/proxy.ts` is theirs) — **and my
finding is that there is no request to make**, which is the answer worth having at sync 1.

### X7.3 The four modes

| Mode | How |
|---|---|
| **محمول** | the iframe at `width: 375px`, in a container that scales it to fit 390 px minus the gutter. 375 px is `16` §11.4's number and is also the narrowest client viewport worth designing for |
| **سطح مكتب** | the iframe at `width: 640px`, in a horizontally scrollable container — never `overflow: hidden` on the page itself |
| **نص فقط** | **not an iframe**. A `<pre dir="auto">` with `white-space: pre-wrap`, `line-height: 1.7`, showing `rendered.text` — what a stripped corporate client displays |
| **داكن قسري** | the same iframe with `filter: invert(1) hue-rotate(180deg)` on the **element**, from outside |

★ **Why forced dark is a filter and not an injected `<style>`.** Injecting anything into the document
would mean previewing bytes we do not send. The six major clients that force dark on a light mail do
it by inverting the rendered result, which is what the filter does — so the simulation is honest
*because* it is crude. The checks panel says the rest out loud: the mail carries **no**
`@media (prefers-color-scheme: dark)` block, by constraint (inline CSS only), so a client that
honours the query has nothing to honour, and what the toggle shows is what an inverting client does.
Images invert with everything else, which is exactly what those clients do to an image with no
`prefers-color-scheme` hint — the reason the logo in the eight designs is authored to survive
inversion.

The mode switcher is **four buttons in `src/components/email/preview-modes.tsx`**, `role="radiogroup"`,
not `ui/tabs`: `TabItem.href` makes a trigger a navigation link, and these modes are client state,
not URLs. This avoids a request against a primitive I do not own.

### X7.4 The checks panel

Six checks, each naming and selecting its block (`16` §11.4): a missing preference footer (impossible
by construction — the check states that and stays green, which is the point of composing it), an
image with no `alt`, a binding the key does not offer, a subject over 78 characters, a button with no
URL binding, text below 14 px. They run on the **client** over the block list for immediacy, and the
binding check runs again in the **database** on save — the form never being the authority is
`REQ-NTF-012`.

### X7.5 The blocks pane, on contract 2 (`d260144`)

`ui/reorderable-list` landed while this plan was being written, so the pane is specified against its
real props rather than against a guess. The call, `getName`'s rule and the footer's fixed last row
are written out at `Q6`; three properties of that arrangement matter here:

- **The editor's state is the authority.** `onReorder(nextKeys, moved)` hands back the whole new
  order and my state applies it, so a reorder is the same kind of edit as changing a heading's text:
  one document, one dirty flag, one save. There is no per-block write and no autosave (`16` §11.4
  does not ask for one, and a mail template is not a canvas).
- **Taps alone, and no drag** — `SC 2.5.7`. Nothing in the pane adds a pointer-only path, and I add
  no timer, interval or nudge to the save button (`DEC-146`).
- **`size="sm"`** because the pane sits beside the preview at 390 px; the preview's own mode buttons
  stay at the house 44 px target.

## X8. N5 — «أرسل اختبارًا» (`REQ-NTF-011`)

### X8.1 The RPC — no recipient parameter

> ★ **The signature is R9's** (§X0.1), not the one first written here: under D1 there is no design id
> to pass, and the test sends **the saved row** or the platform default — «save, then test».

```sql
create function public.send_test_email(p_key text, p_locale text default 'ar')
  returns jsonb language plpgsql security definer set search_path = '' as $$ … $$;
revoke execute on function public.send_test_email(text, text) from public, anon;
grant  execute on function public.send_test_email(text, text) to authenticated;
```

**There is no address argument.** Inside: `m := public.assert_active_member()`; refuse unless
`public.is_org_admin()`; the address is `m.email`, read from the row. «To their own address and to no
other» is then a property of the function's *signature*, not of a check someone could forget — the
call site has no way to name anyone else.

Order inside, so `DEC-043` is satisfied without an envelope-after-write:

1. key is in the matrix with `email = true`, else `22023`.
2. `p_design`, when given, belongs to the caller's org, else `P0002`.
3. **rate limit, before any write**: at most **10** test sends per member per hour, counted from
   `audit_log` where `action = 'notify.test_email_sent'` and `actor_id = m.id` — `audit_log` is
   append-only and already indexed by `(org_id, created_at)`. Over the limit returns
   `jsonb_build_object('status','rate_limited','retryAfterMinutes', …)` rather than raising, so the
   screen says it calmly; nothing has been written, so there is nothing to roll back.
4. `public.write_audit(m.org_id, 'notify.test_email_sent', 'notification_template', null, null,
   jsonb_build_object('key', p_key, 'design_id', p_design), null, m.org_role::text, m.id)`.
5. `public.enqueue_job('send_test_email', jsonb_build_object('org_id', …, 'member_id', m.id, 'key',
   p_key, 'design_id', p_design), 'testmail:' || m.id::text)` — the key is per **member**, and
   `enqueue_job` is `job_key_mode => 'replace'`, so a double press replaces rather than duplicates.
6. returns `{status:'queued'}`.

★ `'notify.test_email_sent'` is a new audit action, and `tests/unit/admin-audit-labels.test.ts`
reads every single-quoted dotted literal in a migration as one and requires a label in
`messages/*/admin.json` — **`console`'s namespace, held by the lead**. That is a written request
(`Q5`), not an edit of mine.

### X8.2 The job

`worker/src/tasks/send_test_email.ts` (mine; the registration in `worker/src/index.ts` is the lead's,
contract 7). It reads the send context through a definer function, renders with `renderEmail()` over
**the sample payload for the key** — the same one the preview uses — writes the `email_deliveries`
row through `record_email_delivery(org, member, key, null)` as `queued`, sends through
`mailTransport()`, and moves the row to `sent` or `failed` with the reason, exactly as
`send_notification` does. So a test send appears in the delivery log beside real ones, with its
reason if it fails, which is what makes «open Outlook on Windows» a real test rather than a hope.

The subject is prefixed **«[اختبار] »** at the **transport call**, never in the renderer — the
rendered bytes must be the bytes that ship. The task logs a count and the key, never a payload.

Locally the transport is `SmtpSinkTransport` → **Mailpit on `:54325`**, so the demonstrable's «sends
a test to their own address (Mailpit)» is the sink doing its job; in CI it is `MemoryTransport`;
`RESEND_API_KEY` is read in the `resend` branch and nowhere else, unchanged.

## X9. What an org's existing string override becomes in the editor

It stays a string template and **renders byte-identically through the string path**. In the editor
its key opens on a «نص» view carrying today's form — subject, body, the declared fields (now a
checkbox list) — so `wave8-console-emails.spec.ts`'s save-and-restore case and the trigger's refusal
case keep their subject.

Beside it, one action: **«حوّله إلى تصميم»**. It creates an `email_designs` row whose blocks are one
`paragraph` per paragraph of the body — the same `toParagraphs()` split the renderer already performs,
so nothing is lost and nothing is invented — plus the composed footer, and points the key's
`design_id` at it. Two properties I will hold:

- **Converting changes nothing that is sent until the admin saves**, and the preview shows the design
  beside «ما يُرسل الآن».
- It is reversible: clearing `design_id` restores the string row, whose `subject` and `body` were
  never overwritten.

## X10. Images in mail (contract 8) and the brand kit (contract 9)

### X10.1 What I need `designer` to tell me

**A mail client fetches with no session, no cookie, and often months later.** Every one of the six
buckets is private (`0037`: «None public; every read is a server-generated signed URL»), and the
signed URLs in the DAL are 300 s or 3600 s. So a signed URL in an `image` block is a broken image by
the time anyone opens the mail, and a long-lived one outlives the thing it depicts.

The product has exactly one precedent, and it is the right one: **`/api/s/[id]/og`**, where
`POL-storage.exports.public_card` admits `anon` to exactly the `og.png` objects of card-eligible
sessions and the handler proxies those bytes as `anon`. Its own header sets out the three things it
deliberately did **not** do, and all three apply here unchanged.

So my question to `designer` is narrow: **which `design_assets` rows have, or can have, a URL of that
shape** — a stable path, `anon`-readable by policy, proxied by a handler, with no signature. My
answer if the answer is «none»: the `image` block offers **two sources only** (`org_logo`,
`session_card_image`) and nothing else, ever; a free URL field is not in the model, because an admin
pasting a URL into a mail is a tracking pixel, a mixed-content warning and a dead image waiting to
happen.

★ And the fallback that must exist either way: **every one of the eight designs renders correctly
with no image at all.** An org with no logo is the common case at launch, and a design whose first
row is a broken image is worse than the wall of text.

### X10.2 What I need from the brand kit — and it is less than contract 9 assumed

I read `0068` and `0093`. **`public.brand_kit(p_org uuid)` already returns everything the studio
needs**: `light` and `dark`, nine tokens each plus `canvasRaise`, `logoAssetId`, `headingFontId`,
`bodyFontId`, `updatedAt`, with per-token platform defaults. Contract 9's «three tokens today» is
about what the **worker reads**, not what the function offers: `send_notification.ts:81-86` takes
`light.fgBody`, `light.fgMuted`, `light.surface` and drops the rest.

So **no SQL change to `public.brand_kit()` is requested.** The two requests are:

1. **A public URL for the org logo**, of `/api/s/[id]/og`'s shape — `branding`'s and the lead's
   (the brand kit is `branding`'s, held by the lead). Concretely: a storage policy admitting `anon`
   to exactly the object `brand_kits.logo_asset_id` points at, and a handler that proxies it. If the
   lead would rather not open one, the `image` block ships with `session_card_image` alone and the
   designs carry the org **name** as a heading instead of a logo band — stated so the decision is
   visible rather than discovered in a screenshot.
2. **An agreement on `RenderInput.brand`'s shape**, which is mine to widen and costs nobody anything:
   `brand?: { fgBody; fgMuted; surface } | { light: Palette; dark: Palette; logoUrl: string | null } | null`
   — the current three-key object keeps working, so `renderEmail`'s signature is compatible and the
   pinned files do not move; `send_notification.ts` starts passing the whole `brand_kit()` object.

## X11. Routes beyond `/app/admin/emails` (`DEC-083`)

| Route | State in `04` §4 | What it is |
|---|---|---|
| `/app/admin/emails` | present (SCR-058) | the frame stays: page header, the two tabs, the delivery log. The library and the editor replace the **content** of the first tab |
| `/api/webhooks/resend` | ★ **already present** — `04` §4's tree lists `webhooks/{resend,google-calendar}/route.ts` | N8. No new entry needed |
| `/api/admin/emails/preview` | ★ **absent — this is my one request for `04`** | the preview handler (X7). `POST`, admin-only, returns `text/html` or `text/plain` |

**No new page route.** The design library, the catalogue and the block editor are all
`/app/admin/emails` with `?view=`, `?key=` and `?design=`, so the frame wave 8 built is kept and the
two tabs stay two. SCR-058's `09` entry already cites `REQ-NTF-009` … `014`, so `09` needs nothing.

## X12. N8 — the bounce webhook, without `service_role` on Vercel

`update_email_delivery_by_provider(text, delivery_status, text)` is `service_role`-only (`0030`) and
`service_role` is never on Vercel (invariant 7). `/api/webhooks/resend` has never existed.

> ★★ **SUPERSEDED IN ITS VERIFICATION STEP BY R6 (§X0.1).** A function `anon` may execute cannot rely
> on a caller it does not control: anyone holding the publishable key calls `rpc/record_delivery_event`
> directly and never meets the route's check. **The HMAC is recomputed inside the function**, with a
> 5-minute tolerance, and the secret lives in the **database**, not on Vercel. The wrapper's shape —
> thin, `returns void`, calling the untouched inner function — is unchanged, and so is the owner's
> Resend endpoint step; what changes is where the secret lives and who checks it.

**What I recommend.** The route verifies Resend's signature with `RESEND_WEBHOOK_SECRET`, then calls
a **new, thin definer wrapper granted to `anon` and nothing else**:

```sql
create function public.record_delivery_event(
  p_provider_message_id text,
  p_status              public.delivery_status,
  p_error               text default null
) returns void                                     -- ★ void, not boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.update_email_delivery_by_provider(p_provider_message_id, p_status, p_error);
end $$;
revoke execute on function public.record_delivery_event(text, public.delivery_status, text)
  from public, authenticated, service_role;
grant  execute on function public.record_delivery_event(text, public.delivery_status, text) to anon;
```

Why this and not the alternatives:

- **`update_email_delivery_by_provider()` is not re-created and not re-granted.** One writer per
  function; the wrapper calls it. Its `service_role` grant stands.
- **`returns void`, deliberately.** The inner function returns whether a row moved, which is an
  **oracle**: `anon` could probe whether a given provider id exists. Void removes it, and the route
  must answer 200 either way anyway — a provider retries a 404 forever.
- **What a forged request achieves** is exactly what `0030`'s own header already argues: mislabelling
  a delivery row it can **name by the provider's opaque message id**. It can create nothing, read
  nothing and enumerate nothing.
- **Not an `anon`-executable `enqueue_job` wrapper** — that would let strangers write queue rows,
  which is strictly worse than letting them mislabel a row they cannot name.
- **Not a worker-hosted endpoint** — Railway has no HTTP surface and adding one is a deployment
  change, not a wave-10 change.

**The `definer-exposure` consequence, stated because it is the point of `DEC-152`.**
`tests/rls/definer-exposure.test.ts` asserts the `anon`-executable definer set is **exactly** six.
It becomes seven, and `ANON_MAY_EXECUTE` gains, in the lead's file (`Q4`):

```ts
"record_delivery_event(p_provider_message_id text, p_status delivery_status, p_error text)":
  "REQ-NTF-008 — the Resend webhook's only door; the route verifies the signature first. Returns void: it can move a row it can NAME by the provider's opaque id, and cannot create, read or enumerate one",
```

**Status mapping.** `email.delivered` → `delivered`; `email.bounced` → `bounced`;
`email.complained` → `bounced`, with the error text naming the complaint, because the enum has no
`complained` value and inventing one would be an `alter type` on a live enum for a state the screen
does not distinguish; `email.delivery_delayed` → left alone (the row is already `sent`).

**The owner's step, written down for L7.**

```
1. Vercel → Project → Settings → Environment Variables:
   RESEND_WEBHOOK_SECRET = <the signing secret Resend shows when the endpoint is created>
   Scope: Production (and Preview, if previews should accept webhooks — they need not).
2. Resend → Webhooks → Add endpoint:
   URL    https://<the live domain>/api/webhooks/resend
   Events email.delivered, email.bounced, email.complained
3. Redeploy so the variable is in the running build.
```

No session does any of this; the repository's secrets and settings are the owner's (`CLAUDE.md`).

## X13. The three specs the studio changes — every case, with its ledger line

★ **The delivery-log cases do not change at all**, in any of the three files. Stated first because it
is the rule the ledger is checked against.

### `tests/e2e/wave8-console-emails.spec.ts` (5 cases)

| Case | Changes? | Proposed ledger line |
|---|---|---|
| «a moderator gets the streamed not-found page» | **no** | — |
| «SCR-058 at 390 px: the catalogue with the matrix…» | yes | *the templates tab gained the design library above the catalogue, so the first assertion now scopes the matrix chips to the catalogue section; the failure banner and the three matrix assertions are byte-identical and the capture keeps its name.* **Expectation for an untouched org changed: no** |
| «REQ-NTF-007 … the refusal lands at the body, naming the field» | yes, **one line** | *«الحقول المطلوبة» became a checkbox list of the key's offered bindings (`REQ-NTF-012`), so `.fill("title")` becomes a check of the «title» box; the refusal, the field it lands at, the kept subject and the «no row written» assertion are unchanged.* **no** |
| «a template saved, then its default restored after a confirmation» | yes, **the same one line** | *the same control change; the save, the toast, «تصل هذه الرسالة بقالب مؤسستك.», the confirm dialog's words and the zero-rows assertion are unchanged.* **no** |
| «REQ-NTF-008 … the delivery log» | **no** | — |

### `tests/components/admin/emails-page.test.tsx` (8 cases)

| Case | Changes? | Proposed ledger line |
|---|---|---|
| «the catalogue lists every email message with the matrix…» | **no** | — |
| «a failure in the last seven days is said at the top» | **no** | — |
| «★ the editor: the trigger's refusal at the body…» | yes | *the required-fields control became a checkbox list; the submitted `FormData` is built from it. The refused state, the field named and the kept values are unchanged.* **no** |
| «restoring the default confirms…» | **no** | — |
| «the delivery log: the failure's reason…» | **no** | — |
| «no failures: the empty log says so» | **no** | — |
| «has no axe violations — catalogue, editor and log» | yes | *the render helper gained the design library and the block editor so axe covers them; the assertion (`violations` empty) is unchanged.* **no** |
| — | | the new block editor, the preview modes and the checks panel get **new** files under `tests/components/email/**` |

### `tests/unit/admin-emails.test.ts` (3 cases)

| Case | Changes? | Proposed ledger line |
|---|---|---|
| `deliveryReason` — «names the provider's refusals by what an admin does next» | **no** | — |
| «saves the trimmed subject and body, and the declared fields as a list» | yes | *the action reads `requiredFields` as repeated form values rather than one comma-separated string; the value handed to `saveTemplateChecked()` is the same `string[]`.* **no** |
| «empty fields and malformed field names are refused before the database; an unknown key is a form error» | yes, **in part** | *a malformed field name can no longer be typed, so that third of the case moves to a new file as «a binding the key does not offer is refused by the database»; the empty-subject, empty-body and unknown-key assertions are unchanged.* **no** |

Plus **three import lines** after L3 (X2.4), each «an import moved with the module; no assertion
touched»: `mail-render`, `mail-day-words`, `mail-instants`.

I considered keeping the free-text input beside the checkbox list so nothing changed at all, and
reject it: two controls writing one value is a worse screen than three ledger lines are a cost.

## X14. N7 — `08` §3.2 corrected, for the lead to paste

`08` §3.2 lists **23** rows. `DEFAULT_TEMPLATES` has **25** keys and `notification_matrix()` (`0062`,
the last definition on disk) has **25** rows with `email = true`. The document is short by exactly
two — both of them added in wave 2 by this track and flagged then (`templates.ts:29-33`, this note
§5.1, `DEC-047`), and the note above the table says so but the table was never extended.
`DEC-081`'s «22 against 25» counted the older list.

**The two missing rows**, to be inserted in `08` §1's order — `MSG-proposal_submitted` at the top of
the proposals group, `MSG-presenter_assigned` after `MSG-session_published`:

| `MSG-*` | Arabic subject |
|---|---|
| `MSG-proposal_submitted` | «مقترح جديد بانتظار المراجعة — {{title}}» |
| `MSG-presenter_assigned` | «أُسندت إليك جلسة — {{title}}» |

**The note above the table**, replacing the `DEC-047` one:

> **Corrected under `DEC-160` §4.** The matrix in force (`0062`) gives **25** messages an email
> channel and `worker/src/mail/templates.ts` carries **25** templates; this list carried 23 until
> wave 10. `MSG-proposal_submitted` and `MSG-presenter_assigned` have had templates since wave 2.
> `tests/unit/mail-render.test.ts` diffs the template file against the matrix read out of the
> promoted migration, and `tests/unit/mail-pinned.test.ts` pins all 25 rendered messages, so the gap
> cannot reopen quietly in either direction.

★ Also for the lead, in the same edit: `08` §3.1's fourth constraint still reads «Numerals follow the
org setting (A30, `REQ-INT-006`)». `DEC-124` abolished the setting and `0082` dropped the column;
`render.ts:13` already reads «Western digits, always». The line should read **«Western digits,
always — `REQ-INT-006`, `DEC-124`»**. And `08` §5.1 says `RESEND_API_KEY` lives «on Fly», which is
Railway since Launch.

## X15. Findings — things I found by reading, each now someone's

1. ★ **`{{url}}` is supplied by no call site in the product.** `'url'` appears in **zero**
   migrations, in no worker task's notify payload, and in neither `notify()` nor `renderEmail()`'s
   injected keys — yet it is the last line of **20 of the 25** default templates. Every email this
   product has sent since M3 ends with a blank where the link should be. `{{tasks}}` is the same, in
   three reminders (`REQ-TSK-005`'s «outstanding preparatory tasks» — this note §W12.2 item 4 already
   carried the empty placeholder, without noticing that `url` shares its fate). The pin records it
   before anything changes; the fix is `Q7`.
2. **`MSG-rsvp_promoted` and `MSG-certificate_issued` reference bindings their payloads do not carry**
   (`venue`, `url`; `title`, `url`) — the same family, visible for the first time because X5 declares
   what a key offers.
3. **No new `brand_kit()` work is needed** (X10.2) — contract 9 is a URL question and a TypeScript
   shape, not SQL.
4. **No `src/proxy.ts` change is needed** for the preview (X7.2) — `/api/` is outside the matcher.
   This was the change I expected to have to ask for.
5. `08` §3.1's numerals line and §5.1's «Fly» are both stale (X14).

★ **Two more, found by N1 — by rendering the messages rather than by reading them.**

6. **Seven keys have a template, an email channel, and no sender at all.**
   `MSG-materials_added`, `MSG-badge_earned`, `MSG-level_reached`, `MSG-certificate_revoked`,
   `MSG-role_changed`, `MSG-account_deactivated`, `MSG-export_ready` — nothing in any migration, any
   worker task or `src/` calls `public.notify()` with them. `mail-render.test.ts` cannot see this: it
   diffs the template table against the matrix, and the two agree; what is missing is a **caller**,
   which neither describes. For those seven the pinned payload is the template's own bindings, filled
   realistically and marked in the fixture, so the file moves as a reviewed diff the day a sender is
   written. Not mine to fix — recognition is `scoring`'s, the account messages the lead's, materials
   `content`'s — and reported to the lead as a wave-11 row.
7. **The sign-off may print the org's name twice, on the live org.** `render.ts:330` builds
   `…\n—\n${input.org.name} · ${SIGNATURE}` and `SIGNATURE` is «كريم معرفة · شارك المعرفة.. واصنع
   الأثر». For «مؤسسة البريد» that reads org · platform · tagline, which is right; for an org called
   **«كريم معرفة»** it reads «كريم معرفة · كريم معرفة · شارك المعرفة.. واصنع الأثر», and every pinned
   file shows it, because the fixture uses the existing suite's org name. One production read settles
   whether it is live — `select name from public.orgs;` — and it is in L7's list either way. If it is,
   the fix is one line in the designed footer (N6) and a named difference.

## X16. Order of work, once the plan is approved

1. **N1, the pin** — the fixtures, the writer, the 116 files, the comparison test. Nothing else is
   touched. I tell the lead the moment it is committed (contract 4; L3 is blocked on it).
2. **L3, the lead's move** — then my four import edits in one commit (`send_notification.ts` and the
   three ledger lines), with the pinned test green as the proof.
3. **N2, the block compiler and the generated text**, in `packages/mail-runtime/src/`, beside the
   string path. The pinned files must not move: that is the unit's definition of done.
4. **N3, the bindings** — `notification_bindings()`, the re-created validate trigger, its RLS tests,
   and the editor's checkbox list (which is what changes the three specs above).
5. **N6, the eight designs** as constants in the package, the 25 → 8 map and its test, and the
   resolution order `Q2` settles.
6. **N4, the editor** — the library, `ui/reorderable-list` for the blocks, the properties pane, the
   preview route and its four modes, the checks panel.
7. **N5, «أرسل اختبارًا»** — the RPC, the job, the delivery row, Mailpit.
8. **N7** — written above; the lead edits `08` whenever it suits.
9. **N8, last** — the wrapper, the route, the signature verification, the owner's step. If the wave
   runs out, this is what is carried, with X12 as its design.

## X17. Questions for the lead, each with my recommendation

**Q1 — `blocks jsonb` on `email_designs`, or `notification_template_blocks` row-per-block?**
`02`, `DEC-081` and `16` §11.6 all name a table. **I recommend the jsonb column**, as a narrowing the
lead records: a reorder is a whole-document write, so a row-per-block table makes it N updates under
a unique `(template_id, position)`; no query ever wants one block; and `design_documents` already
settled this exact argument in this repository («An instance. Fully described by its JSON; nothing
about its appearance lives outside it»). Isolation is not an argument for the table — `email_designs`
is itself in the sweep, so its `blocks` column inherits the right boundary.

**Q2 — ★ the one real conflict: does a key with no org row fall back to the platform design?**
`16` §11.5 says yes, explicitly («a key with no org override falls back to the platform one rather
than to a paragraph of unstyled text. That fallback is the whole difference»). `REQ-NTF-009`,
contract 5 and the wave's second must-not-change say an org that has not touched its templates sends
**byte-identical** mail. Both cannot hold for the org that exists today.
**I recommend: adoption is explicit, and seeded at org creation.** A new org created after this wave
gets its 25 keys bound to the eight designs when it is created — `REQ-NTF-014`'s «present for every
org from creation», literally, on `0061`'s A27 pattern. Every org that exists today keeps the strings
until an admin duplicates a design, which is exactly what demonstrable 2 has the admin do before the
reminder «arrives designed». That satisfies both sentences, keeps the pinned bytes meaningful, and
costs one hook in org creation — **not my file**, so it is a request if the lead takes it.
The alternative I do **not** recommend is an `org_settings` switch: a setting nobody asked for, and
`DEC-124` is the standing lesson about settings that exist to avoid a decision.

**Q3 — where the platform library lives: constants in the package, or platform-owned rows (the
eighth exception to invariant 5)?**
**I recommend constants**, and I could not find the reason the exception would need. `REQ-NTF-014`'s
three acceptance lines are satisfied without rows: «present for every org from creation» is stronger
as code than as a seed plus a backfill; «an org duplicates one … the original is never mutated» is
true by construction when the original is a constant; «changing the org logo restyles every message»
is the renderer reading `brand_kit()`. `DEFAULT_TEMPLATES` is the precedent **in this very module** —
`REQ-NTF-002`'s «every matrix row has an Arabic template» has been satisfied by constants since M3.
The one thing rows would buy is **promotion** of an org design into the platform library, which is
`platform`'s track, `/app/platform/templates`, and not this wave; the migration that would add it
later is additive and small (`scope` + a nullable `org_id` + the `design_templates` policy set), and
I would rather write it when someone needs it than carry an invariant-5 exception for a year.

**Q4 — the seventh row in `ANON_MAY_EXECUTE`** (`tests/rls/definer-exposure.test.ts`, the lead's).
**I recommend the `returns void` wrapper** of X12, with the line as written there. If the lead would
rather not widen that set at all, the fallback is that `REQ-NTF-008`'s webhook stays unbuilt and
carried again — which I think is the worse trade, because the delivery log then never learns about a
bounce and `/app/admin/emails`' whole log tab is fed by failures the worker saw, not by the ones the
provider saw.

**Q5 — the audit label for `notify.test_email_sent`**, a row in `messages/*/admin.json`
(`console`'s, held by the lead) so `tests/unit/admin-audit-labels.test.ts` stays green.
Proposed: `ar` «أُرسلت رسالة اختبار» · `en` "Test email sent".

**Q6 — ★ CLOSED. `ui/reorderable-list` landed at `d260144`**, and it fits the blocks pane with no
request. Read rather than guessed — `ReorderableListProps<Item>` in `src/components/ui/index.ts:442`
and the file's header. How the editor uses it, in its real names (§X7.5):

```tsx
<ReorderableList
  items={blocks}                                   // EmailBlock[], the editor's own state
  getKey={(b) => b.id}                             // stable across reorders — the row keeps focus
  getName={blockName}                              // «فقرة: مرحبًا {{member.name}}…» — never empty
  renderItem={(b) => <BlockRow block={b} selected={b.id === selectedId} />}
  renderActions={(b) => <><DuplicateBlock id={b.id} /><RemoveBlock id={b.id} /></>}
  onReorder={(nextKeys) => setBlocks(byKey(nextKeys))}   // the whole new order; my state decides
  label={t("blocks.listLabel")}                    // «كتل الرسالة»
  disabled={saving}                                // every ▲▼ inert while a save is in flight
  size="sm"                                        // 36 px — the dense pane beside the preview
/>
```

`getName` is the one that needs care: it is what ▲▼ are described by and what is announced after a
move, so «فقرة» twelve times over is the failure. It returns **the block's type and its first words**
— «عنوان: تذكير بجلستك», «زر: أضف إلى تقويمك», «صورة: شعار المؤسسة», «بطاقة جلسة», «فاصل» — with the
type alone for the four blocks that carry no text. A unit test asserts no two rows of a design share
a name.

The props are functions, so the pane is a client component; the block list is editor state and the
document is saved by an action, which is the `DEC-159` shape the header warns about.

★ **The `footer` — I agree with the lead: a fixed last row, outside the reorderable set.** It is
rendered after `</ReorderableList>` as a row of the same shape, marked «يُضاف دائمًا», with no ▲▼ and
no remove. It is **not** in `items`, so `total` never counts it, the last real block's ▼ is correctly
`aria-disabled`, and nothing can move a block below it. Showing it is not decoration: a pane that
omits it tells the admin the mail ends at their last block when it does not, and the checks panel's
«a missing preference footer» check would have nothing to point at. Selecting it opens the properties
pane read-only, so an admin can see what the org signature and the preference link will say and
cannot delete either (`REQ-NTF-005`, `REQ-NTF-009`'s «composed, not typed»).

No prop is missing, so there is no request against the file.

**Q7 — do I fix `{{url}}` this wave, and is it a named difference?**
**I recommend yes, as the wave's named difference 1**, on the same terms `DEC-151` set for named
difference 4: the pin records the broken bytes **first**, the fix lands as a reviewed diff over them.
The design costs no schema: SQL does not know the app's base URL, so instead of an `org_settings`
column, **`RenderInput` gains an optional trailing `appUrl`** (the worker reads one env value; the
preview passes its own origin), and the renderer derives `url` per key from the payload's
`session_id` / `proposal_id` / `certificate_id`. One place, no migration, and it fixes all 20
templates at once. `{{tasks}}` I recommend **leaving empty and carried** — it needs a reader of
`session_tasks` on a mail path, and while that is not a check-in path (`REQ-TSK-002` is safe), it is
`content`'s data and a wave-11 conversation.

**Q8 — the eight design names.** `DEC-082` fixes them in Arabic and X4 maps all 25 keys onto them,
with three stretches named. Confirm the names stay as the owner wrote them; I am not proposing to
rename any.
