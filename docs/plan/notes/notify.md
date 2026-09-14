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
