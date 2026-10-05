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
| `company_domains` | — | — | — | read; write `S` | — | — |
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
| `company_domains` | P2-read | — | — | — | ★ `0203`, `REQ-PRF-012` — admin-only read, **no client write at all**: `save_company()` (definer) is the one writer, so the confirmation's numbers are the save's. `create policy "company_domains_read_admin" on company_domains for select to authenticated; grant select on company_domains to authenticated;` |
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
| `photo_albums` | §5.6g | — | — | — | One album per session (`0156`, `REQ-ADM-021`). Staff of the org read it; the three audit definers and `content`'s service_role functions are its only writers. |

#### §5.6g — the photo album (`0156`, `DEC-180`, `DEC-182`)
```sql
create policy "photo_albums_read_staff" on photo_albums for select to authenticated
  using (org_id = auth_org_id() and is_staff());
```
No client role writes an album. `request_photo_album()` queues it, `JOB-zip_session_photos` builds it, and the
row is what «ready» reads after a reload.

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
★ **No direct insert since `0174` (`DEC-221`).** The policy below stood from `0037` until wave 20, and with the
storage policies it let a checked-in member PUT an **unstripped** original and insert a row claiming
`exif_stripped = true` — the org could then read the photograph's GPS and device data (`REQ-EVT-011`). It is dropped
and `insert` is revoked from `authenticated`. **The only writer is `record_photo_upload()`** (`0050`, `security
definer`, service_role-only), called by the worker after it has stripped the bytes. The check-in gate (D33, D24) is
`initiate_photo_processing()`'s, which refuses a member who has not checked in before anything is queued (`0050`). Kept here as the record of what was removed:
```sql
-- removed by 0174:
-- create policy "photos_insert_checked_in" on photos for insert to authenticated
--   with check (org_id = auth_org_id() and uploader_id = auth_member_id() and exif_stripped
--               and (has_checked_in(session_id) or is_presenter_of(session_id) or is_staff()));
-- grant insert on photos to authenticated;   -- revoked by 0174
```

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
| `member_seen_marks` | §5.7c | §5.7c | §5.7c | — | A member's own bookmark of what they have seen (`0162`, `DEC-197`). No timestamp; no delete; the worker never touches it. |
| `feed_announcements` | §5.7d | §5.7d | §5.7d | §5.7d | An org's announcements in the feed (`0164`, `DEC-206` §3, `REQ-UIX-056`). Members read what is published and unexpired; an admin reads and writes all of the org's. The update grant is by column. The worker never touches it. |
| `story_frames` | §5.7e | — | — | — | A session's story (`0198`, `DEC-248` §5, `REQ-STO-001` … `018`). Members read what is visible and inside 24 h; the author reads their own unfinished video; staff read all. **No client write** — every write is a definer function. |
| `story_views` | §5.7e | §5.7e | — | — | A member's own record of what they viewed; nobody else's, staff included (`REQ-STO-010`). |
| `story_reactions` | §5.7e | §5.7e | §5.7e | §5.7e | One per member per frame; the update grant is by column; no ledger row, ever (`REQ-STO-005`). |
| `story_frame_takedowns` | §5.7e | — | — | — | «أزلني» on a video frame; the requester and staff read; written only by definer functions (`REQ-STO-014`). |

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

#### §5.7c — `member_seen_marks` — a member's own cursor (`0162`, `DEC-197`)
```sql
create policy "member_seen_marks_read_own"   on member_seen_marks for select to authenticated;  -- member_id = auth_member_id() and org_id = auth_org_id()
create policy "member_seen_marks_insert_own" on member_seen_marks for insert to authenticated;  -- the same, and a level or company named on the row is of the org
create policy "member_seen_marks_update_own" on member_seen_marks for update to authenticated;  -- the same, both sides
grant select, insert, update on member_seen_marks to authenticated;
revoke all on member_seen_marks from anon, service_role;
```
Nobody reads another member's marks — not an admin, not a moderator: what a member has looked at is theirs. No
delete: the member's deletion cascades. `service_role` holds nothing; moments 3 to 5 are acknowledged by the client
that showed them, never by a job.
★ `0169` (`DEC-216` §2.2) adds `weekly_period` / `weekly_rank`. **No policy and no grant changes**: the policies are
row predicates that name no column, and the grant above is table-level, so it covers columns added after it —
invariant 6 holds by that, and `tests/rls/scoring-seen.test.ts` proves the pair is the member's own.


#### §5.7d — `feed_announcements` — an org's announcements (`0164`, `DEC-206` §3, `REQ-UIX-056`)

Expiry is a predicate, not a deletion: the member's read policy stops answering for an expired row and no job runs.
`org_id` and `author_id` are never updatable — the update grant names three columns. No super-admin disjunct;
`service_role` holds nothing. Cases: `POL-feed_announcements.read`, `POL-feed_announcements.write` in
`tests/rls/feed-announcements.test.ts`.

```sql
create policy "feed_announcements_read_published" on feed_announcements for select to authenticated;  -- org_id = auth_org_id() and published_at <= now() and not expired
create policy "feed_announcements_admin_read"     on feed_announcements for select to authenticated;  -- org_id = auth_org_id() and is_org_admin()
create policy "feed_announcements_admin_insert"   on feed_announcements for insert to authenticated;  -- the same, and author_id = auth_member_id()
create policy "feed_announcements_admin_update"   on feed_announcements for update to authenticated;  -- the same, both sides
create policy "feed_announcements_admin_delete"   on feed_announcements for delete to authenticated;  -- org_id = auth_org_id() and is_org_admin()
grant select, insert, delete on feed_announcements to authenticated;
grant update (body, published_at, expires_at) on feed_announcements to authenticated;
revoke all on feed_announcements from anon, service_role;
```


#### §5.7e — session stories — `story_frames`, `story_views`, `story_reactions`, `story_frame_takedowns` (`0198`, `DEC-248` §5, `DEC-251` §5)
A story is the session's; a frame is a row that stores an identity and an instant and **no figure**. Expiry, hiding,
removal, cancellation and a hidden photograph are all one predicate, `story_frame_is_visible()` — security invoker, so
it reads the session and the photograph through the caller's own policies and can only take authority away. The read
policy calls it and so does the story feed, so the two cannot drift. **No client role writes a frame or a removal
request**: the generator, the capture, the transcode and moderation are definer functions. `service_role` holds
nothing on any of the four. Cases: `POL-story_frames.read_visible`, `.read_own`, `.staff_read`, `.no_client_write`,
`.one_per_trigger`, `POL-story_views.own`, `POL-story_reactions.own`, `POL-story_frame_takedowns.read`,
`POL-reports.story_frame`, `POL-story_media_read` in `tests/rls/story-tables.test.ts`.
```sql
create policy "story_frames_read_visible"   on story_frames for select to authenticated;  -- org_id = auth_org_id() and story_frame_is_visible(row): visible, not hidden, not removed, inside 24 h of its trigger, session not cancelled, its photograph visible
create policy "story_frames_read_own"       on story_frames for select to authenticated;  -- the author's own video while processing or failed, never a removed one
create policy "story_frames_staff_read"     on story_frames for select to authenticated;  -- org_id = auth_org_id() and is_staff() — expired, hidden and removed too (REQ-STO-017)
grant select on story_frames to authenticated;                                             -- no insert, update or delete for anyone: definer functions only
create policy "story_views_read_own"        on story_views for select to authenticated;   -- member_id = auth_member_id(); no staff policy (REQ-STO-010)
create policy "story_views_insert_own"      on story_views for insert to authenticated;   -- the same, and the frame is one the caller may read now
grant select, insert on story_views to authenticated;
create policy "story_reactions_read"        on story_reactions for select to authenticated;  -- the org's, for a frame the caller may read
create policy "story_reactions_insert_own"  on story_reactions for insert to authenticated;  -- member_id = auth_member_id(), a readable frame
create policy "story_reactions_update_own"  on story_reactions for update to authenticated;  -- the same, both sides
create policy "story_reactions_delete_own"  on story_reactions for delete to authenticated;  -- member_id = auth_member_id()
grant select, insert, delete on story_reactions to authenticated;
grant update (kind) on story_reactions to authenticated;
create policy "story_frame_takedowns_read"  on story_frame_takedowns for select to authenticated;  -- is_staff() or requester_id = auth_member_id()
grant select on story_frame_takedowns to authenticated;                                     -- requests and decisions are definer functions
revoke all on story_frames, story_views, story_reactions, story_frame_takedowns from anon, service_role;
```
`reports` gains `story_frame_id` and `report_target` gains `story_frame`; a check ties the two
(`POL-reports.story_frame`). `photos` gains `caption` and `story_derivative_ready`, both written by the worker's
definer alone.

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
create policy "photos_storage_read"          on storage.objects for select to authenticated;  -- org prefix · hidden only to staff (REQ-EVT-012) · ★ never once removed (0156, DEC-182)
create policy "photos_storage_write"         on storage.objects for insert to authenticated;  -- org prefix · has_checked_in() or presenter or staff (REQ-EVT-009)
create policy "design_assets_storage_read"   on storage.objects for select to authenticated;  -- org prefix
create policy "design_assets_storage_write"  on storage.objects for insert to authenticated;  -- org prefix · staff
create policy "exports_storage_read"         on storage.objects for select to authenticated;  -- org prefix · the requesting member; writes are service_role only
create policy "exports_storage_read_public_card" on storage.objects for select to anon, authenticated;  -- DEC-066 (0080): ONLY the og.png of a card-eligible session's poster, via export_is_public_card(name); a member of another org sees what a stranger sees
create policy "exports_storage_certificate_restricted" on storage.objects as restrictive for select to authenticated;  -- DEC-178 (0153): a certificate's render only to staff of its org or its own member once released, via export_object_is_foreign_certificate(name); narrows exports_storage_read, which admitted the whole org prefix
create policy "photo_albums_storage_read"          on storage.objects for select to authenticated;  -- DEC-182 (0156): staff of the org, and only the album's CURRENT build (path segment 5 = build_id), ready and unexpired — a stale, superseded or expired zip is unreadable with its path in hand
create policy "avatars_storage_read"                on storage.objects for select to authenticated;  -- DEC-182 (0157): same org, and only a member's CURRENT avatar_version (path segment 4) — clearing the version cuts access in the same statement
create policy "story_media_read"                    on storage.objects for select to authenticated;  -- DEC-248 §5 (0198): a story video's rendition and poster — never its source — for a frame the caller may read now (the frame is looked up under the caller's own policies); the write policy lands with content's capture gate
create policy "story_media_write"                   on storage.objects for insert to authenticated;  -- DEC-251 §5 (0199): a SOURCE only (source.mp4|mov|webm), under the caller's org and a session whose capture window is open for them — story_capture_open(): checked in, from the start until 24 h after the end; no update policy, so no overwrite
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
| `POL-company_domains.read_admin` | ★ `0203` — an admin reads their org's rows; a moderator, a member and another org's admin read none. |
| `POL-company_domains.no_client_write` | No client role inserts, updates or deletes a row: `42501`. |
| `CHK-company_domains.one_company_per_domain` | The same domain on two companies of one org is `23505`; on companies of two orgs it is accepted. |
| `CHK-company_domains.lowercase` | A mixed-case domain with a leading `@` is stored lowercase without it; a malformed one is `23514`. |
| `TRG-company_domains.same_org` | A row naming a company of another org is `23503`. |
| `TRG-members.company_source` | A company written with no source named is `'admin'`; one written under `kareem.company_source = 'domain'` is `'domain'`; a member never placed has null. |
| `RPC-provision_member.places_by_domain` | A first sign-in from a company's domain lands in that company with source `'domain'`; no match leaves both null; a deactivated company places nobody. |
| `RPC-provision_member.binding_keeps_admin_choice` | A member added with a company keeps it at first sign-in whatever their domain; one added with none is placed by domain. |
| `RPC-provision_member.company_never_blocks` | ★ With the company lookup made to raise, the sign-in still provisions, with no company — the lookup never blocks sign-in. |
| `RPC-save_company.admin_only` | A moderator and a member are refused `42501`; another org's company is `company_not_found`. |
| `RPC-save_company.dry_run_writes_nothing` | The dry run returns the two counts and the destination's NAME — never a member's — and writes no row. |
| `RPC-save_company.moves_exactly_the_preview` | The confirm moves exactly the members counted, with source 'domain'; the admin-placed are left. |
| `RPC-save_company.token` | A member who arrives between the dry run and the confirm makes the confirm answer `changed` with the new numbers, writing nothing. |
| `RPC-save_company.removal_unplaces_nobody` | Removing a domain leaves every member it placed where they are. |
| `RPC-save_company.refusals_name_the_domain` | A malformed domain and one on another company of the org come back per domain with their reason; nothing is written. |
| `RPC-save_company.deactivated_places_nobody` | Domains saved on a deactivated company move nobody (DEC-255 §4, Q3). |
| `RPC-save_company.audit` | `company.domain_added` / `company.domain_removed` per domain, `member.company_changed` per member moved; `company.created` / `.changed` / `.team_color_changed` still from their triggers. |
| `RPC-set_member_company.by_hand` | An admin's placement or removal is source 'admin', audited with the old and the new, and no later save moves it. |
| `RPC-add_member.company_source` | A company given while adding is 'admin'; none given and a matching domain is 'domain'; none at all is null. |
| `POL-org_settings.update.admin` | A moderator updating settings is rejected (`REQ-ADM-020`). |
| `POL-members.select.member` | Selecting `email` on another member **errors on the column grant**, not returns null. |
| `POL-members.update.self` | A member updating their own `org_role` is rejected; the column is not granted. |
| `POL-members.update.self` | A member updating another member's `bio` is rejected. |
| `POL-members.org_immutable` | An update changing `org_id` raises, even as service_role. |
| `POL-companies.select.member` · `POL-categories.select.member` · `POL-venues.select.member` | A member of org A sees none of org B's rows; sees all of A's. |
| `POL-companies.insert.admin` · `POL-categories.insert.admin` · `POL-venues.insert.admin` | A member's insert is rejected; an admin's succeeds; an admin inserting with org B's `org_id` is rejected by `with check`. |
| `POL-companies.update.admin` · `POL-categories.update.admin` · `POL-venues.update.admin` | An admin deactivates a row; **no role can delete one** (`REQ-ADM-006`). |
| `POL-companies.team_color` | ★ `0160`, `REQ-UIX-043`, `DEC-183` §4.11. Read through `p1_org_read` and written through `p2_admin_update` — no new policy, no new grant. An admin writes a colour and clears it; a member reads it; a member's and a moderator's write matches no row; another org sees no row; the database refuses a value that is not lower-case `#rrggbb`, for an admin and for the owner alike. (`tests/rls/team-colour.test.ts`) |
| `POL-companies.team_color_audit` | ★ `0161`, `DEC-186` §8 — **the first audit `companies` has had, and it covers the team colour only.** A definer trigger on `org_domains_audit()`'s pattern: an admin's change writes one `company.team_color_changed` row naming the company, the old colour and the new; clearing it is audited too; a rename or a deactivation writes none; a member's write touches no row and so writes none. (`tests/rls/team-colour-audit.test.ts`) |
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
| `POL-proposal_presenters.insert.unanswered` | ★ A row for anyone but the proposal's proposer is inserted UNANSWERED — `accepted = false`, no `declined_at` — whatever a member's request sent; `create_proposal()`'s own row stays accepted. Before wave 19 a proposer could insert a colleague as already accepted through PostgREST, and `0020` copied them onto the session without consent. A direct connection with no member's claims is not coerced (migration `0168`, `DEC-214` §1, `REQ-PRO-003`). |
| `POL-proposal_presenters.insert.after_submission` | The proposer may add a co-presenter while the proposal is `draft`, `submitted`, `in_review` or `changes_requested`; `MSG-copresenter_invited` fires for the added row; an insert after the decision is refused (migrations `0012`, `0039`, `0168`; `SCR-018`, wave 19). |
| `RPC-create_proposal` | Creates the proposal, the proposer's own accepted presenter row and the named co-presenters atomically; a bad co-presenter id rolls the proposal back with it; `proposer_id` is the session's own member whatever the caller sends (`REQ-PRO-003`, migration `0012`). |
| `RPC-review_proposal.admin_only` | A member and a moderator are both refused `42501`; only an org admin may review, and never a proposal in another org (migration `0013`). |
| `RPC-review_proposal.reason` | `reject` and `request_changes` without a reason are refused; the reason reaches the proposer on the row and the audit row (`REQ-PRO-005`, `REQ-PRO-006`). |
| `RPC-review_proposal.path` | Deciding on a `submitted` proposal walks it through `in_review`, so `02` §6.1 is followed and both transitions are audited. |
| `POL-sessions.insert.rpc` | `sessions` has no insert policy and no insert grant: a direct insert by an admin is refused, and `create_session()` is the only way in (migration `0020`). |
| `RPC-create_session.admin_only` | A member and a moderator are refused `42501`; an admin of another org cannot reach the proposal or create into that org. |
| `RPC-create_session.one_per_proposal` | An approved proposal becomes at most one session (partial unique index); a second attempt is refused, and only an `approved` proposal can be turned into one (`REQ-PRO-007`, `REQ-PRO-008`). |
| `POL-session_presenters.decline` | A presenter declining an unpublished session returns it to `draft` and writes the transition row; a published session is left alone (`REQ-SES-003`). |
| `POL-session_presenters.update_self.not_after_completion` | A presenter of a completed or cancelled session cannot change their own `accepted` / `declined_at` (the update matches no row); on a session still ahead they can, as before (migration `0146`, `DEC-174`). |
| `RPC-session_award_state.caller_only` | Takes no member; reads the caller's claims; another org's session returns zero rows; `anon` cannot execute it. |
| `RPC-session_award_state.none` | No active check-in, a removed one, a disabled or zero-point rule, a cancelled session, or an accepted presenter → `none`. |
| `RPC-session_award_state.pending_before_completion` | Checked in on a running session → `pending` with the rule's points and the days attended, required and counted. |
| `RPC-session_award_state.paid_when_standing` | An attendance award that no reversal names → `paid` with its amount, before or after completion. |
| `RPC-session_award_state.incomplete` | After completion with the predicate false, or before it once a required day's ceiling has passed unattended → `incomplete`, naming those days in order. |
| `RPC-session_award_state.agrees_with_award_points` | `pending` on a completed session if and only if the completion pass writes the award. |
| `RPC-session_award_state.writes_nothing` | The ledger and the queue are identical before and after a call. |
| `RPC-attendance_award_barred.service_role_only` | No client role can execute the shared presenter bar. |
| `POL-check_in.no_award_before_completion` | A code check-in and a manual mark on a running session — one day or three — enqueue no award job. |
| `RPC-award_points.waits_for_completion_at_any_n` | A `check_in` award on a session that is not completed or archived writes nothing, at one day as at three. |
| `RPC-evaluate_member_attendance.pays_only_after_completion` | The completion pass on a running session enqueues nothing; on a completed one it enqueues main's key and payload. |
| `RPC-attendance_removed.before_completion_writes_nothing` | Check in, remove, complete: no award, no reversal, and the no-show only from the completion pass. |
| `RPC-attendance_removed.no_show_after_completion_only` | A removal records the no-show only on a completed or archived session. |
| `RPC-award_points.presenter_earns_no_attendance` | An accepted presenter of the session is paid no attendance, whenever they checked in. |
| `RPC-award_points.presenter_sources_wait_for_completion` | `session_delivered`, `attendee_bonus`, `rating_bonus` and `proposal_accepted` write nothing before the session completes. |
| `RPC-award_points.presenter_must_be_accepted` | The same four write nothing to a member who is not an accepted presenter of the session when the job runs. |
| `RPC-award_points.presenter_epoch` | With no reversal a presenter award's key is today's (`…:v1`); after one it is `…:v2`. |
| `RPC-evaluate_member_attendance.readd_repays_presenter_bonus` | An attendee re-added after completion re-runs the presenters' award job under its existing key. |
| `POL-proposals.no_award_at_approval` | An approval enqueues nothing: the trigger is gone. |
| `POL-sessions.completion_pays_proposal_presenters` | Completion enqueues `pts:proposal_accepted:<proposal>:<member>` for each accepted session presenter who was on the proposal, with the session's id; none for a direct session. |
| `POL-sessions.proposal_accepted_never_twice` | A proposal paid at approval before this migration is not paid again at completion: the same ledger key. |
| `POL-session_presenters.pays_on_join_after_completion` | Inserting an accepted row, or updating one to accepted, on a completed session enqueues the fan-out's jobs for that presenter; before completion, nothing. |
| `POL-session_presenters.reverses_on_leave` | Deleting an accepted row, or updating it away from accepted, writes one compensating row per standing presenter award, «أُزيل من مقدّمي الجلسة», `reversal:<id>:v1`. |
| `POL-session_presenters.reverses_legacy_proposal_accepted` | A `proposal_accepted` paid at approval is reversed when that presenter leaves, before completion too. |
| `POL-session_presenters.epoch_repays_after_readd` | Removed and re-added after completion: `v1`, its reversal, `v2`. |
| `POL-session_presenters.trigger_is_definer` | An admin's delete through `p2_admin_delete` writes the reversal, though the admin has no grant on the ledger. |
| `RPC-evaluate_streaks.counts_completed_sessions` | Check-ins at sessions not yet completed do not count toward a streak; the same sessions completed do. |
| `RPC-evaluate_badges.counts_completed_sessions` | The same for the `check_ins_count` badge metric. |
| `RPC-add_session_presenter.admin_only` | A member and a moderator are refused 42501; an admin of another org cannot reach the session (`session_not_found`, 42501); stale claims are refused. |
| `RPC-add_session_presenter.assigned` | The member becomes an ACCEPTED presenter, is told once by `MSG-presenter_assigned`, and one `session.presenter_added` audit row names them; a pending or declined row is promoted to accepted rather than refused. |
| `RPC-add_session_presenter.refusals` | A member outside the org, a deactivated member, an existing accepted presenter, a member with an active check-in on the session, a cancelled session, and one beyond the org's presenter limit are each refused, leaving no row, no notice and no audit. |
| `RPC-remove_session_presenter.delete_not_decline` | The row is DELETED — `declined_at` is never written, so a published session keeps its state and gains no transition row; one `session.presenter_removed` audit row. |
| `RPC-remove_session_presenter.last` | The session's only accepted presenter cannot be removed (23514); a pending or declined row always can. |
| `RPC-session_presenters.no_ledger` | Neither function names the ledger, an award or a job, and neither call writes a ledger row. |
| `RPC-create_session.assigned` | A presenter named when an admin creates a session directly is ACCEPTED — assigned, as `DEC-172` rules for an added one (replaces `0020`'s «not accepted on their behalf»). |
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
| `RPC-record_export_download.poster` | A session poster's download: admin ✓, moderator ✓, an accepted presenter ✓, each writing one `export_artifact.downloaded` row naming the session; a plain member ✗ (though `0145` lets them read the render), a presenter not accepted ✗, another org's admin ✗, no row. (migration `0152`, `DEC-176`, `DEC-178`). |
| `RPC-record_export_download.certificate` | A certificate's download: its own member ✓ (issued or revoked), admin ✓, moderator ✓; its member while `held` ✗; another member ✗. The file is named by the Western serial. (migration `0152`, `DEC-177`). |
| `RPC-record_export_download.document` | Any other render (a template, the studio's panel): admin ✓, moderator ✗, member ✗. (migration `0152`). |
| `RPC-record_export_download.refusals` | An unknown id and a not-ready artifact both answer `42501`, so the function is no existence oracle; `anon` cannot execute it. (migration `0152`). |
| `POL-avatars_storage_read.same_org` | A member of the org reads another member's current copy ✓ · another org's member ✗. (migration `0157`, `DEC-182`). |
| `POL-avatars_storage_read.stale_version_refused` | An older version's object ✗; ★ clearing `avatar_version` (a decline, anonymisation) makes the current one unreadable at once. (migration `0157`). |
| `COL-members.avatar_import.no_grant` | A client select of `members.avatar_import` is refused (42501); `avatar_version` is readable through the grant, `members_member_view` and `me()`. (migration `0157`). |
| `TRG-comments_broadcast.avatar_version` | The comment payload carries `authorAvatarVersion`, and `authorAvatarUrl` stays null — no Google URL on the wire. (migrations `0155`, `0157`). |
| `TRG-comments_broadcast.author_context` | The payload adds `authorCompanyName`, `authorTeamColor` and `authorIsPresenter` (an **accepted** presenter of the comment's session only) — every earlier key kept, `authorAvatarUrl` still null, nothing about any other member (REQ-EVT-015, DEC-209). (migration `0167`). |
| `RPC-begin_photo_album_build` | `service_role` only · returns the visible set, never a hidden or removed photograph · a superseded build gets no rows. (migration `0159`, `DEC-182`). |
| `RPC-mark_points_seen.own_row` | Writes the caller's own mark, inserting it the first time; never another member's. (migration `0163`, `DEC-197`). |
| `RPC-mark_points_seen.foreign_level` | A level of another org is refused with `22023` and nothing is written. (migration `0163`). |
| `RPC-mark_board_seen.one_board` | Touches only the named board's columns; the others and the points cursor are unchanged. (migration `0163`). |
| `RPC-mark_board_seen.unknown_board` | A board other than `all_time`, `monthly`, `company` or ★ `weekly` (from `0173`) is refused with `22023`. (migration `0163`, amended by `0173`). |
| `RPC-mark_board_seen.weekly` | Writes the caller's own weekly period and rank, touching no other board's columns (migration `0173`). |
| `RPC-mark_board_seen.weekly_current` | A weekly period other than the current `org_week()` start — or none — is refused with `22023`, and nothing is written (migration `0173`). |
| `POL-org_settings.company_min_active_members` | Every member reads it; an org admin sets it within 1 – 50 (`23514` outside); a member changes nothing; no one reaches another org's row (migration `0175`). |
| `POL-leaderboard_snapshots.min_active_members` | No client writes it — `42501` (migration `0175`). |
| `RPC-snapshot_leaderboard.min_frozen` | A company snapshot stores the org's minimum; changing the setting later changes no snapshot (migration `0176`). |
| `RPC-snapshot_leaderboard.eligible_first` | Below-minimum companies rank after every eligible one; every rank stays > 0 (migration `0176`). |
| `RPC-snapshot_leaderboard.final_untouched` | A final company snapshot taken before the change keeps its order and its null minimum (migration `0176`). |
| `RPC-reverse_photo_points.compensating` | One `reversal` row per standing photo award, `-amount`, 0149's key and its own reason; none written twice (migration `0177`). |
| `RPC-reverse_photo_points.frees_cap` | A reversed award frees its place: the next visible photo on that session is paid (migration `0177`). |
| `RPC-award_photo_points.visible_only` | A hidden or removed photo enqueues nothing; a late job after a hide writes nothing (migration `0177`). |
| `RPC-award_photo_points.epoch` | award → hide → restore → award nets ONE award; a second hide reverses the second (migration `0177`). |
| `RPC-award_photo_points.restore_only_reversed` | A photo with no earlier award, hidden and restored, is paid nothing (migration `0177`). |
| `RPC-award_photo_points.cap` | The sixth visible photo on one session writes nothing, and `capped_award_explanations()` names that session (migration `0177`). |
| `RPC-award_photo_points.grants` | Neither function is callable by anon or authenticated (migration `0177`). |
| `RPC-award_points.photo_epoch` | `award_points()`'s photo branch keys by epoch; every other source's key is unchanged (migration `0177`). |
| `POL-photos.points.insert`  | a stripped photo inserted by `record_photo_upload()` pays its uploader one `photo` award (migration `0178`). |
| `POL-photos.points.hide`    | a visible photo hidden (takedown or staff) reverses the standing award once, «أُخفيت الصورة» (migration `0178`). |
| `POL-photos.points.restore` | a hidden photo restored is paid again — once more, never twice net (migration `0178`). |
| `POL-photos.points.removal` | a removal never reaches this trigger; `scoring`'s path reverses it (migration `0178`). |
| `RPC-mark_board_seen.fraction_clamped` | A company fraction outside 0–1 is stored clamped. (migration `0163`). |
| `RPC-session_attendance_count.count_not_who` | A member reads how many attended a session and no `check_ins` row of anyone else. (migration `0165`). |
| `RPC-session_attendance_count.removed` | A check-in an admin removed does not count; a member is counted once across days. (migration `0165`). |
| `RPC-session_attendance_count.foreign_org` | Another org's session counts zero; `anon` cannot execute it. (migration `0165`). |
| `RPC-monthly_ranked_count.counts_hidden` | Counts every member entry of the snapshot, an opted-out member's included, though the caller cannot read that row. (migration `0165`). |
| `RPC-monthly_ranked_count.members_only` | Company entries are not counted. (migration `0165`). |
| `RPC-monthly_ranked_count.foreign_org` | A snapshot of another org answers null, as an unknown id does. (migration `0165`). |
| `RPC-org_week.boundary` | The week starts at Saturday 00:00 in the org's zone and ends before the next Saturday 00:00; a Friday 23:59 is in it (migration `0171`, `DEC-217` §3.4). |
| `RPC-weekly_leaderboard.window` | Only rows written inside the current `org_week()` count; last week's do not (migration `0171`). |
| `RPC-weekly_leaderboard.opt_out` | An opted-out member is absent from another member's call and present in their own (migration `0171`). |
| `RPC-weekly_leaderboard.active` | A deactivated member never appears (migration `0171`). |
| `RPC-weekly_leaderboard.org` | Another org's ledger never appears (migration `0171`). |
| `RPC-weekly_leaderboard.net_positive` | A net of 0 or less this week is not ranked (migration `0171`). |
| `RPC-week.anon` | anon cannot execute either function (migration `0171`). |
| `RPC-retry_calendar_sync.self` | A member re-queues their OWN failed row: the job is enqueued under `cal:{rsvp_id}` and the session's failed days read `pending` (migration `0170`). |
| `RPC-retry_calendar_sync.not_others` | Another member's row, an admin's attempt on it, and another org's, answer `not_found` and change nothing (migration `0170`). |
| `RPC-retry_calendar_sync.only_failed` | A row that is not `failed` answers `not_failed`; nothing is enqueued (migration `0170`). |
| `RPC-retry_calendar_sync.definer_only_callers` | `authenticated` may execute; `anon` and `public` may not (migration `0170`). |
| `RPC-capped_award_explanations.own` | Explains the caller's own comments only; another member's capped session never appears (migration `0172`). |
| `RPC-capped_award_explanations.full_now` | An unpaid comment while the cap is not full (a cooldown) is not explained (migration `0172`). |
| `RPC-capped_award_explanations.deleted` | A deleted comment is never explained as capped (migration `0172`). |
| `RPC-capped_award_explanations.anon` | anon cannot execute it (migration `0172`). |
| `RPC-monthly_ranked_count.anon` | `anon` cannot execute it. (migration `0165`). |
| `TRG-check_ins_host_broadcast.poke` | A member's check-in sends `{dayId}` on `host:{session_id}` (event `check_in_count`) — the day alone, no member id, name or time; the topic `0016` authorises to staff and that session's presenters (REQ-CHK-001, DEC-209 §1). (migration `0166`). |
| `TRG-check_ins_host_broadcast.removal` | An admin's removal pokes the topic again; a refused attempt does not. (migration `0166`). |
| `TRG-check_ins_host_broadcast.own_topic` | A check-in never pokes another session's topic. (migration `0166`). |
| `RPC-mark_seen.anon` | `anon` cannot execute either function. (migration `0163`). |
| `RPC-record_photo_album_built` | Ready + `MSG-photo_album_ready` to who asked + the expiry enqueued · `stale` when a photograph was hidden mid-build · `superseded` for a replaced build · a part outside its build's prefix refused. (migration `0159`). |
| `RPC-fail_photo_album` | The current build only, `failed` with its error. (migration `0159`). |
| `TRG-photo_albums_stale` | ★ A member's takedown, a staff removal and a delete each make a ready album stale — «remove photos of me» reaches a zip already built — and the takedown still succeeds. (migration `0159`). |
| `RPC-set_avatar_import.self_only` | A member records only their OWN answer; there is no member argument. (migration `0158`, `DEC-182`). |
| `RPC-set_avatar_import.decline_clears_version` | «لا» clears `avatar_version` in the same statement, so `avatars_storage_read` stops serving at once, and enqueues the deletion. (migration `0158`). |
| `RPC-set_avatar_import.no_source` | «نعم» with no Google source answers `no_source` and enqueues nothing. (migration `0158`). |
| `RPC-set_avatar_import.audited` | Each answer writes `member.avatar_import_answered` with before and after. (migration `0158`). |
| `RPC-my_avatar.self_only` | Returns the caller's own answer, version and whether a source exists — never the source URL. (migration `0158`). |
| `RPC-avatar_job_target.worker_only` | `service_role` only; every client role is refused. (migration `0158`). |
| `RPC-record_avatar_copy.worker_only` | `service_role` only. (migration `0158`). |
| `RPC-record_avatar_copy.stale_when_declined` | A copy recorded after a decline answers `stale` and sets nothing. (migration `0158`). |
| `RPC-record_avatar_copy.stale_when_source_changed` | A copy of a source that has since changed answers `stale`. (migration `0158`). |
| `RPC-avatar_member_orgs.worker_only` | `service_role` only — the prefix assertion's member-in-org question. (migration `0158`). |
| `TRG-members_avatar_source_changed.accepted_only` | A changed `avatar_url` enqueues `import_avatar` only for a member who said yes. (migration `0158`). |
| `RPC-anonymise_members.avatar` | Anonymisation clears the answer and the version in the anonymising statement and enqueues the objects' deletion; the summary keys are unchanged. (migration `0158`, `REQ-PRF-011`). |
| `POL-photos_storage_read.removed` | ★ A removed photograph's object is readable by nobody, member or staff — before `0156` it was readable by every member of the org. (migration `0156`, `DEC-182`). |
| `POL-photo_albums_read_staff` | Admin ✓ · moderator ✓ · member ✗ · another org's admin ✗. (migration `0156`). |
| `POL-photo_albums_storage_read` | Staff, a ready and current build ✓ · a member ✗ · stale ✗ · expired ✗ · a superseded `build_id` ✗. (migration `0156`). |
| `POL-story_media_write` | A checked-in attendee inside the window uploads a source under their org and that session ✓ · not checked in ✗ · outside the window ✗ · another org's prefix ✗ · any other file name ✗ · no overwrite. (migration `0199`; `tests/rls/story-frames-content.test.ts`). |
| `RPC-resolve_report.story_frame` | A story-frame report given to `resolve_report()`: `invalid`, nothing written — only `decide_story_frame()` decides one. (migration `0199`). |
| `TRG-story.published_once` | The admin's publish writes one `published` frame with no author; a second publish and a second generate write nothing. (`tests/rls/story-generator.test.ts`, as every `TRG-story.*` and `RPC-story*` row). |
| `TRG-story.live_per_day` | The clock's start writes one `live` frame keyed on the running day; the minutely clock writes no second; a three-day workshop writes three. |
| `TRG-story.recap_once` | Completion writes one `recap`; archive and reopen write none. |
| `TRG-story.registration_no_coincidence` | `registration_opened` only after a priority window, at its end, once; `registration_closed` only for a deadline before the first start, once (`DEC-251` §4.3). |
| `TRG-story.starts_soon_per_day` | One `starts_soon` per day, 24 h before it, never dated before publication, once. |
| `TRG-story.photo_once` | The worker's record writes one `photo` frame naming the photograph; a second record, a hide and a restore write none; a hidden photograph's frame leaves the feed and returns with it. |
| `TRG-story.materials_batched` | Two links on a completed session in one org-local day make one `materials` frame; a «بعد» material before completion makes none, a «قبل» one does. |
| `RPC-story.cancelled` | The generator writes nothing for a cancelled session; `story_feed()` shows even staff none of its frames. |
| `RPC-story_feed.member_view` | A member reads their org's visible frames, `seen` once they view one; another org reads none; staff get the same 24 hours; an author alone reads their own processing video. |
| `RPC-story_recap_figures.withheld` | Attendance always; the average null below `rating_min_aggregate` and shown at it; no row for a non-completed session or another org. |
| `RPC-story_live_count.org` | A day's active check-ins for the org; null for another org. |
| `RPC-story.acl` | The generator is executable by no client role and not by `service_role`; the clock by `service_role` only; `story_feed()` not by `anon`. |
| `RPC-story_capture.gate` | `story_capture_open()`, `initiate_story_photo()` and `begin_story_video()`: checked in ✓ · not checked in ✗ · a presenter or staff not checked in ✗ · before the start ✗ · 24 h after the end ✗ · cancelled ✗ · another org ✗. (`tests/rls/story-frames-content.test.ts`, as the rows below). |
| `RPC-story_video.no_album_no_points` | A video writes no `photos` row and no ledger row; a story photograph is an album photograph with its points and its caption. |
| `RPC-story_moderation` | A report hides the frame at once and lands in the queue; «أزلني» on a video hides it; `remove_story_frame()` on a photograph writes `photo.removed` and one compensating row, on a video `story_frame.removed` and no ledger row; a failed video is its author's alone. |
| `RPC-record_photo_download` | Any member of the org ✓ for a visible photo, one `photo.downloaded` row naming the session; ★ a hidden photo ✗ **for staff too** (`DEC-182` Q3); removed ✗ · another org ✗ · unknown ✗ — all `42501`, no row. (migration `0156`). |
| `RPC-request_photo_album` | Admin ✓ · moderator ✓: one row `queued`, one `photo_album.requested` row, one `zip_session_photos` job under `zipphotos:{session}`; a repeat moves `build_id`, not the row · member ✗ · another org ✗ (`42501`) · no visible photo → `album_empty` (`P0002`), no row. (migration `0156`). |
| `RPC-record_photo_album_download` | Staff, a ready album ✓ per part, one `photo_album.downloaded` row each, named `photos-YYYYMMDD[-part-n-of-m].zip` · member ✗ · stale · expired · part out of range ✗. (migration `0156`). |
| `POL-storage.objects.exports_certificate_restricted` | ★ A RESTRICTIVE select policy on `exports`: a certificate's render is listed only by staff of its org or its own member once released. Another member ✗; its member while `held` ✗; an orphaned object is covered by its path; a session poster stays readable by a member (`DEC-173`); another org ✗. Closes the leak `0037`'s org-prefix policy left open. (migration `0153`, `DEC-178`). |
| `RPC-schedule_session.certificate_mode_unchanged` | A save that does not name the mode leaves the stored mode standing — the schedule form no longer states it. (migration `0154`, `DEC-178`). |
| `RPC-schedule_session.certificate_mode_named` | A save that names the mode still writes it (`main`'s call, unchanged). (migration `0154`). |
| `RPC-set_session_certificate_mode.admin_only` | A member and a moderator are refused `42501`; another org's admin cannot reach the session; stale claims are refused. (migration `0154`). |
| `RPC-set_session_certificate_mode.audited` | A change writes the mode and exactly one `session.certificate_mode_changed` row with the old and new mode; the same mode writes nothing and returns `unchanged`. (migration `0154`). |
| `RPC-set_session_certificate_mode.refusals` | ★ **`DEC-250`:** a **cancelled** session is refused `session_cancelled` (`23514`) with no write and no audit. A completed or archived one is no longer refused. (migrations `0154`, `0194`). |
| `RPC-set_session_certificate_mode.no_side_effects` | **Before completion** the call enqueues no job and writes no notification and no transition row; the same holds for a switch to `off`. (migrations `0154`, `0194`). |
| `RPC-_issue_check_in_code.rotation_off_one_code` | ★ `0202`, `REQ-CHK-019` — with rotation off, a day's code is issued once with `valid_until = check_in_ceiling(day)` and every later issuing call returns it. |
| `RPC-_issue_check_in_code.off_keeps_current` | Switching off while a code is current raises that code's `valid_until` to the ceiling; no new code is issued and none is shortened. |
| `RPC-_issue_check_in_code.on_resumes` | Switching on while a whole-day code is current issues a successor and leaves the whole-day code valid for exactly the grace — never before `now()`, never past the ceiling (`DEC-255` §3). |
| `RPC-check_in.fixed_code_per_day` | With rotation off, day 1's code is refused on day 2 (`invalid_code`), and day 2 has its own. |
| `RPC-save_org_settings.rotation_off` | A null rotation is saved through `save_org_settings()` unchanged: written, in the receipt, guarded as stale in both directions; a period outside 60–3600 is still `23514`. |
| `TRG-sessions.renamed_audited` | ★ `0200`, `DEC-254` §5, `REQ-SES-021` — a title change writes one `session.renamed` row with the actor, `before.title` and `after.title`; an update that leaves the title equal writes none. A definer trigger on `0181`'s pattern; no new grant. |
| `TRG-sessions.title_locked_from_published` | ★ `0200`, `DEC-255` §1 — a title change to a session in `published`, `in_progress`, `completed`, `archived` or `cancelled` raises `session_title_locked` (`55000`) for an admin and for its presenter alike; in every earlier state it succeeds. The guard binds every signed-in caller. |
| `COL-sessions.certificate_mode_default` | ★ `0201`, `REQ-CRT-018` — a session inserted with no mode is `review`; a session that existed before keeps its mode. |
