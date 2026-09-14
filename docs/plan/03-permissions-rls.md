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

#### §5.5a — `materials`, read — the phase gate
```sql
create policy "materials_read" on materials for select to authenticated
  using (org_id = auth_org_id()
         and removed_at is null
         and (phase = 'before'
              or exists (select 1 from sessions s
                          where s.id = materials.session_id
                            and s.state in ('completed','archived'))
              or is_presenter_of(session_id)
              or is_staff()));
```
`REQ-MAT-006` in the database: a `بعد الجلسة` material is invisible to members until the session
completes. Doing this in the DAL alone would leave the row reachable through any other read path.

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
| `fonts` | P1 | P2 | — | — | `parity_status` written by the job only. |
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
| `RPC-transition_session.closes_check_in` | Completing early — or cancelling — closes the check-in window in the same transaction (`REQ-CHK-004`). |
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
| `POL-check_ins.insert.rpc` | Direct insert is rejected; `check_in()` with a valid code succeeds. |
| `POL-check_ins.rate_limit` | 11 attempts in 10 minutes → the 11th returns `status = 'rate_limited'`, and the attempt is still recorded. (An exception would roll back the attempt row written in the same call — DEC-043; `check_in()` returns an envelope for every outcome after the attempt insert and raises only for `not_found`, before anything is logged.) |
| `POL-check_ins.window` | A valid code before `starts_at` and after `ends_at` is rejected. |
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

The last row is the one to run first after any policy change. If it ever returns rows, DEC-014 has
been undone and D3 with it.

### 8.3 The policy-vs-migration diff

Protocol decays; a machine does not. `scripts/policy-diff.mjs` extracts every `create policy` from
the migrations and diffs it against this document, failing CI on any policy present in one and
absent from the other.

This is the **highest-value automation in the plan**: this document is only true if it matches the
database, and nothing else checks that it does.
