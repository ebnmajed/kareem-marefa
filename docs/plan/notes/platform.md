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

### 1.13 The `existsSync` guard hides a promotion that never happened

Every RLS test in this track opens with

```ts
if (existsSync(join(cwd, "supabase", "proposed", file))) await applyProposed(tx, file);
```

which is what lets a test survive its own promotion: once the lead moves the
file into `supabase/migrations/`, the proposed copy is gone and the guard skips
it. That is the right behaviour and it has worked all wave.

**It also means a file that was never promoted looks identical to one that
was.** The proposed file is committed, so the guard fires on CI too, and the
case passes everywhere while `supabase/migrations/` lacks the change. The
green test says "this SQL is correct", never "this SQL is deployed".

It bit at the close of the wave: `platform_job_health()`'s due-jobs fix lived
in `supabase/proposed/platform/0007_job_health_due.sql`, the case passed, and
the migrations did not carry it — while the running database did, so `pg_proc`,
`supabase/migrations/` and CI held three different answers at once.

**What to do about it**, for whoever picks this up: the guard is not the bug and
should not be removed. The check that is missing is a promotion checklist item,
not a test — *`supabase/proposed/<name>/` is empty when a wave closes*. An empty
proposed folder is the only honest signal that every proven file is deployed,
and it costs one `ls`.

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

---

## Wave 8 — the plan (2026-09-17) — seven routes and the console's shell onto the M9 system

`DEC-147`. Planning only: nothing below is built until the lead approves it. Every
route is `REQ-ADM-001`'s console (SCR-080 … 085); the measure is
`node scripts/ui-reach.mjs --wave8` ✓ **and** a 390 px RTL capture at the cited path.

### W8.0 Where the console stands, measured on `e3df1d3`

- `ui-reach --wave8`: **0 of 8** (the layout and seven pages). `ui-lint`'s allowlist
  holds **11** platform files — every form hand-rolls a `FIELD` class string, both
  destructive controls sit in a `<details>`, and the only system import is the pre-M9
  `ui/button`.
- `/app/platform` is a bare `redirect()`. **A redirect page can never pass the strict
  measure** (it imports nothing), so P1 has to render something — W8.2.

**Seven findings, each read in the code before this plan relied on it:**

| # | Finding | Evidence | Serves |
|---|---|---|---|
| F1 | ★ **Stopping from SCR-085's own page leaves the org on the token for up to 900 s.** `endImpersonationAction` is a plain `<form>`; only the banner's `StopImpersonationControl` calls `refreshSession()`. RLS reads the claim, not the session row, so «أنهِ الجلسة» on the page ends the row and not the access | `impersonate/page.tsx`, `components/platform/stop-control.tsx` | `REQ-ADM-002` |
| F2 | ★ **Suspected, to prove red first: starting a session may never refresh the token either.** `ImpersonateForm` refreshes in a `useEffect` on `state.started` — but the action `revalidatePath`s the page, the same response swaps the form for the active panel, and an unmounted component's effect does not run (wave 6's «effect toasts in unmounting cards»). No test reads the token after a start: the e2e asserts the audit row and the heading, and the banner reads `my_impersonation()` by `auth.uid()`, which needs no claim | `impersonate/impersonate-form.tsx`, `tests/e2e/platform-console.spec.ts` | `REQ-ADM-002` |
| F3 | ★ **`set_first_admin()` refuses a mixed-case address.** Its check runs `\.[a-z]{2,}$` on the un-lowercased input; `create_org()` lowercases first, so the two doors disagree. Measured in local Postgres: `'Boss@Example.COM'` refused, `'boss@example.com'` accepted | `0069:560` | `REQ-TEN-002`, contract 4's shape |
| F4 | Five actions return `void` and swallow a refusal — `reinstateOrgAction`, `removeDomainAction`, `retireAction`, `setDefaultAction`, `endImpersonationAction`. Retiring the last default is refused by the RPC and the screen shows **nothing** | the four `actions.ts` | `REQ-UIX-007` |
| F5 | Seven raised identifiers have no message: `version_not_found`, `version_not_published`, `already_platform`, `template_not_found`, `template_retired`, `last_platform_default` (all mapped by `platform-templates.ts`, none in `platform.errors`) and `org_not_found_or_active` (reinstate; falls to `failed`) | `ar/platform.json` | `REQ-UIX-010` |
| F6 | A super admin with no member row who signs in lands on `/ar/no-access` (`destinationFor` → `no_match`), whose primary action is «ادخل بحساب آخر». **There is no way into the console except typing its URL**, and during break-glass the same page's primary action signs the operator out | `src/lib/auth/flow.ts:41`, `(auth)/no-access/page.tsx` — the lead's | `REQ-UIX-012` |
| F7 | The banner's «تنتهي خلال N دقيقة» is computed in a layout, which does not re-render on navigation — stale from the second screen on. The admin rail's `current` has the same cause (`x-pathname` read in `admin/layout.tsx`, the bug `shell-routes.ts` already records for the tab bar) — a finding for `console`, routed through the lead | `platform/layout.tsx:44`, `admin/layout.tsx` | `REQ-UIX-017` |

### W8.1 P0 — the console's shell, and why a rail with a section menu

`app/platform/layout.tsx`, `components/platform/platform-nav.tsx` (new, client).

**The navigation.** Five destinations — لوحة المنصة · المؤسسات · مكتبة القوالب ·
المؤشرات · الدخول الاستثنائي.

- **Desktop (`md` and up): a persistent rail after `16` §6.7** — the admin console's item
  look (icon + label, 44 px rows, `aria-current="page"`), `ui/link` items, a second skip
  link «تخطَّ إلى محتوى اللوحة» to `#platform-content` (`REQ-UIX-017`, the admin
  layout's pattern). **Not collapsible**: five items cost 14 rem and there is nothing to
  hide, so the admin rail's `localStorage` machinery would buy nothing.
- **Phone: a section switcher on `ui/menu`** in a top bar under the banner — the trigger
  names **the current section** («المؤسسات» + chevron, accessible name «أقسام لوحة
  المنصة: المؤسسات»), the menu lists all five as `href` items. Radix closes it on
  selection, outside press and `Escape` with focus returned (`DEC-111`).
- **Why not `AdminRail`:** it renders its phone sheet and desktop rail together, so it
  cannot be half-reused; its `current` comes from a layout (F7); and a sheet behind a
  hamburger hides where you are, which a five-item switcher shows in its trigger.
  **Why not `ui/tabs`:** its list is `overflow-x-auto` in one row — the horizontal
  scroller this wave forbids at 390 px. **Why not a wrapping link row** (today's):
  five Arabic labels wrap to two or three ragged lines at 390 px and name no current item.
- **`current` is computed in the client component from `usePathname()`**, never in the
  layout (F7). The home item is exact-match; the others prefix-match
  (`/app/platform/orgs/new` keeps «المؤسسات» current).

**Order in the layout:** `ImpersonationBanner` first (above the nav, in flow — **never
sticky**: a second sticky layer is `16` §3.1's hazard), then the skip link, then the grid
`md:grid-cols-[auto_1fr]` with the rail and `#platform-content`. The gate stays exactly
as it is — `requirePlatformAdmin()` in the layout (so no nav renders for an org admin)
**and** at the data in every page; the not-found answer is `DEC-134`'s streamed one.
The layout's `note` paragraph (repeated on every screen today) moves to the home page
and SCR-085, where it is read.

**The banner** (`components/platform/impersonation-banner.tsx`, SCR-085): `ui/panel`
`tone="live"` — a break-glass session **is** «جارية الآن», the status vocabulary's own
meaning (`DEC-073`) — with `LockIcon`, «أنت تتصفح <bdi>org</bdi> بصلاحية استثنائية»,
**«تنتهي عند 14:32» as an absolute time** in `Asia/Riyadh` via `formatTime` (a clock time
cannot go stale in a layout; a countdown can — F7), the read-only line, and the stop
control on `ui/button` (`variant="secondary" size="sm"`, `pending` from its transition —
**no timer, no nudge**). It keeps its contract: server component, own DAL read, renders
null for everyone not inside a live session, never throws, no heading.
`stop-control.tsx` stays the **only** stop control in the product — SCR-085's active
panel renders the same component (fixes F1).

### W8.2 P1 — `/app/platform` renders a home, it does not redirect

A redirect cannot reach a primitive, and a console of five sections wants a root the rail
can mark current. **Aggregate only** (`REQ-ADM-003`).

- `ui/page-header` «لوحة المنصة» with the no-data-plane sentence as its description and
  «مؤسسة جديدة» as its one primary action (`ButtonLink`).
- **«يحتاج انتباهك»** (`ui/section-header`): each **fired** alert of `11` §3.2 as a
  `ui/panel` `tone="error"` with its aggregate detail and a link to SCR-084; nothing fired
  → `ui/empty-state` `size="sm"` «لا شيء يحتاج انتباهك الآن», action «عرض المؤشرات».
  This reads `platform_alerts()` — W8.11, file 1. **If the lead declines that file**, the
  section shows only facts that need no threshold (suspended orgs, failed jobs, open
  break-glass sessions, each > 0) and never re-derives «queue stalled» in TypeScript.
- Four `ui/stat` with `href`: المؤسسات النشطة → orgs · الأعضاء النشطون → metrics · الجلسات
  → metrics · جلسات دخول استثنائي مفتوحة → impersonate.
- **DAL:** `getPlatformTotals()` (unchanged) and `listPlatformAlerts()` (new, W8.11).
- **Captures:** `wave8-platform-home-default.png`; `wave8-platform-shell-nav-open.png`
  (the section menu open over the home page).

### W8.3 P2 — `/app/platform/orgs` (SCR-080)

- `ui/page-header` (title, description, meta = the org count with all six plural forms,
  action «مؤسسة جديدة»), and **`ui/data-table`** in a new client `orgs/orgs-table.tsx`:
  the org name (primary, links to SCR-082, the slug beneath it `<bdi dir="ltr">`) ·
  status `ui/badge` (نشطة `success` · موقوفة `neutral outline`) · members · active
  members · sessions · certificates · created · actions. Below `md` the stacked card
  list, with name, status, members, sessions and actions `onCard`. Empty:
  `ui/empty-state` «لا توجد مؤسسات بعد», action → SCR-081.
- **Actions per row, `ui/menu` on an `ui/icon-button`** named «إجراءات <org>» — the
  members table's proven Menu→Dialog shape (`admin/members/members-table.tsx`):
  - **«أوقف المؤسسة»** → `ui/dialog` titled «إيقاف <bdi>org</bdi>», the consequence
    stated before the click (sign-in stops, jobs stop, nothing is deleted, it can be
    undone — `REQ-TEN-006`), `ui/field` + `ui/textarea` for the reason (required, «سيقرأه
    مشرفو المؤسسة»), `SubmitButton variant="danger"`. `noValidate`. Success closes the
    dialog and toasts «أُوقفت <org>»; a refusal stays in the dialog, adjacent to its field.
  - **«أعد التفعيل»** (suspended rows) — one press, no confirm (restorative, the
    `DeactivateToggle` asymmetry), a toast either way (F4).
  - **«احذف نهائيًا»** (`tone="error"`) → `ui/dialog` «حذف <bdi>org</bdi> نهائيًا», the
    irreversibility and the difference from suspension stated first (`REQ-NFR-014`),
    `ui/input dir="ltr" autoComplete="off"` for the slug typed back, **compared on the
    server** (`slug_mismatch` renders on that field). `noValidate`.
- `REQ-UIX-013`: both destructive acts name the org in the dialog title.
- **DAL:** `listOrgs()`, `suspendOrg()`, `reinstateOrg()`, `deleteOrg()` — unchanged.
  `failure()` learns `org_not_found_or_active` (F5).
- **Captures:** `wave8-platform-orgs-cards.png` (two seeded orgs, one suspended) ·
  `wave8-platform-orgs-suspend-confirm.png` · `wave8-platform-orgs-delete-mismatch.png`.
- **Contradiction, for the lead:** `09` §6 lists «set first admin» under SCR-080 and the
  checklist row says «the first admin». It lives on SCR-082, one tap from the row (the
  name links there). A form per card at 390 px is not a list. **I keep it on SCR-082**
  unless ruled otherwise.

### W8.4 P3 — `/app/platform/orgs/new` (SCR-081)

- `ui/page-header` with a breadcrumb (المؤسسات › مؤسسة جديدة) and the no-self-registration
  sentence (`REQ-TEN-002`).
- **The form model (`16` §8.2), rebuilt on `lib/form-state`:** `FormSummary` keyed on
  `attempt`, `ui/field` around every control with «مطلوب» where required, `was()` so a
  refused submit keeps every value (`REQ-UIX-011`), `noValidate`, `SubmitButton`.
  Fields: name (`input`) · slug (`input dir="ltr"`, hint: lowercase Latin, fixed forever) ·
  certificate prefix (`input dir="ltr"`, 2–5 letters, any case — uppercased by the
  schema) · allowed domains (`textarea dir="ltr"`, one per line, **any case**, stored
  lowercase — contract 4 holds here too) · first admin email (`input type="email"
  dir="ltr"`) · seed categories (`ui/checkbox`).
- The action returns `FormState<'name'|'slug'|'certificatePrefix'|'domains'|'firstAdminEmail'>`:
  Zod issues map to per-field keys; the RPC's `slug_taken` lands **on the slug field**
  and `domains_required` on the domains field; anything else is `formError`. Success
  still redirects to SCR-082.
- **DAL:** `createOrg()` and `createOrgInput` unchanged.
- **Capture:** `wave8-platform-orgs-new-field-error.png` — a slug with a space and an
  empty prefix submitted, the summary focused, both fields marked, the name still there.

### W8.5 P4 — `/app/platform/orgs/[id]/domains` (SCR-082) — contract 4

- `ui/page-header`: breadcrumb (المؤسسات › `<bdi>`org`</bdi>`), the org name as the title,
  meta = the slug `ui/badge` `<bdi dir="ltr">` and the status badge; when suspended, a
  `ui/panel` with the date and the reason (the one place a super admin can read it back).
- **«النطاقات المسموح بها»** (`ui/section-header` with the count): the removal note as a
  `ui/panel` `tone="info"` beside the list (`REQ-TEN-007`: removal stops **new**
  provisioning only); a `ui/data-table` of domains (`font-mono`, `<bdi dir="ltr">`),
  remove confirming in `ui/dialog` «إزالة <bdi>domain</bdi>» with the consequence stated
  (`REQ-UIX-013`); empty → `ui/empty-state` «لا توجد نطاقات — لا يستطيع أحد الانضمام الآن»,
  action focusing the add field.
- **Add a domain:** `ui/field` + `ui/input dir="ltr"`; **the hint says any case is
  accepted and it is stored in lowercase**, and the list re-renders **what is stored**
  (contract 4 — `org_domains_normalise` runs before the check). `noValidate`. A domain
  already on the list says so rather than «حُفظ» (`add_org_domain` returns null on
  conflict; `addDomain()` passes that through as `alreadyPresent`).
- **«أول مشرف»:** the stored address shown `<bdi dir="ltr">`, `ui/field` + `ui/input
  type="email"`, `noValidate`. **F3's fix is in the DAL:** `setFirstAdmin()` trims and
  lowercases before the RPC — the same normalisation `create_org()` already applies,
  so the two doors agree. (A `create or replace` of `set_first_admin()` is the stricter
  fix; the DAL line is enough for the only caller and needs no promotion. Lead's call.)
- **DAL:** `getOrgDetail()` unchanged; `addDomain()` gains an optional `alreadyPresent`;
  `setFirstAdmin()` lowercases (F3).
- **Capture:** `wave8-platform-domains-mixed-case-saved.png` — `Mixed-Case.Example`
  typed, `mixed-case.example` in the list, the toast; the spec also reads the row back
  from `org_domains` and asserts the stored value.

### W8.6 P5 — `/app/platform/templates` (SCR-083) — managed, not authored

- `ui/page-header` (the managed-not-authored sentence as description) and a `ui/panel`
  stating the rule: the baseline ships with the platform, is present for every org from
  creation, and a purpose never falls below one default (`DEC-052`).
- **The library:** one `ui/section-header` + `ui/data-table` per purpose (الملصقات ·
  الشهادات), each with its count, sorted family → variant. Columns: the template (name;
  the family label only when it differs — wave 4's «إعلان إعلان» finding) · the variant
  columns contract 3 makes rows (W8.10) · state `ui/badge`s — «أساسي» (neutral), «الافتراضي»
  (success), «متقاعد» (ended, outline) · versions · actions.
- **Actions on `ui/menu`:** «اجعله الافتراضي» (toast) · «أحِله إلى التقاعد» confirming in
  `ui/dialog` naming the template and what a new org loses · «أعده إلى الخدمة».
  ★ **Principle 7: a retire the rule refuses is not offered.** The row that is the last
  non-retired default for its purpose renders no retire item, and the panel above says
  why in one line; the RPC's `last_platform_default` stays the authority and, if it
  fires anyway, it toasts (F4, F5).
- **Promote:** `ui/section-header` + `ui/data-table` of candidates (template name, org
  `<bdi>`, family, «النسخة 3», published, «رُقّي من قبل» badge), each with «رقِّ النسخة»
  opening `ui/dialog`: the copy-not-link consequence stated (`REQ-DSG-008`), the optional
  name in `ui/field`, `SubmitButton`; errors in the dialog, success toasts and closes.
  Empty → `ui/empty-state` «لا توجد نسخ منشورة قابلة للترقية».
- **Still no preview and no document** on this screen (wave 4's reasoning stands).
- **DAL:** `listPlatformTemplates()` gains `isBaseline`, `retirable` and the variant
  fields (optional DTO fields, W8.10); the four writes unchanged.
- **Capture:** `wave8-platform-templates-baseline.png` — the full seeded roster, after
  `designer`'s seed is promoted.

### W8.7 P6 — `/app/platform/metrics` (SCR-084) — aggregate only

- `ui/page-header`; **«التنبيهات»** — the eight `11` §3.2 alerts as a `ui/data-table`
  (alert name, `ui/badge` مُطلق `error` / سليم `success`, the aggregate figure and its
  threshold, e.g. «أقدم منتظرة 7 دقائق · الحد 5») — W8.11 file 1;
  **the totals** as eight `ui/stat` in a 2-column grid on a phone, 4 on desktop;
  **job health** as a `ui/data-table` (task `<bdi dir="ltr">` · oldest pending · pending ·
  failed) — ★ **below `md` a card list, so the one horizontal scroller in this track is
  gone** and «أقدم منتظرة» is on the card, not off the edge (wave 4's capture finding
  keeps its answer); **per org** as a `ui/data-table` (org · active members · sessions ·
  certificates). Empty job table → `ui/empty-state` with «أعد التحميل».
- **Contradiction, for the lead:** `REQ-ADM-003` names **error rates**; SCR-084 shows
  none today. `evaluate_alerts()` already computes the bounce rate, consecutive render
  failures and the rest, aggregate by construction — W8.11 file 1 exposes it.
- **DAL:** `getPlatformTotals()`, `getJobHealth()`, `listOrgs()` unchanged;
  `listPlatformAlerts()` new.
- **Capture:** `wave8-platform-metrics-default.png`.

### W8.8 P7 — `/app/platform/impersonate` (SCR-085) — break-glass

- `ui/page-header` «الدخول الاستثنائي», then **the consequence first** in a `ui/panel`
  (`tone="info"`): you cannot look at an org's data without the org knowing (`09` §6).
- **Empty (no live session):** the form on `lib/form-state` — `ui/field` + `ui/select`
  for the org (a text placeholder option — wave 4's blank-line finding), `ui/field` +
  `ui/textarea` for the **written reason** (required, hint: saved verbatim where the
  org's admins read it), and ★ **the duration as `ui/radio-group` presets — 15 · 30 · 60
  · 120 · 240 minutes, the last labelled as the ceiling**, default 60. A preset set cannot
  ask for more than the table allows, is one tap on a phone, and replaces a number field
  whose `max` only the browser enforced. `noValidate`, `FormSummary`, `SubmitButton`.
- **Active:** the banner at the top (the layout) and a `ui/panel` `tone="live"` — org,
  reason, started, «تنتهي عند …», and **`StopImpersonationControl`** (F1). No form: the
  RPC refuses a second session, so the screen does not offer one.
- **Expired:** history rows carry a `ui/badge` — «مفتوحة» (`live`) · «أُنهيت» (`ended`) ·
  «انتهت تلقائيًا» (`ended`, outline) — from `endedBy`, which the DAL derives
  (`expire_impersonation_sessions()` writes `ended_at = expires_at`; a stop writes an
  earlier time). If the latest session expired within the hour and none is live, a
  `ui/panel` says so at the top.
- **History:** `ui/data-table` (org, reason `<bdi>`, started, ended/expires, state);
  empty → `ui/empty-state` whose action focuses the org select.
- ★ **F2's fix, whatever the proof shows:** the refresh moves **out of an effect** and
  into the submit path — the form calls the Server Action (which no longer
  `revalidatePath`s), and on success awaits `refreshSession()` then `router.refresh()`,
  the stop control's proven shape. The e2e proves both edges **on the token itself**:
  decode the auth cookie's access token and assert `app_metadata.org_id` is the target
  org after start and absent after stop — from the banner **and** from the page.
- **DAL:** `startImpersonation()`, `endImpersonation()`, `listMyImpersonations()` and
  `listOrgs()` unchanged; `ImpersonationSession` gains optional `endedBy`.
- **Captures:** `wave8-platform-impersonate-empty.png` · `wave8-platform-impersonate-active.png`
  (banner + active panel) · `wave8-platform-impersonate-expired.png` (a past session row
  inserted as `postgres`, as the spec's `seedOrg` does) ·
  `wave8-platform-impersonate-banner-org-route.png` — W8.12's contradiction C1.

### W8.9 The four `noValidate` forms (wave 7, sync 5)

All four are replaced, not patched, and every replacement carries `noValidate` with the
app's error adjacent to its field:

| Today | Becomes |
|---|---|
| `orgs/org-controls.tsx` (suspend, delete) | `orgs/orgs-table.tsx` + the two dialogs in `orgs/org-dialogs.tsx` |
| `orgs/new/org-form.tsx` | the same file, on `lib/form-state` |
| `orgs/[id]/domains/forms.tsx` (add, first admin) | the same file, on `lib/form-state`, plus the remove dialog |
| `impersonate/impersonate-form.tsx` | the same file, on `lib/form-state`, refresh in the submit path |

`templates/promote-form.tsx` has no required field and becomes the promote dialog; it
carries `noValidate` too, so a later `required` cannot block the app's own error.

### W8.10 SCR-083 once `designer`'s roster lands — contract 3, planned for either ruling

What is fixed whatever the ruling: the platform default is unique per **(purpose, family)**
(`0055`'s `design_templates_platform_default`) and the retire guard counts per **purpose**
(`0069`'s `retire_platform_template()`). What the ruling decides for SCR-083 is which
attributes are **rows** (and so columns) and whether «one default per purpose» still holds
once certificates come in two orientations.

| Ruling | Library rows | SCR-083 columns | Retire guard |
|---|---|---|---|
| **A** — scheme is render-time (`DEC-125`), certificate orientation is a row | posters 5 · certificates 6 | «الشكل» (أفقي / عمودي) on the certificate table; a panel line says every template renders light and dark | per purpose, unchanged — **unless** the issue-time chooser (D4) needs a default per orientation, which is `designer`'s index and my guard together |
| **B** — scheme is a row too (`DEC-128`'s table) | posters 10 · certificates 12 (or 6 if orientation is not a row) | «النمط» (فاتح / داكن) on both, «الشكل» on certificates | the same question, per purpose × the ruled variants |

**How the screen learns the variant:** from the columns `designer`'s seed migration adds,
if it adds them; if the variant lives only inside the document, SCR-083 shows the name and
nothing more. **How it learns «أساسي»:** a platform row with **no `template.promoted` row in
`platform_audit_log`** — not `duplicated_from is null`, which `on delete set null` turns
true for a promoted template whose source org was later deleted. A seed-time column would
be cleaner, and is `designer`'s to add if it is touching the table anyway.

**Order:** SCR-083 is my **last** route, after the lead's ruling at sync 1 and after
`designer`'s seed is promoted, so W8.11 file 2 is written against a real schema, never a
guessed one.

### W8.11 Proposed SQL — at most two files, numbered after wave 4's

Wave 4's proposed files were `0001`–`0007`; tests still name them behind `existsSync`
guards, so new files continue the sequence rather than reuse a name.

1. **`supabase/proposed/platform/0008_platform_alerts_read.sql`** — `platform_alerts()`:
   `security definer`, `assert_platform_admin()` first, returns `evaluate_alerts()`'s rows
   unchanged (all eight, fired or not, aggregate `detail`). No table, no policy, no grant
   change beyond `execute` to `authenticated`. **Why a door and not a copy:** the
   thresholds live in one SQL function (`0075`); a TypeScript re-derivation on the home
   page would be a second copy to drift. **`03` §8.2:** `RPC-platform_alerts.platform_only`
   (every org role and `anon` refused) and `RPC-platform_alerts.aggregate` (eight rows,
   `detail` keys are counts, ages, rates and thresholds only). **Tests:** two cases in
   `tests/rls/platform-alerts.test.ts`, the no-data-plane sweep untouched.
2. **`supabase/proposed/platform/0009_platform_library_roster.sql`** — after contract 3 and
   `designer`'s seed: `platform_template_library()` dropped and re-created (its return
   type changes) with the variant columns, `is_baseline` and `retirable` computed **beside
   the guard it mirrors**; and, only if the ruling changes the granularity,
   `retire_platform_template()` re-created to match. **`03` §8.2:**
   `RPC-platform_template_library.roster` (a new org's platform admin reads every seeded
   row as baseline, each purpose's last default not retirable) and, if touched,
   `RPC-retire_platform_template.granularity`. **Tests:** `tests/rls/platform-library.test.ts`.

The lead promotes either, or declines 1 and I take W8.2's fallback. Nothing else in this
wave touches SQL; the no-data-plane property is untouched by construction.

### W8.12 Contradictions for the lead to rule

| # | Screen vs requirement | Recommendation |
|---|---|---|
| **C1** | SCR-085: «a persistent banner across every screen», and this wave's capture list asks for «the banner on an org screen». `DEC-055` option C is still what is built (`session.ts` has no `impersonating` state), so an org route sends a break-glass session to `/no-access` | Accept for wave 8: the capture is an org route (`/ar/app/sessions`) **landing on** `/no-access` with the banner, the spec asserting both URLs. Option A stays the lead's `session.ts`, unscheduled |
| **C2** | `REQ-ADM-003` «error rates» absent from SCR-084 | W8.11 file 1 |
| **C3** | `09` §6 puts «set first admin» on SCR-080 | Keep on SCR-082 (W8.3) |
| **C4** | `REQ-ADM-002` «cannot be silently extended»: claims are minted at issuance and live ≤ 900 s, so access can outlast `expires_at` by up to 15 minutes (`DEC-054`, by design). F1/F2 close the stop and start edges; the expiry tail remains | State it on SCR-085 in one line («قد يبقى الوصول حتى 15 دقيقة بعد انتهاء الجلسة»), since SCR-085's whole point is saying the true thing first — or rule that it stays unsaid |
| **C5** | `REQ-UIX-012` — F6's dead end for a super admin on `/no-access` | L1 below — the lead's file |
| **C6** | `DEC-052`'s «one default per purpose» vs `DEC-128`'s two orientations chosen at issue time | Ruled with contract 3 (W8.10) |

### W8.13 Tests and captures

- **`tests/e2e/platform-console.spec.ts`** (mine): the ★ walk keeps asserting `page.url()`
  and that no member, session title or email of either org appears; selectors follow the
  new labels (a `ui/field` label's accessible name ends «مطلوب»); the axe list gains the
  home page; new cases — the token after start and after stop from both controls (F1, F2),
  a mixed-case first admin saved (F3), a refused retire of the last default toasting (F4),
  a stored-lowercase domain (contract 4), and the Menu→Dialog focus returning to the row's
  trigger on close.
- **`tests/e2e/wave8-platform-review.spec.ts`** (new): the 390 px captures only, phone
  project, `E2E_SHOTS_DIR` honoured, the scroller-aware sideways check from
  `certificates.spec.ts`, every file named `wave8-platform-<route>-<state>.png` as listed
  in W8.1–W8.8.
- **`tests/components/platform/`** (new): `platform-nav` (the current item from the path,
  five links, no `overflow-x` on the list, menu closes on selection);
  `impersonation-banner` (null without a session, `<bdi>` on the org, an absolute time,
  the stop control's name); the org-dialog pair (the org named in the title, `noValidate`).
- **`tests/unit/platform-*`**: `endedBy`, and `platform-messages.test.ts` keeps its six
  plural forms and no `#`, for every new plural (orgs, domains, minutes, hours, versions).
- **RLS:** W8.11's cases; the ★ sweep in `platform-schema.test.ts` stays green, run with
  the suite.

### W8.14 Order of work

1. **P0 + P1** — the shell, the nav, the banner and stop control, the home page. Everything
   else renders inside it, and F7 is fixed once here.
2. **P7** — impersonate: F1 and F2 are the only findings that change what break-glass
   actually grants, so they go first among the routes, red first on the token.
3. **P2 + P3** — orgs and new org; they share `orgs/actions.ts` and its state.
4. **P4** — domains, contract 4, F3.
5. **P6** — metrics (after the lead's answer on W8.11 file 1).
6. **P5** — templates, after sync 1's contract-3 ruling and `designer`'s promoted seed.

One commit per route (page, its components, its `ar/` and `en/` JSON together, its spec
changes), `Refs:` citing the route's SCR and REQs. «Ready for sync» after each.

### W8.15 Requests

**To the lead (lead-owned files):**
- **L1** · `src/app/[locale]/(auth)/no-access/page.tsx` — when `getSessionState()` is
  `no_org` with `platformAdmin`, the primary action is «لوحة المنصة» → `/app/platform`
  (F6), and «ادخل بحساب آخر» becomes secondary. It matters most during break-glass, where
  the banner lands on this page and signing out is the wrong first act.
- **L2** · `scripts/ui-lint-allowlist.json` — `--prune` after each platform route lands;
  the eleven platform entries should reach zero.
- **L3** · `src/components/ui/icons.tsx` — a `ChartIcon` at the house stroke for «المؤشرات»
  on the rail. Not blocking: `ClockIcon` stands in (SCR-084's headline number is an age).
- **L4** · `src/components/ui/stat.tsx` (`content`'s, held) — `href` renders
  `@/i18n/navigation`'s `Link`, not `ui/link`, so a linked Stat shows no pending
  affordance and never feeds `RouteProgress`. The home page's four Stats link. Not blocking.
- **L5** · promote W8.11's files when proven; the `03` §8.2 rows are in W8.11.

**To `console`, through the lead:**
- **K1** · `src/components/ui/menu.tsx` — `MenuItem.current?: boolean`, rendering
  `aria-current="page"` on the `href` item and a visual marker, so the phone section
  switcher can mark the current section inside the menu as well as in its trigger. Not
  blocking.
- **K2** · finding, not a request of mine: `admin/layout.tsx` computes the rail's `current`
  from `x-pathname` in a layout, which is stale after a client-side navigation (F7) — the
  cause `shell-routes.ts` records for the tab bar.

**To `designer`, through the lead:** contract 3 (W8.10), and whether its seed migration adds
the variant columns and a baseline marker to `design_templates`.

### W8.16 Top risks

1. **SCR-083 waits on two things outside this track** — the contract-3 ruling and
   `designer`'s seed — and the library RPC's return type changes with them. If the roster
   lands late, P5 is the row that slips; if the roster makes certificate orientation a row
   while the guard stays per purpose, the library can reach «no portrait certificate
   default» without any refusal.
2. **The break-glass token edges (F1, F2) are invisible to everything but a real build.**
   tsc, jsdom and the RLS suite cannot see a refresh that never ran, and the local `.next`
   is stale between the lead's builds (`notes/platform.md` §1.11). The fix is only done
   when the e2e decodes the token on a build the lead names.
3. **The capture list assumes a banner on an org screen that `DEC-055` does not allow**
   (C1), and a sign-in that dead-ends a super admin on `/no-access` (F6) — both in the
   lead's files. Without a ruling, P7's row cannot close exactly as written.
