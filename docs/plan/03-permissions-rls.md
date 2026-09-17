# 03 — Permissions and Row Level Security

**Status:** `draft` · **Owns:** the `POL-*` ID space
**Serves:** `REQ-TEN-003`, `REQ-NFR-001`, `REQ-ADM-002`, `REQ-ADM-020`, `REQ-PRF-004`
**Cites:** `02-domain-model.md` (frozen)

> **The rule this document exists to enforce:** cross-org reads must be **impossible**, not
> filtered (D3, `REQ-TEN-003`). Isolation lives in the database. Application code is the second
> line, never the first.

---

## 1. How roles are represented — and why

### 1.1 The decision

**`org_id` is a JWT claim and it is immutable. `org_role` and `status` are claims for reads, but
every privileged write re-reads them from the table.** (DEC-014.)

| Fact | Where it lives at read time | Why |
|---|---|---|
| `org_id` | JWT claim | **Immutable** for the life of the account (`REQ-TEN-004`), so a stale token can never carry the wrong tenant. Isolation therefore never depends on claim freshness — which is the whole point. |
| `member_id` | JWT claim | Immutable, derived at provisioning. Saves a lookup on every policy evaluation. |
| `org_role` | JWT claim **for reads**; **re-read from `members` for privileged writes** | Mutable. A demoted admin holds a valid token asserting `admin` until it expires. |
| `status` | Same | Mutable. A deactivated member's token is likewise stale. |
| `claims_version` | JWT claim, compared against `members.claims_version` on every privileged write | The staleness detector. |

Claims are injected by the **Custom Access Token Hook**. `jwt_expiry` drops to **900 seconds**, so
a stale read-side role corrects itself within 15 minutes, while every write that *matters* corrects
itself immediately.

### 1.2 Why not a table lookup on every read

**Rejected alternative:** a `SECURITY DEFINER` function reading `members` inside every policy.

It is correct, and it costs a lookup on every row of every query in the product — a function call
per row in the worst plans. It also creates a circular dependency: the policy on `members` would
need to call a function that reads `members`. The claim approach pays the freshness cost only
where freshness is load-bearing.

### 1.3 The staleness pattern, written out

Every privileged write goes through an RPC shaped like this:

```sql
create function assert_fresh_admin() returns members
language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
  select * into m from public.members
   where id = (auth.jwt() -> 'app_metadata' ->> 'member_id')::uuid;

  if m is null or m.status <> 'active' then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if m.claims_version <> (auth.jwt() -> 'app_metadata' ->> 'claims_version')::int then
    raise exception 'stale_claims' using errcode = '42501';
  end if;
  if m.org_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = '42501';
  end if;
  return m;
end $$;
```

The client's response to `stale_claims` is to refresh the token and retry once — surfaced to the
member as nothing at all, and to a demoted admin as a permission error, which is the truth.

### 1.4 Super admins have no data-plane access

**No policy in this document contains an `is_super_admin()` disjunct.** (DEC-014,
`REQ-ADM-002`.)

A super-admin escape hatch on every policy reduces "cross-org reads are impossible" to "one claim
is correct", which is a materially weaker guarantee than D3 asks for. Break-glass is **time-bounded
impersonation**: the super admin mints a session that carries an ordinary member's claims, capped
at 4 hours by a table constraint (`ENT-impersonation_sessions`), and the record lands in **the
org's own audit log** where its admins can see it.

The consequence, stated plainly: **a super admin cannot debug an org's data without the org
knowing.** That is the intended property, not a limitation to work around.

### 1.5 The grant discipline

**Every policy needs a matching `grant`.** A policy narrows what a role may do with a privilege it
already has; it cannot confer one. Without the grant, the request fails with `42501` and the
policy looks broken.

This repository has already paid for this lesson. Migration `0002` exists for no other reason than
that `0001` wrote an `insert` policy for `anon` and forgot `grant insert`, so **every single
registration failed in production**.

The rule, therefore: **a migration that creates a policy and no grant does not pass review**, and
CI asserts that every table with a policy has a corresponding grant to `authenticated`.

---

## 2. Helper functions

```sql
-- Claim readers. STABLE, not VOLATILE: the planner may hoist them out of loops.
create function auth_org_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
$$;

create function auth_member_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'member_id', '')::uuid
$$;

create function auth_org_role() returns public.org_role
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_role', '')::public.org_role
$$;

create function is_org_admin() returns boolean
language sql stable set search_path = '' as $$ select auth_org_role() = 'admin' $$;

create function is_staff() returns boolean          -- admin or moderator
language sql stable set search_path = '' as $$ select auth_org_role() in ('admin','moderator') $$;

-- Presenter of a given session. SECURITY DEFINER so the policy on session_presenters
-- does not have to be satisfied in order to evaluate a policy that depends on it.
create function is_presenter_of(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_presenters sp
     where sp.session_id = p_session
       and sp.member_id  = auth_member_id()
       and sp.accepted
  )
$$;

-- The check-in gate. D24 / REQ-CHK-009 in one function, referenced by every
-- right that depends on attendance, so there is exactly one definition of it.
create function has_checked_in(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.check_ins c
     where c.session_id = p_session and c.member_id = auth_member_id()
  )
$$;
```

**`has_checked_in()` is the most important function in this document.** Four separate rights —
attendance points, the right to rate, the attendee certificate, and photo upload — must depend on
the verified check-in event **and nothing else** (D24). Defining it once means they cannot drift
apart, and a change to what counts as a check-in changes all four at the same instant.

---

## 3. Role × resource × action matrix

`✅` allowed · `—` denied · `self` own rows only · `S` via a `SECURITY DEFINER` RPC, never direct
· `agg` aggregates only

| Resource | member | presenter (that session) | moderator | org admin | super admin | anon |
|---|---|---|---|---|---|---|
| `orgs` (own) | read | read | read | read + update | create, suspend | — |
| `org_domains` | — | — | — | ✅ | ✅ | — |
| `org_settings` | read | read | read | ✅ | — | — |
| `companies`, `categories`, `venues`, `tags` | read | read | read | ✅ | — | — |
| `members` | read (tier) | read (tier) | read (tier) | ✅ | — | — |
| own profile | self ✅ | | | ✅ | — | — |
| `proposals` | self ✅ | self ✅ | read | ✅ | — | — |
| `sessions` | read published | read own + edit limited | read | ✅ | — | — |
| `session_state_transitions` | — | read own | read | read | — | — |
| `rsvps` | self ✅ | read session's | read session's | ✅ | — | — |
| `check_in_codes` | — | read own session | read | read | — | — |
| `check_ins` | self read, `S` insert | read session's | ✅ (manual, reason) | ✅ | — | — |
| `check_in_attempts` | — | — | read | read | — | — |
| `materials` | read (phase) | ✅ own session | read | ✅ | — | — |
| `session_tasks` | read | ✅ own session | read | ✅ | — | — |
| `task_form_responses` | self ✅ | read session's | — | read | — | — |
| `comments` | ✅ self, read all | ✅ | remove any | remove any | — | — |
| `reactions` | ✅ self | ✅ | — | — | — | — |
| `photos` | read; insert **only if `has_checked_in`** | ✅ | remove any | remove any | — | — |
| `photo_takedowns` | insert self | — | resolve | resolve | — | — |
| `reports` | insert self | — | ✅ | ✅ | — | — |
| `ratings` | insert/update self **if `has_checked_in`** | **agg only** | — | ✅ full | — | — |
| `survey_templates`, `surveys` and their questions and options | — | — | read | read | — | — |
| `survey_participations`, `survey_responses`, `survey_answers` | **no `select` for anyone** — answer through `submit_survey_response()` **if `has_checked_in`** | — | results through `survey_results()` only, withheld | the same; and the CSV | — | — |
| `points_ledger` | self read, `S` insert | self read | — | read + `S` adjust | — | — |
| `points_balances` | read | read | read | read | — | — |
| `scoring_rules` | read | read | read | ✅ | — | — |
| `badges`, `levels`, `perks`, `streak_rules` | read | read | read | ✅ | — | — |
| `member_badges`, `member_perks` | read | read | read | ✅ | — | — |
| `leaderboard_*` | read | read | read | read | — | — |
| `certificates` | self read | self read | — | ✅ | — | `S` verify only |
| `design_templates` (platform) | — | — | — | read | ✅ | — |
| `design_templates` (org) | — | — | — | ✅ | — | — |
| `design_documents`, `design_assets`, `export_artifacts` | — | read own session's poster | — | ✅ | — | — |
| `fonts` | read | read | read | ✅ add | ✅ | — |
| `notifications` | self ✅ | self | self | self | — | — |
| `notification_preferences` | self ✅ | self | self | self | — | — |
| `notification_templates` | — | — | — | ✅ | — | — |
| `calendar_connections` | **`S` only — no `select` for anyone** | — | — | — | — | — |
| `bookmarks` | self ✅ | self | self | self | — | — |
| `audit_log` | — | — | read (own actions) | read | — | — |
| `impersonation_sessions` | — | — | read | read | insert | — |
| `registrations` (legacy) | — | — | — | — | — | insert only |

Three rows in that table are the ones worth arguing about, so each is defended below:
**`ratings` / presenter = agg only** (§5.6), **`calendar_connections` = nobody** (§5.9), and
**super admin = `—` almost everywhere** (§1.4).

---

## 4. Policy patterns

Writing 64 tables × 4 actions as 256 hand-copied blocks guarantees drift. Instead: **eight named
patterns**, each written out once in full, then a per-table map naming the pattern for each action.
Every table that deviates has its policy written out in §5.

A pattern is instantiated per table; `POL-<table>.<action>.<role>` is the ID.

### P1 — `org-read`
Any active member of the org may select.
```sql
create policy "p1_org_read" on <table> for select to authenticated
  using (org_id = auth_org_id());
grant select on <table> to authenticated;
```

### P2 — `admin-write`
Only an org admin may insert, update or delete. Reads follow P1.
```sql
create policy "p2_admin_insert" on <table> for insert to authenticated
  with check (org_id = auth_org_id() and is_org_admin());
create policy "p2_admin_update" on <table> for update to authenticated
  using       (org_id = auth_org_id() and is_org_admin())
  with check  (org_id = auth_org_id() and is_org_admin());
create policy "p2_admin_delete" on <table> for delete to authenticated
  using       (org_id = auth_org_id() and is_org_admin());
grant insert, update, delete on <table> to authenticated;
```
**The `with check` repeats the `using` clause on purpose.** Without it, an admin could `update` a
row and set its `org_id` to another org — `using` gates the row you may touch, `with check` gates
what you may leave behind.

### P3 — `self-write`
A member may write only their own rows.
```sql
create policy "p3_self_insert" on <table> for insert to authenticated
  with check (org_id = auth_org_id() and member_id = auth_member_id());
create policy "p3_self_update" on <table> for update to authenticated
  using       (org_id = auth_org_id() and member_id = auth_member_id())
  with check  (org_id = auth_org_id() and member_id = auth_member_id());
create policy "p3_self_delete" on <table> for delete to authenticated
  using       (org_id = auth_org_id() and member_id = auth_member_id());
```

### P4 — `append-only`
Insert permitted; **update and delete have no policy and no grant**.
```sql
create policy "p4_insert" on <table> for insert to authenticated
  with check (org_id = auth_org_id());
grant insert on <table> to authenticated;
revoke update, delete on <table> from anon, authenticated, service_role;
```
Used by `points_ledger` and `audit_log`. The `revoke` including `service_role` is the point: not
even the worker can rewrite history (`REQ-PTS-001`, `REQ-NFR-006`).

### P5 — `rpc-only`
**No insert, update or delete policy exists.** All writes go through a `SECURITY DEFINER` function
that enforces the invariants a policy cannot express — capacity, rate limits, serial allocation,
idempotency keys.
```sql
grant select on <table> to authenticated;   -- reads only
revoke insert, update, delete on <table> from anon, authenticated;
```
A policy can answer *may this row be written by this actor*. It cannot answer *are there already
N rows*, which is what capacity and rate limiting need — so those live in a function that holds
the lock.

### P6 — `staff-moderate`
Moderators and admins may update the moderation columns (soft-delete, hide, resolve) and nothing
else.
```sql
create policy "p6_staff_update" on <table> for update to authenticated
  using       (org_id = auth_org_id() and is_staff())
  with check  (org_id = auth_org_id() and is_staff());
```
Column-level restriction is enforced by `grant update (removed_at, removed_by, removal_reason,
hidden_at, hidden_reason) on <table> to authenticated` — **column grants, not a trigger**, so a
moderator cannot rewrite a comment's body under the guise of removing it.

### P7 — `self-read`
Only the member themselves may read. No org-wide read.
```sql
create policy "p7_self_read" on <table> for select to authenticated
  using (org_id = auth_org_id() and member_id = auth_member_id());
```

### P8 — `presenter-scope`
Presenters of the session may write; reads follow P1 or a phase rule.
```sql
create policy "p8_presenter_write" on <table> for insert to authenticated
  with check (org_id = auth_org_id()
              and (is_presenter_of(session_id) or is_org_admin()));
```

---

## 5. Per-table policies

Legend: pattern per action, `—` = no policy and no grant.

### 5.1 Tenancy and identity

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `orgs` | §5.1a | — | §5.1a | — | Own org only. Creation is a super-admin RPC. |
| `org_domains` | P2-read | P2 | P2 | P2 | Admin-only, including read — the domain list is a membership control. |
| `org_settings` | P1 | — | P2 | — | Exactly one row per org; no insert or delete path. |
| `companies` | P1 | P2 | P2 | — | `REQ-ADM-006`: deactivate, never delete. |
| `categories` | P1 | P2 | P2 | — | Same. |
| `venues` | P1 | P2 | P2 | — | Same. |
| `tags` | P1 | P8 | P2 | P2 | Presenters create tags on their own sessions. |
| `members` | §5.1b | — | §5.1c | — | Provisioning is an RPC; tiering is a view. |
| `member_interests` | P1 | P3 | P3 | P3 | |
| `platform_admins` | — | — | — | — | **No policy at all.** Read only by the auth hook, which runs as `supabase_auth_admin`. |
| `retention_periods` | — | — | — | — | **No policy at all.** Platform-level configuration; read through `retention_period()` by the retention job. |
| `platform_audit_log` | — | — | — | — | **No policy at all.** Platform-side evidence; written by `security definer` functions only. |
| `data_export_requests`| P3 self | — | — | — | Insert through `request_data_export()`; the archive path is never client-writable. |
| `impersonation_sessions` | P1 + `is_staff()` | — | — | — | Insert by super-admin RPC. Readable by the org's staff **by design** (`REQ-ADM-019`). |

#### §5.1a — `orgs`
```sql
create policy "orgs_read_own" on orgs for select to authenticated
  using (id = auth_org_id());
create policy "orgs_update_own" on orgs for update to authenticated
  using       (id = auth_org_id() and is_org_admin())
  with check  (id = auth_org_id() and is_org_admin());
grant select, update on orgs to authenticated;
```
**No `insert` policy and no `delete` policy.** Org creation and deletion are super-admin RPCs
(`REQ-TEN-002`, `REQ-NFR-014`), which is why an org admin — who has "full control of the org"
(D8) — still cannot delete it.

#### §5.1b — `members`, read
```sql
create policy "members_read_org" on members for select to authenticated
  using (org_id = auth_org_id());
grant select on members to authenticated;
```
The policy grants row access to the org. **Field tiering (`REQ-PRF-004`, A33) is not a policy** —
Postgres RLS is row-level, and A33 is column-level. It is enforced by two mechanisms together:
1. `grant select (id, display_name, avatar_url, company_id, job_title, bio, org_role, created_at)`
   — a **column grant** — is what `authenticated` actually holds. `email`, `deactivated_reason`
   and `anonymised_at` are not in it.
2. A `members_member_view` view exposing exactly A33's `member` tier, which the DAL uses for every
   read of someone else's profile. Self and admin reads go to the base table, where the column
   grant still applies and the *additional* admin columns are read through an
   `assert_fresh_admin()`-gated RPC.

A column grant is the right tool here precisely because it fails **closed and loudly**: a query
selecting `email` errors rather than quietly returning it.

#### §5.1c — `members`, update
```sql
-- self-service fields only
create policy "members_update_self" on members for update to authenticated
  using       (id = auth_member_id() and org_id = auth_org_id())
  with check  (id = auth_member_id() and org_id = auth_org_id());
grant update (display_name, company_id, job_title, bio, leaderboard_opt_out) on members
  to authenticated;
```
**`org_role`, `status` and `org_id` are absent from the grant.** A member cannot promote
themselves by crafting an update, and neither can an admin through this path — role changes go
through an `assert_fresh_admin()` RPC that bumps `claims_version` and writes the audit row
(`REQ-TEN-005`). `org_id` is additionally immutable by trigger (`REQ-TEN-004`).

### 5.2 Proposals and sessions

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `proposals` | §5.2a | P3 | §5.2b | P3 (draft only) | |
| `proposal_presenters` | P1 | P3-by-proposer | P3-self (accept/decline) | P3 | A named member accepts or declines their own row. |
| `sessions` | §5.2c | — | §5.2d | — | Creation and publication are admin RPCs. |
| `session_presenters` | P1 | P2 | P3-self | P2 | |
| `session_state_transitions` | P1 + `is_staff() or is_presenter_of()` | — | — | — | P4 write, but only via RPC — every transition is written by the function that performs it. |
| `session_tags` | P1 | P8 | — | P8 | |

#### §5.2a — `proposals`, read
```sql
create policy "proposals_read_own_or_staff" on proposals for select to authenticated
  using (org_id = auth_org_id()
         and (proposer_id = auth_member_id()
              or exists (select 1 from proposal_presenters pp
                          where pp.proposal_id = proposals.id
                            and pp.member_id = auth_member_id())
              or is_staff()));
```
A member sees their own proposals and those naming them as co-presenter (`REQ-PRO-008`). Other
members' proposals are not org-readable — a rejected proposal is a private matter between its
author and the admin.

#### §5.2b — `proposals`, update
```sql
create policy "proposals_update_own_editable" on proposals for update to authenticated
  using       (org_id = auth_org_id() and proposer_id = auth_member_id()
               and state in ('draft','changes_requested'))
  with check  (org_id = auth_org_id() and proposer_id = auth_member_id()
               and state in ('draft','submitted'));
grant update (title, abstract, category_id, level, target_audience,
              expected_duration_minutes, admin_notes, state) on proposals to authenticated;
```
The asymmetric `using` / `with check` is the state machine (`REQ-PRO-006`): a member may edit a
`draft` or a `changes_requested` proposal, and may leave it as `draft` or `submitted` — so the
only transition this policy permits is *submit*. Approval, rejection and change-requests are
admin RPCs. **`decision_reason` is not in the grant** — a proposer cannot write their own rejection
reason.

#### §5.2c — `sessions`, read
```sql
create policy "sessions_read" on sessions for select to authenticated
  using (org_id = auth_org_id()
         and (state in ('published','in_progress','completed','archived','cancelled')
              or is_staff()
              or is_presenter_of(id)));
```
Members see published sessions and everything after. Drafts and proposals-in-progress are staff
and presenter only.

#### §5.2d — `sessions`, update
```sql
create policy "sessions_update_admin" on sessions for update to authenticated
  using       (org_id = auth_org_id() and is_org_admin())
  with check  (org_id = auth_org_id() and is_org_admin());
create policy "sessions_update_presenter" on sessions for update to authenticated
  using       (org_id = auth_org_id() and is_presenter_of(id)
               and state in ('draft','changes_requested','approved','published'))
  with check  (org_id = auth_org_id() and is_presenter_of(id));
grant update (title, abstract, level, language) on sessions to authenticated;  -- presenter scope
```
**Scheduling columns are not in the presenter's grant.** `starts_at`, `venue_id`, `capacity`,
`rsvp_deadline_at`, `certificate_mode` and `state` are admin-only, which is D13/D14 expressed as
privileges rather than as UI: a presenter literally cannot set a date, even by crafting a request.
Admin updates to those columns go through an RPC that writes the state transition and fires the
change notifications (`REQ-SES-009`).

**The edge set is the table's, not any RPC's** (migration `0024`, DEC-046). `sessions_guard_transition`
is a `before update of state` trigger that accepts exactly `02` §6.2's edges — including the
presenter-decline return to `draft` (`REQ-PRO-007`) — and refuses everything else with `23514`,
for every writer including the migration owner and `service_role`. An RPC that writes an edge the
diagram does not draw fails its own test. Rows are born with a state and no edge, so there is no
insert guard: `create_session()` is the only door for people (no insert grant, no insert policy).

**A session's days (`0100`, `DEC-119`, `DEC-150`).** `session_days` — when, where and which meeting,
and nothing else — is visible exactly when its session is. The subquery runs as the caller, so
`sessions_read` decides and this policy cannot drift from it:

```sql
create policy "session_days_read" on public.session_days for select to authenticated
  using (org_id = public.auth_org_id()
         and exists (select 1 from public.sessions s where s.id = session_days.session_id));
```

**There is no write policy and no write grant**, as for every scheduling column since `0010`: a day is
written only by a definer RPC, and `service_role` holds nothing on the table (invariant 7).
★ **`sessions.starts_at` / `ends_at` / `venue_id` / the custom-venue trio are DERIVED from the days and
stay STORED** — the first day's start, the last day's end, the first day's venue — so every policy, index,
sort and job that reads them is unchanged. Two triggers keep the pair in step (a day write re-derives the
session, only where a value is distinct; a write to the session's own window is carried onto its one day
while `n ≤ 1`, unless the writer set the transaction-local `kareem.days_writer`), and a **deferred
constraint trigger** refuses at commit any session whose stored window is not its derived one. `position`
is derived too — the chronological rank.

### 5.3 RSVP

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `rsvps` | §5.3a | **P5** | **P5** | — | Capacity cannot be a policy. |

```sql
create policy "rsvps_read" on rsvps for select to authenticated
  using (org_id = auth_org_id()
         and (member_id = auth_member_id() or is_staff() or is_presenter_of(session_id)));
grant select on rsvps to authenticated;
revoke insert, update, delete on rsvps from anon, authenticated;
```

**Why `rsvps` is P5 and not P3.** `REQ-RSV-002` requires capacity enforced at the database, and a
policy cannot count rows — `with check` sees the row being written, not the set it joins. So
reserving is:

```sql
create function reserve_seat(p_session uuid) returns rsvps
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; taken int; r public.rsvps;
begin
  select * into s from public.sessions where id = p_session for update;  -- the lock is the mechanism
  if s.org_id <> auth_org_id() then raise exception 'not_found'; end if;
  if s.state <> 'published' then raise exception 'not_open'; end if;
  if now() > s.rsvp_deadline_at then raise exception 'deadline_passed'; end if;  -- REQ-RSV-005
  if not has_priority_access(s) then raise exception 'priority_window'; end if;  -- REQ-RSV-009

  select count(*) into taken from public.rsvps
   where session_id = p_session and status = 'confirmed';

  insert into public.rsvps (org_id, session_id, member_id, status, waitlist_position, reserved_at)
  values (s.org_id, p_session, auth_member_id(),
          case when taken < s.capacity then 'confirmed' else 'waitlisted' end,
          case when taken < s.capacity then null else next_waitlist_position(p_session) end,
          now())
  on conflict (session_id, member_id) do nothing          -- REQ-RSV-001 idempotency
  returning * into r;

  perform graphile_worker.add_job('calendar_upsert',
            json_build_object('rsvp_id', r.id),
            job_key => 'cal:' || r.id);                   -- enqueued in the same transaction
  return r;
end $$;
```

The `for update` on the session row serialises reservations for **that session only**, so N
concurrent calls against N−1 seats confirm exactly N−1 and waitlist the rest. Promotion is the
mirror image, and runs **in the same transaction as the cancellation that freed the seat**
(`REQ-RSV-003`) — there is no window in which a seat is free but unassigned.

### 5.4 Check-in

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `check_in_codes` | §5.4a | — | — | — | Issued and revoked by RPC. |
| `check_ins` | §5.4b | **P5** | — | — | Rate limiting cannot be a policy. |
| `check_in_attempts` | staff only | — | — | — | Written by the check-in RPC. |

#### §5.4a — `check_in_codes` — the host-view gate
```sql
create policy "codes_read_host" on check_in_codes for select to authenticated
  using (org_id = auth_org_id()
         and (is_presenter_of(session_id) or is_staff()));
grant select on check_in_codes to authenticated;
```
**OQ-013 as a policy.** A member — including one who has already checked in — cannot read the
current code. A member who could re-read it could forward it from outside the room, which is the
exact attack rotation exists to blunt (`REQ-CHK-014`).

#### §5.4b — `check_ins`
```sql
create policy "checkins_read" on check_ins for select to authenticated
  using (org_id = auth_org_id()
         and (member_id = auth_member_id() or is_staff() or is_presenter_of(session_id)));
grant select on check_ins to authenticated;
revoke insert, update, delete on check_ins from anon, authenticated;
```
Note what the read policy denies: **an ordinary member cannot see who else attended a session**.
That is A33's rule 3 — attendance reveals who was in a room with whom — enforced at the source
rather than only on the profile screen.

Checking in:

```sql
create function check_in(p_session uuid, p_code text) returns check_ins
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; c public.check_in_codes; recent int; ci public.check_ins;
begin
  select * into s from public.sessions where id = p_session;
  if s.org_id <> auth_org_id() then raise exception 'not_found'; end if;

  -- Rate limit INSIDE the transaction (DEC-015 / REQ-CHK-006). An in-memory
  -- limiter resets per serverless instance, which is fine for a form backed by
  -- a unique index and useless against guessing.
  select count(*) into recent from public.check_in_attempts
   where session_id = p_session and member_id = auth_member_id()
     and attempted_at > now() - interval '10 minutes';
  insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded)
  values (s.org_id, p_session, auth_member_id(), p_code, false);
  if recent >= 10 then raise exception 'rate_limited'; end if;

  if s.state <> 'in_progress' then raise exception 'not_open'; end if;   -- REQ-CHK-004
  if is_presenter_of(p_session) then raise exception 'presenter'; end if; -- REQ-CHK-011 / OQ-025

  select * into c from public.check_in_codes
   where session_id = p_session and code = upper(p_code)
     and revoked_at is null and now() between valid_from and valid_until;
  if c is null then raise exception 'invalid_code'; end if;

  insert into public.check_ins (org_id, session_id, member_id, method, code_id,
                                session_window)
  values (s.org_id, p_session, auth_member_id(), 'code', c.id,
          tstzrange(s.starts_at, s.ends_at, '[)'))
  on conflict (session_id, member_id) do nothing                          -- REQ-CHK-005
  returning * into ci;

  update public.check_in_attempts set succeeded = true
   where session_id = p_session and member_id = auth_member_id()
     and attempted_at = (select max(attempted_at) from public.check_in_attempts
                          where session_id = p_session and member_id = auth_member_id());

  perform graphile_worker.add_job('award_points',
            json_build_object('source','check_in','source_id', ci.id),
            job_key => 'pts:check_in:' || ci.id);
  return ci;
end $$;
```

Two details worth noticing. The **attempt row is written before the limit is checked**, so a
request that trips the limit still counts toward it — otherwise the limit is trivially evaded by
exceeding it. And the exclusion constraint on `check_ins` (§`ENT-check_ins`) rejects an overlapping
attendance without this function needing to check for one (`REQ-CHK-013`).

Manual marking is a separate `assert_fresh_admin()`- or moderator-gated RPC requiring a reason
(`REQ-CHK-008`), producing the **same row** with `method = 'manual'`.

### 5.5 Materials and tasks

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `materials` | §5.5a | P8 | P8 + P2 | P2 | Phase gating in the read policy. |
| `material_versions` | follows parent | P8 | — | — | Append-only in practice. |
| `material_pages` | follows parent | — | — | — | Written by the render job only. |
| `session_tasks` | P1 | P8 | P8 | P8 | |
| `task_completions` | P7 + presenter | P3 | P3 | P3 | |
| `task_form_responses` | §5.5b | P3 | P3 | — | |

#### §5.5a — `materials`, read — the phase gate, the day scope, and the proposal branch
```sql
create policy "materials_read" on materials for select to authenticated
  using (org_id = auth_org_id()
         and removed_at is null
         and (
           (session_id is not null and (
             phase = 'before'
             or exists (select 1 from sessions s where s.id = materials.session_id
                         and s.state in ('completed','archived'))
             or (session_day_id is not null
                 and exists (select 1 from session_days d where d.id = materials.session_day_id
                             and d.ends_at <= now()))
             or is_presenter_of(session_id)
           ))
           or (proposal_id is not null and is_proposal_owner_of(proposal_id))
           or is_staff()
         ));
```
*Corrected under `DEC-161` (wave 10), from `content`'s note: this section described the pre-`0053`,
pre-`0116` policy until then.* `REQ-MAT-006` in the database, as amended by `DEC-121`: a `بعد الجلسة`
material releases when **its own scope** ends — the session's `completed` / `archived` state for a
session-scoped material, or its own day's `ends_at` for a day-scoped one, whichever comes first.
`REQ-PRO-004`: a proposal's own material (`session_id` null) is visible to its proposer, an accepted
co-presenter, or staff — never to a plain member — until `0053`'s carry-over reassigns it on
publication. Doing this in the DAL alone would leave the row reachable through any other read path.

**The same gate, three more times.** `material_versions_read`, `material_pages_read` and the
`material-pages` bucket's `material_pages_storage_read` each carry an **independent copy** of this
predicate (`0037`; the day-scope clause by `0116`; the proposal branch and `is_staff()` at the top
level by `0129`). A viewer's read reaches `materials` **and** one of these, so a row readable whose
dependant is not is the defect this section exists to prevent (`0054`) — and was, until `0129`, exactly
what happened to a proposal's material: all three `inner join`ed `sessions`, so for a row whose
`session_id` is null **no branch was reached, `is_staff()` included**, and an admin reviewing a
proposal could not open the file the proposer attached. The proposal branch on the two
`material_pages*` policies is unreachable by construction (carry-over clears `proposal_id` before any
render job can write a page row) and is written anyway, so the three read as one gate; a test proves
it dead against a synthetic page row rather than an empty table.

**`allow_download` is not enforced here** — RLS gates the *row*, not the *file*. The file lives in
Storage, and download control is a bucket policy plus a signed-URL decision (§6), because that is
where the bytes are.

#### §5.5b — `task_form_responses`, read
```sql
create policy "responses_read" on task_form_responses for select to authenticated
  using (org_id = auth_org_id()
         and (member_id = auth_member_id()
              or is_org_admin()
              or exists (select 1 from session_tasks t
                          where t.id = task_form_responses.task_id
                            and is_presenter_of(t.session_id))));
```
A9: presenters and admins, not other members. **Moderators are absent** — form responses are not
moderation material (`REQ-ADM-020`).

### 5.6 Event page and ratings

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `comments` | P1 (org-wide) | §5.6a | §5.6b + P6 | — | Soft delete only. |
| `reactions` | P1 | P3 | — | P3 | |
| `photos` | P1 (not hidden) | §5.6c | P6 | — | **The check-in gate.** |
| `photo_takedowns` | staff + requester | P3 | P6 | — | Insert hides instantly, by trigger. |
| `reports` | staff + reporter | P3 | P6 | — | |
| `ratings` | §5.6d | §5.6e | §5.6e | — | **The D36 boundary.** |
| `survey_templates` | §5.6f | — | — | — | Staff read; every write is a definer RPC (a write renumbers a whole ordered set). |
| `survey_template_questions` | §5.6f | — | — | — | Same. |
| `survey_template_options` | §5.6f | — | — | — | Same. |
| `surveys` | §5.6f | — | — | — | One per session. Staff read; attach and detach are definer RPCs. **A presenter is not staff.** |
| `survey_questions` | §5.6f | — | — | — | The copy made at attach — editing a template never rewrites it. |
| `survey_question_options` | §5.6f | — | — | — | Same. |
| `survey_participations` | — | — | — | — | **No policy at all.** The REGISTER: who answered, with no answer, no time and no surrogate id (`DEC-160` §3). Written by `submit_survey_response()` alone. |
| `survey_responses` | — | — | — | — | **No policy at all.** The BOX: a random id, an org and a survey, **and nothing else, ever** — no member, no timestamp. Written by the jittered job alone; read by `survey_results()` alone. |
| `survey_answers` | — | — | — | — | **No policy at all.** One value of one response. No member, no timestamp. |

#### §5.6f — the survey (`0124`, `DEC-074`, `DEC-160` §3, `DEC-161`)
```sql
create policy "survey_templates_read_staff" on survey_templates for select to authenticated
  using (org_id = auth_org_id() and is_staff());
create policy "survey_template_questions_read_staff" on survey_template_questions for select to authenticated
  using (org_id = auth_org_id() and is_staff());
create policy "survey_template_options_read_staff" on survey_template_options for select to authenticated
  using (org_id = auth_org_id() and is_staff());
create policy "surveys_read_staff" on surveys for select to authenticated
  using (org_id = auth_org_id() and is_staff());
create policy "survey_questions_read_staff" on survey_questions for select to authenticated
  using (org_id = auth_org_id() and is_staff());
create policy "survey_question_options_read_staff" on survey_question_options for select to authenticated
  using (org_id = auth_org_id() and is_staff());
```
`REQ-SUR-005`: the survey is the organisation's instrument. **Its audience is the reverse of the
rating's** — `admin` **and** `moderator`, never the presenter, and `is_staff()` says exactly that: a
presenter is not staff by presenting. ★ **A staff member who presents the session is refused the
results as well** (`survey_results()`, `DEC-161`): the ask exists so a presenter never reads their own
session's survey, and an admin who presents is that person — deliberately unlike `ratings`, where an
admin reads per-rater rows for a session they present.

★ **The three tables that hold who answered and what was answered have no policy and no grant — for
every client role and for `service_role`.** A stored response names **no member** and carries **no
timestamp of any kind**; «one member, one response» lives in `survey_participations`, which carries no
answer and no time. The response is written by a jittered job whose payload and key name no member.
Results leave through **one** definer function that applies the minimum-count withhold to **every**
question type — and to the response count itself — for the screen and the CSV alike, so `xmin` and
`ctid` are never readable. `tests/rls/survey-structure.test.ts` asserts the shape over the catalogue.
`org_settings.survey_min_responses` has a floor of 3: an org cannot switch the withhold off.

#### §5.6a — `comments`, insert
```sql
create policy "comments_insert" on comments for insert to authenticated
  with check (org_id = auth_org_id()
              and author_id = auth_member_id()
              and exists (select 1 from sessions s
                           where s.id = session_id
                             and s.state in ('published','in_progress','completed','archived')));
```
D32: any member, at any time, **without** a check-in or a reservation. Commenting is deliberately
*not* behind `has_checked_in()` — that gate applies to photos and ratings only.

#### §5.6b — `comments`, update
```sql
create policy "comments_update_own" on comments for update to authenticated
  using       (org_id = auth_org_id() and author_id = auth_member_id()
               and deleted_at is null
               and created_at > now() - (select make_interval(mins => comment_edit_window_minutes)
                                           from org_settings where org_id = comments.org_id))
  with check  (org_id = auth_org_id() and author_id = auth_member_id());
grant update (body, edited_at) on comments to authenticated;
```
OQ-007's 15-minute window, read from `org_settings` so it is configurable without a deploy.
Moderator removal is P6 with its own column grant — a moderator can set `deleted_at` and cannot
touch `body`.

#### §5.6c — `photos`, insert — the check-in gate
```sql
create policy "photos_insert_checked_in" on photos for insert to authenticated
  with check (org_id = auth_org_id()
              and uploader_id = auth_member_id()
              and exif_stripped                                  -- REQ-EVT-011
              and (has_checked_in(session_id)                    -- D33 / D24
                   or is_presenter_of(session_id)
                   or is_staff()));
```
**This is D33 and D24 in one clause.** A member with a confirmed RSVP and no check-in fails it. The
`exif_stripped` conjunct pairs with the table's check constraint so an unstripped image cannot be
recorded even by a code path that forgot to strip it.

#### §5.6d — `ratings`, read — where D36 lives
```sql
-- Org admins see everything, including who rated what (D36, REQ-RAT-005) —
-- ONLY through list_session_ratings_admin(), a definer RPC that writes an
-- audit_log row per read. The direct admin select 0010 created was dropped
-- in 0017 (DEC-044): RLS cannot leave an audit row as a side effect of a
-- select, so a direct policy is an unaudited path by construction.
-- A member sees their own rating, to edit it within the window.
create policy "ratings_read_self" on ratings for select to authenticated
  using (org_id = auth_org_id() and member_id = auth_member_id());
grant select on ratings to authenticated;
```
**There is no presenter policy on this table, and that is the design.** A presenter reads
`session_rating_aggregates`, a `security_invoker = off` view exposing `avg`, `count` and
unattributed free text, and returning **nothing at all below `org_settings.rating_min_aggregate`**
(`REQ-RAT-006`, OQ-009). A moderator has neither — moderators do not see per-rater ratings
(`REQ-ADM-020`).

The reason to do it this way rather than with a cleverer policy: a policy that let presenters read
rows while hiding `member_id` would still leak through `count(*)` on a filtered query, through
ordering, and through realtime payloads. A view that never emits the column cannot.

#### §5.6e — `ratings`, write
```sql
create policy "ratings_write_self" on ratings for insert to authenticated
  with check (org_id = auth_org_id()
              and member_id = auth_member_id()
              and check_in_id in (select id from check_ins
                                   where session_id = ratings.session_id
                                     and member_id = auth_member_id())   -- REQ-RAT-001
              and exists (select 1 from sessions s
                           where s.id = session_id and s.state = 'completed'
                             and now() <= s.completed_at
                                   + make_interval(days => (select rating_window_days
                                                              from org_settings
                                                             where org_id = ratings.org_id))));
```
The `check_in_id` sub-select makes `REQ-RAT-001` unforgeable: a member cannot supply someone
else's check-in, because the sub-select is scoped to their own. OQ-006's window is the same clause
for insert and update, so "opens at completion, closes 14 days later" is one rule, not two.

### 5.7 Scoring, recognition, leaderboards

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `scoring_rules` | P1 | P2 | P2 | — | Read by members so the app can explain what earns what. |
| `scoring_config_history` | P1 + `is_org_admin()` | — | — | — | Written by the config RPC. |
| `points_ledger` | §5.7a | **P4 via RPC** | — | — | Append-only, `revoke` includes `service_role`. |
| `points_balances` | P1 | — | — | — | Trigger-maintained. |
| `badges`, `levels`, `perks`, `streak_rules` | P1 | P2 | P2 | — | |
| `member_badges`, `member_perks`, `streak_awards` | P1 | — | — | — | Awarded by job or admin RPC. |
| `leaderboard_snapshots`, `leaderboard_entries` | §5.7b | — | — | — | Job-written. |

#### §5.7a — `points_ledger`, read
```sql
create policy "ledger_read_self_or_admin" on points_ledger for select to authenticated
  using (org_id = auth_org_id()
         and (member_id = auth_member_id() or is_org_admin()));
grant select on points_ledger to authenticated;
revoke insert, update, delete on points_ledger from anon, authenticated, service_role;
```
`REQ-PTS-003` gives a member their own full history; A33 denies them anyone else's. **The `revoke`
naming `service_role` is not redundant** — the worker connects as `service_role` and would
otherwise bypass RLS entirely. Inserts go through `award_points()`, a `SECURITY DEFINER` function
owned by a role that *does* hold `insert`, which is the single audited doorway into the ledger.

#### §5.7b — leaderboards
```sql
create policy "boards_read" on leaderboard_entries for select to authenticated
  using (org_id = auth_org_id()
         and (member_id is null
              or member_id = auth_member_id()
              or not exists (select 1 from members m
                              where m.id = leaderboard_entries.member_id
                                and m.leaderboard_opt_out)));
```
`REQ-LDR-008`: an opted-out member is filtered from other members' view of the board but still
sees their own row, and **company rows (`member_id is null`) are unaffected** — so opting out never
changes a company's standing, which removes the incentive to opt out in order to protect a company
average.

### 5.8 Certificates

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `certificates` | §5.8a | **P5** | **P5** | — | Serial allocation holds a lock. |
| `certificate_serial_counters` | — | — | — | — | **No policy at all.** Touched only inside `allocate_serial()`. |

#### §5.8a — `certificates`
```sql
create policy "certs_read_self_or_admin" on certificates for select to authenticated
  using (org_id = auth_org_id()
         and state <> 'held'                                  -- REQ-CRT-004
         and (member_id = auth_member_id() or is_org_admin()));
-- admins additionally see held certificates awaiting release
create policy "certs_read_held_admin" on certificates for select to authenticated
  using (org_id = auth_org_id() and is_org_admin());
grant select on certificates to authenticated;
revoke insert, update, delete on certificates from anon, authenticated;
```

**`anon` gets no policy on this table, at all.** The public verification page (`REQ-CRT-007`,
A13) goes through a `SECURITY DEFINER` function that returns **only** A13's fields:

```sql
create function verify_certificate(p_code text)
returns table (recipient_name text, kind certificate_kind, session_title text,
               session_date date, achievement_name text, org_name text,
               issued_at timestamptz, state certificate_state)
language sql security definer set search_path = '' as $$
  select c.recipient_name_snapshot, c.kind, s.title, s.starts_at::date,
         b.name, o.name, c.issued_at, c.state
    from public.certificates c
    join public.orgs o on o.id = c.org_id
    left join public.sessions s on s.id = c.session_id
    left join public.badges  b on b.id = c.badge_id
   where c.verification_code = p_code            -- the ONLY accepted key (DEC-010)
     and c.state in ('issued','revoked')
$$;
grant execute on function verify_certificate(text) to anon;
```

Three properties this shape buys, none of which an `anon` RLS policy would: the function's return
type is the **allowlist**, so a later column addition cannot leak (an `anon` select policy would
expose every column the grant covers); it is reachable only by `verification_code`, never by
`serial`, so `/verify/KM-2026-000001` cannot be walked (`REQ-CRT-009`); and it returns an empty
set for both unknown and revoked-but-nonexistent codes, so the caller cannot distinguish *never
existed* from *revoked* (`REQ-CRT-007`).

Rate limiting sits in the route handler in front of it (`REQ-NFR-005`), not in the function,
because the limit is per-IP and the database does not see IPs.

### 5.9 Designer, notifications, calendar

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `design_templates` | §5.9a | P2 (org scope) | P2 | P2 | Platform scope is super-admin RPC. |
| `design_template_versions` | follows parent | P2 | — | — | Versions are immutable once published. |
| `design_documents` | §5.9b | P2 | P2 | P2 | |
| `design_assets` | P1 | P2 | — | P2 | |
| `export_artifacts` | follows document | — | — | — | Job-written. |
| `fonts` | P1 | P2 | — | — | `parity_status` written by the job only. `service_role` reads (`0067`, DEC-051), never writes — `record_font()` is its one door. |
| `session_posters` | P1 | P2 | P2 | — | |
| `notification_templates` | P1 + `is_org_admin()` | P2 | P2 | P2 | |
| `notifications` | P7 | — | P7 (`read_at`) | P7 | Job-written. |
| `notification_preferences` | P7 | P3 | P3 | P3 | |
| `email_deliveries` | `is_org_admin()` | — | — | — | |
| `calendar_connections` | **§5.9c** | — | — | P7 | |
| `calendar_events` | P7 | — | — | — | Job-written. |
| `bookmarks` | P7 | P3 | — | P3 | |

#### §5.9a — `design_templates`
```sql
create policy "templates_read" on design_templates for select to authenticated
  using (scope = 'platform' or org_id = auth_org_id());
create policy "templates_write_org" on design_templates for insert to authenticated
  with check (scope = 'org' and org_id = auth_org_id() and is_org_admin());
create policy "templates_update_org" on design_templates for update to authenticated
  using       (scope = 'org' and org_id = auth_org_id() and is_org_admin())
  with check  (scope = 'org' and org_id = auth_org_id() and is_org_admin());
```
The one table where a **cross-org read is deliberately permitted**, and the exception is narrow and
explicit: platform templates are readable by every org because D67 requires org admins to duplicate
from them. They are **never writable** by an org — `scope = 'org'` appears in every write clause,
so an org admin cannot edit a platform template in place (`REQ-DSG-008`).

#### §5.9b — `design_documents`
```sql
create policy "documents_read" on design_documents for select to authenticated
  using (org_id = auth_org_id()
         and (is_org_admin()
              or (bound_session_id is not null and is_presenter_of(bound_session_id))
              or (bound_certificate_id in (select id from certificates
                                            where member_id = auth_member_id()))));
```
A presenter can see their own session's poster document; a member can see the document behind
their own certificate. Neither can edit (`REQ-DSG-002` makes design an admin act).

#### §5.9c — `calendar_connections` — the table nobody may read
```sql
create policy "calendar_delete_self" on calendar_connections for delete to authenticated
  using (org_id = auth_org_id() and member_id = auth_member_id());
grant delete on calendar_connections to authenticated;
grant select (member_id, provider, connected_at, disconnected_at) on calendar_connections
  to authenticated;
create policy "calendar_read_status_self" on calendar_connections for select to authenticated
  using (org_id = auth_org_id() and member_id = auth_member_id());
revoke insert, update on calendar_connections from anon, authenticated;
```

**The token columns appear in no grant to any role** (A33, `REQ-CAL-003`). Not the member's, not
the org admin's, not a moderator's. Only the worker's narrow job interface reads them, through a
`SECURITY DEFINER` function that returns a refreshed access token to the calendar job and nothing
to anyone else.

This is **the one place in the product where admin access is narrower than member self-access**,
and it is deliberate: an OAuth token is a credential for a third-party Google account, not org
data. An org admin who could read it could act as that member in their personal calendar, which no
requirement asks for and no member would expect. Disconnect **deletes** the row — `REQ-CAL-007`
puts it outside the retention schedule entirely.

### 5.10 Audit and legacy

| Table | select | insert | update | delete | Notes |
|---|---|---|---|---|---|
| `audit_log` | §5.10a | **P4 via RPC** | — | — | `revoke update, delete` from **every** role. |
| `registrations` | — | `anon` only | — | — | **Frozen legacy. Do not touch.** |

#### §5.10a — `audit_log`
```sql
create policy "audit_read_admin" on audit_log for select to authenticated
  using (org_id = auth_org_id() and is_org_admin());
create policy "audit_read_moderator_own" on audit_log for select to authenticated
  using (org_id = auth_org_id() and is_staff() and actor_id = auth_member_id());
grant select on audit_log to authenticated;
revoke insert, update, delete on audit_log from anon, authenticated, service_role;
```
A moderator can see **their own** actions — accountability works in both directions, and someone
who cannot see what they did cannot correct a mistake — but not the admin's. Writes come only from
`write_audit()`, `SECURITY DEFINER`, called inside the transaction that performs the audited act,
so an action and its audit row commit together or not at all.

#### `registrations` — frozen
Its existing policy (`anon` insert, `select/update/delete` revoked) **stays exactly as it is**
(DEC-002, `REQ-NFR-020`). No platform policy is added, no platform code reads it, and
`REQ-NFR-001`'s org-key requirement explicitly exempts it (`02-domain-model.md` §7).

---

## 6. Storage bucket policies

Six private buckets. **None is public.** Every read is a server-generated signed URL with a short
expiry.

| Bucket | Contents | Path | Read | Write |
|---|---|---|---|---|
| `materials` | Source uploads | `{org_id}/sessions/{session_id}/materials/{version_id}/{filename}` | signed, gated by `REQ-MAT-005` + phase | presenters, admins |
| `material-pages` | Rendered page images | `{org_id}/sessions/{session_id}/pages/{version_id}/{n}.webp` | signed, phase-gated | worker only |
| `photos` | Event photos | `{org_id}/sessions/{session_id}/photos/{photo_id}.webp` | signed, org members | `has_checked_in` gate |
| `design-assets` | Designer images | `{org_id}/design/assets/{asset_id}.{ext}` | signed, admins | admins |
| `exports` | Rendered posters, certificates | `{org_id}/exports/{document_id}/{preset}.{ext}` | signed | worker only |
| `fonts` | Materialised font binaries | `fonts/{sha256}.{ext}` | signed, editor + worker | worker only |

The storage policy pattern, per bucket:

```sql
create policy "materials_read" on storage.objects for select to authenticated
  using (bucket_id = 'materials'
         and (storage.foldername(name))[1] = auth_org_id()::text);

create policy "materials_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials'
              and (storage.foldername(name))[1] = auth_org_id()::text
              and is_staff_or_presenter_for_path(name));
```

### The honest weakness, and what contains it

**Storage path prefixes are the only place in this design where isolation depends on application
correctness.** Everywhere else, a forgotten predicate returns zero rows because a constraint or a
policy says so. Here, a path built wrong puts an object in another org's prefix and the policy
dutifully allows it.

Three containments, because one is not enough:

1. **A single server-side path builder.** No route, action or job constructs a storage path by
   string concatenation. One function, one place to audit, and a lint rule forbidding
   `from('materials').upload(` with anything but its output.
2. **A restrictive prefix policy**, as above — the first path segment must equal the caller's
   `org_id` claim. A wrong path is at least caught for *authenticated* writes.
3. **A nightly assertion** walking every bucket and proving no object sits outside its org's
   prefix (`REQ-TEN-003`), alerting on the first violation.

The `fonts` bucket is deliberately **not** org-prefixed: fonts are content-addressed by SHA-256 and
shared platform-wide (`REQ-DSG-016`), because the entire point is that the editor, the worker's
Chromium and the worker's LibreOffice load **the same bytes**.

### Download control is a Storage decision, not an RLS one

`allow_download` (`REQ-MAT-005`) is enforced where the bytes are:

- **Viewing** a slide deck serves signed URLs for `material-pages` — page images, never the source.
- **Downloading** the source requires `allow_download = true`, checked server-side before a signed
  URL for `materials` is minted at all.
- An admin download is always permitted and **writes an audit row** (`REQ-MAT-005`).

A member who is denied download never receives a URL, so there is nothing to replay. Signed URLs
expire in 5 minutes for sources and 60 minutes for page images, which are re-requested constantly.

---

### 6.9 The bucket policies as promoted — migration `0037` (wave 2)

The nine policies below are the ones `0037_m5_schema.sql` creates on `storage.objects`; their
bodies are the prefix rules of §6.1–§6.6 and are read there, not restated here. The
`policy-diff` gate keys `storage.objects` by schema (DEC-044) and matches these names.

```sql
create policy "materials_storage_read"       on storage.objects for select to authenticated;  -- org prefix · phase gate · allow_download (REQ-MAT-005, REQ-MAT-006) · since 0054 also the pre-finalize self-read: whoever may WRITE the path may read it back before a material_versions row exists (the complete step sniffs the landed bytes)
create policy "materials_storage_write"      on storage.objects for insert to authenticated;  -- org prefix · sessions/<id> · presenter or staff
create policy "material_pages_storage_read"  on storage.objects for select to authenticated;  -- org prefix · phase gate, no allow_download conjunct
create policy "photos_storage_read"          on storage.objects for select to authenticated;  -- org prefix · hidden only to staff (REQ-EVT-012)
create policy "photos_storage_write"         on storage.objects for insert to authenticated;  -- org prefix · has_checked_in() or presenter or staff (REQ-EVT-009)
create policy "design_assets_storage_read"   on storage.objects for select to authenticated;  -- org prefix
create policy "design_assets_storage_write"  on storage.objects for insert to authenticated;  -- org prefix · staff
create policy "exports_storage_read"         on storage.objects for select to authenticated;  -- org prefix · the requesting member; writes are service_role only
create policy "exports_storage_read_public_card" on storage.objects for select to anon, authenticated;  -- DEC-066 (0080): ONLY the og.png of a card-eligible session's poster, via export_is_public_card(name); a member of another org sees what a stranger sees
create policy "design_assets_storage_read_public_logo" on storage.objects for select to anon, authenticated;  -- DEC-161 (0126): ONLY the PNG or JPEG an ACTIVE org's brand_kits.logo_asset_id names, via brand_logo_is_public(name) — so a mail client can fetch a logo; every other design asset stays closed
create policy "fonts_storage_read"           on storage.objects for select to authenticated;  -- no org prefix (REQ-DSG-016)
```

## 7. Realtime authorization

**Added by DEC-022.** Under DEC-020 this section was unnecessary — the browser could not reach
Supabase at all. Under **DEC-021** it is the most important section in this document after §5,
because RLS is now the **only** boundary between a browser and the data, and Realtime is precisely
where RLS is *not* applied unless it is configured to be.

Three separate controls. Missing any one of them leaves data outside every policy in §5.

### 7.1 Every channel is private

```ts
supabase.channel(`session:${sessionId}`, { config: { private: true } })
```

**A public channel can be subscribed to without authentication.** Not "with weak authentication" —
without any. `private: true` is what makes the connection an authenticated one whose JWT is
evaluated at all.

There is **no public channel in this product**. A code review that finds a `channel()` call without
`private: true` is looking at a data leak, and a lint rule should fail the build on one.

### 7.2 RLS on `realtime.messages`

Realtime authorizes broadcast and presence through RLS on the system table `realtime.messages` —
**not** through the policies on our own tables. Supabase validates a subscription by inserting a
message, reading it back, and rolling the transaction back; nothing is stored.

Channel topics are therefore **structured so a policy can parse them**:

```
session:{session_id}       — the event page: comments, reactions, RSVP and check-in counts
org:{org_id}:notifications — a member's in-app inbox
host:{session_id}          — the host view's live check-in count (staff and presenters only)
```

```sql
-- Receive: only members of the org that owns the session.
create policy "realtime_session_select" on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and topic like 'session:%'
    and exists (
      select 1 from public.sessions s
       where s.id = split_part(topic, ':', 2)::uuid
         and s.org_id = auth_org_id()
    )
  );

-- Send: the same, and only for the message kinds a client is allowed to originate.
create policy "realtime_session_insert" on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and topic like 'session:%'
    and exists (
      select 1 from public.sessions s
       where s.id = split_part(topic, ':', 2)::uuid
         and s.org_id = auth_org_id()
    )
  );

-- The host channel carries the live check-in count. Same gate as the host view
-- itself (§5.4a / OQ-013): a member who could read it could infer attendance.
create policy "realtime_host_select" on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and topic like 'host:%'
    -- DEC-044: the org check the first draft lacked — without it any org's
    -- staff could read another org's host topic.
    and exists (select 1 from sessions s where s.id = split_part(topic, ':', 2)::uuid and s.org_id = auth_org_id())
    and (is_staff() or is_presenter_of(split_part(topic, ':', 2)::uuid))
  );
```

**`select` and `insert` are separate policies and separate questions.** Receiving a broadcast and
originating one are different rights — a member may watch a session's comment stream without being
able to inject messages into it.

### 7.3 Broadcast from the database, not Postgres Changes

Changes reach clients through `realtime.broadcast_changes()` in a trigger, not through Postgres
Changes subscriptions.

| | Postgres Changes | **Broadcast from the database** |
|---|---|---|
| Authorization | table RLS, per subscriber | `realtime.messages` RLS (§7.2) |
| Payload | **the row shape** | whatever the trigger chooses |
| A column added later | **broadcast to every subscriber by default** | not sent unless the trigger sends it |
| Coupling | the wire format is the table schema | the wire format is a reviewed decision |

Both are authorized, so this is not a security-versus-insecurity choice. It is about **what
travels**. With Postgres Changes, adding `members.deactivated_reason` later would put it on the
wire for every subscriber who can read the row — nobody would have decided that, and nobody would
notice. With a trigger, the payload is an explicit list.

It also decouples the two: the check-in counter broadcasts **a count**, not a stream of
`check_ins` rows, so a member watching the counter does not receive a row per attendee — which
would leak exactly what `POL-check_ins.select.member` (§5.4b) exists to prevent.

### 7.4 What is broadcast, and to whom

| Topic | Payload | Who may receive |
|---|---|---|
| `session:{id}` | comment created/edited/deleted, reaction totals, **counts only** for RSVP and check-in | any member of the session's org |
| `host:{id}` | check-in count, current code rotation tick | **staff and that session's presenters only** |
| `org:{id}:notifications` | a notification id for the recipient to fetch | the recipient only |

**Counts, never rows**, on `session:{id}`. And notifications broadcast **an id, not content** — the
client then reads the row through the DAL, where §5.9's policy applies. A payload cannot leak what
it does not contain.

---

## 8. Test cases

**Every policy has a test.** `REQ-NFR-001` makes a policy without a named test case a review
failure, so this table is the checklist, not an appendix.

Tests run against a seeded fixture: **two orgs**, each with an admin, a moderator, two members, a
presenter, a published session, a completed session, and content on both. The second org exists for
one reason — **every isolation test is meaningless without it**.

### 8.1 The isolation sweep — one test, every table

```
For each table T in the 64 entities:
  Given member M of org A
  When M selects from T with no org predicate
  Then zero rows belonging to org B are returned
```
Generated from the entity list rather than hand-written, so a **new table is automatically covered
the day it is created** and a table someone forgot to protect fails immediately. This single
generated suite is the highest-value test in the product.

### 8.2 Per-policy cases

| Policy | Test |
|---|---|
| `POL-orgs.select.member` | A member of org A reading org B's row gets nothing. |
| `POL-orgs.update.admin` | A member cannot update the org; an admin can; **neither can delete it**. |
| `POL-org_domains.select.member` | A non-admin member reading the domain list gets nothing. |
| `POL-org_settings.update.admin` | A moderator updating settings is rejected (`REQ-ADM-020`). |
| `POL-members.select.member` | Selecting `email` on another member **errors on the column grant**, not returns null. |
| `POL-members.update.self` | A member updating their own `org_role` is rejected; the column is not granted. |
| `POL-members.update.self` | A member updating another member's `bio` is rejected. |
| `POL-members.org_immutable` | An update changing `org_id` raises, even as service_role. |
| `POL-companies.select.member` · `POL-categories.select.member` · `POL-venues.select.member` | A member of org A sees none of org B's rows; sees all of A's. |
| `POL-companies.insert.admin` · `POL-categories.insert.admin` · `POL-venues.insert.admin` | A member's insert is rejected; an admin's succeeds; an admin inserting with org B's `org_id` is rejected by `with check`. |
| `POL-companies.update.admin` · `POL-categories.update.admin` · `POL-venues.update.admin` | An admin deactivates a row; **no role can delete one** (`REQ-ADM-006`). |
| `POL-member_interests.select.member` · `POL-member_interests.write.self` | A member writes only their own interests; writing another member's is rejected. |
| `POL-scoring_config_history.select.admin` | An admin reads the org's history; a moderator and a member get nothing; no role can insert, update or delete directly. |
| `POL-org_settings.history` | Changing a setting as an admin writes one history row per changed column, with old and new values. |
| `POL-platform_admins.none` | Every client role selecting from `platform_admins` fails on the grant — there is no policy and no grant (DEC-035). |
| `POL-auth_hook.no_member` | The hook returns the event **unchanged** for a user with no member row. |
| `POL-auth_hook.claims` | For a member, `app_metadata` carries `org_id`, `member_id`, `org_role`, `status`, `claims_version`, `org_status`. |
| `POL-auth_hook.never_raises` | With `select` on `members` revoked from the definer's path, the hook still returns the event unchanged. |
| `POL-provision_member.no_match` | A domain on no list returns `no_match` and creates **no** member row and **no** audit row (`REQ-AUT-006`). |
| `POL-provision_member.ambiguous` | A domain on two lists returns both orgs and creates nothing; a second call naming one org creates exactly one member (`REQ-AUT-004`). |
| `POL-provision_member.idempotent` | Two calls for the same user yield one row. |
| `POL-assert_fresh_admin.stale` | A token whose `claims_version` lags the row raises `stale_claims`; a member raises `not_an_admin`. |
| `POL-set_member_role.audit` | Changing a role bumps `claims_version` and writes an audit row with old and new role; demoting the last admin raises `last_admin`. |
| `POL-deactivate_member.reason` | Deactivating without a reason is rejected; with one, `status` flips, `claims_version` bumps, the audit row carries the reason. |
| `POL-proposals.select.member` | Member B cannot read member A's proposal; a co-presenter can. |
| `POL-proposal_presenters.select.member` · `POL-proposal_presenters.insert.proposer` · `POL-proposal_presenters.update.self` · `POL-proposal_presenters.delete.proposer` | Org-readable; only the proposer names or removes a co-presenter; the named member accepts or declines their own row and cannot touch another's; a sixth presenter raises `too_many_presenters` (A5). |
| `POL-proposal_presenters.insert.same_org` · `POL-session_presenters.insert.same_org` | Naming a member of another org is refused with `23514`, even though the row's own `org_id` is the caller's — the isolation sweep walks tables, not cross-table references (migration `0012`). |
| `POL-proposal_presenters.insert.state` | A co-presenter cannot be added to an `approved` or `rejected` proposal (migration `0012`). |
| `RPC-create_proposal` | Creates the proposal, the proposer's own accepted presenter row and the named co-presenters atomically; a bad co-presenter id rolls the proposal back with it; `proposer_id` is the session's own member whatever the caller sends (`REQ-PRO-003`, migration `0012`). |
| `RPC-review_proposal.admin_only` | A member and a moderator are both refused `42501`; only an org admin may review, and never a proposal in another org (migration `0013`). |
| `RPC-review_proposal.reason` | `reject` and `request_changes` without a reason are refused; the reason reaches the proposer on the row and the audit row (`REQ-PRO-005`, `REQ-PRO-006`). |
| `RPC-review_proposal.path` | Deciding on a `submitted` proposal walks it through `in_review`, so `02` §6.1 is followed and both transitions are audited. |
| `POL-sessions.insert.rpc` | `sessions` has no insert policy and no insert grant: a direct insert by an admin is refused, and `create_session()` is the only way in (migration `0020`). |
| `RPC-create_session.admin_only` | A member and a moderator are refused `42501`; an admin of another org cannot reach the proposal or create into that org. |
| `RPC-create_session.one_per_proposal` | An approved proposal becomes at most one session (partial unique index); a second attempt is refused, and only an `approved` proposal can be turned into one (`REQ-PRO-007`, `REQ-PRO-008`). |
| `POL-session_presenters.decline` | A presenter declining an unpublished session returns it to `draft` and writes the transition row; a published session is left alone (`REQ-SES-003`). |
| `RPC-schedule_session.admin_only` | A member, a moderator and the session's own presenter are all refused; a presenter cannot set a date even through the RPC (D13, migration `0021`). |
| `RPC-schedule_session.derives` | `ends_at` is stored, derived from the duration when not given and independently editable when it is; the time zone comes from the venue, else the org; a custom venue needs a name **and** an address (`REQ-SES-002`). |
| `RPC-publish_session.gate` | Publishing without a date, an end, a venue or a capacity is refused by the **table**, not only by the form; the refusal names what is missing (`REQ-SES-001`; the poster gate joins at M6). |
| `RPC-publish_session.path` | Publishing walks `02` §6.2's chain and writes one transition row per edge, all flagged manual and attributed to the admin (`REQ-SES-012`). |
| `RPC-clock.service_role_only` | Neither clock function is executable by `authenticated` or `anon`; only the worker's role may call them (migration `0022`). |
| `RPC-clock.idempotent` | Running either twice moves a session once, and neither ever moves a session backwards: a session an admin started, completed or cancelled early is left alone (`REQ-SES-004`, `REQ-SES-005`). |
| `RPC-clock.closes_check_in` | Completing a session expires its live check-in codes in the **same** transaction (`REQ-CHK-004`). |
| `RPC-transition_session.admin_only` | A member, a moderator, a presenter and a stale admin are all refused; an admin of another org cannot reach the session (migration `0023`). |
| `RPC-transition_session.edges` | Only `02` §6.2's edges are accepted — starting a draft, completing a published session, archiving anything but a completed one are all refused; `reopen` is archived → completed (`cancelled` has no outgoing edge). |
| `RPC-transition_session.cancel` | Cancelling requires a reason, keeps the page and the row, and is reachable from `completed` (`REQ-SES-010`). |
| `RPC-transition_session.closes_check_in` | Completing early — or cancelling — closes the check-in window in the same transaction (`REQ-CHK-004`). ★ *Since `0089` (`DEC-141`) by setting `check_in_open = false`, not by truncating the code.* |
| `POL-sessions.transition.legal` | Every edge of `02` §6.2, and the presenter-decline return to `draft` (`REQ-PRO-007`), is accepted; `draft → published`, `approved → in_progress`, `completed → draft`, `published → draft` and anything out of `cancelled` are refused with `23514` — even by the migration owner, past every RPC (migration `0024`). |
| `POL-sessions.transition.rpcs_pass` | `publish_session()`'s walk, both clock functions, `transition_session()` and the decline trigger all still succeed through the guard (migration `0024`). |
| `POL-evidence.occurred_at.ordered` | `audit_log` and `session_state_transitions` rows written by one transaction carry strictly increasing `occurred_at`; the publish chain's rows order by time alone (migration `0024`, DEC-046). |
| `RPC-enqueue_job.definer_only` | No client role can call `public.enqueue_job()` — `anon`, `authenticated` and a stale admin are refused on the grant; a `security definer` RPC and the worker's role can (migration `0025`, DEC-046). |
| `RPC-enqueue_job.replace` | Enqueuing twice with one key leaves **one** pending job, moved to the later `run_at` — a rescheduled reminder moves rather than duplicating (`REQ-NTF-004`, `11` §1.1). |
| `RPC-enqueue_job.loud` | Without the `graphile_worker` schema the call raises `3F000` naming the fix; a job is never silently dropped. A task name that is not a snake_case identifier is refused with `22023`. |
| `POL-notifications.insert` | **No role** may insert: job-written through `notify()`. (migration `0026`). |
| `POL-notifications.update.read_at` | A member marks their own row read; `key`, `payload` and `member_id` are outside the column grant. (migration `0026`). |
| `POL-notification_preferences.self` | A member reads and writes only their own preferences. (migration `0026`). |
| `POL-notification_preferences.not_switchable` | A row disabling `certificates`, `moderation` or `account` is rejected by the constraint (`08` §2). (migration `0026`). |
| `POL-notification_templates.select.admin` | A plain member reads no template; the org admin does. (migration `0026`). |
| `POL-notification_templates.required_fields` | A template whose body omits a declared `required_fields` entry is refused **before it is saved** (`REQ-NTF-007`). (migration `0026`). |
| `POL-notification_templates.matrix` | A template for a key or channel absent from `08` §1 is refused (`REQ-NTF-002`). (migration `0026`). |
| `POL-email_deliveries.select.admin` | An org admin sees bounces with the reason; a member sees nothing, not even their own. (migration `0026`). |
| `POL-calendar_events.select.self` | A member sees only their own sync rows; insert and update have no policy and no grant. (migration `0026`). |
| `POL-scoring_rules.select` | any org member reads the catalogue (REQ-PTS-003) (migration `0027`). |
| `POL-scoring_rules.update.admin` | a moderator changing a point value is rejected (migration `0027`). |
| `POL-scoring_rules.catalogue` | inserting action_key = 'rsvp' is rejected (REQ-PTS-010) (migration `0027`). |
| `POL-scoring_rules.immutable_key` | action_key and actor cannot be changed by update (column grant) (migration `0027`). |
| `POL-scoring_rules.history` | a rule edit appends to scoring_config_history (scope='scoring') (migration `0027`). |
| `POL-points_ledger.insert` | direct insert rejected for authenticated AND service_role (migration `0027`). |
| `POL-points_ledger.update` | update and delete raise for every client role including service_role (migration `0027`). |
| `POL-points_ledger.select` | a member reads only their own rows; an admin reads the org's (migration `0027`). |
| `POL-points_ledger.idempotency` | awarding the same source event twice inserts one row (proven again once award_points() exists) (migration `0027`). |
| `POL-points_balances.select` | org-wide read, no client writes (migration `0027`). |
| `POL-badges.select` · `POL-badges.update.admin` | P1/P2, no delete (retiring ≠ deleting, REQ-REC-001) (migration `0027`). |
| `POL-levels.select` · `POL-levels.update.admin` | P1/P2, no delete (migration `0027`). |
| `POL-streak_rules.select` · `POL-streak_rules.update.admin` | P1/P2, no delete (migration `0027`). |
| `POL-perks.select` · `POL-perks.update.admin` | P1/P2, no delete (migration `0027`). |
| `POL-member_badges.select` | org-wide read, no client writes (job/admin RPC only) (migration `0027`). |
| `POL-member_perks.select` | same (migration `0027`). |
| `POL-streak_awards.select` | same (migration `0027`). |
| `POL-leaderboard_snapshots.select` | org-wide read, no client writes (migration `0027`). |
| `POL-leaderboard_snapshots.immutable` | a final (is_final) snapshot refuses update and delete, for every role including the owner (migration `0027`). |
| `POL-leaderboard_entries.select.opt_out` | an opted-out member is absent from others' view, present in their own; company rows unaffected (REQ-LDR-008) (migration `0027`). |
| `POL-leaderboard_entries.immutable` | entries of a final snapshot refuse update and delete (migration `0027`). |
| `POL-orgs.seed_scoring` | inserting a row into orgs seeds all five M4 catalogues for it (proven on the fixture orgs, which insert into orgs directly) (migration `0027`). |
| `RPC-award_points.definer_only` | no client role can call it; only service_role (the worker) and the function owner can (migration `0028`). |
| `RPC-award_points.silent_skip` | a disabled rule, an exhausted cap, or a live cooldown award nothing and raise nothing (migration `0028`). |
| `RPC-award_points.idempotent` | the same (rule, source, source_id, member) quadruple inserts at most one row, via on conflict do nothing (migration `0028`). |
| `POL-check_in.award_points_hook` | a successful check-in enqueues exactly one `award_points` job, keyed `pts:check_in:<check_in.id>` (migration `0028`). |
| `POL-ratings.award_points_hook` | a rating insert enqueues one `award_points` job keyed `pts:rating:<rating.id>` (migration `0029`). |
| `POL-comments.award_points_hook` | a comment insert (top-level or a reply) enqueues one `award_points` job keyed `pts:comment:<comment.id>` (migration `0029`). |
| `RPC-notification_send_context.definer_only` | `anon`, `authenticated` and an org admin are refused on the grant: it returns another member's email address. (migration `0030`). |
| `RPC-notification_send_context.recheck` | It reports the preference as it stands NOW, not as it stood when the job was enqueued (`11` §2.6). (migration `0030`). |
| `RPC-record_email_delivery.append` | The worker records a send it has not made yet as `queued`, then moves it to `sent`, `delivered`, `bounced` or `failed` — no send is unlogged. (migration `0030`). |
| `RPC-update_email_delivery_by_provider.scoped` | The provider webhook can only move a row it can name by `provider_message_id`, and cannot invent one. (migration `0030`). |
| `POL-proposals.award_points_hook` | an approval enqueues one proposal_accepted award_points job per accepted presenter (proposer included), keyed pts:proposal_accepted:<proposal_id>:<member_id> (migration `0031`). |
| `POL-sessions.completion_fanout` | a session reaching `completed` enqueues one evaluate_no_shows job (key noshow:<session_id>) and, per accepted session presenter, two award_presenter_points jobs (immediate and +48h), keyed pts:presenter:<session_id>:<member_id> and the same with a :rating_bonus suffix (migration `0031`). |
| `RPC-adjust_points_manually.admin_only` | a moderator and a stale admin are refused; a fresh admin succeeds; a caller-error (empty reason, zero amount, another org's member) raises before anything is written (migration `0032`). |
| `RPC-adjust_points_manually.audited` | the ledger row and the audit_log row commit in the same transaction (migration `0032`). |
| `POL-comments.reversal_hook` | a moderator's removal of a comment writes a compensating reversal row for whatever the original comment award was (nothing, if it was capped or cooled down), and separately evaluates the off-by-default comment_removed penalty (migration `0032`). |
| `RPC-audit_balances.service_role_only` | no client role may call it (migration `0033`). |
| `RPC-audit_balances.no_self_heal` | a divergence is reported, not corrected; points_balances is unchanged by calling it (migration `0033`). |
| `RPC-rebuild_points_balances.reproduces` | truncate + resum always reproduces the same totals a correct rollup would already show (migration `0033`). |
| `RPC-cancel_job.definer_only` | No client role can remove a queued job; a definer RPC and the worker can. (migration `0034`). |
| `RPC-schedule_session_reminders.moves` | Rescheduling a session leaves ONE pending job per (member, offset), at the new time — not a second set (`REQ-NTF-004`). (migration `0034`). |
| `RPC-schedule_session_reminders.past` | An offset whose moment has passed is REMOVED, not left to fire the instant the worker sees it. (migration `0034`). |
| `RPC-schedule_session_reminders.confirmed_only` | A waitlisted member has no reminders; being promoted gives them the full set. (migration `0034`). |
| `POL-rsvps.notice` | Reserving notifies the member, promotion off the waitlist notifies them on both channels (`REQ-RSV-004`), and cancelling removes their reminder keys. (migration `0034`). |
| `RPC-send_reminder_notification.still_due` | A reminder for a seat that was cancelled, or for a session that was, sends nothing — the job may outlive the reason for it. (migration `0035`). |
| `RPC-send_rsvp_nudge.non_responders` | Only members with NO rsvp row are nudged, and never a presenter of the session. (migration `0035`). |
| `RPC-send_rating_prompt.unrated` | Filtered at SEND time: a member who rated in the first hour is not prompted (`REQ-RAT-007`). (migration `0035`). |
| `RPC-send_*.definer_only` | All three are the worker's; no client role may fan out a notification to an org. (migration `0035`). |
| `POL-sessions.change_notice` | Moving a published session notifies confirmed AND waitlisted members with both values, moves their reminders, and enqueues one calendar upsert per confirmed seat. (migration `0036`). |
| `POL-sessions.change_notice.non_optional` | `MSG-session_changed` and `MSG-session_cancelled` reach a member who muted `my_sessions` on both channels (`08` §1.7). (migration `0036`). |
| `POL-sessions.change_notice.unpublished` | Editing a draft notifies nobody: there is nobody holding a seat to mislead. (migration `0036`). |
| `POL-sessions.cancel_notice` | Cancelling removes every reminder key and the nudge, enqueues a calendar delete per seat, and tells confirmed and waitlisted members why. (migration `0036`). |
| `POL-sessions.publish_notice` | Publishing announces the session once, to active members, and never twice for one session. (migration `0036`). |
| `POL-materials.select.phase` | An `after` material is invisible to a member until the session is `completed`; visible to the presenter throughout. (migration `0037`). |
| `POL-materials.insert.presenter` | A member who is not a presenter cannot add a material. (migration `0037`). |
| `POL-materials.update.window` | A presenter removes their own material before completion; the same presenter is refused after completion; an admin removes it anyway. (migration `0037`). |
| `POL-materials.hard_delete.admin_only` | A member and a presenter are refused a hard `delete`; an admin succeeds. (migration `0037`). |
| `POL-material_versions.select.phase` | Follows the parent material's phase gate exactly. (migration `0037`). |
| `POL-material_pages.select` | No rows exist for a Keynote material (DEC-006; no such row can exist at all since DEC-058); follows the parent's phase gate with no `allow_download` conjunct. (migration `0037`). |
| `POL-materials.kind_pdf_only` | An insert with kind `powerpoint` or `keynote` is refused `23514` by `materials_kind_pdf_only`, for every role including the owner (DEC-058). (migration `0077`). |
| `POL-session_tasks.write.presenter` | A member who is not a presenter cannot insert, update or delete a session task; the presenter and an admin can. (migration `0037`). |
| `POL-task_completions.self` | A member reads and writes only their own completions; a presenter reads the session's (migration `0037`). |
| `RPC-store_calendar_connection.self` | A member can store only their OWN connection: the function takes no member id and reads `auth_member_id()`. (migration `0038`). |
| `RPC-store_calendar_connection.write_only` | Storing a token does not make it readable — the same member calling `select *` afterwards still gets `42501`. (migration `0038`). |
| `RPC-calendar_tokens_for_job.worker_only` | The ONLY function that returns a token, and no client role may call it (`03` §5.9c, `11` §2.2). (migration `0038`). |
| `RPC-record_calendar_sync.idempotent` | Running it twice for one (member, session) leaves ONE row — `REQ-CAL-004`'s idempotency is the constraint, not job logic. (migration `0038`). |
| `POL-calendar_connections.disconnect_notice` | Deleting the row notifies the member that existing events will no longer update (`MSG-calendar_disconnected`, non-optional). (migration `0038`). |
| `POL-comments.reply_notice` | A reply notifies the parent's author, and replying to yourself notifies nobody. (migration `0039`). |
| `POL-comments.mention_notice` | Every member in `mentions` is notified once; a mention of yourself, of the parent's author you already replied to, or of someone in another org, is not. (migration `0039`). |
| `POL-comments.removal_notice` | A moderator removing a comment tells its author (`MSG-content_removed`, non-optional). (migration `0039`). |
| `POL-proposals.decision_notice` | Approved, rejected and changes-requested each notify the proposer AND the co-presenters, carrying `decision_reason`. (migration `0039`). |
| `POL-proposal_presenters.invite_notice` | Being named as a co-presenter is non-optional; the decline notifies the proposer. (migration `0039`). |
| `POL-session_presenters.assigned_notice` | An assigned presenter is told (`REQ-PRO-007`). (migration `0039`). |
| `POL-reports.filed_notice` | A report reaches every moderator and admin of the org, and nobody else. (migration `0039`). |
| `POL-org_settings.reminder_reschedule` | Changing `reminder_offsets_minutes` removes every pending job under an offset that is no longer configured and adds one per new offset, for every confirmed seat in the org — no duplicates and no orphans. (migration `0040`). |
| `POL-org_settings.prompt_delay_reschedule` | Changing `rating_prompt_delay_minutes` moves the pending `rate:{session}` job of every completed session. (migration `0040`). |
| `RPC-evaluate_streaks.idempotent` | a member who already has a period's streak_awards row is never awarded twice for it (migration `0041`). |
| `RPC-evaluate_badges.idempotent` | member_badges' unique constraint makes a re-run a no-op; a `manual` metric badge is never auto-awarded (only an admin RPC can grant it — not yet built) (migration `0041`). |
| `RPC-evaluate_levels_perks.no_demotion` | a member's current_level_id never moves to a lower sort_order (REQ-REC-003) (migration `0041`). |
| `RPC-evaluate_levels_perks.perk_materialisation` | member_perks reflects level/badge state without a recursive check on the RSVP hot path (migration `0041`). |
| `RPC-*.service_role_only` | no client role may call any of the three (migration `0041`). |
| `RPC-snapshot_leaderboard.service_role_only` | no client role may call it (migration `0042`). |
| `RPC-snapshot_leaderboard.frozen_denominator` | active_member_count on a company snapshot never changes after it is taken, even if a member is later deactivated (migration `0042`). |
| `RPC-snapshot_leaderboard.provisional_replace` | re-running for the same (org, kind, period_start, period_end, category_id) before it is final replaces the entries; after is_final it cannot be re-run at all (the table's own immutability trigger, 0027, refuses the necessary delete) (migration `0042`). |
| `POL-leaderboard_entries.opt_out_at_write` | an opted-out member's row is still written (REQ-LDR-008: they still count toward their company's total and still see their own rank) — the RLS policy is what hides it from other members, not the snapshot itself (migration `0042`). |
| `RPC-photo_takedowns_hide.notifies` | Inserting a takedown writes an in-app `MSG-photo_hidden` notification to the photo's uploader, whose payload names the photo and session but never the requester. (migration `0043`). |
| `RPC-all_time_leaderboard.opt_out` | an opted-out member is absent from another member's call, present in their own; a deactivated member never appears at all (unlike a snapshot, which has no "still a member" concept to check) (migration `0044`). |
| `POL-rsvps.priority_window` | a member without the perk is refused during the priority window; a member with it is not; after the window everyone is treated identically, whether or not they hold it (migration `0045`). |
| `RPC-finalize_material_upload.authority` | A member who is neither the session's presenter nor an org admin is refused `42501`. (migration `0046`). |
| `RPC-finalize_material_upload.size` | A byte size over the org's `limit_document_mb`/`limit_audio_mb`/`limit_image_mb` for the material's kind is refused `23514`, naming the limit. (migration `0046`). |
| `RPC-finalize_material_upload.enqueues` | A `pdf` material enqueues `convert_document` keyed `conv:{version_id}`; an `image`/`audio` material does not, and its `render_status` is `not_applicable`. (migration `0046`, amended `0077` — DEC-058). |
| `RPC-finalize_material_upload.version_number` | A second call for the same material inserts version 2 and moves `current_version_id`, leaving version 1's row and its pages untouched (`REQ-MAT-010`). (migration `0046`). |
| `RPC-award_badge_manually.admin_only` | a moderator and a stale admin are refused (migration `0047`). |
| `RPC-award_badge_manually.reason_mandatory` | an empty reason raises before anything is written (member_badges' own check constraint backs this up structurally) (migration `0047`). |
| `RPC-award_badge_manually.idempotent` | awarding the same badge twice to the same member is a no-op, not an error (migration `0047`). |
| `RPC-record_material_conversion.service_role_only` | `authenticated` and `anon` are both refused on the grant; `service_role` succeeds. (migration `0048`). |
| `RPC-record_material_conversion.enqueues` | A successful call with a page count enqueues `render_pages` keyed `pages:{version_id}`; a failed call (or one with no page count) enqueues nothing. (migration `0048`). |
| `RPC-record_material_conversion.superseded` | A call naming a version that is no longer `current_version_id` changes nothing on `materials`, but still enqueues (the version's own row is still worth rendering, if it somehow gets there — in practice the job that would do that was itself for the version that superseded it). (migration `0048`). |
| `RPC-record_material_pages.service_role_only` | Same as above. (migration `0048`). |
| `RPC-record_material_pages.upsert` | A second call for the same version and page number replaces that page's paths rather than duplicating the row (`unique (material_version_id, page_number)`, 0037). (migration `0048`). |
| `RPC-record_material_pages.ready` | A successful call moves `render_status` to `ready`. (migration `0048`). |
| `RPC-record_material_download.admin_only` | A member and a moderator are both refused `42501`; an admin writes one audit row naming the material and the version. (migration `0049`). |
| `POL-storage.materials.preupload_self_read` | Before a material's `material_versions` row exists, only whoever `materials_storage_write` would have let write to that exact prefix — the session's presenter, the proposal's owner, or staff — can read the object back; nobody else, and the ordinary phase/`allow_download` branches are unaffected once the version row exists. (migration `0054`). |
| `POL-materials.proposal.visibility` | A proposal's own materials are visible to its proposer, an accepted co-presenter, and staff — never to a plain member — until the proposal becomes a session. (migration `0053`). |
| `POL-materials.proposal.write` | The same three may upload/update a proposal's materials; nobody else. (migration `0053`). |
| `RPC-carry_over_proposal_materials.trigger` | A session inserted with a `proposal_id` reassigns every material with that `proposal_id` to the new session (`session_id` set, `proposal_id` cleared), leaving `phase`/`allow_download` untouched. (migration `0053`). |
| `POL-storage.materials.proposal_write` | The `materials` bucket's write policy accepts a `{org}/proposals/{proposal_id}/materials/…` prefix for the proposal's owner/co-presenter/staff, the same shape the `{org}/sessions/{session_id}/materials/…` prefix already had. (migration `0053`). |
| `POL-materials.phase_change.audited` | Changing `phase` writes one `audit_log` row naming the old and new value; changing `title` or `allow_download` alone writes none. (migration `0052`). |
| `RPC-initiate_photo_processing.authority` | A member with a confirmed RSVP and no check-in, who is not the session's presenter or org staff, is refused `42501` — REQ-EVT-009, mirroring `photos_storage_write`. (migration `0050`). |
| `RPC-initiate_photo_processing.size` | A declared byte size over the org's `limit_image_mb` is refused `23514`, naming the limit — the courtesy check; `record_photo_upload`'s is the control, against the REAL (post-strip) size. (migration `0050`). |
| `RPC-initiate_photo_processing.enqueues` | A successful call enqueues `process_photo` keyed `photo:{photo_id}`. (migration `0050`). |
| `RPC-record_photo_upload.service_role_only` | `authenticated` and `anon` are both refused on the grant; `service_role` succeeds. (migration `0050`). |
| `RPC-record_photo_upload.exif_stripped` | Every row this function inserts has `exif_stripped = true` — it is the ONLY door that can ever create a `photos` row (03 §5.6c's `with check (exif_stripped)` says the same thing again, as a constraint rather than a door). (migration `0050`). |
| `RPC-record_photo_upload.size_envelope` | A real byte size over the org's `limit_image_mb` returns `{status: 'file_too_large', limit_mb}` and inserts no row, rather than raising (DEC-043). (migration `0050`). |
| `RPC-record_photo_upload.idempotent` | A second call with the same `p_photo_id` (a retried job) returns the already-inserted row's envelope rather than erroring on the primary key. (migration `0050`). |
| `POL-photos.restore.audited` | `hidden_at` going from set to null writes one `audit_log` row naming the photo. (migration `0051`). |
| `POL-photos.removal.audited` | `removed_at` going from null to set writes one `audit_log` row naming the photo and `removed_by`. (migration `0051`). |
| `POL-task_form_responses.select` | A moderator reading form responses gets nothing (`REQ-ADM-020`). (migration `0037`). |
| `POL-photos.insert.checked_in` | A member with a confirmed RSVP and no check-in is rejected; the same member, after checking in, succeeds. (migration `0037`). |
| `POL-photos.insert.exif` | Inserting with `exif_stripped = false` is rejected by the table constraint. (migration `0037`). |
| `POL-photo_takedowns.insert` | Inserting hides the photo in the same transaction, before any other read. (migration `0037`). |
| `POL-photo_takedowns.restore` | A moderator resolving with `restored` unhides the photo; `resolved_by` is stamped, never trusted from the client. (migration `0037`). |
| `POL-photos.select.hidden` | A hidden photo is invisible to a member, visible to staff. (migration `0037`). |
| `POL-tags.insert.admin` · `POL-tags.delete.admin` | A member's insert is rejected; an admin's succeeds; a moderator cannot delete a tag, an admin can. (migration `0037`). |
| `POL-session_tags.write.presenter` | A non-presenter member cannot tag a session they do not present; the presenter and an admin can. (migration `0037`). |
| `POL-bookmarks.self` | A member reads and writes only their own bookmarks; another member's bookmark is invisible. (migration `0037`). |
| `POL-search.ar_normalize` | «معرفات» and «مُعرِّفات» normalise to the same string; «إدارة» and «ادارة» too. (migration `0037`). |
| `POL-storage.materials.prefix` | An authenticated write to another org's prefix is rejected. (migration `0037`). |
| `POL-storage.materials.download` | With `allow_download = false`, the joined `materials` bucket read policy denies a member (but not the presenter or staff). (migration `0037`). |
| `POL-storage.material_pages.phase` | An `after` page image is denied to a member before completion, regardless of `allow_download`. (migration `0037`). |
| `POL-storage.photos.hidden` | A hidden photo's object is denied to a member, permitted to staff. (migration `0037`). |
| `POL-storage.exports.write` | An authenticated client cannot write to `exports`; only `service_role` can (bypassrls, not a policy). (migration `0037`). |
| `POL-storage.fonts.read` | Any authenticated member reads the `fonts` bucket with no org prefix required. (migration `0037`). |
| `RPC-notify.matrix_closed` | A key absent from `08` §1 raises `22023` — nothing outside the matrix can be sent (`REQ-NTF-002`). (migration `0026`). |
| `RPC-notify.preference` | A member who disabled a category gets no inbox row and no job; the call is a no-op, not an error. (migration `0026`). |
| `RPC-notify.non_optional` | One of `08` §1.7's messages is written and enqueued even with both channels disabled. (migration `0026`). |
| `RPC-notify.definer_only` | `anon`, `authenticated` and an org admin are all refused on the grant; a definer RPC and `service_role` succeed. (migration `0026`). |
| `RPC-notify.enqueues_in_transaction` | The `notify:{message_id}` job and the `notifications` row commit or roll back together (`02` §4.17). (migration `0026`). |
| `POL-session_presenters.select.member` · `POL-session_presenters.insert.admin` · `POL-session_presenters.update.self` · `POL-session_presenters.delete.admin` | Org-readable; an admin adds and removes; the named member accepts or declines only their own row. |
| `POL-session_state_transitions.select.staff_or_presenter` | A member reads none; staff read the org's; the session's presenter reads their own session's; no role inserts directly. |
| `POL-check_in_attempts.select.staff` | A member — including the attempter — reads none; staff read the org's; no role inserts directly. |
| `POL-reactions.select.member` · `POL-reactions.write.self` | Org-readable; a member adds and removes only their own; a duplicate `(member, comment, kind)` is rejected. |
| `POL-reports.select.staff_or_reporter` · `POL-reports.insert.self` · `POL-reports.update.staff` | The reporter and staff read; a member cannot read another's report; a member cannot resolve; a moderator resolves through the column grant. |
| `POL-proposals.update.own` | A proposer cannot write `decision_reason`; cannot edit an `approved` proposal. |
| `POL-proposals.transition.audit` | Creating a proposal and submitting it each write an `audit_log` row; a member cannot suppress either, and cannot write one directly (`REQ-PRO-006`, migration `0011`). |
| `POL-proposals.transition.legal` | `changes_requested → draft` and `submitted → approved` are refused with `23514`; `draft → submitted` and `in_review → approved` succeed (`02` §6.1, migration `0011`). |
| `POL-sessions.select.member` | A `draft` session is invisible to members, visible to its presenter. |
| `POL-sessions.update.presenter` | A presenter setting `starts_at` is rejected — the column is not granted (D13). |
| `POL-sessions.update.presenter` | A presenter setting `state = 'published'` is rejected. |
| `POL-rsvps.insert.rpc` | Direct `insert into rsvps` is rejected for every role. |
| `POL-rsvps.reserve.capacity` | N concurrent reservations, N−1 seats → exactly N−1 confirmed, rest waitlisted, no duplicates. |
| `POL-rsvps.reserve.deadline` | Reserving after `rsvp_deadline_at` is rejected; **promotion after it succeeds** (OQ-002). |
| `POL-rsvps.select.member` | Member B cannot read member A's RSVP; staff and the presenter can. |
| `POL-check_in_codes.select.member` | A **checked-in** member reading the current code gets nothing (OQ-013). |
| `POL-check_in_codes.select.presenter` | The session's presenter reads it; a presenter of a *different* session does not. |
| `RPC-check_in.reservation_required` | With `allow_walk_ins` off, a member with no confirmed reservation gets `reservation_required` — the attempt is recorded, the code is not revealed as right or wrong; with it on, the same member checks in (migration `0079`, DEC-065). |
| `RPC-set_session_walk_ins.staff` | A member and a presenter are refused `42501`; an admin and a moderator flip the flag, audited as `session.walk_ins_changed` (migration `0079`). ★ *Retired with the function by `0085` (`DEC-118`) — see `RPC-set_session_walk_ins.retired`.* |
| `POL-sessions.public_card.anon` | `session_public_card()` as `anon` on a published, in-progress or completed session returns exactly the public fields (title, times, time zone, venue name, org name, the poster's `og.png` path and size — `numerals` left the row type in migration `0082`, DEC-124/DEC-132); the abstract, presenters, capacity and every other column are absent from the return type. A draft, approved, archived or cancelled session, a suspended org's session and an unknown uuid are the same empty answer. `anon` still has no policy on `sessions`, `venues`, `session_posters` or `export_artifacts` (migration `0080`, DEC-066). |
| `POL-storage.exports.public_card` | `anon` reads the `og.png` object of a card-eligible session's poster and nothing else in `exports` — not the same poster's `master`, `a4`, `og.webp` or `cert_*`, not a draft's or a cancelled session's — and cannot write. A member of ANOTHER org reads the same object and no more: signing in never shows less than being a stranger (migration `0080`). |
| `POL-company_scoring_rules.select` | Any org member reads the company rule catalogue; another org's rows are invisible (migration `0081`, DEC-067). |
| `POL-company_scoring_rules.update.admin` | A moderator changing a value is rejected; an admin's edit succeeds and appends to `scoring_config_history` with scope `company_scoring` (`.history`). |
| `POL-company_scoring_rules.catalogue` · `.shape` | An `action_key` outside the three is rejected; a hosting row cannot carry a percent configuration and vice versa. |
| `POL-company_points_ledger.insert` · `.update` · `.select` · `.idempotency` | A direct insert is rejected for `authenticated` AND `service_role`; update and delete raise for every client role including `service_role` (append-only, invariant 9); the read is org-wide (a company has no session); evaluating the same session twice inserts no duplicate rows. |
| `POL-company_points_balances.select` | Org-wide read, no client writes; the rollup trigger is the only writer. |
| `RPC-evaluate_company_points.service_role_only` · `.hosting` · `.attendance_pct` · `.presenting_pct` | No client role may call it; a session with `host_company_id` set and the rule enabled credits the hosting points once; a company's share of its own active members who checked in (and, separately, who presented as accepted presenters) credits `round(percent × points_per_percent)` capped, only above `min_active_members`. |
| `RPC-audit_company_balances.service_role_only` · `.no_self_heal` | Mirrors `audit_balances()` exactly: worker-only, reports divergence, never repairs it. |
| `RPC-rebuild_company_points_balances.reproduces` | Truncate and re-sum always reproduces the same totals from the ledger. |
| `POL-sessions.host_company_same_org` | A session cannot be assigned a host company from another org (`sessions_host_company_same_org`). |
| `RPC-snapshot_leaderboard.company_ledger_included` | The company board's total is the member-derived sum plus the company ledger's sum for the period; the frozen `active_member_count` denominator is unchanged. |
| `RPC-ensure_check_in_code.only_live` | The presenter of a `published` session is refused `not_open` before it starts and after it ends; once `in_progress` the same call returns a code (migration `0078`). ★ *Superseded by `RPC-ensure_check_in_code.floor_ceiling` (`0084`, `DEC-141`).* |
| `POL-check_ins.insert.rpc` | Direct insert is rejected; `check_in()` with a valid code succeeds. |
| `POL-check_ins.rate_limit` | 11 attempts in 10 minutes → the 11th returns `status = 'rate_limited'`, and the attempt is still recorded. (An exception would roll back the attempt row written in the same call — DEC-043; `check_in()` returns an envelope for every outcome after the attempt insert and raises only for `not_found`, before anything is logged.) |
| `POL-check_ins.window` | A valid code before `starts_at` and after `ends_at` is rejected. ★ *Since `0084` (`DEC-141`) the ceiling is `ends_at` + 2 h — see `RPC-check_in.floor` / `.ceiling`.* |
| `POL-check_ins.revoked` | A revoked code is rejected; check-ins already recorded with it stand. |
| `POL-check_ins.single_use` | A second check-in is a no-op returning the first, with `status = 'already_checked_in'` so SCR-014 renders its own state (`09`). |
| `POL-check_ins.overlap` | Checking in to an overlapping session raises on the exclusion constraint. |
| `POL-check_ins.presenter` | A presenter checking in to their own session is rejected (OQ-025). |
| `POL-check_ins.select.member` | A member cannot list who else attended (A33 rule 3). |
| `POL-materials.select.phase` | An `after` material is invisible to a member until the session is `completed`; visible to the presenter throughout. |
| `POL-materials.insert.presenter` | A member who is not a presenter cannot add a material. |
| `POL-material_pages.select` | No rows exist for a Keynote material (DEC-006). |
| `POL-task_form_responses.select` | A moderator reading form responses gets nothing. |
| `POL-comments.insert.member` | A member with no RSVP and no check-in **can** comment (D32). |
| `POL-comments.update.window` | Editing at 14 minutes succeeds; at 16 minutes is rejected. |
| `POL-comments.update.moderator` | A moderator can set `deleted_at` and **cannot** change `body`. |
| `POL-comments.depth` | A reply to a reply attaches to the parent thread. |
| `POL-photos.insert.checked_in` | A member with a confirmed RSVP and **no check-in** is rejected. |
| `POL-photos.insert.checked_in` | The same member, after checking in, succeeds. |
| `POL-photos.insert.exif` | Inserting with `exif_stripped = false` is rejected by the constraint. |
| `POL-photo_takedowns.insert` | Inserting hides the photo **in the same transaction**. |
| `POL-ratings.insert.check_in` | A member with an RSVP and no check-in cannot rate. |
| `POL-ratings.insert.check_in` | Supplying another member's `check_in_id` is rejected. |
| `POL-ratings.insert.window` | Rating 15 days after completion is rejected. |
| `POL-ratings.select.presenter` | A presenter selecting from `ratings` gets **zero rows** — not redacted rows. |
| `POL-ratings.aggregate.min` | With 2 ratings the aggregate view returns nothing; with 3 it returns a value (OQ-009). |
| `POL-ratings.select.admin` | An org admin's **direct** select on `ratings` returns zero rows (DEC-044, migration `0017`); a moderator's too. |
| `POL-ratings.select.admin.audited` | `list_session_ratings_admin()` returns the org's rows for that session to a fresh admin **and writes one `audit_log` row naming them**; a moderator and a stale admin are refused; another org's session is refused (`REQ-RAT-005`, migration `0017`). |
| `RPC-session_rating_count` | Below `rating_min_aggregate` the presenter and staff get the bare **count**; a member gets nothing; another org's presenter gets nothing (`REQ-RAT-006`, migration `0019`). |
| `RPC-delete_own_comment` | The author soft-deletes their own comment **after** the edit window; another member cannot; a tombstone remains when replies exist (`REQ-EVT-005`, migration `0018`). |
| `POL-points_ledger.insert` | Direct insert is rejected for `authenticated` **and** `service_role`. |
| `POL-points_ledger.update` | `update` and `delete` raise for every role including `service_role`. |
| `POL-points_ledger.select` | A member reads only their own rows; an admin reads the org's. |
| `POL-points_ledger.idempotency` | Awarding the same source event twice inserts one row. |
| `POL-scoring_rules.update.admin` | A moderator changing a point value is rejected. |
| `POL-scoring_rules.catalogue` | Inserting `action_key = 'rsvp'` is rejected (`REQ-PTS-010`). |
| `POL-leaderboard_entries.select.opt_out` | An opted-out member is absent from B's view, present in their own, and **the company row is unchanged**. |
| `POL-certificates.select.held` | A `held` certificate is invisible to its recipient, visible to an admin. |
| `POL-certificates.verify.anon` | `verify_certificate()` with a valid code returns exactly A13's fields. |
| `POL-certificates.verify.anon` | With a **serial** instead of a code: empty. |
| `POL-certificates.verify.anon` | Unknown code and revoked-nonexistent code are **indistinguishable**. |
| `POL-certificates.serial.gapless` | A rolled-back issuance leaves `next_value` unchanged. |
| `POL-certificates.serial.per_org` | Two orgs both issue `…-000001` without collision. |
| `POL-certificate_serial_counters.*` | Direct select by any role is rejected. |
| `POL-design_templates.select.platform` | An org admin **reads** a platform template. |
| `POL-design_templates.update.platform` | An org admin **cannot update** one (`REQ-DSG-008`). |
| `POL-design_assets.insert.mime` | An SVG with a `.png` name is rejected on `sniffed_mime` (DEC-009). |
| `POL-fonts.select` | A font at `parity_status = 'pending'` is not selectable in the picker. |
| `POL-calendar_connections.select` | **No role** can select a token column — member, admin, moderator alike. |
| `POL-calendar_connections.delete` | Disconnect deletes the row; the tokens are gone immediately. |
| `POL-notifications.select.self` | A member cannot read another's notifications. |
| `POL-audit_log.insert` | Direct insert is rejected; `write_audit()` succeeds. |
| `POL-audit_log.update` | `update` and `delete` raise for every role. |
| `POL-audit_log.select.moderator` | A moderator sees their own actions and not the admin's. |
| `POL-design_templates.select.platform` | An org admin reads a platform template; org B's own templates are invisible. (migration `0055`). |
| `POL-design_templates.update.platform` | An org admin cannot update a platform template (`REQ-DSG-008`). (migration `0055`). |
| `POL-design_templates.insert.org` | An admin cannot create a platform-scope template; a plain member cannot create any. The scope/`org_id` and family/purpose constraints hold. (migration `0055`). |
| `POL-design_template_versions.read` | Read follows the parent; a platform template's version is readable and not writable; a published version has no update and no delete grant (`REQ-DSG-007`); `org_id` mirrors the parent. (migration `0055`). |
| `POL-design_template_versions.guard` | A hard-coded colour, an unknown layer kind or a duplicate layer id is refused by the trigger (`REQ-DSG-021`, `REQ-DSG-005`). (migration `0055`). |
| `POL-design_documents.read` | The presenter of the bound session sees the document, another member does not, the admin does; a member sees the document behind their own certificate only. (migration `0055`). |
| `POL-design_documents.write` | Design is an admin act (`REQ-DSG-002`): a presenter cannot edit their own poster document. (migration `0055`). |
| `POL-design_documents.locked` | A locked region cannot be moved, resized, hidden, unlocked or deleted (`REQ-DSG-024`). (migration `0055`). |
| `POL-design_assets.insert.mime` | An SVG named `.png` is rejected on `sniffed_mime`, never on the filename (DEC-009); a plain member cannot add or remove an asset; an asset is never updated in place. (migration `0055`). |
| `POL-fonts.select` | Every member reads the manifest; only the job writes it; a font cannot reach `passed` without Arabic coverage (A39). (migration `0055`). |
| `POL-export_artifacts.select` | Select follows the document; no client role writes one; `source_fingerprint` is the cache key — the same source cannot be stored twice (`REQ-DSG-013`). (migration `0055`). |
| `POL-session_posters.*` | An `auto` poster is always live (structural); every member reads the poster, only an admin writes it, nobody deletes it. (migration `0055`). |
| `POL-certificates.constraints` | An attendee certificate without a `check_in_id` is refused by the table (`REQ-CRT-001`); the same session, member and kind cannot be certified twice (`REQ-CRT-003`); a revoked certificate must carry a reason (`REQ-CRT-011`). (migration `0055`). |
| `POL-certificates.select.held` | A held certificate is invisible to its recipient and visible to the admin (`REQ-CRT-004`); writes are RPC-only for every role. (migration `0055`). |
| `POL-certificates.serial` | A rolled-back issuance leaves `next_value` unchanged; two orgs both issue `…-000001`; the counter table has no policy and no grant (`REQ-CRT-008`, DEC-010). (migration `0055`). |
| `POL-certificates.verify.anon` | `verify_certificate()` resolves by code and returns the A13 fields and nothing else; a serial returns not-found; unknown and held are the same empty answer (`REQ-CRT-007`, `REQ-CRT-009`). (migration `0055`). |
| `POL-admin_list_members.select.admin` | An admin reads every member of their org **with email** through `admin_list_members()`, and none of org B's (`REQ-ADM-009`). (migration `0056`). |
| `POL-admin_list_members.select.non_admin` | A member and a moderator get zero rows from the function, not an error. (migration `0056`). |
| `POL-admin_list_members.select.no_base_grant` | The base table's column grant still hides `email` from a direct select, admin included — the function is the only door (A33, DEC-044's pattern). (migration `0056`). |
| `POL-write_admin_export_audit.execute.admin` | An admin's export writes exactly one audit row naming the export type and the subject (`REQ-ADM-017`). (migration `0058`). |
| `POL-write_admin_export_audit.execute.non_admin` | A moderator and a member are both refused — the boundary is `assert_fresh_admin()`, not the route handler. (migration `0058`). |
| `POL-write_admin_export_audit.execute.own_org_only` | An admin cannot forge another org's export as their own subject; the audit row lands in the caller's own org. (migration `0058`). |
| `POL-comments.removal_audit` | A staff removal of a comment writes an audit row with the reason; a self-delete writes none (`REQ-EVT-014`, `REQ-ADM-018`). (migration `0059`). |
| `POL-remove_photo.staff_only` | `remove_photo()` is admin-or-moderator with a mandatory reason; a member is refused. (migration `0059`). |
| `POL-remove_photo.resolves_takedown_and_report` | One call hides the photo and resolves any open takedown and report on it in the same transaction (DEC-005). (migration `0059`). |
| `POL-remove_photo.reverses_points` | Removing a photo reverses its points the way a comment's removal does (`0032`'s deferred half). (migration `0059`). |
| `POL-remove_photo.own_org_only` | A staff member cannot remove another org's photo. (migration `0059`). |
| `POL-export_artifacts.request.admin` | A moderator's `request_render()` is refused; an admin's queues one row per target and returns them. (migration `0060`). |
| `POL-export_artifacts.cache` | Re-requesting an unchanged document re-renders nothing — the `ready` rows come back as they are (`REQ-DSG-013`). (migration `0060`). |
| `POL-export_artifacts.record.worker` | `record_export_artifact()` and `export_render_context()` are `service_role` only; an admin calling them is refused; `service_role`'s direct select on the table is refused too — the definer functions are the boundary. (migration `0060`). |
| `POL-export_artifacts.retry.admin` | An admin retries a `failed` artifact and it returns to `queued`; a `ready` one is left alone. (migration `0060`). |
| `POL-reminder_message_key.tolerance_band` | `reminder_message_key()` picks a fixed reminder message within ±20% of its offset and `MSG-reminder_generic` for anything else (`08` §1.2's fourth message, DEC-047). (migration `0062`). |
| `POL-reminder_message_key.default_unaffected` | Every default org offset still maps to the message it mapped to before. (migration `0062`). |
| `POL-notification_matrix.generic_key_accepted` | `MSG-reminder_generic` is in the matrix under `reminders`, so a template for it is accepted and a reminder carrying it is deliverable. (migration `0062`). |
| `POL-session_posters.publish` | Publishing a session enqueues `regenerate_poster` once, with `11` §2.5's key (`REQ-DSG-001`). (migration `0063`). |
| `POL-session_posters.detach` | `detach_poster()` flips binding to `detached` and mode to `customised`, one way: no call ever re-attaches (`REQ-DSG-003`). (migration `0063`). |
| `POL-session_posters.detach.admin` | A moderator's `detach_poster()` is refused. (migration `0063`). |
| `POL-session_posters.stale` | A data change on a detached poster sets `stale_since` and enqueues no render. (migration `0063`). |
| `POL-session_posters.live` | A data change on a live poster enqueues one render and leaves `stale_since` null. (migration `0063`). |
| `POL-request_render.system` | `system_request_render()`, `poster_render_context()` and `record_session_poster()` are `service_role` only; an admin calling them is refused. (migration `0063`). |
| `POL-fonts.materialise.admin` | An org admin requests a Google family and one `materialise_font` job is enqueued with `11` §2.5's key; a moderator is refused (`REQ-DSG-017`). (migration `0064`). |
| `POL-fonts.record.worker` | `record_font()` is `service_role` only; an admin calling it is refused. (migration `0064`). |
| `POL-fonts.gate` | A font recorded as `failed` carries the report naming which checks failed and stays unselectable (A39). (migration `0064`). |
| `POL-fonts.select.service_role` | `service_role` reads the manifest (a bucket-walking job sees every font) and still cannot write a row directly — the only write path stays `record_font()`. (migration `0067`). |
| `POL-brand_kits.select.member` | Any member of the org reads the kit; a member of another org gets nothing. (migration `0068`). |
| `POL-brand_kits.write.rpc_only` | `brand_kits` has no insert/update/delete grant to `authenticated`: a direct write is refused on the grant, even by an admin. (migration `0068`). |
| `POL-save_brand_kit.admin_only` | A member and a moderator are refused `42501`; an admin's save succeeds. (migration `0068`). |
| `POL-save_brand_kit.history` | A save writes one `scoring_config_history` row per changed column (`scope = 'branding'`) and one `audit_log` row, in the same transaction. (migration `0068`). |
| `POL-save_brand_kit.logo_ownership` | A logo asset belonging to another org is refused. (migration `0068`). |
| `POL-save_brand_kit.font_gate` | A font at `parity_status <> 'passed'` is refused for either face (A39). (migration `0068`). |
| `POL-reset_brand_kit.admin_only` | A moderator's reset is refused; an admin's deletes the row and is audited. (migration `0068`). |
| `POL-brand_kit.identity_default` | `public.brand_kit(p_org)` for an org with no row returns the platform defaults, matching `packages/designer-runtime/src/brand.ts` byte-for-byte. (migration `0068`). |
| `POL-brand_kit.override` | With a row, `public.brand_kit(p_org)` returns the org's own colours, not the platform defaults. (migration `0068`). |
| `POL-export_render_context.brand_identity` | For an org with no `brand_kits` row, the new `brand` column is `{}` and every previously-existing column is unchanged (the identity override, DEC-052). (migration `0068`). |
| `POL-export_render_context.brand_override` | For an org with a row, the `brand` column carries exactly its light/dark overrides and `logoAssetId`. (migration `0068`). |
| `POL-impersonation_sessions.append_only` | No role — `authenticated` or `service_role` — may insert, update or delete a row; `end_impersonation()` is the only writer of `ended_at`. (migration `0069`). |
| `RPC-start_impersonation.platform_only` | A member, an org admin and a stale admin are all refused `42501`; only a row in `platform_admins` passes, and the audit row lands in the target org's log with `platform_admin`. (migration `0069`). |
| `RPC-end_impersonation.actor` | The starting super admin and `service_role` (the expiry job) may end a session; another super admin and the org's own admin cannot. Ending twice is a no-op. (migration `0069`). |
| `POL-auth_hook.impersonation` | With an active session the hook mints `org_id`, `org_role = 'member'`, `status`, `org_status` and the session id, and NO `member_id`; after `ended_at` it mints none. It still never raises. (migration `0069`). |
| `RPC-set_first_admin.platform_only` | Only a platform admin may name an org's first admin; an existing member with that address is promoted and their `claims_version` bumps; the org's log records it. (migration `0069`). |
| `RPC-add_org_domain.platform_only` | A platform admin adds and removes a domain on an org it is not a member of; the audit row is attributed `platform_admin`, not `system` (`REQ-TEN-007`). (migration `0069`). |
| `POL-retention_periods.none` | RLS enabled, no policy, no grant — every client role and `service_role` are refused on the grant; `12` §5.3's periods are read through `retention_period()` alone. (migration `0069`). |
| `POL-platform_audit_log.none` | Same shape. The platform-side trail has no foreign key to `orgs`, so an `org.deleted` row survives the org. (migration `0069`). |
| `POL-data_export_requests.select.self` | A member reads their own export requests and nobody else's; no role may insert, update or delete directly — `request_data_export()` is the only door (`REQ-PRF-006`). (migration `0069`). |
| `RPC-platform_metrics.aggregate_only` | Both metrics functions refuse a non-platform-admin, and the two views expose counts alone — no member, no session title, no content column (`REQ-ADM-003`). (migration `0069`). |
| `RPC-promote_template_to_platform` | A published org version becomes a platform template by COPY; a later edit of the org template does not reach it; an unpublished version and a platform version are both refused (`REQ-DSG-008`). (migration `0069`). |
| `RPC-retire_platform_template.floor` | Retiring the last non-retired default for a purpose is refused — the A27 baseline never falls below one default per purpose (DEC-052). (migration `0069`). |
| `RPC-delete_org.slug` | Deletion needs the org's slug typed back; a wrong slug changes nothing. The org is suspended in the same transaction, the platform trail records it, and `orgdel:{org_id}` is enqueued once (`REQ-NFR-014`, `12` §5.5). (migration `0069`). |
| `RPC-assert_org_deleted` | After `perform_org_deletion()` no table with an `org_id` column holds a row for the id, walked dynamically so a table added later is covered the day it is created. (migration `0069`). |
| `RPC-platform_org.platform_only` | An org admin, a moderator, a member and `anon` are all refused `42501`; a platform admin gets the org's own row, its domains and its counts — and no member, title or content field. (migration `0070`). |
| `RPC-platform_impersonations.own` | A platform admin lists their OWN sessions across orgs; another platform admin's do not appear. The org's admins read the same fact through the table's own policy (`REQ-ADM-019`). (migration `0070`). |
| `POL-save_brand_kit.regenerates_live_posters` | Saving a kit enqueues `regenerate_poster` once per org session with a LIVE poster, with `11` §2.5's key; a `detached` (customised) poster is left alone. (migration `0071`). |
| `POL-reset_brand_kit.regenerates_live_posters` | Resetting a kit does the same; resetting an org with no kit enqueues nothing. (migration `0071`). |
| `RPC-platform_promotable_versions.platform_only` | An org admin, a moderator and a member are refused `42501`; a platform admin gets one row per PUBLISHED org version with its purpose, family, name and version number — and no document, no `published_by`, and nothing from a draft. (migration `0072`). |
| `RPC-platform_promotable_versions.scope` | Platform-scope versions never appear: the library does not offer to promote itself (`REQ-DSG-008`). (migration `0072`). |
| `RPC-enforce_retention.periods` | The sweep reads `retention_periods` and nothing else: a class marked `retain` deletes nothing, and the job is worker-only — `authenticated` and a platform admin are both refused. (migration `0073`). |
| `RPC-enforce_retention.idempotent` | A second run in the same window deletes nothing further, and never touches `points_ledger`. (migration `0073`). |
| `RPC-anonymise_members.total` | After anonymisation every org-level points total is UNCHANGED and no ledger row is gone; the member's personal columns are rewritten, `anonymised_at` is set, and the row keeps its id as the pseudonymous key (`REQ-PRF-007`, `12` §5.4). (migration `0073`). |
| `RPC-anonymise_members.window` | A member deactivated yesterday is left alone; only the period in `retention_periods` decides. (migration `0073`). |
| `RPC-build_data_export_payload.self_only` | The archive carries the member's own rows and no other member's personal data — another member's comment appears by display name alone, with no address and no id (`REQ-PRF-006`). (migration `0073`). |
| `RPC-record_data_export.worker` | Only `service_role` may mark a request ready or failed; the member can read their own row and write none of it. (migration `0073`). |
| `RPC-request_data_export.rate_limited` | A second request inside 24 hours is refused `42501` while an already-queued one is returned unchanged (`REQ-NFR-005`, `REQ-PRF-006`). (migration `0073`). |
| `RPC-my_data_export.self` | A member handed another member's request id gets their OWN latest row, never the other's archive. (migration `0073`). |
| `RPC-evaluate_alerts.worker` | `service_role` only — `authenticated`, a platform admin and `anon` are all refused on the grant. (migration `0075`). |
| `RPC-evaluate_alerts.eight` | It returns exactly the eight alerts of `11` §3.2, every call, whether or not any is firing. (migration `0075`). |
| `RPC-evaluate_alerts.isolation` | Seeding any ONE condition fires that alert and leaves the other seven quiet; clearing it stops the alert. (migration `0075`). |
| `RPC-evaluate_alerts.no_queue` | Without the `graphile_worker` schema the queue alert reports `not_installed` rather than raising — the drill runs in an environment that may not have it. (migration `0075`). |
| `RPC-platform_job_health.due` | A job scheduled in the future counts as neither pending nor old; a job overdue by an hour counts as both, and the age is never negative. (migration `0076`). |
| `POL-certificates.fanout` | Completing a session with `certificate_mode <> 'off'` enqueues one `issue_certificates` job per checked-in attendee and per accepted presenter, with `11` §2.5's key; `off` enqueues none (`REQ-CRT-002`). (migration `0065`). |
| `POL-certificates.fanout.member` | The completion trigger fires for a non-owner caller too — it is `security definer`, like `rsvps_notify()` (0034). (migration `0065`). |
| `POL-issue_certificate.check_in` | An attendance certificate re-derives its `check_in_id` and is refused when the member never checked in (`REQ-CHK-009`). (migration `0065`). |
| `POL-issue_certificate.idempotent` | Running the job twice produces one certificate and consumes one serial (`REQ-CRT-003`, `REQ-CRT-008`). (migration `0065`). |
| `POL-issue_certificate.mode` | `automatic` issues; `review` holds, invisible to the recipient and unemailed (`REQ-CRT-004`). (migration `0065`). |
| `POL-release_certificates.admin` | An admin releases held certificates; a moderator is refused; the release is audited and notifies once. (migration `0065`). |
| `POL-revoke_certificate.reason` | Revoking without a reason is refused; with one the state flips, it is audited, and the PDF is not deleted (`REQ-CRT-011`). (migration `0065`). |
| `POL-achievement.badge` | Earning a badge issues an achievement certificate outright (`issue_achievement_certificate()` from a definer row trigger on `member_badges`, driven as an admin, not the owner); a second earn issues no second certificate (`REQ-CRT-012`). (migration `0066`). |
| `POL-achievement.snapshot` | A final member-ranked snapshot's top three get HELD achievement certificates through `fan_out_snapshot_certificates()` (a statement-level definer trigger on `leaderboard_entries`); topic boards issue none; an admin releases them (`REQ-CRT-012`, `REQ-LDR-006`). (migration `0066`). |
| `POL-verify_certificate.public` | `/verify/[code]` for `anon`: an issued certificate resolves with the A13 fields; a held one, a revoked one's reason, a serial and an unknown code are all the same not-found (`REQ-CRT-007`, `REQ-CRT-009`, `REQ-CRT-011`). (migration `0065`). |
| `POL-allocate_serial.gapless` | Two issuances in two transactions take consecutive serials; a rolled-back one leaves `next_value` unchanged (`REQ-CRT-008`, DEC-010). (migration `0065`). |
| `POL-design_documents.certificate_read` | A member reads the document behind their own issued certificate and nobody else's. (migration `0065`). |
| `POL-impersonation_sessions.select` | The **org's own admin** can see that a super admin impersonated (`REQ-ADM-019`). |
| `POL-impersonation_sessions.expiry` | A session exceeding 4 hours is rejected by the constraint. |
| `POL-registrations.*` | Unchanged from migration `0002`: `anon` inserts, nobody selects. |
| `POL-storage.materials.prefix` | An authenticated write to another org's prefix is rejected. |
| `POL-storage.materials.download` | With `allow_download = false`, no signed URL is issued. |
| `POL-storage.exports.write` | An authenticated client cannot write to `exports`; only the worker can. |
| `POL-realtime.channel_private` | A `channel()` call without `private: true` fails the lint rule; an anonymous subscribe to any topic is refused. |
| `POL-realtime.messages.select` | A member of org A subscribing to `session:{a session in org B}` receives **nothing**. |
| `POL-realtime.messages.insert` | A member cannot broadcast into a session topic belonging to another org. |
| `POL-realtime.host_topic` | A **checked-in member** subscribing to `host:{id}` receives nothing (OQ-013). |
| `POL-realtime.payload_shape` | The `session:{id}` payload carries **counts**, never `check_ins` rows. |
| `POL-realtime.notification_payload` | The notification broadcast carries an **id**, not content. |
| `POL-super_admin.no_data_plane` | A super admin selects from `sessions`, `members`, `points_ledger` and `certificates` → **zero rows in every case** (`REQ-ADM-002`). |
| ★ **wave 7 (`DEC-141`), migrations `0084` – `0090`** — the check-in switch and its ceiling, walk-ins at publication, the admin's removal and its reversal, and the profile's admin tier | |
| `RPC-check_in.floor` | A code entered before the session's scheduled start is refused `not_started`, clock-derived, independent of `state`. |
| `RPC-check_in.ceiling` | A code entered at or after `ends_at + 2h` is refused `session_ended`, computed from the SCHEDULED end, not from when the session actually finished. |
| `RPC-check_in.switch_closed` | Inside the window, with `check_in_open = false`, a correct code is refused `check_in_closed` — never revealing whether it was right. |
| `RPC-check_in.attendance_states` | A `draft`/`approved`/`cancelled`/`archived` session refuses `not_started` regardless of the clock. |
| `RPC-set_check_in_open.role_set` | A plain member is refused; the session's own accepted presenter, any moderator, any admin succeed; a presenter of a DIFFERENT session is refused. |
| `RPC-set_check_in_open.ceiling` | Opening (not closing) past `ends_at + 2h` is refused; closing is always allowed. |
| `RPC-set_check_in_open.audited` | Every open and close writes an audit row naming who and when. |
| `RPC-ensure_check_in_code.floor_ceiling` | Mirrors `check_in()`'s own floor/ceiling/state gate — supersedes 0078's `RPC-ensure_check_in_code.only_live`. |
| `RPC-schedule_session.walk_ins` | `p_allow_walk_ins = true`/`false` sets `allow_walk_ins`; admin-only, same as every other field this RPC writes. |
| `RPC-schedule_session.walk_ins_unchanged` | Rescheduling WITHOUT passing the parameter (the default, `null`) leaves `allow_walk_ins` exactly as it was. |
| `RPC-schedule_session.walk_ins_changed_audited` | A reschedule that actually changes `allow_walk_ins` writes a `session.walk_ins_changed` row with the old and new values, KEPT SEPARATE from `session.scheduled`'s own row (the lead's promotion-review fix) — a reschedule that leaves it unchanged writes none. |
| `RPC-set_session_walk_ins.retired` | The function no longer exists — DEC-118: no door but `schedule_session()`. |
| `RPC-mark_checked_in_manually.window` | An admin marks a member present any time after the scheduled start, including on an archived session; a moderator is refused outside the code family's floor/ceiling; both are refused on a cancelled session. |
| `RPC-mark_checked_in_manually.award_points` | A manual mark enqueues exactly one `award_points` job, keyed `pts:check_in:<check_in.id>` — the same key shape a code check-in uses. |
| `RPC-remove_check_in.admin_only` | A member, a presenter and a moderator are all refused `not_authorized`; only an admin succeeds. |
| `RPC-remove_check_in.reason_required` | An empty reason is refused before anything is written. |
| `RPC-remove_check_in.reversal` | Removing a check-in with a points award inserts ONE compensating `reversal` row per original award (attendee's own and the presenter's `attendee_bonus`), `-amount`, reason «أُلغي تسجيل الحضور»; a second removal attempt is refused, never a second reversal. |
| `RPC-remove_check_in.certificate_revoked` | Removing a check-in with an issued attendance certificate revokes it through the existing `revoke_certificate()` path — audited, PDF not deleted, the member never sees the admin's own words. |
| `RPC-remove_check_in.no_show_symmetry` | Removing a confirmed-RSVP member's check-in awards the `no_show` rule with the same key `evaluate_no_shows` would compute. |
| `RPC-remove_check_in.not_found` | Removing a member with no active check-in (never checked in, or already removed) is refused `P0002`. |
| `RPC-remove_check_in.readd` | After a removal, the same member can check in again (code or manual) with no special path — the partial index frees the slot. |
| `POL-check_ins.removed_excluded_from_overlap` | A removed check-in no longer blocks an overlapping session's check-in (REQ-CHK-013). |
| `POL-has_checked_in.excludes_removed` | `has_checked_in()` returns false once the check-in is removed — the photo-upload gate re-derives live. |
| `POL-ratings.write_self_excludes_removed` | A rating insert whose `check_in_id` points at a removed check-in is refused, same as no check-in at all. |
| `RPC-award_points.skips_removed_check_in` | A late `award_points('check_in', …)` call for a check-in removed before it ran writes nothing, silently — the same shape as a capped or cooled-down rule. |
| `RPC-issue_certificate.no_check_in_when_removed` | A late `issue_certificates` job for a removed check-in raises `no_check_in`, the same refusal as for a member who never checked in. |
| `RPC-fan_out_certificates.excludes_removed` | The completion fan-out does not enqueue an attendance certificate for a member whose check-in was removed before completion. |
| `RPC-send_rating_prompt.excludes_removed` | A member whose check-in was removed is not prompted to rate the session. |
| `RPC-evaluate_streaks.excludes_removed` | A removed check-in does not count toward a streak period not yet awarded; an already-awarded streak_awards row is untouched. |
| `RPC-evaluate_badges.excludes_removed` | A removed check-in does not count toward the `check_ins_count` badge metric for a badge not yet granted; an already-granted member_badges row is untouched. |
| `RPC-build_data_export_payload.shows_removal` | A member's own data export includes a removed check-in, with `removed_at`/`removal_reason` populated — never dropped from the list. |
| `RPC-transition_session.check_in_open_early` | Completing a session BEFORE its scheduled end sets `check_in_open = false` in the same transaction; completing on or after the scheduled end leaves it untouched (the ceiling already governs). |
| `RPC-transition_session.check_in_open_cancel` | Cancelling sets `check_in_open = false` too. |
| `RPC-transition_session.check_in_open_reopenable` | An early close from completion is an ordinary close — the room can reopen it through `set_check_in_open()`, same as any other, up to the ceiling. |
| `RPC-admin_member_profile.admin_only` | An admin of the member's org gets one row; a moderator, a member (including the member themselves) and an admin of another org get zero rows. |
| `RPC-admin_member_profile.fields` | The row carries exactly email, attended_count, attended, no_show_count, late_cancel_count. |
| `RPC-admin_member_profile.removed_excluded` | A removed check-in is neither counted nor listed as attended, and turns a confirmed reservation on an ended session into a no-show. |
| ★ **wave 7 (`DEC-139`), migration `0091`** — a processing photo takes its place without a reload | |
| `TRG-photos_broadcast.session_topic` | An insert on `photos` sends `{id, sessionId, uploaderId}` on `session:{session_id}` (event `INSERT`), the topic and `realtime.messages` policy `0016` already authorise. It carries no photo bytes and no path, and another org's subscriber receives nothing (`POL-realtime.messages.select`). |
| ★ **wave 8 (`DEC-147`), migration `0092`** — one domain check in every environment | |
| `CHK-org_domains.domain_lowercase_everywhere` | The check is text's case-sensitive `~`, stated with an explicit cast, so it reads the same on production and locally; a mixed-case domain written through the table is stored lowercase by `org_domains_normalise` and accepted; one that bypasses the trigger is refused (`23514`). |
| ★ **wave 8 (`DEC-127`, `DEC-148`), migration `0093`** — `canvasRaise` joins the brand kit | |
| `POL-brand_kit.canvas_raise_identity_default` | For an org with no row, or a row saved before `0093`, `brand_kit()`'s `canvasRaise` matches `platformBrand()`'s — the per-token identity override. |
| `POL-brand_kit.canvas_raise_override` | With a row whose `canvasRaise` was explicitly saved, `brand_kit()` returns that value, not the platform default. |
| `POL-save_brand_kit.canvas_raise_required` | A save whose `p_light`/`p_dark` omits `canvasRaise` fails `23502`, as any other missing token does. |
| `POL-export_render_context.canvas_raise_override` | With a row, the `brand` column's `light`/`dark` objects carry the saved `canvasRaise`; with none, the key is absent (the raw override, `{}` semantics unchanged). |
| ★ **wave 8 (`DEC-127`, `DEC-148`), migration `0094`** — the template guard walks every colour | |
| `POL-design_template_versions.guard_gradient_stop_hex` | A template version whose gradient background carries a hex literal in ANY stop is refused (`22023`); the same gradient on `{{brand.*}}` tokens is accepted. |
| `POL-design_template_versions.guard_non_hex_literal` | A colour that is not a `{{brand.<token>}}` binding — `rgb(…)`, `navy` — is refused on the background, a stop, a layer `color`, `shape.fill` and `shape.stroke` alike (`22023`). |
| `POL-design_template_versions.guard_structure_kept` | `0055`'s checks still hold: a missing `schemaVersion`, a non-array `layers`, a missing or duplicated layer id and an unknown layer kind are refused (`22023`). |
| ★ **wave 8 (`DEC-148`), migration `0095`** — the platform console reads the alert states | |
| `RPC-platform_alerts.platform_only` | An org admin, a moderator and a member are refused `not_platform_admin`; `anon` is refused `42501` on the grant. |
| `RPC-platform_alerts.aggregate` | A platform admin reads all eight alerts of `11` §3.2, firing or not, and every `detail` key is a count, an age, a rate or a threshold — no org, member, session or content. |
| ★ **wave 8 (`DEC-148`), migration `0096`** — the platform library reads the roster | |
| `RPC-platform_template_library.roster` | A platform admin reads every platform row with its `orientation` (certificates only, from the latest version's master: wider than tall is landscape), `is_baseline` (false once a `template.promoted` row names it) and `retirable` (false exactly for the last non-retired default of a purpose, true again once a second default exists). |
| ★ **wave 8 (`DEC-148`), migration `0097`** — a reinstate cannot undo a requested deletion | |
| `RPC-reinstate_org.pending_deletion` | After `delete_org()`, `reinstate_org()` is refused `org_deletion_pending` (`42501`), the org stays suspended and no `org.reinstated` is written; a suspended org with no deletion requested still reinstates. `platform_metrics_by_org()` reports `deletion_pending` for the first and not the second, and `platform_org()` returns `deletionPending` outside its counts. |
| ★ **wave 8 (`DEC-148`), migration `0099`** — a session's certificate design, and the scheme pinned on a certificate (`0098`, the library seed, adds no policy) | |
| `POL-session_certificate_designs.select_staff` | An admin and a moderator of the org read a session's certificate design; a member does not; another org's staff do not. |
| `POL-session_certificate_designs.no_write_grant` | An authenticated insert, update or delete is refused (42501) — the only writer is `set_certificate_design()`. |
| `RPC-set_certificate_design.admin` | An admin sets (and resets) the design, audited as `certificate.design_set`; a moderator is refused (42501). |
| `RPC-set_certificate_design.family_matches_kind` | A template of another family, a poster template, a retired one or another org's is refused (22023). |
| `RPC-set_certificate_design.locked_after_issue` | Once a certificate of that kind for that session is `issued` or `revoked`, the design is refused (55000); while they are `held` it may change. |
| `RPC-issue_certificate.pins_design` | A certificate issued for a session with a design pins that template's latest PUBLISHED version and its scheme. |
| `RPC-issue_certificate.no_design_is_default_light` | With no design, the org's default of the family, else the platform's, and `light` — every certificate before this file. |
| `RPC-issue_certificate.no_check_in_when_removed` | Kept from 0088: a late job for a removed check-in raises `no_check_in`. |
| `RPC-redesign_held_certificates.held_only` | Re-pins the HELD certificates of a kind to the current design and re-enqueues each render with 11 §2.5's key; issued and revoked ones are untouched; audited; a moderator is refused. |
| `RPC-record_certificate_document.follows_the_pin` | The certificate's document follows its pinned version, so a redesigned held certificate is not refused by the locked-region guard. |
| ★ **wave 9 (`DEC-150`), migration `0100`** — a session's days (`ENT-session_days`, `DEC-119`): the entity, the two-way derivation of `sessions.starts_at` / `ends_at` / venue, check-in per day, content scoped to a day |
| `POL-session_days.read_follows_session` | A member reads a day exactly when they can read its session: a published session's days are visible to the org, a draft's only to staff and its presenters; another org's never; `anon` is refused. |
| `POL-session_days.no_direct_write` | `authenticated` holds no insert, update or delete on `session_days` (42501), and `service_role` holds nothing at all (invariant 7); every write is a definer RPC, as for every scheduling column since `0010`. `resolve_session_day()` is executable by no client role. |
| `POL-session_days.single_day_follows_session` | A write to a session's own window or venue creates, moves or removes its one day while it has at most one — the same day id throughout; with `kareem.days_writer` on, or with several days, it does not. |
| `POL-session_days.session_follows_days` | A day write re-derives the session's window (first start, last end), its venue (the first day's) and every day's `position` (chronological rank). ★ An equal value writes nothing — the session's row version is unchanged, so no notice, re-render or reschedule fires on a no-op. |
| `POL-session_days.consistent_at_commit` | At commit a session with days stores its derived window and venue (`session_window_not_derived`), and a session at `published` or beyond has a day (`session_without_days`); `23514`, whatever `kareem.days_writer` says. The last day of a published session cannot be removed. |
| `POL-session_days.no_overlap` | Two days of one session cannot overlap (`23P01`) — back to back is allowed, the range is `[start, end)` — and a day ends after it starts (`23514`). |
| `POL-check_ins.day_derived` | `check_ins.session_day_id` and `session_window` are derived on insert — the code's day first, else `resolve_session_day()`: the day whose window to `ends_at + 2 h` holds the instant (the later-started of two), else the latest day begun, else the first — and the window is THE DAY'S. No day: `session_not_scheduled`, `23514`, as before. |
| `POL-check_ins.one_active_per_day` | One active check-in per member per DAY (`23505`, never `23P01` — `0087`'s creation order is kept); a second day of the same session is a second row. `REQ-CHK-013`'s exclusion compares DAY windows, so a talk on Tuesday does not collide with a workshop that meets Monday and Wednesday. A day that holds attendance cannot be deleted (`23503`). |
| `POL-content.day_of_own_session` | `materials`, `session_tasks` and `photos` may name a day only of their own session (`23503`); existing content is session-scoped (null) and adding a day re-scopes nothing; deleting a day sets the column null — the content is promoted to the session, never deleted (`DEC-121`). |
| `POL-tasks.never_read_by_check_in` | `REQ-TSK-002`, enforced: no function names both a task table and anything of check-in, attendance or the day; no policy on a check-in table or on `session_days` names a task table; no trigger joins the two. The TypeScript half walks the check-in import graph (`tests/unit/tasks-never-read-by-check-in.test.ts`). |
| ★ **wave 9, sync 1 (`DEC-151`), migration `0101`** — the day's check-in switch, the ceiling capped by the next day, one calendar entry per day |
| `POL-session_days.switch_born_with_session` | A day created for a legacy writer of the session's window carries the session's `check_in_open` — a session inserted closed never has a day born open; an existing day's switch is not touched by a later write to the session's window. |
| `RPC-check_in_ceiling.capped_by_next_day` | A day's check-in ceiling is `least(ends_at + 2 h, the next day's starts_at)`; with no next day it is `ends_at + 2 h`, exactly a one-day session's ceiling. Executable by no client role (`service_role` holds it for the worker's `rotate_codes` query). |
| `RPC-resolve_session_day.windows_never_overlap` | With the cap, at most one day of a session holds any instant: between a 9–12 and a 13–16 day on one date, 12:30 is the morning and 13:00 and 13:30 are the afternoon. |
| `POL-calendar_events.legacy_insert_gets_first_day` | A row inserted with no day — `main`'s `record_calendar_sync()` — is given its session's first day, so a null day only ever means «the day was deleted» or «the session has none». |
| `POL-calendar_events.day_of_own_session` | A calendar row may name a day only of its own session (`23503`); deleting the day sets the column null and KEEPS the row with its `provider_event_id`, so the provider event can still be removed. `unique (member_id, session_day_id)` holds beside `unique (member_id, session_id)`, which leaves in the same file as the function that names it in `on conflict`. |
| ★ **wave 9 (`DEC-151`), migration `0102`** — contract 5: what a check-in earns is decided in two functions of `scoring`'s, with `main`'s exact behaviour |
| `RPC-attendance_recorded.definer_only` | No client role can call it; only `service_role` and the function owner (so `check_in()` and `mark_checked_in_manually()`, both definer, can). |
| `RPC-attendance_removed.definer_only` | The same. |
| `RPC-attendance_recorded.enqueues_award` | A recorded attendance enqueues exactly one `award_points` job, task `award_points`, key `pts:check_in:<check_in id>`, payload `{rule:'check_in', member_id, source:'check_in', source_id:<check_in id>, session_id}` — byte for byte what `check_in()` enqueues on `main`. |
| `RPC-attendance_removed.reversal` | One compensating `reversal` row per not-yet-reversed `check_in`/`attendee_bonus` award keyed to that check-in: `-amount`, reason «أُلغي تسجيل الحضور», key `reversal:<ledger id>:v1`. A second call writes no second row. |
| `RPC-attendance_removed.no_show_symmetry` | A removed check-in whose member holds a confirmed RSVP awards the `no_show` rule under `evaluate_no_shows`' own key; a member with no confirmed RSVP earns no such row. |
| `RPC-attendance_hooks.terminal_row` | Either function called with a check-in id that no longer exists returns silently — the terminal-row pattern (DEC-059), never an exception into an admin's transaction. |
| ★ **wave 9 (`DEC-152`), migration `0103`** — a SECURITY fix: the private core that mints a live check-in code was executable by `anon` since M2 (`0015` never revoked it) |
| `RPC-_issue_check_in_code.not_public` | The private core that mints a live check-in code is executable by NO client role — `anon`, `authenticated` and `service_role` are each refused 42501; its three definer callers still work. |
| `RPC-definer.anon_allowlist` | The SECURITY DEFINER, non-trigger functions `anon` may execute are EXACTLY the documented six; a new one fails the suite until it is either revoked or added to the list with its reason. |
| ★ **wave 9 (`DEC-151`), migration `0104`** — `sessions.check_in_open` is the shadow of its days' switches, and only a writer of the SESSION's column reaches the days |
| `POL-check_in_open.shadow_is_bool_or` | `sessions.check_in_open` equals `bool_or` of its days: closing the only open day closes the session's shadow, reopening any day opens it. |
| `POL-check_in_open.reopening_one_day_opens_only_that_day` | ★ Three closed days; reopening day 2 leaves days 1 and 3 closed, and flips the session's shadow to open. The defect this file exists to prevent. |
| `POL-check_in_open.session_write_carries_to_every_day` | A writer of the session's own column — `transition_session()`'s early completion or cancellation, or a fixture's direct `update` — closes every day of the session. |
| `POL-check_in_open.one_day_is_identical` | At one day the pair moves together in both directions, and `set_check_in_open()` returns a session row carrying the day's value. |
| ★ **wave 9 (`DEC-151`), migration `0105`** — contract 4: check-in moves to the day — eight RPCs, each keeping `p_session` and gaining a trailing `p_day` |
| `RPC-check_in.day_from_code` | A live code names the day it was minted for, and only while that day is taking attendance; a code of any other day of the same session — one not yet begun, or one whose ceiling has passed — is `invalid_code`, never a disclosure that it was real. |
| `RPC-check_in.already_checked_in_per_day` | A member checked into day 1 checking into day 2 succeeds; a second attempt on day 2 returns `already_checked_in` for day 2's row. |
| `RPC-check_in.rate_limit_per_day` | Ten attempts against day 1 do not consume day 2's stream (REQ-SES-015: «its own rate-limit stream»); at one day every attempt of the session is that day's. |
| `RPC-check_in.day_window` | The floor is the day's start, the ceiling `check_in_ceiling()`; after day 2's ceiling with day 3 still ahead the answer is `session_ended`, and the envelope status is the one main returns. |
| `RPC-check_in.day_switch` | Closing day 2's switch refuses day 2 with `check_in_closed` and leaves day 3 open. |
| `RPC-check_in.overlap_compares_days` | Three check-ins across three days of one session are all accepted (their windows are disjoint); a check-in overlapping ANOTHER session's day is refused `overlap` naming it. |
| `RPC-ensure_check_in_code.per_day` | The host view of day 2 gets day 2's code; issuance is refused `not_open` outside that day's floor/ceiling even while day 3 is ahead. |
| `RPC-_issue_check_in_code.not_callable` | ★ The private core is executable by no client role — a member calling it directly is refused `42501` instead of being handed a live code. |
| `RPC-revoke_check_in_code.per_day` | Revoking on day 2 revokes day 2's code and issues day 2's replacement; day 3 has none and is unaffected. |
| `RPC-mark_checked_in_manually.day` | An admin marks a member present on day 1 while day 3 is running; a future day is refused `not_open`; a moderator is still bound by that day's floor and ceiling. |
| `RPC-remove_check_in.day` | Removing day 2 leaves days 1 and 3 standing; removing a member with no active check-in on that day is `not_found`. |
| `RPC-set_check_in_open.day` | The switch moves the day's column; the audit row still names the SESSION and carries the day in its payload; the returned session row carries the recomputed shadow. |
| ★ **wave 9 (`DEC-151`), migration `0106`** — contract 3: `schedule_session()` writes a day set, matched by `id`; a null `p_days` is `main`'s call exactly; `publish_session()` names a gap per day |
| `RPC-schedule_session.days_null_is_today` | `p_days => null` writes the session once and nothing else: one `session.scheduled` row, one notice, and `0100`'s trigger A carries the window onto its one day. Byte-identical to `0085`. |
| `RPC-schedule_session.days_written` | `p_days` replaces the session's day set: entries with an `id` are updated, entries without one inserted, stored days left out deleted. `position` is never written by the caller — `0100` derives it. |
| `RPC-schedule_session.days_derive_the_session` | With `p_days`, the session's stored window is the first day's start and the last day's end and its venue is the first day's, written ONCE — `sessions_notify` fires exactly once for the whole change. |
| `RPC-schedule_session.days_required` | A `null` `p_days` on a session that already has more than one day is refused `days_required` (23514), by name, rather than left to `0100`'s commit check. |
| `RPC-schedule_session.day_has_attendance` | A day left out of `p_days` that holds a check-in — removed or not — is refused `day_has_attendance: <position>` (23514) before anything is written. |
| `RPC-schedule_session.days_refusals` | `days_empty`, `days_too_many`, `days_invalid`, `day_window_invalid`, `days_overlap`, `day_repeated` (23514) and `day_not_of_session` (42501) are each raised by name, before the first write. |
| `RPC-schedule_session.day_venue_rules` | A day names the org's venue OR the inline trio, never both and never a name without an address, and never another org's or a deactivated venue. |
| `RPC-schedule_session.require_all_days` | `p_require_all_days` sets `sessions.require_all_days`; `null` leaves it exactly as it was, as `p_allow_walk_ins` does (DEC-141 correction B). |
| `RPC-publish_session.missing_days` | Publishing a session with no day names `days`; a day after the first with no place names `day:<position>:venue`. A one-day session's `missing[]` is unchanged. |
| ★ **wave 9 (`DEC-151`), migration `0107`** — contract 6: the one definition of «attended the session» for points and certificates, and the per-day reader behind it |
| `RPC-session_attendance_complete.definer_only` | No client role can call it; only `service_role` and the function owner. |
| `RPC-session_attendance_complete.every_day` | With `require_all_days` (the default), an active check-in on EVERY day is required: one missing day, or one removed check-in, makes it false. |
| `RPC-session_attendance_complete.any_day` | With `require_all_days = false`, an active check-in on ANY day makes it true. |
| `RPC-session_attendance_complete.one_day_equals_has_checked_in` | On a one-day session the predicate agrees with `has_checked_in()` for that member, in both directions and under both settings. |
| `RPC-session_attendance_complete.no_days` | A session with no days is false under both settings — never vacuously true. |
| `POL-session_attendance.reader` | A member reads their own per-day rows; staff and the session's presenter read any member's; another ordinary member sees every day with `attended` false and learns nothing. |
| ★ **wave 9 (`DEC-153`), migration `0108`** — certificates follow attendance: eligibility reads contract 6's predicate in all three places, and contract 5's third hook keeps a member's certificate in step |
| `RPC-fan_out_certificates.complete_attendance` | At completion an attendance certificate is fanned out to each member contract 6's predicate holds for — once per member, never once per check-in; a member who attended two days of three gets none; with `require_all_days = false` one day is enough. At one day: every active check-in, as before. |
| `RPC-issue_certificate.complete_attendance` | A late job for a member whose attendance is not complete raises `no_check_in` (42501), the error a member who never came raises; the certificate's `check_in_id` is the member's latest active check-in. |
| `RPC-attendance_certificate_sync.revokes_whichever_day` | Removing ANY day's check-in from a member holding a live attendance certificate revokes it, with the fixed phrase, whichever check-in the certificate names. |
| `RPC-attendance_certificate_sync.issues_when_completed_late` | A member whose attendance becomes complete after the session completed gets the issue job under `cert:<session>:<member>:attendance`; not while the session is still running, not with certificates off, and not when a certificate row already exists — a revoked one included (wave 7's carry). |
| `RPC-attendance_certificate_sync.never_fails_a_check_in` | Called from a member's own check-in it raises nothing, whatever the state of the session or of their attendance. Executable by no client role. |
| `RPC-session_complete_attendees.staff_only` | Staff of the session's org read the members whose attendance is complete; a member is refused 42501, another org's staff read nothing. |
| ★ **wave 9 (`DEC-151`), migration `0109`** — contract 8: one calendar entry per day, under the reservation's existing job key; the old `unique (member_id, session_id)` leaves in the same file as the function that named it |
| `RPC-record_calendar_sync.per_day` | One row per member per DAY: running it twice for one
| `RPC-record_calendar_sync.legacy_call_gets_first_day` | `main`'s six-argument call resolves to
| `RPC-calendar_sync_target.days_and_orphans` | The target carries one entry per day with that
| `RPC-record_calendar_event_removed.worker_only` | Only the worker may mark an orphaned row
| `RPC-resync_calendars.definer_only` | No client role may fan calendar jobs out across an org. |
| ★ **wave 9 (`DEC-151`), migration `0110`** — contract 8: reminders fire per day — an offset for day `k` only when its moment falls after day `k − 1` ended — and a key set that can shrink |
| `RPC-schedule_session_reminders.per_day` | A confirmed seat on a three-day session holds one
| `RPC-schedule_session_reminders.offset_after_previous_day` | An offset fires for day `k` only
| `RPC-cancel_unlisted_reminders.sweeps` | Every pending reminder of a session that the
| `RPC-cancel_member_reminders.every_day` | Cancelling a seat removes that member's keys for
| `RPC-send_reminder_notification.day_scoped` | The reminder names the DAY's moment and the
| ★ **wave 9 (`DEC-151`), migration `0111`** — contract 11: `session_days_changed()` announces a changed day set once and names the day; under `kareem.days_writer` `sessions_notify()`'s change branch stands down for it |
| `RPC-session_days_changed.names_the_day` | Moving day 2 of a three-day session — which moves
| `RPC-session_days_changed.once_per_transaction` | However many statements a day-aware writer
| `RPC-session_days_changed.day_added_or_removed` | A day added to or removed from a published
| `RPC-session_days_changed.definer_only` | No client role may notify a session's members. |
| `POL-sessions.change_notice.days_writer_stands_down` | `sessions_notify()` does not announce a
| ★ **wave 9 (`DEC-151`), migration `0112`** — contract 11's call site: a day-aware `schedule_session()` calls `session_days_changed()` once, after its last day write — promoted WITH `0111`, because either alone announces nothing |
| `RPC-schedule_session.announces_the_day_set` | A day-aware save calls `session_days_changed()` exactly once, after its last day write, with the whole day set before and after — so moving day 2 of a three-day workshop, which moves no column of `sessions`, still reaches every confirmed member. |
| `RPC-schedule_session.days_null_announces_nothing` | A `null` `p_days` does not call it: main's path announces through `sessions_notify()` as it always has. |
| ★ **wave 9 (`DEC-151`), migration `0113`** — `REQ-SES-017`: the attendance award moves to completion for a session with several days, decided from two facts under a lock; one day is unchanged |
| `RPC-evaluate_member_attendance.awards_once` | Complete and nothing standing awards exactly one attendance row; run again it writes nothing, whatever the epoch has become. |
| `RPC-evaluate_member_attendance.reverses_when_incomplete` | Not complete with one standing writes exactly one compensating `reversal`, with the caller's reason. |
| `RPC-evaluate_member_attendance.no_double_pay_on_new_epoch` | A new active check-in appearing while an award stands writes nothing — the `require_all_days = false` double-pay. |
| `RPC-evaluate_member_attendance.no_double_pay_on_replay` | Removing the epoch check-in while the predicate still holds, then replaying the completion pass, writes nothing. |
| `RPC-attendance_recorded.one_day_pays_at_check_in` | On a one-day session the hook enqueues main's job, under main's key, with main's payload. |
| `RPC-attendance_recorded.multi_day_waits` | On a multi-day session before completion the hook enqueues nothing, whatever days have been attended. |
| `RPC-attendance_recorded.after_completion_evaluates` | A member marked present after completion is evaluated at once, which is what pays a re-added member. |
| `RPC-evaluate_session_attendance.one_award_per_member` | A three-day workshop attended in full pays one attendance award, not three. |
| `RPC-evaluate_session_attendance.reverses_added_day` | A one-day award, then a second day added and missed, is reversed at completion with «لم يكتمل حضور جميع الأيام». |
| `RPC-award_points.requires_attendance_complete` | A late `award_points('check_in', …)` for a member who did not attend every day writes nothing. |
| `RPC-award_points.skips_when_award_standing` | The same call with an attendance award already standing for that session writes nothing. |
| `RPC-attendance_removed.no_show_only_when_none_left` | Removing one day of three records no `no_show`; removing the last active one does. |
| `RPC-attendance_removed.reverses_presenter_bonus_by_member` | The presenter's `attendee_bonus` for an attendee who no longer qualifies is reversed even when it is keyed to a different day's check-in. |
| `RPC-evaluate_streaks.counts_sessions_not_check_ins` | Three check-ins on one workshop count as one session toward a streak. |
| `RPC-evaluate_badges.counts_sessions_not_check_ins` | The same for the `check_ins_count` badge metric. |
| `RPC-evaluate_company_points.counts_members_not_check_ins` | A company's attendance share counts distinct members, and excludes a removed check-in (named difference 2). |
| ★ **wave 9 (`DEC-151`), migration `0114`** — `REQ-SES-017`: the member can see which day was missed — a reader that answers only about its caller |
| `RPC-missed_attendance_days.self_only` | The function takes no member and reads the caller's own claims; a member cannot ask about anyone else, and `anon` cannot call it at all. |
| `RPC-missed_attendance_days.multi_day_only` | A one-day session never appears, whatever the member did or did not attend. |
| `RPC-missed_attendance_days.names_the_missed_day` | A three-day workshop attended on days one and three returns exactly day two, with its position and its start. |
| `RPC-missed_attendance_days.silent_when_complete` | A workshop attended in full returns nothing — there is nothing to explain. |
| ★ **wave 9 (`DEC-151`), migration `0115`** — `DEC-121`: content is scoped by where it was added — three re-scope doors, and a photo takes the day its upload moment falls in (null while the session has one day) |
| `RPC-rescope_material.authority` | Staff, or the session's own presenter, may move a material between the session and one of its own days; anyone else is refused `42501`. A proposal's own material (no session) is refused `not_found`. |
| `RPC-rescope_material.day_of_own_session` | A day naming another session is refused `day_not_of_session` (`23503`) before the update is attempted. |
| `RPC-rescope_material.audited` | Every successful call writes one `material.rescoped` audit row naming the old and new `session_day_id` — REQ-MAT-006's visibility fix (0052 already audits a phase change for the same reason). |
| `RPC-rescope_task.authority` | Staff, or the session's own presenter, may move a task; anyone else is refused `42501`. No audit row — REQ-TSK-002 makes a task's scope carry no visibility rule for one to protect. |
| `RPC-rescope_photo.authority` | Staff alone may move a photo; a presenter who is not staff is refused `42501` — a photo has no presenter-write concept (`photos_insert_checked_in`, 03 §5.6c). No audit row. |
| `RPC-record_photo_upload.day_from_upload_moment` | With more than one day, the photo is scoped to the day whose window contains `p_uploaded_at`, falling back to the day whose nearer edge (start or end) is closest to it. With at most one day, `session_day_id` stays null (DEC-121: a one-day session's content is session-scoped, which is what makes "adding a second day re-scopes nothing" true). |
| `RPC-initiate_photo_processing.enqueues_uploaded_at` | The enqueued `process_photo` payload carries `uploaded_at`, the instant of THIS call — not the worker's own, later clock. |
| ★ **wave 9 (`DEC-151`), migration `0116`** — `REQ-MAT-006` as amended: `phase` is relative to the scope — in all FIVE policies that carry the rule, table and storage alike |
| `POL-materials.day_scoped_after_release` | A day-scoped «بعد» material is visible once ITS OWN DAY has ended, even if the session as a whole has not yet completed. |
| `POL-materials.day_scoped_after_release_on_early_completion` | A day-scoped «بعد» material is ALSO visible once the session reaches `completed`/`archived`, whether or not its own day has ended — an early completion never leaves it hidden forever. |
| `POL-storage.materials.day_scoped_after_release` | The storage twin releases the same object at the same two moments. |
| `POL-material_versions.day_scoped_after_release` | The version row a released day-scoped material's `current_version_id` points at is readable the same two moments — otherwise `getViewerData()` finds a material but no version. |
| `POL-material_pages.day_scoped_after_release` | A released day-scoped material's rendered page rows are readable the same two moments. |
| `POL-storage.material_pages.day_scoped_after_release` | The page-image objects in the `material-pages` bucket are readable the same two moments — otherwise the viewer shows a page count with no images. |
| ★ **wave 9, sync 3, migration `0117`** — `session_day_place()` is the worker's, not a member's — `notify` closing the same class of hole it had copied a grant into |
| `RPC-session_day_place.definer_only` | No client role may execute it; it exists for
| ★ **wave 9, sync 3, migration `0118`** — the public card says how many days a session has — `anon` cannot read `session_days`, so the count travels in the card's own row |
| `POL-sessions.public_card.day_count` | The public card's row carries the number of days of the session, for `anon` and `authenticated` alike. No policy changes and `session_days` gains no grant: the count comes from the definer function, never from the table. |
| ★ **wave 9, sync 3, migration `0119`** — `DEC-152`'s low finding closed: `session_venue_label()` revoked from members, after every caller was verified to be a definer function |
| `RPC-session_venue_label.not_for_members` | A member calling `session_venue_label()` with another org's venue uuid is refused 42501 rather than handed its name; every notice, reminder and calendar payload still carries the venue, because their definer callers run as the owner. |
| ★ **wave 9, sync 3, migration `0120`** — contract 5's call sites: `check_in()`, `mark_checked_in_manually()` and `remove_check_in()` call the three hooks and decide nothing about points or certificates |
| `RPC-check_in.calls_attendance_recorded` | A code check-in enqueues exactly one `award_points` job under `pts:check_in:<check_in id>` — through the hook, and the source of all three functions names no points primitive. |
| `RPC-mark_checked_in_manually.calls_attendance_recorded` | A manual mark enqueues the same one job under the same key, so REQ-CHK-008's «the same rights as a code check-in» is one call site each rather than two blocks kept in step. |
| `RPC-remove_check_in.calls_attendance_removed` | A removal writes one compensating row per unreversed award and the no-show row, through the hook; a second removal of the same check-in is refused and writes no second row. |
| `RPC-remove_check_in.certificate_revoked_through_the_hook` | An issued attendance certificate is still revoked when a removal makes attendance incomplete — now through `attendance_certificate_sync()` rather than a `check_in_id` lookup, and still with only the fixed phrase «أُلغي تسجيل الحضور» reaching it. |
| `RPC-check_in.certificate_synced` | A check-in on a session that is already `completed` reaches the same hook, so a member recorded after the fact becomes eligible rather than being silently skipped (named difference 3). |
| `RPC-checkin_functions.decide_nothing` | ★ The source of `check_in()`, `mark_checked_in_manually()` and `remove_check_in()`, comments stripped, names none of `points_ledger`, `award_points`, `enqueue_job`, `certificates`, `revoke_certificate` — nor any of `REQ-TSK-002`'s three task tables. |
| ★ **wave 9, sync 3, migration `0121`** — the presenter's attendee bonus is decided in SQL (`DEC-157`), so `main`'s OLD worker — which runs on this schema between the merge and Railway's redeploy — cannot over-pay an append-only ledger |
| `RPC-award_points.attendee_bonus_epoch_only` | An `attendee_bonus` call naming any active check-in other than that attendee's epoch writes nothing — so `main`'s old per-check-in loop pays a three-day workshop's presenter ONE bonus per attendee, not three. |
| `RPC-award_points.attendee_bonus_requires_complete` | An `attendee_bonus` call for a partial attendee writes nothing, even when it names that attendee's own latest day. |
| `RPC-award_points.attendee_bonus_one_day_unchanged` | On a one-day session every call that writes a row today still writes it, with the same amount and the same key. |
| `RPC-award_points.attendee_bonus_skips_silently` | Every refusal above returns normally — `main`'s loop must never throw part-way through a session. |
| ★ **wave 9, sync 4, migration `0122`** — the public card is given its day windows (`DEC-157`), so `sessionPhase()` stays the one implementation and the card stops saying «جارية الآن» between two days |
| `POL-sessions.public_card.day_windows` | The public card's row carries one `{ starts_at, ends_at }` per day, ordered, for `anon` and `authenticated` alike — enough for `sessionPhase()` and nothing more. No day id, no position, no venue; `session_days` gains no grant. |
| `POL-sessions.public_card.one_day_unchanged` | A one-day session returns a one-element array, which `betweenDays()` has no pair to walk — the card's phase is what it has always been. |
| ★ **wave 10, migration `0123`** — recognition edits are recorded (`DEC-160`, row L9): the four recognition tables get the history trigger every other configuration table has carried since `0004` and `0027` |
| `POL-badges.history` | An admin's edit of a badge appends one `scoring_config_history` row per changed column (`scope = 'badges'`), retiring included; a custom badge's creation appends one `created` row; a save that changes nothing appends none; the org's seed appends none. |
| `POL-levels.history` | An admin's edit of a level appends one row per changed column (`scope = 'levels'`), with the old and the new threshold. |
| `POL-perks.history` | An admin's edit of a perk appends one row per changed column (`scope = 'perks'`). |
| `POL-streak_rules.history` | An admin's edit of a streak rule appends one row per changed column (`scope = 'streaks'`). |
| `POL-recognition.history.no_forgery` | A moderator's refused edit appends nothing; another org's history is untouched; no client role — the admin included — can insert a history row directly (`42501`). |
| ★ **wave 10, migration `0124`** — the survey's tables (`DEC-160` §3, `DEC-161`): six authoring tables staff read, and a register and a box no client role reads. Tables only; each row below is proven by `event`'s suites at the promotion of its functions |
| `POL-survey_templates.staff_read` | Staff of the org read its templates, questions and options; a plain member and the other org's staff read none; no client role writes any of the three directly. |
| `POL-surveys.staff_read` | Staff of the org read a session's survey, its questions and options; a plain member, the session's presenter as such, and the other org's staff read none; no client role writes directly. |
| `POL-survey_participations.no_client_select` | RLS enabled, no policy, no grant: `anon`, a member, the presenter, a moderator, an admin and `service_role` are each refused `42501`. |
| `POL-survey_responses.no_client_select` | The same, for the box. |
| `POL-survey_answers.no_client_select` | The same, for the answers. |
| `POL-survey.structure` | Generated over the catalogue: no member, check-in, rating or timestamp column on `survey_responses` or `survey_answers`; no timestamp column on `survey_participations`; no foreign key from a response or an answer to `members`. |
| `POL-org_settings.survey_min_responses.floor` | The minimum cannot be set below 3 by any role. |
| ★ **wave 10, migration `0125`** — a notification template may carry blocks, on its own row (`DEC-161`): no table of shared designs, so one trigger polices one key's bindings and `body` cannot go stale |
| `POL-notification_templates.blocks.shape` | `blocks` is null or an object carrying `schemaVersion` and an array `blocks`; anything else is refused `23514`, for every writer. `source_family` without `blocks` is refused. |
| `POL-notification_templates.blocks.admin_only` | An admin of the org writes `blocks` and `source_family` on its own rows through the existing policies; a moderator, a member and the other org's admin cannot. |
| ★ **wave 10, migration `0126`** — an active org's logo, readable with no session (`DEC-161`, contract 9): a mail client fetches months later with no cookie, and every app-minted URL for `design-assets` is a five-minute signature. `0080`'s shape, for one more object |
| `POL-storage.design_assets.public_logo` | `anon` reads exactly the object an ACTIVE org's `brand_kits.logo_asset_id` names, while it is PNG or JPEG. Refused: any other design asset of the same org; the same org's logo while it is WebP (Outlook draws none); a suspended org's logo; a logo the org has since replaced or cleared. A signed-in member of ANOTHER org sees what a stranger sees. `anon` writes and deletes nothing. |
| `RPC-org_public_logo.path_only` | Returns the storage path and the SNIFFED content type of that one object, or no row — for `anon`, `authenticated` and the worker. It reveals nothing a caller could not learn by fetching the object. |
| `RPC-definer.anon_allowlist` (amended) | The `anon`-executable definer functions are exactly the documented eight: `0080`'s two, `verify_certificate`, the three that answer about the caller, and `0126`'s two. |
| ★ **wave 10, migration `0127`** — `designer` — certificates re-issued (`DEC-160` §6, `DEC-161`): a removal's revocation may be replaced under the next serial, an admin's revocation for cause never is; the lead's DDL inside it (contract 10) |
| `POL-certificates.live_once` | A second LIVE certificate for one (org, session, member, kind) is refused 23505 by `certificates_live_once`; a second REVOKED row is accepted, which is what lets a re-issue keep the first one on the register. |
| `RPC-issue_certificate.replacement_after_removal` | A member whose certificate was revoked BY A REMOVAL, then re-added, is issued a second certificate under the NEXT serial; its `check_in_id` is the new check-in; the first keeps its serial and still verifies as revoked, without its reason. |
| `RPC-issue_certificate.no_replacement_after_for_cause` | A certificate revoked FOR CAUSE is never replaced — not by the sync hook, not by a re-run fan-out, not by a late job. `issue_certificate()` raises `revoked_for_cause` (42501) BEFORE `allocate_serial()`, so the org's serial counter does not move. |
| `RPC-revoke_certificate.records_its_cause` | Every revocation records why it happened: the removal path passes `attendance_removed`, every other caller takes `for_cause`. A revocation written before this file reads as `for_cause` — final — through `coalesce`. |
| `RPC-attendance_certificate_sync.reissues_after_removal` | Attendance complete again on a completed session with certificates on, holding only a removal-revoked certificate, enqueues the issue job under 11 §2.5's key; holding a for-cause-revoked one enqueues nothing; holding a LIVE one still enqueues nothing. |
| ★ **wave 10, migration `0128`** — `designer` — `poster_render_context()` hands the worker a session's days, by `position`; no new binding, so any document version renders on any runtime (`DEC-161`, defect 1) |
| `RPC-poster_render_context.days` | The render context carries the session's days in `position` order — the database's derived rank, never a minimum or a maximum computed by a caller. At one day it is that one day, and every other column is `0082`'s, in `0082`'s order. Executable by `service_role` alone. |
| ★ **wave 10, migration `0129`** — `content` — a proposal's own material (`DEC-155`'s carry): the three policies that `inner join sessions` admit it for its owner and for staff |
| `POL-material_versions.proposal` | The version row of a proposal's own material is readable by its proposer, an accepted co-presenter, and staff — never a plain member — the same audience `materials_read`'s proposal branch already admits at the row. |
| `POL-material_pages.proposal` | Same audience, for a proposal-owned material's page rows — in practice always empty, since no page is ever rendered before carry-over. |
| `POL-storage.material_pages.proposal` | The page-image bucket's own copy of the same rule. |
| ★ **wave 10, migration `0130`** — `event` — `ratings` holds no instant finer than a day (`DEC-160` §3.4): a coarsening trigger pinned to UTC, the backfill, the presenter's comments no longer in submission order |
| `POL-ratings.day_precision.insert` | A rating written by a member is stored at midnight UTC — the instant it was written is not recoverable from the row. |
| `POL-ratings.day_precision.update` | An edit coarsens `edited_at` too: `main`'s app writes it from JavaScript at millisecond precision, and the trigger covers `update` for exactly that reason. |
| `POL-ratings.day_precision.backfill` | The rows that existed before this file are coarsened by it, and coarsening an already-coarsened row changes nothing. |
| `POL-ratings.day_precision.no_award` | The backfill enqueues no `award_points` job: `ratings_award_points` is `after insert`, and this is an `update`. |
| `POL-ratings.aggregate.comment_order` | The presenter's comment list is ordered by the rating's random id, never by submission: submission order is itself a disclosure to a presenter who watched people leave. |
| ★ **wave 10, migration `0131`** — `event` — `rating_window_open()`: the one SQL definition of «completed, and inside the window», called by both rating policies and by the survey's submit |
| `RPC-rating_window_open.completed_and_inside` | True for a completed session inside `rating_window_days`; false before completion and false the day after the window closes. |
| `RPC-rating_window_open.other_org` | False for a session of another org, whatever its state — the function answers about the CALLER's org only. |
| `RPC-rating_window_open.not_public` | `anon` cannot execute it; `authenticated` can. |
| `POL-ratings.insert.window` | The re-created insert policy still accepts a rating inside the window and refuses one past it — the rule moved into a function, not out of the policy. |
| `POL-ratings.update.window` | The re-created update policy still refuses an edit past the window. |
| ★ **wave 10, migration `0132`** — `event` — the survey's authoring half: templates saved whole, attach copies, detach refused once anyone has answered; attach and detach audited |
| `RPC-survey_template_save.staff_only` | A member is refused `not_authorized`; an admin and a moderator both succeed; a stale admin is refused `stale_claims`. |
| `RPC-survey_template_save.whole_set` | Saving replaces the whole question set in the array's order: positions are 1…n and are never read from the client. |
| `RPC-survey_template_save.shapes` | A choice question with fewer than two options, an empty prompt, an unknown kind and options on a non-choice question are each refused by name, with the question's index — and nothing is written. |
| `RPC-survey_template_save.title_taken` | Two templates of one org cannot share a title; the refusal is an envelope, not a constraint error. |
| `RPC-survey_template_save.other_org` | A template of another org is `not_found`, never edited. |
| `RPC-survey_attach.copies` | Attaching copies the template's questions and options into the session's own rows: editing the template afterwards changes nothing that was attached. |
| `RPC-survey_attach.one_per_session` | A second attach to the same session is refused by name; an empty template is refused before anything is written. |
| `RPC-survey_attach.audited` | Attach and detach each write one `audit_log` row naming the session and the survey. |
| `RPC-survey_detach.has_responses` | Once one member has answered, detaching is refused and the survey stands. |
| ★ **wave 10, migration `0133`** — `notify` — bindings declared per message key and refused by the database for every writer (`REQ-NTF-012`), inside blocks too; `0026`'s three rules verbatim |
| `RPC-notification_bindings.total` | Every message with an email channel offers at least the three the renderer injects; no key offers a binding twice. |
| `RPC-notification_bindings.defaults_are_legal` | Every binding the built-in Arabic templates interpolate is offered by the key that uses it — the platform's own text cannot be refused by the rule the platform ships. |
| `POL-notification_templates.unknown_binding` | A template whose subject, body or blocks reference a binding the key does not offer is refused `22023`, as the org admin — the writer the screen uses — and as the owner. |
| `POL-notification_templates.blocks_bindings` | The scan reaches INSIDE `blocks`: a paragraph's `{{…}}`, a button's `urlBinding` (a bare name, not a placeholder), a detail row's label and value, an image's `alt`. |
| `POL-notification_templates.in_app_unchecked` | An `in_app` row is not subject to the binding rule: nothing reads one (`notification_send_context` filters `channel = 'email'`), and its key may have no email channel and so no declared bindings at all. |
| ★ **wave 10, migration `0134`** — lead — corrects `0125`: an object with no `blocks` key is refused (a CHECK rejects only on FALSE) |
| `POL-notification_templates.blocks.shape` | … an object with `schemaVersion` and NO `blocks` key is refused `23514` too. |
| ★ **wave 10, migration `0135`** — lead, as `platform`'s custodian — the PDPL self-export lists the surveys a member answered (`REQ-PRF-006`, `REQ-SUR-009`, `DEC-160` §3) |
| `RPC-build_data_export_payload.surveys_answered` | `surveys_answered` lists, for the member alone, the sessions whose survey they took part in — by title, each entry carrying that one key and so no instant, ordered by title and never by insertion. |
| `RPC-build_data_export_payload.surveys_no_answers` | No answer text and no question prompt appears anywhere in the archive: there is no path from a member to a stored response. Every key `0088` returned is still returned, and `surveys_answered` is the only addition. |

The last row is the one to run first after any policy change. If it ever returns rows, DEC-014 has
been undone and D3 with it.

### 8.3 The policy-vs-migration diff

Protocol decays; a machine does not. `scripts/policy-diff.mjs` extracts every `create policy` from
the migrations and diffs it against this document, failing CI on any policy present in one and
absent from the other.

This is the **highest-value automation in the plan**: this document is only true if it matches the
database, and nothing else checks that it does.
