-- 0175 · wave 20, PR C (DEC-220 §1, REQ-UIX-082, STORY-UIX-072) — «بلا ترتيب»: a minimum of active members, set by
-- the org and frozen into each company snapshot.
--
-- The owner chose a setting of its own over reusing `company_scoring_rules.min_active_members`, so the ranking and the
-- attendance rule cannot drift. `org_settings` is one column per setting (0004:109-123), and the company metric is its
-- sibling there, so this is one more column beside it, in the pattern `max_co_presenters` and `priority_rsvp_hours` set.
--
-- ★ THE DEFAULT IS 3, and it decides who competes: it equals what the company rules already seed (0081:47), and it
-- stops a one- or two-person company topping a per-active-member board on one member's points.
--
-- ★ No admin control this wave (DEC-220 §1.3): the screen is `/app/admin/settings`, a console route, frozen. The column
-- joins the admin's column-level update grant (0004:146) — «everything except identity and timestamps» — so the
-- console wave builds only the control; until then the owner sets it by SQL. `p2_admin_update` already covers the row.
--
-- The snapshot's copy is nullable: a snapshot taken before this migration has none and draws as it always did. It is
-- written by `snapshot_leaderboard()` (scoring's replace, from this wave's next migration); once a snapshot is final,
-- `leaderboard_snapshot_guard()` (0027:453) refuses any change, so a final month or quarter never moves.
-- `leaderboard_snapshots` has no client write path (0027:451), so no grant is needed for the new column.
--
-- Additive for `main`: a defaulted column and a nullable one. main's app selects the columns it names; main's worker
-- calls `snapshot_leaderboard()` as it is, which never writes the new column until it is replaced.

alter table public.org_settings
  add column company_min_active_members int not null default 3
    check (company_min_active_members between 1 and 50);

grant update (company_min_active_members) on public.org_settings to authenticated;

alter table public.leaderboard_snapshots
  add column min_active_members int check (min_active_members is null or min_active_members >= 1);
