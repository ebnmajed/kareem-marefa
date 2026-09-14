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

## 1. Order of work

| # | Story | What lands |
|---|---|---|
| 1 | contract | `0001_notification_contract.sql` — the six M3 tables, RLS, grants, the matrix, `notify()` |
| 2 | STORY-NTF-001 | preferences (`REQ-NTF-003`): the DAL, SCR-026's settings half, the non-optional rows rendered as fixed |
| 3 | STORY-NTF-002 | `send_notification` + the mail transport (DEC-046) + templates + `email_deliveries` (`REQ-NTF-008`) |
| 4 | STORY-NTF-003 | reminders that MOVE — `schedule_reminders`, `send_reminder`, `rsvp_nudge`, `rating_prompt` (`REQ-NTF-004`, `REQ-RAT-007`) |
| 5 | STORY-NTF-004 | the inbox SCR-026 + `NotificationBell` (`REQ-NTF-006`) |
| 6 | STORY-CAL-001 | ICS at `/api/sessions/[id]/ics`, 75-**octet** folding, `VTIMEZONE` (`REQ-CAL-001`) |
| 7 | STORY-CAL-002 | add-to-calendar links, Arabic-safe encoding (`REQ-CAL-002`) |
| 8 | STORY-CAL-003 | Google connect/disconnect, `calendar_upsert`/`_delete`/`refresh_calendar_tokens` |
| 9 | STORY-CAL-004 | SCR-025, the member's calendar view |
| 10 | the M2 deferrals (DEC-045) | proposed SQL at the `TODO(notify, M3)` call sites, plus triggers for `REQ-SES-009`, `REQ-EVT-007`, `REQ-PRO-005`, `REQ-PRO-007` |

The M2 deferrals are last because every one of them is a two-line `perform public.notify(...)`
once the contract is promoted, and each needs `notify()` to already be in `supabase/migrations/`
rather than in a rolled-back test transaction.

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

_(appended as they happen)_
