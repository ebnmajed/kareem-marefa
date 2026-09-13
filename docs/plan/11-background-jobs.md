# 11 — Background Jobs

**Status:** `draft` · **Owns:** the `JOB-*` ID space
**Serves:** D63, `REQ-NFR-016`, and the requirements cited per job
**Cites:** `02-domain-model.md` (frozen), `04-architecture.md`, `05`, `06`, `07`, `08`

---

## 1. The queue

**graphile-worker on Fly.io** (DEC-018, A34, A35), Postgres-backed so no extra infrastructure —
which is D63's own constraint.

### 1.1 Two properties everything below depends on

**Jobs are enqueued from SQL inside the originating transaction:**

```sql
perform graphile_worker.add_job('award_points',
          json_build_object('source', 'check_in', 'source_id', ci.id),
          job_key => 'pts:check_in:' || ci.id);
```

There is no state in which the row is committed and the job is not, or the reverse. **The
dual-write window does not exist** — which is why the check-in RPC can enqueue scoring without
either blocking the member or risking a lost award.

**`job_key` is the idempotency mechanism**, and it does more than deduplicate: a pending job with
the same key is **replaced**. So re-saving a poster leaves **one** pending render, and rescheduling
a session **moves** its reminders rather than adding a second set. That behaviour is the reason
graphile-worker was chosen over pg-boss.

### 1.2 The connection trap

graphile-worker needs `LISTEN`/`NOTIFY`, which requires a **session-mode** connection — Supabase
port **5432**, *not* the transaction pooler on **6543**.

**The failure is silent.** On a pooled connection `LISTEN` does not error; it simply never
delivers. The worker degrades to polling, jobs still run, nothing logs an error, and reminders
arrive late for months.

**A boot-time probe is mandatory:** `LISTEN` a test channel, `NOTIFY` it, and **refuse to start**
if it does not arrive within a second.

### 1.3 Retry policy

| Class | Attempts | Backoff | On exhaustion |
|---|---|---|---|
| Fast, idempotent (points, notifications) | 5 | exponential from 5 s | dead-letter + alert |
| External API (calendar, email) | 8 | exponential from 30 s, capped 1 h | dead-letter + alert |
| Heavy render (documents, exports) | 3 | exponential from 60 s | mark `failed`, surface in the UI with a retry |
| Scheduled (reminders, transitions) | 3 | 60 s | alert — a missed reminder cannot be retried usefully after its moment |

**Every job is idempotent.** Retries are safe by construction: keys collide, constraints reject
duplicates, and `on conflict do nothing` absorbs the rest.

### 1.4 Queues and concurrency

| Queue | Concurrency | Why |
|---|---|---|
| `default` | 10 | points, notifications, state transitions — small and fast |
| `render` | 2 | headless Chromium is memory-hungry; more concurrency means OOM, not throughput |
| `convert` | 2 | LibreOffice, on the separate credential-free app |
| `external` | 5 | calendar and email — network-bound, rate-limited upstream |

Separating `render` matters: one 30-second A3 export must not starve the queue that delivers a
check-in's points while the member is looking at the screen.

---

## 2. Job catalogue

Each job: trigger · inputs · outputs · idempotency key · failure handling · observability.

### 2.1 Session lifecycle

#### `JOB-start_session`
**Serves:** `REQ-SES-004`, A6 · **Trigger:** cron, every minute
**In:** — · **Out:** sessions at `starts_at` move `published → in_progress`; the first
**رمز الحضور** is issued
**Key:** `start:{session_id}` · **Retry:** 3 × 60 s
**Notes:** skips any session an admin transitioned manually (`REQ-SES-005`). Idempotent — running
twice moves a session once.
**Watch:** sessions stuck in `published` past `starts_at`.

#### `JOB-complete_session`
**Serves:** `REQ-SES-004` · **Trigger:** cron, every minute
**Out:** `in_progress → completed`; check-in codes expire; then it **fans out**:
`JOB-award_presenter_points`, `JOB-evaluate_no_shows`, `JOB-issue_certificates`,
`JOB-rating_prompt`
**Key:** `complete:{session_id}`
**Notes:** the single fan-out point for everything that happens when a session ends. Concentrating
it here means "what happens at completion" has one answer rather than five scattered triggers.

#### `JOB-rotate_check_in_code`
**Serves:** `REQ-CHK-002`, A7, DEC-015 · **Trigger:** scheduled per session per window
**Out:** a new `ENT-check_in_codes` row; the previous stays valid for the grace period
**Key:** `code:{session_id}:{window_index}`
**Notes:** codes are **stored per window**, not derived, so an operator can burn one instantly
(`REQ-CHK-007`). Changing the org's rotation period does not invalidate issued codes.

#### `JOB-archive_sessions`
**Serves:** `REQ-SES-012` · **Trigger:** cron, daily · **Key:** `archive:{date}`

### 2.2 RSVP and calendar

#### `JOB-promote_waitlist`
**Serves:** `REQ-RSV-003`, `REQ-RSV-004` · **Trigger:** a seat frees
**Out:** the first waitlisted member promoted; `MSG-rsvp_promoted`; `JOB-calendar_upsert`
**Key:** `promote:{session_id}`
**Notes:** ★ promotion runs **in the same transaction as the cancellation that freed the seat**, so
there is no window in which a seat is free but unassigned. Promotion continues **after** the RSVP
deadline, until the session starts (OQ-002) — the deadline freezes planning numbers, and a
promotion does not change the total.

#### `JOB-calendar_upsert` · `JOB-calendar_delete`
**Serves:** `REQ-CAL-004` … `REQ-CAL-006` · **Trigger:** RSVP confirmed/promoted; session changed;
cancellation
**Key:** `cal:{rsvp_id}` / `caldel:{rsvp_id}` · **Retry:** 8 × exponential
**Notes:** idempotency is the `unique (member_id, session_id)` constraint, not job logic. A **404
from Google on delete is success** — the member may have deleted the event by hand
(`REQ-CAL-006`). **Failure never blocks the app** (`REQ-CAL-008`).

#### `JOB-refresh_calendar_tokens`
**Serves:** `REQ-CAL-003` · **Trigger:** cron, hourly · **Key:** `caltok:{connection_id}`
**Notes:** the **only** consumer of the token columns. Nothing else in the system reads them
(`03` §5.9c).

#### `JOB-evaluate_no_shows`
**Serves:** OQ-004, `REQ-PTS-008` · **Trigger:** fan-out from `JOB-complete_session`
**Out:** a `no_show` event per confirmed RSVP with no check-in
**Key:** `noshow:{session_id}`
**Notes:** evaluated **once**, at completion. The event is recorded whether or not the org
penalises it — which is what lets an admin see what *would* have been penalised before turning a
penalty on.

### 2.3 Scoring

#### `JOB-award_points`
**Serves:** `REQ-PTS-012`, `05` §2.2 · **Trigger:** check-in, rating, comment, photo
**Key:** `pts:{source}:{source_id}` · **Retry:** 5 × exponential
**Notes:** calls `award_points()`, which applies caps and cooldowns and writes with
`on conflict do nothing`. **A replay writes zero rows.** The member's action never waits on this —
the check-in returns as soon as its row commits.

#### `JOB-award_presenter_points`
**Serves:** A10, A5 · **Trigger:** fan-out from completion
**Out:** `session_delivered` + `attendee_bonus` (capped) + `rating_bonus` (when the average
qualifies) **per presenter**
**Key:** `pts:presenter:{session_id}:{member_id}`
**Notes:** `rating_bonus` re-evaluates on a **delay**, because ratings arrive after completion —
scheduled +48 h, not at the fan-out moment.

#### `JOB-evaluate_streaks` · `JOB-evaluate_badges` · `JOB-evaluate_levels_perks`
**Serves:** `REQ-REC-002`, `REQ-REC-003`, `REQ-REC-005`, `REQ-REC-006`
**Trigger:** nightly, and on balance change for levels
**Keys:** `streak:{member}:{period}` · `badge:{member}:{badge}` · `perks:{member}`
**Notes:** streak periods use the **org's time zone** (A20) — evaluating in UTC shifts the month
boundary by three hours in `Asia/Riyadh` and occasionally awards the wrong month. Levels are
**never lowered** by an evaluation (`REQ-REC-003`); perks are re-materialised into
`ENT-member_perks` so the RSVP hot path stays a single indexed lookup.

#### `JOB-snapshot_leaderboards`
**Serves:** `REQ-LDR-006`, A11, DEC-016 · **Trigger:** cron at period end, plus a nightly
provisional
**Out:** `ENT-leaderboard_snapshots` + entries, **including the frozen `active_member_count`**
**Key:** `snap:{kind}:{period_start}`
**Notes:** ★ **required, not an optimisation.** Points-per-active-member has a time-dependent
denominator: computed live, deactivating one member retroactively rewrites last quarter's standings
and invalidates a certificate already issued to the winner. Provisional snapshots are replaced
until the period closes; the final one is `is_final` and immutable.

#### `JOB-audit_balances`
**Serves:** `REQ-PTS-011` · **Trigger:** nightly · **Key:** `audit_bal:{date}`
**Notes:** recomputes every balance with `sum()` and compares via `last_entry_id`. **Alerts; does
not self-heal** — a rollup that silently corrects itself hides the bug that caused the divergence.

### 2.4 Content

#### `JOB-convert_document`
**Serves:** `REQ-MAT-003`, `REQ-MAT-011`, DEC-006 · **Trigger:** material version ready, kind ∈
{pdf, powerpoint}
**Out:** a PDF (for PowerPoint) and a font-substitution report
**Key:** `conv:{version_id}` · **Retry:** 3 × 60 s · **Queue:** `convert`
**Notes:** runs on the **credential-free converter app** (`04` §7.1) — the code parsing hostile
PPTX holds a signed input URL, a signed output URL, and nothing else. **Never enqueued for
Keynote** (DEC-006).

#### `JOB-render_pages`
**Serves:** `REQ-MAT-003` · **Trigger:** conversion produced a PDF
**Out:** WebP page images (1600 px) + thumbnails (320 px) + `ENT-material_pages`
**Key:** `pages:{version_id}` · **Queue:** `convert`

#### `JOB-process_photo`
**Serves:** `REQ-EVT-011`, DEC-005 · **Trigger:** photo uploaded
**Out:** **EXIF/GPS stripped**, re-encoded WebP, variants
**Key:** `photo:{photo_id}`
**Notes:** ★ stripping happens **before** the row is written — `ENT-photos` carries
`check (exif_stripped)`, so a row cannot exist for an unstripped image. This job re-encodes and
generates variants; it is **not** where stripping first happens, because a job is asynchronous and
the photo must never be retrievable with EXIF intact for even a moment.

#### `JOB-transcode_audio` · `JOB-cleanup_rejected`
**Keys:** `audio:{version_id}` · `cleanup:{date}`

### 2.5 Designer and certificates

#### `JOB-render_variant`
**Serves:** `REQ-DSG-011` … `REQ-DSG-014` · **Trigger:** document saved, template published,
session data changed on a **live** poster
**In:** `document_id`, preset, format · **Out:** `ENT-export_artifacts` + the stored file
**Key:** `doc:{document_id}:{preset}:{format}` · **Retry:** 3 · **Queue:** `render`
**Notes:** fonts load by **SHA-256** from the manifest. **Tier A parity runs on every render**
(`06` §9.1) and a mismatch **fails the export** rather than shipping it. `source_fingerprint` makes
the cache self-invalidating (`REQ-DSG-013`).

#### `JOB-regenerate_poster`
**Serves:** DEC-012, `REQ-DSG-003` · **Trigger:** session title/date/venue/presenter changed
**Out:** if `binding = 'live'` → regenerate every variant. If `detached` → set `stale_since` and
raise **«تغيّرت تفاصيل الجلسة — راجع الملصق»**
**Key:** `poster:{session_id}`
**Notes:** ★ the branch **is** the decision. A live poster is a pure function of template plus
data, so regenerating costs nothing. A detached one carries someone's judgement, and overwriting it
is the worse failure.

#### `JOB-issue_certificates`
**Serves:** `REQ-CRT-003`, `REQ-CRT-008` · **Trigger:** fan-out from completion, when
`certificate_mode <> 'off'`
**Out:** one certificate per checked-in attendee and per presenter; **serial allocated inside the
transaction**; PDF + PNG rendered; state `issued` or `held` per mode
**Key:** `cert:{session_id}:{member_id}:{kind}`
**Notes:** ★ the serial comes from `allocate_serial()`, a locked counter row — **a rollback returns
the number** (DEC-010). A Postgres `SEQUENCE` would leave a hole, and a gap in a certificate
register reads as a lost or hidden certificate. Attendee certificates require a `check_in_id`,
enforced by a table constraint, so `REQ-CHK-009` cannot be bypassed by a bug in this job.

#### `JOB-materialise_font`
**Serves:** `REQ-DSG-017`, A39 · **Trigger:** an admin selects a Google font
**Out:** binary downloaded once → stored → SHA-256 → `ENT-fonts` → **goldens run** → selectable
only on pass
**Key:** `font:{family}:{style}:{weight}`
**Notes:** ★ the goldens are not a formality. A font with partial `GSUB`/`mark` coverage renders
Latin perfectly and silently breaks lam-alef and stacked tashkeel; only the Arabic cases catch it.
A failed font reports **which** goldens failed, so the admin gets an answer rather than a refusal.

### 2.6 Notifications

#### `JOB-send_notification`
**Key:** `notify:{message_id}` · **Retry:** 8 × exponential (email), 5 (in-app)
**Notes:** checks preferences at **send** time, not at enqueue time — a member may have changed
them in between. The eleven non-optional messages bypass the check (`08` §1.7). **All mail is sent
from the worker**, which is why `RESEND_API_KEY` is not on Vercel.

#### `JOB-schedule_reminders` · `JOB-send_reminder`
**Serves:** `REQ-NTF-004`, A19
**Keys:** `sched:{session_id}` · `remind:{session}:{offset}:{member}`
**Notes:** ★ the key is the whole mechanism. Rescheduling a session **moves** the reminders,
because `job_key` replaces a pending job rather than adding one. Changing the org's reminder
schedule removes the old-offset keys and adds new ones. No cancel-and-recreate window in which both
or neither exists.

#### `JOB-rating_prompt`
**Key:** `rate:{session_id}` · **Notes:** +1 h after completion, filtered at **send** time to
members who have not yet rated — most ratings arrive in that first hour.

#### `JOB-rsvp_nudge`
**Key:** `nudge:{session_id}` · **Notes:** in-app only, **once**, at −7 d. §6 asks for reminders to
non-responders; once and in-app is the restraint that keeps that from being the reason people mute
the platform.

### 2.7 Maintenance

| Job | Trigger | Key | Serves |
|---|---|---|---|
| `JOB-enforce_retention` | nightly | `retain:{date}` | `REQ-NFR-012`, OQ-019 |
| `JOB-anonymise_members` | nightly | `anon:{date}` | `REQ-PRF-007`, OQ-023 |
| `JOB-assert_storage_prefixes` | nightly | `storageck:{date}` | `REQ-TEN-003`, `03` §6 |
| `JOB-expire_impersonation` | every minute | `impexp:{session_id}` | `REQ-ADM-002` |
| `JOB-build_data_export` | on request | `export:{member_id}:{requested_at}` | `REQ-PRF-006` |
| `JOB-rebuild_search` | on category/company rename | `search:{org_id}` | `REQ-DSC-003` |

**`JOB-assert_storage_prefixes` deserves its place here.** Storage paths are the only point in the
design where isolation depends on application correctness rather than on a constraint (`03` §6).
This job is the third containment, and the only one that would catch a path builder that was wrong
for a week.

---

## 3. Observability

`REQ-NFR-016`.

### 3.1 Per job
Queue depth · in-flight count · duration p50/p95/p99 · failure rate · dead-letter count · **oldest
pending job age** (the number that actually catches a stalled queue).

### 3.2 Alerts

| Alert | Threshold | Why it matters |
|---|---|---|
| **Queue stalled** | oldest pending > 5 min on `default` | The `LISTEN`/`NOTIFY` degradation in §1.2 looks exactly like this. |
| **Ledger divergence** | any, from `JOB-audit_balances` | The rollup disagrees with the ledger. |
| **Parity failure** | any Tier A failure in production | An export differed from what was approved. |
| **Calendar backlog** | > 50 pending or > 15 min old | Google API trouble, or expired tokens. |
| **Email bounce spike** | > 5 % in an hour | In an org where every address is corporate, this is a mail-server change, not bad addresses. |
| **Render failures** | > 3 consecutive | Usually a font or a memory ceiling. |
| **Storage prefix violation** | any | The path builder is wrong. Page immediately. |
| **Impersonation active** | > 2 h | Someone left a break-glass session open. |

### 3.3 Errors and dead letters
Sentry, tagged with job name, key, attempt number and org. A dead-lettered job keeps its payload so
it can be replayed after a fix — and replaying is safe, because every job is idempotent (§1.3).

### 3.4 What the worker does not do
**No network access except** Supabase, Google Calendar, Resend and Sentry. Fonts come from the
manifest, never from a CDN at render time (`06` §7.2) — a font fetched at render time is a font
that can differ between renders, which is D66's failure mode with no error attached.

---

## 4. Job → requirement map

| Job | Requirements |
|---|---|
| `JOB-start_session`, `JOB-complete_session`, `JOB-archive_sessions` | `REQ-SES-004`, `REQ-SES-012` |
| `JOB-rotate_check_in_code` | `REQ-CHK-002`, `REQ-CHK-007` |
| `JOB-promote_waitlist` | `REQ-RSV-003`, `REQ-RSV-004` |
| `JOB-calendar_upsert`, `JOB-calendar_delete`, `JOB-refresh_calendar_tokens` | `REQ-CAL-004` … `REQ-CAL-008` |
| `JOB-evaluate_no_shows` | `REQ-PTS-008`, OQ-004 |
| `JOB-award_points`, `JOB-award_presenter_points` | `REQ-PTS-012`, `REQ-PTS-006` |
| `JOB-evaluate_streaks`, `JOB-evaluate_badges`, `JOB-evaluate_levels_perks` | `REQ-REC-002` … `REQ-REC-006` |
| `JOB-snapshot_leaderboards` | `REQ-LDR-002`, `REQ-LDR-006` |
| `JOB-audit_balances` | `REQ-PTS-011` |
| `JOB-convert_document`, `JOB-render_pages` | `REQ-MAT-003`, `REQ-MAT-011` |
| `JOB-process_photo` | `REQ-EVT-011` |
| `JOB-render_variant`, `JOB-regenerate_poster` | `REQ-DSG-003`, `REQ-DSG-011` … `REQ-DSG-014` |
| `JOB-issue_certificates` | `REQ-CRT-003`, `REQ-CRT-008` |
| `JOB-materialise_font` | `REQ-DSG-017` |
| `JOB-send_notification`, `JOB-schedule_reminders`, `JOB-send_reminder`, `JOB-rating_prompt`, `JOB-rsvp_nudge` | `REQ-NTF-002` … `REQ-NTF-008`, `REQ-RAT-007` |
| `JOB-enforce_retention`, `JOB-anonymise_members` | `REQ-NFR-012`, `REQ-PRF-007` |
| `JOB-assert_storage_prefixes` | `REQ-TEN-003` |
| `JOB-expire_impersonation` | `REQ-ADM-002` |
| `JOB-build_data_export` | `REQ-PRF-006` |

## 5. Proposed entities

**None.** graphile-worker owns its own schema (`02` §4.17); every job reads and writes entities
already frozen.
