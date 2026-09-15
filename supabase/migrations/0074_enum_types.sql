-- platform (wave 4, M8) — the two enums `0069` should have had. Follows `0004`.
--
-- Serves:  the naming rule in CLAUDE.md § Naming — "Enums: singular
--          `snake_case`, **Postgres enum types**, never `text` + check"
-- Cites:   02 §4.1 (ENT-retention_periods, ENT-data_export_requests, DEC-054),
--          12 §5.3, REQ-NFR-012, REQ-PRF-006
--
-- `0069` shipped `retention_periods.action` and `data_export_requests.status`
-- as `text` + a check constraint, which is exactly what the naming rule
-- forbids and for the reason the rule gives: a check accepts any text the
-- application sends until the constraint rejects it at write time, while an
-- enum makes an unknown value unrepresentable and gives every reader — psql,
-- a generated type, `\\d` — the list without going to find the constraint.
--
-- Forward-only, and ordered so it is safe on a table with rows: create the
-- type, drop the check, convert with a `using` cast, restore the default.
-- `retention_periods` carries `0069`'s seven seeded rows and every one of
-- their values is a label below, so the cast is total.
--
-- ── 03 §8.2 rows this file needs ───────────────────────────────────────────
-- None. It creates no policy, no grant and no function; the two columns keep
-- the policies and grants `0069` gave them. The one behavioural change is
-- worth a row in `03` §5 only if `03` names column types, which it does not.

-- ═══════════════════════════════════════════════════════════════════════════
-- retention_action — 12 §5.3's three outcomes.
--   delete    — the row goes
--   anonymise — the row stays and its personal columns are rewritten (§5.4:
--               members are never deleted)
--   retain    — enforced by doing nothing, and present as a VALUE so the
--               ledger's exemption is visible in the data rather than
--               inferred from an absent row
-- ═══════════════════════════════════════════════════════════════════════════
create type public.retention_action as enum ('delete', 'anonymise', 'retain');

-- ★ BOTH checks that mention `action` have to go first, not just the one that
-- enumerates it. `retention_days_required` stores its expression already
-- resolved as `action = 'retain'::text`, so an `alter column type` re-validates
-- it against the new type and fails with `operator does not exist:
-- retention_action = text`. It is restored below, where it recompiles against
-- the enum — the rule it states (a `retain` class has no period, and every
-- other class does) is the reason the ledger's exemption is a row.
alter table public.retention_periods
  drop constraint retention_periods_action_check,
  drop constraint retention_days_required;
alter table public.retention_periods
  alter column action type public.retention_action using action::public.retention_action;
alter table public.retention_periods
  add constraint retention_days_required check ((action = 'retain') = (days is null));

-- ═══════════════════════════════════════════════════════════════════════════
-- data_export_status — REQ-PRF-006's request lifecycle.
--   queued → building → ready → expired,  with failed reachable from building.
-- The order of the labels is the order of the lifecycle, so `order by status`
-- sorts a list of requests the way a reader expects.
-- ═══════════════════════════════════════════════════════════════════════════
create type public.data_export_status as enum ('queued', 'building', 'ready', 'failed', 'expired');

-- ★ The PARTIAL INDEX has to go too, for the same reason as the check above:
-- `data_export_requests_one_open`'s predicate is stored as
-- `status = ANY (ARRAY['queued'::text, 'building'::text])`, and an
-- `alter column type` re-validates it against the new type. A plain index on
-- the column (`data_export_requests_org_status_idx`) is rebuilt silently; only
-- an index with a PREDICATE that names the old type fails. It is recreated
-- below, and `RPC-request_data_export.rate_limited` in tests/rls/privacy.test.ts
-- is what proves it still bites afterwards — an index that quietly did not
-- come back would take the one-open-request rule with it.
drop index public.data_export_requests_one_open;
alter table public.data_export_requests
  drop constraint data_export_requests_status_check;
alter table public.data_export_requests
  alter column status drop default;
alter table public.data_export_requests
  alter column status type public.data_export_status using status::public.data_export_status;
alter table public.data_export_requests
  alter column status set default 'queued'::public.data_export_status;
create unique index data_export_requests_one_open
  on public.data_export_requests (member_id) where status in ('queued', 'building');

comment on type public.retention_action is '12 §5.3 — what enforce_retention() does with a class.';
comment on type public.data_export_status is 'REQ-PRF-006 — the lifecycle of a member''s own export request.';
