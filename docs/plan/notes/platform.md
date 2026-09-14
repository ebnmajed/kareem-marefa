# platform — M8 (ADM · PRF · NFR · DSG-008), wave 4

The `platform` teammate's working note. Plans before code, findings as they are
found. `docs/plan/` is otherwise the lead's; this file is mine.

---

## 0. The plan (bundle 1, written before any code)

### 0.1 The one property everything else serves

M8's demonstrable is a **negative**: a super admin creates an org, sets its first
admin, and **cannot read a single row of its data**. Every design choice below is
downstream of that, and the order of the stories is the order in which the
negative becomes provable.

The positive surface — six screens, six jobs, two legal pages — is comparatively
ordinary. The thing that is easy to get wrong is the seam where the platform
*does* reach an org: `create_org()`, `set_first_admin()`, `add_org_domain()`,
`delete_org()` and impersonation. Each is a `security definer` write that never
returns org data to the caller, and each lands an audit row in the same
transaction.

### 0.2 Story order, and why

| # | Story | Bundle | Why here |
|---|---|---|---|
| 1 | **STORY-ADM-002** (`REQ-ADM-002`, `REQ-ADM-019`) — no data plane, break-glass | 1 | The schema, the RLS cases and the ★ sweep. Everything else sits on top of `assert_platform_admin()` and `impersonation_sessions`, and the sweep must exist before a single platform screen does. |
| 2 | **STORY-ADM-001** (`REQ-ADM-001`, `REQ-ADM-003`) — the console | 2 | SCR-080 … 082, 084, 085 and the banner. Needs story 1's RPCs and views; gives the e2e its walk. |
| 3 | **`REQ-DSG-008`** — the platform library (SCR-083) | 3 | Managed, not authored. Needs `promote_template_to_platform()` and the seeded-baseline proof (DEC-052). Sits after the console because it reuses its shell and its nav. |
| 4 | **STORY-NFR-006** (`REQ-NFR-012` … `015`) — retention, export, deletion, PDPL | 4 | The six jobs, `/app/me/privacy`, `/api/me/export`, SCR-005. Largest, and the only story that touches the worker in anger. `delete_org` closes it because the post-deletion assertion is the last thing that can run. |
| 5 | **STORY-PRF-004** (`REQ-PRF-006`, `REQ-PRF-007`) — self export and deactivation | 4 | Shares bundle 4 with NFR-006: `build_data_export` and `anonymise_members` are its two jobs, and `/app/me/privacy` is one screen serving both stories. Split only in the backlog, not in the code. |

**Not mine:** STORY-NFR-004 and STORY-NFR-005 (the lead's closing pass), Sentry
and the job dashboards (`REQ-NFR-016`), the real-device pass.

### 0.3 What already exists, and what I am not rebuilding

`0005` already ships `assert_platform_admin()`, `create_org()`, `suspend_org()`
and `reinstate_org()`, each writing its audit row into **the org's own**
`audit_log` with `actor_role = 'platform_admin'`. `0004` ships `orgs`,
`org_domains`, `platform_admins` (no policy, no grant — DEC-035) and `audit_log`
(append-only, revoked including `service_role`). `0006` ships the hook.

So the M8 schema is **additive**. It adds what `0004`/`0005` deliberately left
for M8, and it `create or replace`s exactly two earlier functions — the auth hook
and the `org_domains` audit trigger — both for the same reason: a platform admin
has no member row, and neither function knows that yet.

### 0.4 The M8 schema — `supabase/proposed/platform/0001_m8_schema.sql`

Twelve blocks, in dependency order:

1. **`impersonation_sessions`** — `02` §4.1 verbatim: `org_id`,
   `platform_admin_id`, `reason`, `started_at`, `expires_at`, `ended_at`, with
   `check (expires_at > started_at and expires_at <= started_at + interval '4 hours')`.
   One policy, `impersonation_read_staff` (`03` §5 row: `P1 + is_staff()`), one
   `grant select` to `authenticated`. **No insert, update or delete policy and no
   such grant, for any role including `service_role`** — append-only like
   `audit_log`. The RPCs are the only writers.
2. **`retention_periods`** — `12` §5.3 as rows, not constants. Platform-level:
   **no `org_id`, no policy, no grant** (the `platform_admins` shape). Read by
   `enforce_retention` through a definer function.
3. **`platform_audit_log`** — the platform-side evidence that has to **survive
   the org it is about**. `audit_log.org_id` cascades from `orgs`, so an
   `org.deleted` row written there dies with the org it records. This table holds
   `org_id uuid` as a plain column with **no foreign key**. No `org_id` key in the
   tenancy sense, no policy, no grant; written by definer functions only.
4. **`data_export_requests`** — `REQ-PRF-006` needs somewhere to hold a request,
   its status, its storage path and its expiry, and `JOB-build_data_export`'s key
   (`export:{member_id}:{requested_at}`) needs a `requested_at` to name. Org-scoped,
   P3 self-read, insert through the RPC alone.
5. **`assert_platform_admin()`** — already in `0005`; **not redefined**. Cited
   here so the file reads as the whole story.
6. **`start_impersonation(p_org, p_reason, p_minutes)`** — `assert_platform_admin()`,
   insert, `write_audit(p_org, 'impersonation.started', …, 'platform_admin')` in
   the same transaction, `enqueue_job('expire_impersonation', …, 'impexp:'||id, run_at => expires_at)`.
   Returns the session row. Refuses a second concurrent session for the same admin.
7. **`end_impersonation(p_session)`** — the only writer of `ended_at`; audits
   `impersonation.ended`. Callable by the platform admin who started it **and** by
   `service_role` (the expiry job).
8. **`custom_access_token_hook(jsonb)` — `create or replace`** so an active
   impersonation session mints the member claims. See §0.5.
9. **`set_first_admin(p_org, p_email)`** and **`add_org_domain()` /
   `remove_org_domain()`** — platform-admin write paths for two admin-only tables
   a super admin cannot reach through a policy, each audited into the org's log.
10. **`org_domains_audit()` — `create or replace`** so a platform admin's domain
    change is attributed `platform_admin` rather than `system`.
11. **`promote_template_to_platform(p_version, p_name)`** — `REQ-DSG-008`. Copies
    a **published** org version into a new `scope = 'platform'` template.
    `retire_platform_template()` refuses to drop the last non-retired default for
    a purpose (DEC-052).
12. **The aggregate metrics views + `delete_org()`** — see §0.6 and §0.7.

### 0.5 Impersonation, mechanically

`02` §4.1 gives the session an `org_id` and **no target member**. That is the
right shape and it decides the claims:

| Claim | Value during impersonation | Consequence |
|---|---|---|
| `org_id` | the session's org | every `P1` read policy opens |
| `member_id` | **absent** | `assert_active_member()` raises `not_a_member` |
| `org_role` | `member` | `is_org_admin()` and `is_staff()` are false |
| `status` | `active` | |
| `impersonation` | the session id | the banner and the audit trail |

So a break-glass session **reads what an ordinary member reads and writes
nothing privileged** — every privileged RPC re-reads the member row (`03` §1.3)
and there is none. That is a stronger property than the plan asks for and it
falls out of `02`'s column list rather than being bolted on.

Claims are minted at token issuance, so `start_impersonation()` takes effect on
the **next token**: the server action starts the session and the client calls
`supabase.auth.refreshSession()`, which re-runs the hook. That is an auth
operation, so it is the browser client's business (DEC-020).

The hook keeps all three of `0006`'s rules — never raises, returns the event
unchanged for a user with neither a member row nor a platform-admin row, and the
three `supabase_auth_admin` grants. The replacement adds one `select` against
`impersonation_sessions`, so the grant list grows by that table.

### 0.6 Metrics (SCR-084) — aggregate only, and provably so

`REQ-ADM-003` is a **negative about columns**: no member, no session title, no
content. The shape that makes it checkable is a view whose select list a reader
can scan in ten seconds:

- `platform_org_metrics` — one row per org: `org_id`, `name`, `slug`, `status`,
  `created_at`, and six counts (members, active members, sessions, published,
  completed, certificates issued). An org's own name is platform metadata, not
  org content — `orgs` is the platform's table.
- `platform_totals` — one row: orgs, active orgs, suspended orgs, members,
  sessions, certificates.
- `platform_job_health()` — a **function**, not a view, because
  `graphile_worker` may be absent (`0025` raises `3F000` for exactly this), and a
  view over a missing schema cannot be created. Returns zero rows when the schema
  is not installed.

All three are `revoke all … from anon, authenticated, service_role` and reached
only through `platform_metrics()` / `platform_org_metrics()`, which call
`assert_platform_admin()` first. No client role can select them directly, so the
views are documentation as much as they are machinery.

A test asserts the **column lists** of both views against a frozen allow-list, so
a later session that adds `session.title` to the metrics breaks a test rather
than a requirement.

### 0.7 Org deletion — the one irreversible act

`delete_org(p_org, p_slug_typed)` is the request path:

1. `assert_platform_admin()`.
2. The typed slug must equal the org's slug, or `slug_mismatch` (`22023`).
3. The org is **suspended first** (`status = 'suspended'`, reason
   `pending_deletion`) so nobody signs in while the job runs — using the columns
   `0004` already has, not a new state.
4. `platform_audit_log` gets `org.deletion_requested` with the slug, the name and
   the actor. This is the row that survives.
5. `enqueue_job('delete_org', …, 'orgdel:' || p_org)`.

The job deletes rows in dependency order — in practice `delete from public.orgs`
does most of it, because every org-scoped table cascades from it; the job asserts
that rather than assuming it — then every storage object under `{org_id}/` in the
five org-prefixed buckets (`fonts` is un-prefixed and untouched, DEC-049), then
runs the post-deletion assertion: **no row and no object bearing the id**. It
writes `org.deleted` to `platform_audit_log` only after the assertion passes.

### 0.8 The six jobs

| Task | Key | Trigger | Idempotent because |
|---|---|---|---|
| `enforce_retention` | `retain:{date}` | nightly | It deletes by age predicate; a second run finds nothing left. |
| `anonymise_members` | `anon:{date}` | nightly | It filters `anonymised_at is null`. |
| `assert_storage_prefixes` | `storageck:{date}` | nightly | It reads and reports; it writes nothing. |
| `expire_impersonation` | `impexp:{session_id}` | scheduled at `expires_at` | It expires **every** due session, not only the one named; a replay finds none. |
| `build_data_export` | `export:{member_id}:{requested_at}` | on request | The request row's status guards it; the archive path is deterministic. |
| `delete_org` | `orgdel:{org_id}` | on request | Deleting a deleted org is a no-op that still asserts. |

Every one enqueues through `public.enqueue_job()` and writes org tables only
through `security definer` functions. `assert_storage_prefixes` names `fonts` in
its report as the one deliberately un-prefixed bucket rather than skipping it —
a skipped bucket is indistinguishable from a forgotten one.

Retention periods come from `retention_periods`, seeded from `12` §5.3:

| Class | Period | Table |
|---|---|---|
| Audit log | 7 years | `audit_log` |
| Check-in attempts | 90 days | `check_in_attempts` |
| Notification delivery logs | 180 days | `email_deliveries` |
| Deactivated member's personal data | 12 months | `members` (anonymise, never delete) |
| Data export archives | 7 days | `data_export_requests` |

The ledger is **not** trimmed (`12` §5.3, `REQ-PTS-011`) and the table says so
with an explicit row rather than by omission.

### 0.9 Anonymisation — the total that must not move

`12` §5.4 and `REQ-PRF-007`. `anonymise_members` rewrites `display_name`,
`email`, `avatar_url`, `job_title`, `bio` and the interests of a member
deactivated more than 12 months ago, sets `anonymised_at`, and **touches no
ledger row**. `members.id` is the pseudonymous id — it already is one — so
balances reconcile by construction. Authored content stays and is attributed
«عضو سابق» at the DAL, from `anonymised_at`, not by rewriting an author column.

The test that matters: sum `points_ledger` per org before and after, and assert
equality. Not "no rows deleted" — the **total**, which is what `REQ-PRF-007`
promises.

### 0.10 Screens

| Screen | Route | Notes |
|---|---|---|
| SCR-080 | `/app/platform/orgs` | List, status, create, suspend/reinstate, delete (slug typed back). |
| SCR-081 | `/app/platform/orgs/new` | Name, slug, certificate prefix, domains, first admin email. |
| SCR-082 | `/app/platform/orgs/[id]/domains` | Add/remove, and set first admin. |
| SCR-083 | `/app/platform/templates` | Managed, not authored: list the seeded eight plus promotions; promote, retire. |
| SCR-084 | `/app/platform/metrics` | Aggregate only. |
| SCR-085 | `/app/platform/impersonate` | Reason, org, ≤ 4 h, and the sentence that says the org will see it. |
| SCR-005 | `/legal/privacy`, `/legal/terms` | Public, Arabic, PDPL per `12` §6 with the region as a fact (OQ-026). |
| — | `/app/me/privacy` | Export request, download, deactivation request. |

Every platform screen is server-rendered, gated by `assertPlatformAdmin()` in the
DAL (never in a layout — Partial Rendering), and reads only the platform tables
and the metrics functions.

### 0.11 Questions for the lead

1. **Three new entities need a DECISIONS entry**, the way `brand_kits` does:
   `retention_periods`, `platform_audit_log` and `data_export_requests`. The
   first two carry **no `org_id`**, so `02` §7's five documented exceptions
   become seven; both follow the `platform_admins` shape exactly — RLS enabled,
   **no policy and no grant** — so `03`'s per-table map needs a row saying "No
   policy at all" for each, which is what `scripts/policy-diff.mjs` parses.
   `data_export_requests` is org-scoped and needs `POL-data_export_requests.*`
   rows in `03` §8.2.
2. **`03` and DEC-052 disagree by one role on `impersonation_sessions`.** `03`
   §5's per-table map says `P1 + is_staff()` and its role matrix gives moderator
   *and* admin a read; DEC-052 and my agent definition say "P2 read for the org's
   admins". I have written `is_staff()` — `03` is the settled permissions
   document and policy-diff reads it. Say if the narrower rule is wanted.
3. **`11` §2.7 says `expire_impersonation` runs "every minute".** I schedule it
   per session at `expires_at` (key `impexp:{session_id}`, which is the key `11`
   gives) and the task expires every due session, so a missed schedule
   self-heals. A crontab line would need a key `11` does not define. Confirm the
   scheduled-at-expiry reading, or give me a key for the sweep.
4. **The deactivation request (`REQ-PRF-007`) gets no table.** A member's request
   writes `member.deactivation_requested` to the org's own audit log and notifies
   the org's admins through `public.notify()`; the admin acts with the existing
   `deactivate_member()`. That avoids a fourth new entity. Say if a queue table
   is wanted instead.
5. **The auth hook gains a `select` on `impersonation_sessions`** for
   `supabase_auth_admin`. It is in the proposed file; flagging it because `0006`
   is the single point of failure for all sign-in and the grant list is part of
   its contract.

---

## 1. Findings

Eight things that cost time or changed a design. Each is here because it will
recur, not because it was interesting.

### 1.1 `(f()).*` calls a composite plpgsql function ONCE PER OUTPUT COLUMN

`select (public.start_impersonation(...)).*` expands to `(f()).col1, (f()).col2, …`
and calls the function once for each. The first impersonation case refused its
own second call with `impersonation_already_active`, which looked like a bug in
the RPC and was a bug in the test. **Call a composite-returning RPC as a table
source: `select * from public.f(...)`.**

### 1.2 `design_templates` reads as a leak in the ★ sweep and is not one

The no-data-plane sweep walks every table with an `org_id` column and expects
zero rows for a platform admin. `design_templates` returns rows, because its
PLATFORM-scope rows are readable by every authenticated user **by requirement**
(`03` §5.9a, D67) and carry a null `org_id`. The sweep asserts on
`where org_id is not null`, which is the claim that was actually meant.

### 1.3 Replacing `org_domains_audit()` silently dropped `0008`'s escape

Adding platform-admin attribution to the trigger meant rewriting its body from
`0005`'s — and `0008` exists precisely because that body had to learn not to
write an audit row during an org-deletion cascade. Dropping the guard made
`delete_org()` impossible with a foreign-key violation, which is the bug `0008`
was written to fix. The test caught it. **Every other append-only trigger on
the cascade path already carries the same escape** (`points_ledger_append_only`,
both leaderboard guards, `calendar_disconnected`), which is why a single
`delete from public.orgs` is enough and nothing has to disable a trigger.

### 1.4 `exports_storage_read` has no member conjunct — so the archive is a column

`REQ-PRF-006`'s archive cannot live in the `exports` bucket: `0037`'s policy is
`bucket_id = 'exports' and the first segment = auth_org_id()`, with nothing
about the member, because everything else in that bucket is an org's own poster
or certificate. A personal archive there would be readable by every member of
the org, and **a storage policy is permissive — an extra policy can only
widen**, so the subtree could not be narrowed without rewriting M5's.

The alternatives were a seventh bucket (`03` §6 says six) or a Route Handler
holding `service_role` (invariant 7). A `jsonb` column on the request row needs
neither: `data_export_read_self` is already exactly the right boundary.

### 1.5 `tests/rls/fixture-m7.ts` seeds a `data_export_requests` row

It arrived mid-session (wave-4 isolation coverage) and writes `storage_path` on
a `ready` row for `members[0]` of each org. Two consequences:

- **`storage_path` stays on the table**, unused. Dropping a column out from
  under a file this track does not own would break a teammate's suite to tidy a
  schema. It can go once that fixture writes `payload` instead — the lead's
  call, not this track's.
- **The privacy cases use `members[1]`**, because `members[0]` already has an
  export and a second request is correctly rate-limited. That also makes the
  rate-limit case honest: a member with no history.

### 1.6 ICU's `#` formats with the LOCALE's numbering system

`{count, plural, few {# مؤسسات}}` renders Arabic-Indic digits under `ar`, which
contradicts `REQ-INT-006` — numerals follow the **org setting**, not the locale.
Every plural in this track selects on `count` and prints a pre-formatted
`{value}`, the way `templates.json` already did.
`tests/unit/platform-messages.test.ts` refuses a `#` in any plural.

### 1.7 The column names in the export payload are not the obvious ones

`points_ledger.amount`/`occurred_at` (not `delta`/`created_at`),
`comments.author_id` (not `member_id`), `photos.uploader_id`,
`ratings.session_stars`/`presenter_stars`/`submitted_at`,
`check_ins.arrived_at`, `rsvps.reserved_at`. plpgsql does not resolve columns
in a function body until the body runs, so `create function` succeeded and the
first real call failed. **Smoke-test a definer function against a seeded row,
not against an empty database.**

### 1.8 An impersonating session cannot reach an org's screens — the lead's call

`02` §4.1 gives the session an `org_id` and no target member, so the hook mints
no `member_id`, which is what makes break-glass read-only. But
`getSessionState()` requires **both** `org_id` and `member_id` for its `member`
branch, so an impersonating super admin falls to `no_org` and every org screen
sends them to `/no-access`. Today break-glass reaches the console and nothing
else, which is narrower than SCR-085's "a persistent banner across every
screen".

Three ways out were put to the lead: add one state to `session.ts`, widen
`Session.memberId` to nullable (touches every DAL — too large for this wave),
or accept the narrower behaviour for M8. **The M8 demonstrable holds either
way**: a super admin creates an org, reads no row of it, and the session lands
in the org's audit log and expires on its own. `<ImpersonationBanner />` stays
a no-op placeholder until the lead decides.

### 1.9 The app shell made the whole console unreachable

`src/app/[locale]/app/layout.tsx` rendered `<NotificationBell />` for every
route under `/app/**`, including `/app/platform/**`. The bell's DAL calls
`requireSession()`, a super admin has no member row, and so **every console
screen redirected to `/no-access`** before any of this track's code ran. A
nested layout cannot opt out of its parent, so nothing here could prevent it;
the lead's one-line guard fixed it (`753788d`).

Worth keeping because of what it says about test coverage: **35 RLS cases, the
policies, the RPCs and the DAL were all correct, and the screens had never
rendered for anyone.** Only a real session against a real build through the
real shell shows this. It is the concrete version of "a mocked client never
catches a policy gap between two real calls".

### 1.10 Two assertions that passed while the thing failed

Both cost a sync, and both are easy to repeat:

- **`page.goto()` reports the status of the FINAL response.** A redirect to
  `/no-access` answers 200, so `expect(response.status()).toBe(200)` passed on
  every screen while none of them rendered. Assert `page.url()` beside it.
- **`page.request.get()` follows redirects by default.** The members-export
  check landed on an HTML page with status 200 and read as "the export
  succeeded" when `requireSession()` had bounced it. Use `maxRedirects: 0`.

A third, related: `/ar/app/sessions` renders for a super admin and comes back
**empty** rather than redirecting, because a session with no `org_id` claim
matches no row under any policy. That satisfies `REQ-ADM-002` exactly as well
as a redirect. The spec asserts the property — no org data — rather than the
mechanism, because demanding a redirect couples this track's spec to another
track's choice of where it calls its DAL.

### 1.11 `next start` serves the build, not the source

Obvious in hindsight, and it cost a confusing half hour: only the lead runs
`npm run build`, so **every source change is invisible to the e2e until the
next sync**. A spec that asserts new copy fails for an environment reason, and
— worse — a 390 px capture taken after a fix is the render from BEFORE it.

The rule this track follows now: a capture is evidence only when `.next/BUILD_ID`
is newer than the file it renders. The diagnosis from a stale capture is still
sound; the fix is unverified until the rebuild.

### 1.12 What the captures actually caught

Three things no test would have:

- **An empty `<option>` renders as a blank line.** SCR-085's org picker looked
  like a broken control rather than a prompt.
- **The one number that matters was inside the scroller.** SCR-084 put `oldest
  pending` last, so at 390 px a reader saw the two columns that look healthy
  either way and had to scroll for the one that catches a stalled queue.
- **The A27 baseline names each template after its family**, so SCR-083 read
  «إعلان إعلان» on every row.

And one the drill caught instead: a real worker beside the suite finishes
`build_data_export` in under a second, so an assertion that expected `queued`
only passed on a machine where nothing was running.

---

## 1b. `JOB-evaluate_alerts` — the drill (planned before code, lead's addition at sync 1)

`14` M8's third demonstrable is "every `11` §3.2 alert fires in a drill". That is
**this track's job, not Sentry's**: Sentry is a transport, and a transport
cannot be drilled. What can be drilled is a pure evaluation of eight thresholds
against SQL, emitted through one interface with a sink you can assert on.

### 1b.1 Shape

- **`public.evaluate_alerts()`** — one `security definer` function, `service_role`
  only, returning `(alert text, fired boolean, detail jsonb)` for **all eight**
  alerts every call. Evaluating all eight always (rather than returning only
  the firing ones) is what makes "and clears when the condition clears"
  expressible: the task sees both edges.
- **`worker/src/platform/alerts.ts`** — the `AlertSink` interface and
  `ConsoleAlertSink` / `MemoryAlertSink`. **No network call lives here.** The
  lead wires Sentry behind the same interface at Launch.
- **`worker/src/tasks/evaluate_alerts.ts`** — every minute, key
  `alerts:{minute}`. Calls the function, hands every row to the sink.

### 1b.2 The eight, and the SQL each reads

| `11` §3.2 alert | Threshold | Read from |
|---|---|---|
| `queue_stalled` | oldest pending > 5 min on `default` | `graphile_worker._private_jobs` left-joined to `_private_job_queues`; a null queue IS `default` |
| `ledger_divergence` | any | `audit_log` rows `points.balance_divergence` in the last 24 h — the trail `JOB-audit_balances` already writes, rather than re-running an expensive sweep every minute |
| `parity_failure` | any Tier A failure | `fonts.parity_status = 'failed'` recorded in the window; that row IS the parity gate's record (`record_font()` writes `parity_report`) |
| `calendar_backlog` | > 50 pending **or** > 15 min old | `calendar_events` where `state = 'pending'` |
| `email_bounce_spike` | > 5 % in an hour | `email_deliveries` in the last hour, `bounced`/`failed` over the total, with a floor so one bounce out of three is not a spike |
| `render_failures` | > 3 consecutive | the last four `export_artifacts` by `created_at`; all failed means the run is consecutive |
| `storage_prefix_violation` | any | `platform_audit_log` rows `storage.prefix_violation` — written by `assert_storage_prefixes`, so the two jobs meet through the durable trail rather than through a variable |
| `impersonation_active` | > 2 h | `impersonation_sessions` still open and started more than two hours ago |

Two of these are readings rather than transcriptions, and both are stated in
the SQL header: **ledger divergence and parity failure are read from the
records the jobs that detect them already write**, because an alert job that
re-derives a nightly sweep every minute is an alert job that becomes the
outage it was meant to report.

### 1b.3 Why "fires once" is the SINK's property

There is no alert-state table, deliberately. A ninth entity holding open/closed
would need a DEC, a policy and a retention row, and it would duplicate what
every real alert transport already does: Sentry, PagerDuty and a log pipeline
all dedupe by fingerprint. So the task emits the **current state** of all eight
every minute and the sink turns that into transitions — `fire` on the first
firing evaluation, `clear` on the first non-firing one after it.

The honest cost, recorded here so nobody calls it a bug: **a worker restart
re-fires every currently-open alert once.** That is the correct behaviour for a
process that has just lost its memory, and it is what the real transport
deduplicates.

### 1b.4 The drill

`tests/rls/platform-alerts.test.ts` for the SQL (seed each condition, assert
exactly that one alert fires, clear it, assert it stops) and
`tests/unit/platform-alerts.test.ts` for the sink's transition logic over a
`MemoryAlertSink`. The RLS half is the drill `14` M8 asks for: **eight
conditions, eight alerts, and each one proven not to fire the other seven.**

---

## 2. What is owed at the next sync

1. **One rebuild.** `platform-console` is 16/16 and `legal` is green, but the
   served build predates the three capture fixes and the export rate-limit
   change (§1.11). One case in `privacy.spec.ts` is red for that reason alone.
   After the rebuild: re-run both, re-look at the captures.
2. **Two proposed files** to promote, in order: `0005_enum_types.sql`, then
   `0006_alerts.sql`. (`0001`–`0004` are `0069`, `0070`, `0072`, `0073`.)
   Four `03` §8.2 rows for `0006`; none for `0005`.
3. **Seven task registrations and four crontab lines** in `worker/src/index.ts`
   — `evaluate_alerts` joined the six, every minute.
4. **`<ImpersonationBanner />` on `/no-access`.** The platform shell renders it
   already; under DEC-055 the other slot is the more important one, because
   `/no-access` is where an impersonating operator actually lands.
5. **Two readings in `0006`'s header** for the lead to confirm or correct: the
   sources for ledger divergence and parity failure, and "> 3 consecutive"
   renders implemented as three in a row.
