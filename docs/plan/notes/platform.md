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

---

## Wave 8 — as built (2026-09-17), after sync 1's rulings (DEC-148)

All eight platform files reach the system (`ui-reach --wave8`), and `ui-lint --strict`
finds nothing in any platform file. **None of it has run on a production build yet** —
the e2e and every capture wait on the lead's build (§1.11 still holds).

| Row | Commit | What landed |
|---|---|---|
| P0 + P1 | `53a06f5` | rail + phone section switcher (`current` from `usePathname()`), the banner on `ui/panel` with an end TIME, the one stop control, `/app/platform` as a home, `platform_alerts()` proposed (promoted as `0095`) |
| P7 | `fa0ed74` | F1 and F2 fixed, SCR-085 on the form model with duration presets, the history on `ui/data-table`, C4's line |
| P2 + P3 | `d6d2331` | SCR-080 on `ui/data-table` with Menu→Dialog acts, SCR-081 on `lib/form-state` |
| P4 | `4984951` | SCR-082, contract 4 at the screen, F3 in the DAL |
| P6 | `42baf38` | SCR-084 with the eight alerts (C2), every list a card list on a phone |
| — | `5af7767` | the rail's metrics item takes the lead's `ChartIcon` |
| P5 | `c480f21` | SCR-083 on contract 3, `0009_platform_library_roster.sql` proposed |

### W8.A F1 and F2, measured red before the fix

A throwaway probe (never committed) ran against the build that predated P7 and decoded
the browser's `sb-*-auth-token` cookie:

- **F2:** three seconds after «ابدأ الجلسة», `app_metadata.org_id` was **null**. The
  session row and the org's audit row existed; only a separate refresh put the org on
  the token. Cause as diagnosed: the refresh lived in a `useEffect` of a form that the
  same action response unmounted.
- **F1:** three seconds after «أنهِ الجلسة» on the page's own form, `org_id` was **still
  the org's**.

The fix for both is one shape: **no `revalidatePath` in the action; the client awaits it,
refreshes the session, then `router.refresh()`** — in the submit path or the transition's
callback, never in an effect. `tests/e2e/platform-console.spec.ts` now decodes the token
after start and after stop, from the page and from the banner.

### W8.B Three things worth keeping

1. **A token is the only proof of what break-glass grants.** The audit row, the banner
   (`my_impersonation()` keys on `auth.uid()`) and the active panel all render without
   the org claim. Every earlier check passed while the grant never arrived.
2. **A toast title is plain text**, so `<bdi>` cannot reach it. An interpolated name goes
   in as `⁨…⁩` (FSI…PDI) — the character form of the same isolation.
3. **`[.theme-dark_&]:` on a primitive's `className`** is how the banner reads correctly
   on the light console and on `/no-access`'s dark card with one component: `Panel`'s
   `live` fill is a light constant, and the semantic text tokens flip under
   `.theme-dark`.

### W8.C Open, named

- **Reinstate during a pending deletion.** `delete_org()` suspends and enqueues; until
  the job runs, `reinstate_org()` accepts the org and the queued job still deletes it.
  Seconds with the worker up. SQL, the lead's call (told at P2+P3).
- **`platform-schema.test.ts`'s baseline cases** now assert DEC-052's property (every
  family, one default per family) rather than eight rows, so `designer`'s seed promotion
  cannot turn them red; the exact count is `REQ-DSG-026`'s.
- **The e2e run and all 13 captures** (`wave8-platform-*`), on the lead's build with
  `0009` and the roster seed applied.

---

## Wave 11 — the plan (2026-09-22) — P1, the exhausted-job alert · P2, the `/app/platform` findings

Planning only; nothing below is code yet. Read at `b8a51f6`: `DEC-166`, `DEC-167`, `0075`, `0076`, `0095`,
`0142` (which re-created `evaluate_alerts()` last — `notify`'s complaint arm), `worker/src/platform/alerts.ts`,
`worker/src/tasks/evaluate_alerts.ts`, `11` §3.2–3.3, graphile-worker 0.18's `failJobs` / `getJobs` SQL, and
every test that names `evaluate_alerts`, `platform_alerts` or `platform_job_health`.

### W11.1 The gap, measured

`queue_stalled` filters `attempts < max_attempts` on purpose (a dead job is not a backlog), and nothing else
reads the other side. **No task sets `max_attempts`** (`enqueue_job()`'s `p_max_attempts` is never passed; the
crontab passes none), so every job gets graphile's default **25**, with backoff `exp(least(attempts, 10))`
seconds: **a job exhausts about 4 days after its first failure** (the sum of `e^1 … e^9` plus fifteen `e^10`,
≈ 343,000 s). graphile never deletes an exhausted job — it stays in `_private_jobs` with its payload, which is
what `11` §3.3 asks for («a dead-lettered job keeps its payload so it can be replayed after a fix»).

So the alert is a **durable condition that already exists as rows**, like `ledger_divergence` reading
`audit_log`: the source is `graphile_worker._private_jobs` joined to `_private_tasks`, the same pair
`platform_job_health()` (`0076`) already reads. **No failure hook** — a hook in the worker would be a second
record of what the queue already records, and it would miss a job that exhausts while a worker is between
deploys.

### W11.2 The predicate

```sql
j.attempts >= j.max_attempts and j.locked_at is null
```

The `locked_at is null` matters: graphile increments `attempts` when it **locks** a job, so a job on its 25th
attempt that is running right now reads `attempts = max_attempts` and has not failed. (`0076`'s `failed`
column counts it anyway — see W11.6, Q3.)

**Which jobs count — every task, no exemption.** I looked for a task designed to give up quietly and found
none: a task that decides not to act (a cancelled session, a gone survey — `designer`'s hunt in wave 10)
returns **success**; none throws to give up. An allowlist of «ignorable» tasks would be the place a real
loss hides, so there is none. `evaluate_alerts` itself counts too (it cannot report its own death — W11.8).

### W11.3 What the super admin sees — the task name and a count, never a payload (`DEC-014`)

The reading, one row, the same shape as the eight:

| `alert` | `fired` | `detail` |
|---|---|---|
| `job_exhausted` | any row matches | `{ "exhausted_jobs": n, "tasks": k, "by_task": { "<task_identifier>": count, … }, "newest_exhausted_seconds": s }` |

A task identifier is code, not org data. The function **never reads** `payload`, `key` (a job key can embed a
session or member id), `last_error` (a thrown message can interpolate one), `queue_name` or `run_at`'s
neighbours — it selects `t.identifier`, a count and `max(now() - j.updated_at)` … `min`, nothing else.
`newest_exhausted_seconds` is `now() - max(j.updated_at)` over the matching rows (graphile's trigger stamps
`updated_at` on the failing update), so an operator sees whether the loss is fresh.

**On the console:** SCR-084's job-health card list already shows the task name and its dead count (`failed`,
`0076`) — that *is* the per-task surface, platform-admin-gated, aggregate. What is missing is the **home
page's «يحتاج انتباهك»**: a card «مهامّ استنفدت محاولاتها» that lists each task identifier in `<bdi dir="ltr">`
with its count (six ICU forms), and links to SCR-084's job health. Nothing on the console acts on a job —
a retry or a discard touches org data, and the super admin has no data plane (W11.5).

### W11.4 Dedupe and clearing

**No time window.** It fires while **any** exhausted, unlocked job exists and clears only when **every** one is
resolved — rescheduled after a fix (`graphile_worker.reschedule_jobs(ids, attempts => 0)`, or a keyed
`add_job` re-enqueue, which resets `attempts`), or discarded (`graphile_worker.complete_jobs(ids)`). A 24 h
window like the other durable alerts would turn a lost survey response into silence after a day, while the
payload that could still recover it sits in the table; the whole point of this alert is that the loss is
otherwise invisible.

**Dedupe is the sink's**, as for the eight (`alerts.ts`: no alert-state table). One addition, in
`worker/src/platform/alerts.ts` (mine): `EdgeTriggered` swallows every reading of an open alert, so a
**second** task exhausting while the first is unresolved would say nothing. `EdgeTriggered` gains an optional
per-alert **escalation key** — for `job_exhausted`, `exhausted_jobs`: while open, a reading whose count
**rises** above the count it last fired at fires again (with the new detail); a steady or falling count is
silent; zero clears. Default off, so the eight behave exactly as today and `tests/unit/platform-alerts.test.ts`
is untouched. A worker restart re-fires once, as today.

### W11.5 Resolution is operations, not the console

The runbook I write into `11` §3.3 through the lead (a request, `docs/plan/` is the lead's): the owner reads
`select t.identifier, count(*) … where attempts >= max_attempts and locked_at is null group by 1` on the
linked project, reads `last_error` **for that task only**, fixes, then reschedules or discards by job id.
For `record_survey_response` a reschedule after the fix recovers the answers — the payload is
`{response_id, survey_id, answers}`, no member (`DEC-160` §3), and `record_survey_response()` is idempotent on
`response_id` (`0137`'s `.replay` row), so a replay cannot double-count.

### W11.6 The SQL — `supabase/proposed/platform/0009_job_exhausted_alert.sql`

**Schema requests to the lead: none.** No table, no column, no enum value — the source is graphile's own
table and the alert is a row in a function's result, like the eight.

1. ★ **A new function, not a ninth arm of `evaluate_alerts()`**:
   `public.evaluate_job_exhaustion() returns table (alert text, fired boolean, detail jsonb)`, `stable security
   definer set search_path = ''`, dynamic SQL behind `to_regnamespace('graphile_worker')` (not installed →
   `fired false, {"status": "not_installed"}`, `0075`'s precedent). `revoke … from public, anon,
   authenticated; grant … to service_role` — `definer-exposure` passes by construction.
   **Why separate** (the lead may rule otherwise — Q1): `evaluate_alerts()` has had two writers already
   (`0075` mine, `0142` `notify`'s), and a ninth arm moves **four pinned «eight» assertions in files that exist
   on `main`** — `platform-alerts.test.ts`'s `.eight`, «all eight fire together» and `.aggregate`,
   `platform-console.spec.ts`'s `8 : 9` row count — and makes their `quiesce()` wrong, because it deletes only
   `run_at <= now()` jobs while an exhausted job's `run_at` is up to 6 h in the future: a dev machine's own
   dead job would turn «a quiet database fires nothing» red. Separate, none of those moves.
2. **`platform_job_health()`'s `failed` gains `and j.locked_at is null`** (`create or replace`, same signature,
   same columns) so the screen's dead count and the alert's agree — `0076`'s own argument («an operator who
   sees a healthy table and gets paged anyway stops trusting both»). Q3.

No new door for the console: `platform_job_health()` already carries the task and the count through
`assert_platform_admin()`.

### W11.7 The worker

- `worker/src/platform/alerts.ts` (mine): `EXHAUSTION_ALERT = "job_exhausted"`, the escalation option, the
  `ConsoleAlertSink` line unchanged in shape (`ALERT FIRED job_exhausted {"exhausted_jobs":1,…}` — counts and
  task names only). `ALERTS` stays the eight.
- ★ **`worker/src/tasks/evaluate_alerts.ts` is not in my list — a request (Q2).** The change is three lines:
  after `sink.apply(rows)` for the eight, `select alert, fired, detail from public.evaluate_job_exhaustion()`
  and `sink.apply()` it. After, so that if the function were ever missing the eight still reach the sink
  before the task throws. Logs a count, never a payload. No new task, no registration, no crontab line.

### W11.8 What `main`'s old worker does between the push and the redeploy

The owner pushes `0143+`, then merges; Railway redeploys from `main` after.

- **Pushed, not merged (old app, old worker):** `evaluate_job_exhaustion()` exists and nothing calls it.
  `platform_job_health()` answers the same columns to `main`'s SCR-084; the only difference is that a job
  **running** its last attempt no longer counts as failed. No error path, nothing to survive.
- **Merged, Vercel first, worker second:** the new app reads nothing new (it reads `platform_job_health()`, as
  `main` did). The new worker calls a function that has existed since the push. The reverse order (worker
  before SQL) cannot happen under the owner's order; if it did, the eight still fire and the task throws once
  a minute until the push — loud, not silent.
- **On the first new-worker tick** the alert fires for whatever production has already lost. That is the
  point, and it is why the owner's order should start with the read in W11.5 — so the first page is expected,
  not a surprise. (A production read is the owner's to run.)

### W11.9 Tests — all new files, no existing assertion moves

`tests/rls/alerts-exhausted.test.ts` (each case in a rolled-back transaction; every case first deletes
exhausted jobs **inside** the transaction, since `graphile_worker` is shared state):

| Case | Asserts |
|---|---|
| `RPC-evaluate_job_exhaustion.worker_only` | an org member, a moderator, an org admin, a platform admin (as `authenticated`) and `anon` are refused `42501`; `service_role` answers |
| `.quiet` | no exhausted job → one row, `fired false`, `exhausted_jobs 0` |
| `.fires` | an `add_job('record_survey_response', …)` driven to `attempts = max_attempts`, unlocked → `fired`, `by_task = {record_survey_response: 1}` |
| `.running_last_attempt` | the same job **locked** → not counted |
| `.retrying` | `attempts < max_attempts`, past or future `run_at` → not counted; `queue_stalled` unaffected either way |
| `.clears` | `reschedule_jobs(…, attempts => 0)` clears it; `complete_jobs(…)` clears it; two tasks → `tasks 2`, one resolved → `tasks 1`, still fired |
| ★ `.no_payload` | a dead job whose `payload`, `key` and `last_error` each carry a sentinel uuid and a sentinel Arabic string → neither appears anywhere in the row; `detail`'s top-level keys are exactly the four; `by_task`'s keys are task identifiers |
| `.not_installed` | with `graphile_worker` renamed inside the transaction → `{status: not_installed}`, no raise |
| ★ `RPC-platform_job_health.no_org_reader` | org member, moderator, org admin → `not_platform_admin`; `anon` → `42501`; none of them can `select` `graphile_worker._private_jobs` directly (`42501`) — no side door to a payload |
| `RPC-platform_job_health.failed_agrees` | a platform admin reads `failed = 1` for the dead job and `0` for the locked last attempt — the same number the alert counts; no payload, key or error in any column |

`tests/unit/alerts-exhaustion.test.ts`: escalation fires again on a rise, stays quiet on steady and falling,
clears at zero, re-fires once after a restart; without the option an alert still fires once (the eight's
behaviour, asserted again here rather than by editing the existing file).

`tests/components/platform/platform-home-exhausted.test.tsx`: the card lists each task in `<bdi dir="ltr">`
with its count; absent when nothing is dead; absent (and «تعذّر…» said) when the read fails.

`tests/e2e/wave11-platform-exhausted.spec.ts`: seeds one dead `record_survey_response` job through the owner
connection the wave-9/10 specs already use, opens `/app/platform` and SCR-084 at 390 px, asserts the card and
the job-health row, captures `wave11-platform-home-exhausted.png` and `wave11-platform-metrics-exhausted.png`,
removes the job.

★ **One ledger line I expect, and why it is a mock, not an expectation:** `/app/platform/page.tsx` will call
`getJobHealth()`, and `tests/components/platform/platform-home-page.test.tsx`'s `vi.mock` factory does not
list it, so the page would call `undefined`. The factory gains `getJobHealth: vi.fn(async () => [])` — the
same kind as `emails-page.test.tsx`'s wave-10 ledger line («the page binds every action it passes down»).
No assertion changes. If the lead prefers zero edits, the alternative is to carry the dead counts on
`getPlatformTotals()`'s DTO, which the mock already returns without them — I think that couples two unrelated
reads and do not recommend it.

### W11.10 P2 — the accessibility findings

Waiting on the lead's sweep rows for `/app/platform/**`. Each will be fixed in my files with the app's passing
tokens (`DEC-123`), a new test where the finding is behavioural, and a capture beside its wave-8 one.
`node scripts/ui-lint.mjs --strict` shows **none** of my files today (`DEC-166` §1 counts no platform
violation) — I will confirm on the first code commit.

### W11.11 Questions for the lead

1. **Separate function (my recommendation) or a ninth arm of `evaluate_alerts()`?** The ninth arm is the
   tidier catalogue — one list in `11` §3.2 — at the price of four «eight» assertions and a `quiesce()` in
   `main`'s files, each a ledger line with a changed expectation. Either way `11` §3.2 gains the row
   «**Job exhausted** · any job with no attempts left · a permanent failure is otherwise silent — for
   `record_survey_response`, a member's answers», which is your edit.
2. **`worker/src/tasks/evaluate_alerts.ts`** — transfer it to me for this row, or you make the three-line change
   on my written request?
3. **`platform_job_health()`'s `failed` excluding a running last attempt** — approve, or leave `0076` as it is
   and let the screen and the alert differ by at most the jobs running this second?
4. **Four days to exhaust.** Every job has graphile's 25 attempts, so this alert fires ≈ 4 days after
   `record_survey_response` first fails. Shortening that (`p_max_attempts` on `submit_survey_response()`'s
   enqueue, `0137`, `event`'s function you hold) is a behaviour change outside my files and I do not propose it
   — but if the owner wants to hear sooner, that is the lever, not a second threshold here.
5. **Retention.** A dead `record_survey_response` job keeps its answers (no member) in `graphile_worker` until
   someone resolves it; `12` §5.3 has no period for queue rows. I think «until resolved» is right, since that
   is the recovery path — recorded so it is a decision and not an accident.

## Wave 11 — P1 as built (2026-09-22), after sync 1's rulings

Sync 1 approved the plan: Q1 a separate function; Q2 `worker/src/tasks/evaluate_alerts.ts` transferred to me for
this row; Q3 `failed` gains `locked_at is null`; Q4 `max_attempts` left alone (the lead puts «hear sooner» to the
owner); Q5 «until resolved» goes into `12` §5.3 and the runbook below into `11` §3.3.

**Two departures from the plan, both smaller:** `detail` has **three** keys, not four — `newest_exhausted_seconds`
is gone, because graphile 0.18 no longer maintains `_private_jobs.updated_at` (no trigger; read on the local
database: three dead jobs whose `updated_at` is their creation time), so an «age since exhaustion» would be a
wrong number. And the home reads a new DAL function, **`listExhaustedJobs()`**, not `getJobHealth()`:
`getJobHealth()` answers `[]` when the read fails, and the home must tell a failed read from «nothing dead».

### Files — for promotion

| File | What |
|---|---|
| `supabase/proposed/platform/0011_job_exhausted_alert.sql` | `evaluate_job_exhaustion()` (new, `service_role` only) · `platform_job_health()` re-created, same signature and columns, `failed` gains `and j.locked_at is null` (its ACL is kept by `create or replace`) |
| `worker/src/platform/alerts.ts` | `EdgeTriggered`'s optional per-alert escalation; `EXHAUSTION_ALERT`, `ESCALATE`. `ALERTS` stays the eight |
| `worker/src/tasks/evaluate_alerts.ts` | reads `evaluate_job_exhaustion()` **after** the eight reach the sink; an empty or missing reading throws |
| `src/lib/dal/platform.ts` | `listExhaustedJobs()` — task and count from `platform_job_health()`, `null` on a failed read |
| `src/app/[locale]/app/platform/page.tsx` | the «مهام استنفدت محاولاتها» card in «يحتاج انتباهك»; the heading's count includes it; a failed read is said and blocks the all-clear |
| `src/messages/{ar,en}/platform.json` | five `home.*` keys, `exhaustedJobs` in all six Arabic forms |
| `tests/rls/alerts-exhausted.test.ts` | **8 of 8** alone (`npm run test:rls -- tests/rls/alerts-exhausted.test.ts`) |
| `tests/unit/alerts-exhaustion.test.ts` | 7 cases — escalation, restart, the eight unchanged, the task's order and its throw |
| `tests/components/platform/platform-home-exhausted.test.tsx` | 6 cases, axe included |
| `tests/e2e/wave11-platform-exhausted.spec.ts` | 2 cases, two captures — **not run**: it needs a production build carrying the page (a question to the lead) |

### 03 §8.2 rows

| Row | Case |
|---|---|
| `RPC-evaluate_job_exhaustion.worker_only` | `service_role` only — an org member, a moderator, an org admin, a platform admin and `anon` are refused on the grant |
| `RPC-evaluate_job_exhaustion.fires` | one row, `job_exhausted`; fired while any job has no attempts left and is not running; `detail` is `exhausted_jobs`, `tasks`, `by_task` (identifier → count) |
| `RPC-evaluate_job_exhaustion.running_last_attempt` | a job locked on its last attempt is not counted; a job with attempts left never is |
| `RPC-evaluate_job_exhaustion.clears` | rescheduling or completing every dead job clears it; resolving one of two tasks leaves it firing |
| `RPC-evaluate_job_exhaustion.no_payload` | nothing from a job's payload, key or last error appears anywhere in the row |
| `RPC-evaluate_job_exhaustion.not_installed` | without the `graphile_worker` schema it reports `not_installed` rather than raising |
| `RPC-platform_job_health.failed_agrees` | `failed` counts exactly the jobs the alert counts — a job running its last attempt is not failed |
| `RPC-platform_job_health.no_org_reader` | an org member, moderator and admin are refused `not_platform_admin`, `anon` on the grant, and none of them can select `graphile_worker._private_jobs` |

### The untouched-suite ledger line (approved at sync 1)

| File | Owner, commit | Why | Expectation changed? |
|---|---|---|---|
| `tests/components/platform/platform-home-page.test.tsx` | `platform`, this commit | its `vi.mock("@/lib/dal/platform")` factory gains `listExhaustedJobs: vi.fn(async () => [])` — the home now awaits a third read, and a factory without it makes vitest throw on the import | **no** — every assertion is as it was, and with `[]` the page renders exactly what it rendered |

### The runbook, for `11` §3.3 (the lead's edit)

> **A job that used its last attempt.** `job_exhausted` fires while any job has no attempts left and is not running,
> and clears only when each one is resolved; there is no time window. Every job has graphile's default 25 attempts,
> so a job exhausts about four days after its first failure. The console shows the task and a count, never a
> payload; resolving is operations, not a console action (DEC-014).
>
> 1. **Read which tasks and how many**, on the linked project:
>    `select t.identifier, count(*) from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id where j.attempts >= j.max_attempts and j.locked_at is null group by 1;`
> 2. **Read why, for that task only**: `select j.id, j.last_error from … where t.identifier = '<task>' and j.attempts >= j.max_attempts and j.locked_at is null;` — never `select *` (the payload of `record_survey_response` holds answers).
> 3. **Fix the cause**, ship it, then **replay**: `select graphile_worker.reschedule_jobs(array[<ids>]::bigint[], attempts => 0);` Every job is idempotent (§1.3); `record_survey_response()` writes once per `response_id`.
> 4. **Or discard**, when the job cannot be recovered: `select graphile_worker.complete_jobs(array[<ids>]::bigint[]);` For `record_survey_response` that loses the answers for good while the register still says «أجبت» — record the decision.
>
> The alert clears on the next minute's evaluation after the last one is resolved; a new dead job while it is open fires again.

**What `main`'s old worker does between the push and the redeploy:** nothing calls `evaluate_job_exhaustion()`, and
`platform_job_health()` answers `main`'s SCR-084 with the same columns — the only difference is that a job running its
last attempt stops counting as failed. The new worker calls a function that has existed since the push.

**Local note for the lead:** this machine's database holds three dead `issue_certificates` jobs (`max_attempts 3`,
from 2026-09-21). The new alert will fire on them the first time a worker runs this code locally, and so will the home
card — that is the alert working, not a bug.

## Wave 11 — P2: Prose-dependent screens (the owner's rule, 2026-09-22)

The copy stays as it is. Each row names a screen whose meaning depends on a paragraph, and the affordance that
could carry that meaning instead in a later wave. I found these by reading every `platform.json` string longer
than a sentence, before any sweep row arrived. Fixes that are not about prose go through P2 as usual.

| Route | Message key | What depends on it | The affordance that could carry it instead |
|---|---|---|---|
| `/app/platform/impersonate` (SCR-085) | `impersonate.honest` | that a session is logged in the org's own audit log, that the org's admins see it, and that it **opens no org screen** (`DEC-055` C) | a fixed «مُسجَّل لدى المؤسسة» badge on the start button and on the active-session card; the org's screens shown as locked items rather than described |
| `/app/platform/impersonate` | `impersonate.tokenTail` | that an automatic expiry leaves the claim on the token for up to 15 minutes, and ending it yourself drops it now | a countdown on the active card that goes on after expiry («تنتهي صلاحيتها في المتصفح خلال 12 دقيقة»), with «أنهِ الآن» as its primary action |
| `/app/platform/impersonate` | `impersonate.intro` | that the 4-hour ceiling is a database constraint | a duration control whose maximum is 4 h and says so at the limit, not in the intro |
| every `/app/platform/**` (the shell) | `shell.note` | the console's whole model: no data plane, org screens closed to a platform account, break-glass bounded and audited | a persistent «بلا بيانات مؤسسات» status chip in the console header that opens the explanation on demand |
| `/app/platform/orgs` (SCR-080) | `orgs.deleteHint` | the difference between suspend (reversible) and delete (irreversible) | two actions set apart in the menu, delete in a danger group with «لا رجعة» on its label; the slug typed back already enforces it |
| `/app/platform/orgs/[id]/domains` (SCR-082) | `domains.removeConfirmBody` | that removing a domain stops new memberships and leaves existing members as they are | the confirm dialog's two outcomes as a short list («يتوقف: …» / «يبقى: …») rather than a sentence |
| `/app/platform/templates` (SCR-083) | `templates.intro`, `templates.promoteIntro` | that the library is managed, not authored, and that promotion is a **copy** later org edits never reach | no «تحرير» action anywhere on the screen (already true), and the promote dialog showing «نسخة» with the version number frozen beside it |
| `/app/platform/templates` | `templates.floorNote` | why the last default of a purpose has no retire action | a disabled retire item with its reason as the item's description, instead of an absent item explained elsewhere |
| `/app/platform/metrics` (SCR-084) | `metrics.jobsIntro` | that oldest-pending is the number that shows a stalled queue | the oldest-pending figure styled as the row's lead figure, with the threshold drawn beside it |
| `/app/platform` (home) | `home.exhaustedIntro` (new, P1) | that a dead job will not retry by itself, and its payload is kept for a replay but not shown | a «يُعاد بعد الإصلاح — عمليات» tag on the card, pointing to the runbook, rather than a sentence |

This list covers what I found by reading, before any sweep rows. The sweep can add to it, and I will add a row for
any finding that turns out to be about copy.

---

## Wave 14 plan (2026-09-27) — Google's photo copied, never hotlinked (`DEC-180` §3, `DEC-181`, M16)

`REQ-PRF-008` (the import half), `REQ-PRF-009`, `REQ-PRF-011`, contract 4. Written before any code, measured on
`ba3ffe7`. **No code and no test until sync 1.** `DEC-099` read in full; it stands, and nothing below renders
`members.avatar_url` or carries it to a browser.

### W14.0 Measured — where the brief and the tree disagree

1. ★ **A Google URL still reaches a browser today, after `92953c8`: `/app/me`.** `getMe()` (`lib/dal/members.ts:44`)
   returns `avatarUrl: m.avatar_url`, which is Google's URL. `app/me/page.tsx:47` hands the **whole** `SelfProfile` to
   `ProfileForm`, a `"use client"` component (`components/me/profile-form.tsx:1`, `:44`), so the URL is serialised
   into `/app/me`'s RSC payload for every member who has one. It is text only, and nothing fetches it, but under rule
   2 it is a defect. **It needs a one-line fix in `members.ts:44`, the lead's as custodian.** Either
   `avatarUrl: null` now, as L0 did for comments, or contract 4's expression in L2. I recommend closing it now,
   the way L0 did.
2. ★ **The 303 target is outside `img-src`, and the CSP is report-only.** `proxy.ts:131` sets
   `content-security-policy-report-only`, and `img-src 'self' blob: data:` (`:148`) does not list the Supabase
   origin. Every signed-URL image the product draws today is already a reported violation: photos
   (`photos.ts:174`), material pages (`materials.ts:509`) and moderation thumbnails (`admin-moderation.ts:246`).
   So a `303` from `/api/avatars/…` to `…supabase.co/storage/v1/object/sign/…` would be reported. The day the CSP
   enforces, it would be blocked. It follows that **removing Google from `img-src` (L3) prevented nothing on its
   own**; `DEC-181` §2 already says the code carriers were the control. There is also a caching cost: a freshly
   minted signed URL is a new URL on every render, so the browser downloads it again every time. → **Q1**: I
   recommend the route **proxies the bytes**, as `/api/brand/[orgId]/logo` does (`route.ts:1-60`). The read runs
   as the viewer, the response comes from our own origin, and a versioned URL can be cached. The DTO type is the
   same either way.
3. ★ **A 404 does not fall back to initials.** `ui/avatar.tsx:73-83`: once `src` is truthy the component draws only
   the `<img>`, with no tint and no initial, and it is a server component with no `onError`. A failed load
   therefore shows an empty 34 px box, which is the «broken frame» `REQ-PRF-010` forbids. My mitigation is that the
   resolver emits an `href` **only** when a copy exists and is readable (W14.4), so a 404 remains possible only in
   a race, for example a member who removes their photo while another member's page is open. **Request R1 to
   `content`:** draw the tint and the initial **under** the image (CSS only, no client JS), so that an image which
   fails to load leaves the initial showing.
4. **The brief says `session.ts` swaps an expression. It carries no avatar.** The shell's value comes from
   `layout.tsx:105` (`getMe`) through `:199` (`avatarUrl={null}`). The shell swap is therefore `members.ts:44` plus
   `layout.tsx:199` → `me?.avatarUrl ?? null`, both the lead's.
5. **«The member profile draws our copy» needs a new expression in a page, not just a DAL swap.**
   `members/[id]/page.tsx:51` draws `<Avatar … size={96}>` **with no `src`**. The ratings list
   (`admin/sessions/[id]/attendance/page.tsx:368-372`) draws no avatar at all. Today only the comment and the
   account menu pass a `src`, and both pass `null`. The profile needs `src={profile.avatarUrl}` (the lead, as
   custodian of `sessions`). Ratings need nothing drawn: the DTO swaps, and no placement is added.
6. **The session cookie carries Google's URL.** `0006`'s hook does not touch `user_metadata`, so the access token
   carries `user_metadata.avatar_url` and `picture`, and `@supabase/ssr` keeps the session, including `user`, in
   the `sb-…-auth-token` cookie. It is the member's own value, in their own cookie, and nothing fetches it.
   **«No response anywhere carries a Google image URL» is attainable for response bodies** (HTML, RSC, JSON,
   realtime), which is what my spec asserts. It is not attainable for `Set-Cookie` without an auth-hook change
   (the lead's `0006`). → **Q6**
7. **PostgREST still serves the source to any member who asks.** The column grant (`0004:305`),
   `members_member_view` (`0004:319`) and `me()` (`0005:203`) all expose `avatar_url` to `authenticated`. No app
   code does this from a browser, but a member's own JS could fetch colleagues' Google URLs. It cannot be revoked
   in the push that precedes the merge: `main`'s `members.ts:61` and `ratings.ts:253` select it from the view,
   and would get `42501`. → **Q5**: a revoke migration **after** the merge.
8. **`DEC-099`'s «supersedes the `^https://` check» should not happen.** `0004:243`'s check and
   `provision_member()`'s own guard (`0005:125`) stop a non-https source from ever reaching the job. The column is
   still the source, so **keep the check**. ★ The source is also **member-controllable**:
   `supabase.auth.updateUser({ data: { avatar_url } })` writes `raw_user_meta_data`, and `provision_member()`
   (`0005:124`) copies it on the next sign-in. The job's host allowlist is therefore the **SSRF control**, not a
   tidy-up.
9. **`DEC-099` and `DEC-180` differ on two small points; I follow the later one.** `DEC-099` puts the path in
   `packages/storage-paths/src/content.ts`; `DEC-180` and the map put it in a new `avatar.ts`. `DEC-099` has
   «derivatives by the existing worker job»; `11` §2.4 has a new `JOB-import_avatar`.
10. **Google's `picture` size is not measured.** My aggregate read of production (host and size suffix only, no
    URL) was refused by the permission layer, so I did not retry it. Google's OIDC `picture` normally ends in
    `=s96-c` (96 px, square-cropped), and `=sN-c` selects the size. The job asks for `=s192-c`. It logs the
    decoded dimensions on every run, so the first real import measures it. → **Q10** asks the lead or owner to run
    `select substring(avatar_url from '=s[0-9]+[^/]*$') as suffix, count(*) from public.members group by 1`. It
    returns no personal data.
11. **`provision_member()` has one definition** (`0005:101`); no later migration re-creates it. `me()` is also
    `0005`'s. `anonymise_members()` is `0073:158`. `build_data_export_payload()` was last re-created by `0135`, and
    `main`'s worker stores its payload opaquely.

### W14.1 Schema — named for the lead to land in `0156`, never written by me

| Object | Shape | Why |
|---|---|---|
| **enum** `public.avatar_import_answer` | `('accepted', 'declined')` | the answer to «نستخدم صورتك من Google؟». A Postgres enum, singular |
| `members.avatar_import` | `public.avatar_import_answer`, **nullable**, no default | `null` = not answered, so the prompt shows. **Not** in any client grant. It is read through `my_avatar()` and written through `set_avatar_import()` |
| `members.avatar_version` | `bigint`, **nullable** | the version of **our** copy, the epoch milliseconds at copy time. `null` = no readable copy, so initials. It never repeats, so a declined-then-accepted member never reuses a URL a browser cached as immutable. ★ **Invariant, held by the writers:** non-null ⇒ `avatar_import = 'accepted'` and both objects stored |
| grant | `avatar_version` **appended** to `0004:305`'s `grant select (…) on public.members to authenticated` | readers select it, and `comments.ts` embeds it through `author:members(…)` |
| view | `members_member_view` re-created with `avatar_version` **appended last** (`create or replace view` allows a trailing column) | `members.ts` and `ratings.ts` read the view. `main` selects named columns, so this is additive |
| `me()` | re-created in the same file with one key appended, `'avatar_version', m.avatar_version` | `getMe()` resolves the shell's and `/app/me`'s avatar without a second query. `main`'s `getMe` ignores an unknown key |
| **bucket** `avatars` | private; `file_size_limit` 262144; `allowed_mime_types` `{image/webp}` | our copy only, WebP derivatives only. No SVG can be stored (invariant 11) |
| **storage policy** `avatars_storage_read` | `for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.auth_org_id()::text and (storage.foldername(name))[2] = 'members' and exists (select 1 from public.members m where m.id::text = (storage.foldername(name))[3] and m.org_id = public.auth_org_id() and m.avatar_version::text = (storage.foldername(name))[4]))` | same org, and **only the current version**. A decline or an anonymisation makes the object unreadable **in the same statement** that clears the version, before the job deletes it («removal is immediate», `REQ-PRF-008`) |
| no write policy | none for any client role | only the worker writes and deletes, holding `service_role` (invariant 7) |
| `03` §8.2 rows | `POL-avatars_storage_read.same_org`, `.other_org_refused`, `.stale_version_refused`, `.anonymised_refused` | `policy-diff` |

**Where our copy lives:** `avatars/{org_id}/members/{member_id}/{version}/{96|192}.webp`, built only by
`packages/storage-paths/src/avatar.ts`. No original is kept. The 192 px derivative is the largest copy of a face we
hold, which keeps the personal data to the minimum `DEC-099` needs. **R2 to the lead:** `Bucket` in
`packages/storage-paths/src/guards.ts:55` gains `"avatars"`, and `index.ts` gets its export line and
`storagePaths.avatar`. Until then, `avatar.ts` returns its own `{ bucket: "avatars"; path }`.

No new table, so there is no new entity for the isolation sweep. `registrations` is untouched.

### W14.2 My SQL — `supabase/proposed/platform/0010_avatar_import.sql` (functions and one trigger; no DDL)

| Function | Caller | Does |
|---|---|---|
| `set_avatar_import(p_answer public.avatar_import_answer) returns jsonb` | `authenticated`, self (`assert_active_member()`) | writes `avatar_import`. On `declined` it sets `avatar_version = null` **in the same statement**. Audits `member.avatar_import_answered` `{answer}`. When there is a source, or a copy to delete, it enqueues `import_avatar` `{member_id}` under key `avatar:{member_id}`, queue `convert`, 3 attempts. Returns an envelope (`ok` · `no_source`) and never raises after its write (`DEC-043`) |
| `my_avatar() returns jsonb` | `authenticated`, self | `{answer, has_source, version}` for the prompt and `/app/me/privacy` |
| `avatar_job_target(p_member uuid) returns jsonb` | `service_role` only | `{org_id, answer, source_url, version, anonymised}`, which the job reconciles against |
| `record_avatar_copy(p_member uuid, p_version bigint, p_source text) returns jsonb` | `service_role` only | sets `avatar_version = p_version` **only if** `avatar_import = 'accepted'`, `avatar_url = p_source` and `anonymised_at is null`. Otherwise it returns `stale`, and the job deletes what it just uploaded |
| trigger `members_avatar_source_changed` (after update of `avatar_url`, `when old.avatar_url is distinct from new.avatar_url and new.avatar_import = 'accepted'`), definer | fires under `provision_member()` | **re-copies on a changed source** (`REQ-PRF-001`'s refresh) **without touching the lead's `provision_member()`** |
| `anonymise_members()` re-created from `0073:158` | worker | additionally sets `avatar_version = null, avatar_import = null` and enqueues `import_avatar` for each member who had either. **The summary's keys are unchanged** (`anonymised`, `after_days`) |

Grants: the two self functions go to `authenticated`, revoked from `public` and `anon`. The two worker functions go
to `service_role` only. `definer-exposure` stays as it is, because nothing is added to `anon`. `build_data_export_payload()`
is **not** changed: the worker adds the picture (W14.6), so the SQL payload's keys, which `privacy.test.ts:70` and
`data-export-surveys.test.ts:73` pin, do not move.

### W14.3 `JOB-import_avatar` — `worker/src/tasks/import_avatar.ts` (name confirmed; registration is the lead's)

**One reconcile job, keyed `avatar:{member_id}`.** It makes storage match the row, whatever triggered it: a yes, a
no, a changed source, an anonymisation, or a retry. Because it reconciles, the key's `replace` mode is exactly
right.

1. It reads `avatar_job_target()`. If the member is gone or anonymised, or the answer is not `accepted`, it
   **deletes everything under `{org}/members/{member}/`** and returns.
2. **Fetch rules.** The URL is parsed with `new URL()`. The protocol must be `https:`, the hostname must be an
   **exact** member of `{lh3,lh4,lh5,lh6}.googleusercontent.com` (→ **Q8**), and there must be no userinfo and no
   port. The request is `redirect: "manual"`, and each `Location` is re-validated against the same rules, **at most
   2 hops**, never off the host set. Headers: `Accept: image/jpeg, image/png`, which stops Google negotiating
   WebP, with no cookie, no `Referer` and a fixed UA. A trailing `=s<N>(-c)?` becomes `=s192-c`.
   `AbortSignal.timeout(10_000)`.
3. **Byte cap of 2 MiB**, enforced on `content-length` **and** on the streamed body, so a missing or lying header
   does not get past it. Anything but a `200` is refused.
4. **Sniffed on content** with `sniffImageKind()` from `worker/src/content/exif.ts`, **imported, never edited**.
   `jpeg` and `png` pass. `svg`, `webp` and `unknown` are refused (→ **Q9** on WebP). Then
   `stripImageMetadata()` runs, and `assertsNoExifRemains()` must hold. The decoded width and height are logged,
   which is the running measurement of W14.0 §10, and anything over 4096 px on either side is refused before any
   binary sees it.
5. **Derivatives come from `cwebp` in the image** (`worker/Dockerfile`, `DEC-181` §4). With a centred square
   `-crop`, it runs `cwebp -quiet -metadata none -q 82 -crop x y s s -resize 96 96` and again at `192 192`, under
   `withTempDir()` from `content/pdf.ts` (imported). **No npm package and no Dockerfile change.**
6. It uploads both files to `avatars/{org}/members/{member}/{version}/`, then calls `record_avatar_copy()`. On
   `stale` it deletes the new version and returns; a newer job is already queued. On `recorded` it deletes
   **every other version** under the member's prefix.

**Failure modes: a failure never sets a version, so it leaves initials, or the previous copy.**

| Case | Outcome |
|---|---|
| host not allowlisted · not https · redirect off-host or > 2 hops · userinfo/port | warn, return (no retry) |
| `404` / `410` / any other `4xx` | warn, return |
| `5xx`, network error, timeout | throw → retry (3 × 60 s) |
| over 2 MiB · over 4096 px · `svg` / `webp` / `unknown` · EXIF residue after the strip | warn (EXIF: error), return |
| `cwebp` fails · upload fails | throw → retry. Partial objects sit under an unrecorded version, which the policy cannot read, and the next run deletes them |
| `record_avatar_copy` → `stale` | delete the new version, return |

### W14.4 Contract 4 — the resolver and the route (★ published day one)

```ts
// src/components/privacy/avatar-href.ts — PURE, no `server-only`, so the realtime comment list can use it (Q2)
export type AvatarSize = 96 | 192;
export interface AvatarSource { id: string; avatarVersion: number | null | undefined }
/** `/api/avatars/{id}?v={version}&s={size}`, or null when there is no readable copy. */
export function avatarHref(member: AvatarSource, size?: AvatarSize /* = 96 */): string | null;

// src/lib/dal/avatars.ts — `import "server-only"`; re-exports avatarHref, AvatarSize, AvatarSource
export interface MyAvatar { answer: "accepted" | "declined" | null; hasSource: boolean; href: string | null }
export async function getMyAvatar(locale: string): Promise<MyAvatar>;
export async function setMyAvatarImport(locale: string, answer: "accepted" | "declined"): Promise<{ status: "ok" | "no_source" | "failed" }>;
export async function readAvatar(memberId: string, version: string, size: AvatarSize): Promise<Uint8Array | null>; // the route's read
```

**Every reader keeps `avatarUrl: string | null`.** Each reader changes its select (`avatar_url` → `avatar_version`)
and swaps one expression:

| Reader | Owner | The swap |
|---|---|---|
| `members.ts:44` `getMe` | lead | `avatarUrl: avatarHref({ id: m.id as string, avatarVersion: m.avatar_version as number \| null })` (needs `me()`'s key, W14.1) |
| `members.ts:61,69` `getMemberProfile` | lead | select `avatar_version` · `avatarHref({ id: data.id, avatarVersion: data.avatar_version }, 192)`, plus `src={profile.avatarUrl}` at `members/[id]/page.tsx:51` (W14.0 §5) |
| `ratings.ts:253,260` | lead | select `avatar_version` · `avatarHref({ id: r.member_id, avatarVersion: m.avatar_version })` |
| `comments.ts:~118,126` | `content` | embed `avatar_version` · `avatarHref({ id, avatarVersion })` |
| realtime `comments_broadcast()` (`0155`) | lead's SQL, `content`'s client | `authorAvatarUrl` **stays null** for `main`'s client. A new `authorAvatarVersion` key is appended, and `comment-list.tsx:43` calls `avatarHref`. There is only one URL shape, and SQL never builds it (Q3) |
| `layout.tsx:199` | lead | `avatarUrl={me?.avatarUrl ?? null}` |

**The route: `GET /api/avatars/[memberId]?v=&s=`** (`runtime = "nodejs"`, outside `proxy.ts`'s matcher). It calls
`getSessionState()`, **not** `requireSession()`: an image request that gets a redirect to `/sign-in` is a broken
frame, so every non-member answer is a plain `404`. That includes a platform admin with no member row, per
`DEC-057`. Zod: `memberId` uuid, `v` digits, `s` ∈ {96, 192}. It reads `members.avatar_version` for the id **as
the viewer**, so `members_read_org` makes another org's member invisible. `null` → `404`. It then downloads the
object **as the viewer**, and `avatars_storage_read` re-checks the org and the current version.
- **Recommended (Q1): proxy the bytes.** `200 image/webp` with `content-length`, `x-content-type-options: nosniff`
  and `content-security-policy: default-src 'none'; sandbox`. The cache header is
  `private, max-age=86400, immutable` when `v` is current, and `private, no-cache` when `v` is stale and the
  current copy is served.
- **If the lead holds the brief:** `303` to `createSignedUrl(path, 300)` minted as the viewer, with
  `Cache-Control: no-store`.
- Any refusal, whether another org, no copy, a bad id or no session, gets the **same** `404` and no body anyone
  could learn from. No `service_role` is involved (invariant 7).

### W14.5 The prompt and `/app/me/privacy` — Arabic first

**`src/components/privacy/avatar-import-prompt.tsx`** is a server component, `AvatarImportPrompt({ locale })`, that
the lead slots in. It renders **only** when `answer === null && hasSource`, so **no existing e2e member ever sees
it**: every spec creates users with `user_metadata: { full_name }` alone (`a11y.spec.ts:67` and the rest), which
means the blast radius over the existing suites is nil. It uses one form with two submit buttons,
`name="answer" value="accepted|declined"`, bound to `setAvatarImportAction` in `me/privacy/actions.ts`. That action
calls `revalidatePath(`/${locale}/app`, "layout")` so that the shell re-reads. ★ **It never previews the Google
photo**, because a preview would be the hotlink. It shows the member's initial instead. **Placement (Q7):** the
constraints are inside `#main`'s landmark (the a11y sweep), in its own `Suspense` with a `null` fallback so that it
never delays a page, and with no `role="status"`. I recommend the top of `/app` (the timeline), beside the
existing `companyMissing` panel (`sessions-timeline.tsx:41`), rather than on every screen. The lead rules on it.

`privacy.avatar.*` in `messages/ar/privacy.json`, written first:

| Key | ar | en |
|---|---|---|
| `prompt.title` | نستخدم صورتك من Google؟ | Use your Google photo? |
| `prompt.body` | ننسخ صورة حسابك في Google إلى المنصة لتظهر بجانب اسمك لأعضاء مؤسستك. يمكنك تغيير اختيارك لاحقًا من صفحة الخصوصية. | We copy your Google account photo onto the platform so it shows beside your name to members of your organisation. You can change this later on the privacy page. |
| `prompt.accept` | نعم، انسخ صورتي | Yes, copy my photo |
| `prompt.decline` | لا، أبقِ الحرف الأول | No, keep my initial |
| `section.title` | صورتك الشخصية | Your profile photo |
| `section.ready` | تظهر نسختنا من صورتك في Google بجانب اسمك. | Our copy of your Google photo shows beside your name. |
| `section.pending` | لم تُنسخ صورتك بعد. | Your photo has not been copied yet. |
| `section.initials` | يظهر الحرف الأول من اسمك. | Your initial shows beside your name. |
| `section.noSource` | لا توجد صورة في حساب Google لننسخها. | Your Google account has no photo to copy. |
| `section.use` | استخدم صورتي من Google | Use my Google photo |
| `section.retry` | أعد المحاولة | Try again |
| `section.remove` | أزل صورتي | Remove my photo |
| `page.exportIntro` (changed) | …وسجل نقاطك وشهاداتك، وصورتك الشخصية إن نسختها المنصة. ويضم أيضًا… | (mirrored) |

The `/app/me/privacy` section sits before the export section. It shows the `<Avatar>` at 96 px, drawn from
`getMyAvatar().href` or as initials, plus one sentence and one button, bound by `.bind(null, locale, answer)`
(`DEC-159`). «أزل صورتي» takes effect immediately because the policy stops the read in the same statement.
«أعد المحاولة» submits `accepted` again. **No `role="status"` element**, because `privacy.spec.ts:324`'s
`getByRole("status")` is strict. There are no interpolated values, and the numerals are Western.

### W14.6 `REQ-PRF-011` and `REQ-NFR-014`

- **Anonymisation:** `anonymise_members()` (W14.2) clears the version and the answer, and the policy refuses the
  read at once. The enqueued reconcile job deletes every object under the member's prefix.
  `worker/src/tasks/anonymise_members.ts` stays as it is.
- **Export:** `build_data_export.ts`, after `build_data_export_payload()`, reads `avatar_job_target()`. If there is a
  version, it downloads `192.webp` (`content/storage.ts`'s `downloadObject`, imported) and appends
  `avatar: { content_type: "image/webp", size: 192, data_base64 }` before `record_data_export()`. ★ It **never**
  includes `members.avatar_url`, so the export stays a response with no Google URL in it. A download failure
  throws, and the retry follows the existing path.
- **Prefixes:** `{ name: "avatars", orgPrefixed: true }` joins `BUCKETS` (`worker/src/platform/storage.ts:92`). One
  line covers **both** `assert_storage_prefixes` **and** `delete_org`, which iterates the same list (`delete_org.ts:33`,
  `:58`), so a deleted org's avatars go with it and `delete_org.ts` needs no edit. I recommend a deeper check for
  `avatars` as well: segment 3 must be a member **of that org**. It needs one more `service_role` definer,
  `avatar_member_orgs()`, so it is optional (Q11).

### W14.7 Every path that carries `members.avatar_url` toward a browser today (`ba3ffe7`)

| # | Path | State |
|---|---|---|
| 1 | `members.ts:44` `getMe` → `me/page.tsx:47` → `"use client"` `ProfileForm` | ★ **LIVE**: the Google URL is in `/app/me`'s RSC payload (W14.0 §1) |
| 2 | `members.ts:44` `getMe` → `layout.tsx:105` → `:199` | closed (`avatarUrl={null}`); `sessions-timeline.tsx:33` reads only `companyId` |
| 3 | `members.ts:61,69` `getMemberProfile` → `members/[id]/page.tsx` | server-only today (`<Avatar>` has no `src`); becomes a carrier the moment a `src` is added, which is why it swaps first |
| 4 | `ratings.ts:253,260` `getRatingsForAdmin` → `attendance/page.tsx:368` | server-only (the name is rendered, the avatar is not) |
| 5 | `comments.ts:123-126` | closed by `92953c8` (`null`) |
| 6 | realtime `comments_broadcast()` `0016:114,122` | closed by `0155` (`authorAvatarUrl` null) |
| 7 | `admin_list_members()` `0056:45` → `admin-members.ts:41` | server-only; the DTO drops it (`AdminMemberRow` has no avatar) |
| 8 | the column grant `0004:305`, `members_member_view` `0004:319`, `me()` `0005:203`, all via PostgREST | reachable by any member's own JS with their JWT; no app code does it (Q5) |
| 9 | the Auth session cookie and JWT `user_metadata.{avatar_url,picture}` | the member's own value in their own cookie (Q6) |
| 10 | `notifications.ts:707,711` | selects `display_name` only; not a carrier |
| 11 | `build_data_export_payload()` `0073:222` / `0135` | no `avatar_url`; not a carrier, and W14.6 keeps it that way |

Rows 1 and 3–7 are closed by contract 4's swaps, and row 1 today if the lead takes W14.0 §1. After that, **L3 is
safe:** no reader needs Google in `img-src`, and none does today.

### W14.8 Dependencies — none

`cwebp` and the strip are already in the image and in `exif.ts`. The fetch is Node's `fetch`. Nothing goes into
`package.json` or `worker/package.json`, and there is no Dockerfile change.

### W14.9 Existing tests whose expectation moves — each one gets a ledger line in the same commit

| File | Assertion | Why | Owner |
|---|---|---|---|
| `tests/rls/members.test.ts:41` | `Object.keys(rows[0]).sort()` on `members_member_view` gains `"avatar_version"` | the view gains the column (W14.1). **This is the only one** | lead (custodian), in `0156`'s commit |

**Measured, and not moving:** `rpcs.test.ts:43,79` (the source is still refreshed); `retention.test.ts:53,137-188`
(the summary's keys and counts are unchanged); `privacy.test.ts:70` and `data-export-surveys.test.ts:48,73` (the
SQL payload is unchanged); `platform-tasks.test.ts` (its fake returns `{ rows: [] }` for unknown SQL, so no
avatar is found); `sessions-member-profile.test.ts:27` (no assertion on `avatarUrl`; `avatarHref` returns `null`
for `undefined`); `comments-no-hotlink.test.ts` (`authorAvatarUrl` stays null); `profile-form.test.tsx:26` and
`comments*.test.tsx` (fixtures are `null`, and the type is unchanged); `definer-exposure` (nothing is added to
`anon`); `privacy.spec.ts` (no `role="status"` is added; its locators are all named).

**New files only:** `tests/rls/avatar-import.test.ts` (★ another org's member is refused our copy, a stale
version is refused, anonymisation refuses the read and enqueues the delete, the self functions refuse another
member, the worker functions refuse `authenticated`, and a changed source re-enqueues for `accepted` only);
`tests/unit/avatar-import-job.test.ts` (every row of W14.3's table, with a fake `fetch`, a fake `cwebp` runner and
storage: the allowlist, off-host redirects, the cap with a lying `content-length`, SVG renamed `.png`, EXIF gone, a
failure sets no version, `stale` deletes); `tests/unit/avatar-href.test.ts`; `tests/unit/avatar-route.test.ts`
(404 for every refusal alike); `tests/components/privacy/avatar-*.test.tsx`;
`tests/e2e/wave14-platform-avatar.spec.ts`. That spec is **M3**: a seeded member with an lh3 source answers
«نعم», and **the spec plays the worker** by uploading a fixture WebP with the service key and calling
`record_avatar_copy`, because CI cannot reach Google. The photo is then visible in the account menu. A second
member answers «لا» and sees initials. Both are captured at 390 px as
`.qa-shots/rtl/wave14-platform-{account-menu,privacy}-{photo,initials}.png`. ★ **It asserts that no response body
on `/app`, `/app/me`, `/app/me/privacy` or `/app/members/[id]` contains `googleusercontent`**, by collecting
`page.on("response")` bodies, including RSC.

### W14.10 What `main`'s worker does in the gap

- **Pushed, not merged** (the new schema, `main`'s app, `main`'s worker): the columns are nullable and unanswered,
  and `main` never writes them. The view's trailing column and `me()`'s extra key are both ignored. The
  re-created `anonymise_members()` enqueues only for members with an answer or a version, and there are none. The
  trigger fires only for `accepted`, which is nobody. The bucket is empty. **Nothing moves.**
- **Merged, Vercel live, Railway not yet reconnected** (the standing owner step): members can answer, and
  `import_avatar` jobs queue. **graphile-worker 0.18 only fetches task identifiers it has registered**, so `main`'s
  worker leaves them alone rather than failing them. Members see initials. An export built by the old worker has
  no picture, but no copies exist yet either. When the new worker boots, the queue drains, and because the job
  reconciles, jobs replaced in the meantime do no harm.

### W14.11 Questions for the lead (sync 1)

1. **Proxy or `303`?** (W14.0 §2) I recommend the proxy: it stays on our origin and inside `img-src`, it can be
   cached, and no signed URL ever reaches a browser.
2. **Where the pure `avatarHref` lives.** It has to be importable from `"use client"`, and `lib/dal/*` is
   `server-only`. My proposal is `src/components/privacy/avatar-href.ts`, re-exported by `avatars.ts`.
   `src/lib/avatar-href.ts` would read better, but it is not in my list.
3. The realtime payload: append `authorAvatarVersion` and keep `authorAvatarUrl` null (the lead's SQL, `content`'s
   client).
4. `me()` gains `avatar_version` (the lead's function, the same file as `0156`)?
5. When is `avatar_url` revoked from the grant, the view and `me()`? After the merge, once `main` no longer
   selects it. A second push this wave, or wave 15's first migration?
6. The cookie and JWT `user_metadata`: accept it and scope the assertion to response bodies, or strip
   `avatar_url`/`picture` in `0006`'s hook? (That still leaves the cookie's `user`.)
7. The prompt's slot: the shell, or `/app`'s timeline (my recommendation)?
8. The host allowlist: `lh3` only, or `lh3`–`lh6`?
9. Google negotiates WebP. Refuse it (the brief: «PNG or JPEG in») and force JPEG through `Accept`, or accept it?
   `cwebp` reads WebP.
10. Run W14.0 §10's aggregate read, which returns no personal data?
11. The `avatars` member-in-org check (W14.6) needs one extra definer. Wanted?
12. **Requests:** R1 to `content`, initials under the `<img>` (W14.0 §3). R2 to the lead: `guards.ts`' `Bucket`,
    and `index.ts`' export and `storagePaths.avatar`. R3 to the lead: `members/[id]/page.tsx:51`'s `src`
    (W14.0 §5).
13. **The `/app/me` carrier** (W14.0 §1): close it now with `avatarUrl: null` in `members.ts:44`, as L0 did?

### W14.12 Order of work, after sync 1

(1) `avatar.ts`, `avatar-href.ts` and `avatars.ts` with their units, which publishes contract 4 as code.
(2) `0010_avatar_import.sql` and `avatar-import.test.ts` via `applyProposed()`, on top of the lead's `0156`.
(3) `import_avatar.ts` and its unit. (4) The route and its unit. (5) The prompt, the privacy section and the
messages, with `ui-lint`. (6) `BUCKETS`, the export, and the anonymise hook. (7) The e2e and the captures, through
the gate lock. The note says what is done at each step.

---

## Wave 14 — as built (2026-09-27), after sync 1 (`DEC-182`)

CI is blocked (the repo is private, so no runner starts). **The local gates below are the gates.**

| Commit | What | Local gates |
|---|---|---|
| `1dedf42` | `avatarHref()` (contract 4 as code) · `packages/storage-paths/src/avatar.ts` · `worker/src/platform/avatar.ts`: allowlist, redirects, byte cap, sniff, strip, cwebp · `avatars` and `photo-albums` in `BUCKETS` · `privacy.avatar.*` in ar and en | the avatar units 42/42 |
| `e044e1e` | `lib/dal/avatars.ts` · `/api/avatars/[memberId]`, which proxies the bytes read as the viewer, with one 404 for every refusal · `import_avatar.ts`, the reconcile job · the export's 192 px copy (never the source URL) · the prefix assertion's member-in-org check · the prompt, the `/app/me/privacy` section and its action · `proposed/platform/0010_avatar_import.sql` · `tests/rls/avatar-import.test.ts` | tsc clean for these files (the tree's only error was `content`'s WIP `comment-list.tsx:51`) · lint 0 errors · avatar units and components 79/79 · `test:rls` 136 files, 1316 passed (`avatar-import` 14/14) · `ui-lint` strict clean |

**For the lead's promotion (0158):** `0010`'s five functions, the trigger and the re-created `anonymise_members()`. The
`03` §8.2 rows are in the file header. The audit label `admin.audit.actions.member.avatar_import_answered` is needed
in `admin.json` (the lead's) or `admin-audit-labels.test.ts` fails. The `import_avatar` registration is also needed,
along with the prompt's slot, `<Suspense fallback={null}><AvatarImportPrompt locale={locale} /></Suspense>` in `#main`
on the timeline.

**Not done yet:** `tests/e2e/wave14-platform-avatar.spec.ts` (M3) is written and uncommitted. It needs `0158`, the
prompt's slot and L2 (the shell's avatar through `getMe()`) before it can pass. It runs through the gate lock once
those land, and the four captures come from that run.

**Untouched-suite ledger:** none of mine. `members.test.ts:41` was the lead's, in `0157`'s commit.

**M3, run by the lead on production build `c0bd26b` at `0159`:** `tests/e2e/wave14-platform-avatar.spec.ts` is
**10/10 green on phone and desktop**, including the check that no response body contains a `googleusercontent`
URL. The lead opened the captures at full resolution. For «نعم» the account menu shows our copy; for «لا» it shows
the «س» initial. The four captures are `.qa-shots/rtl/wave14-platform-{account-menu,privacy}-{photo,initials}.png`.
**Platform's wave-14 rows (A1–A4, C4, M3) are done**, unless the lead's final gates say otherwise.
