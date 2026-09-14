-- console (wave 3, M7) — admin_list_members(), REQ-ADM-009's "view a
-- member's full record."
--
-- Serves:  01 §20 REQ-ADM-009, 09 SCR-049
-- Cites:   02 §4.1 (`members`), 03 §1.1/§5.1b (the column grant IS the
--          member tier, A33), 03 §2 (helper functions), DEC-014
--
-- 0004's column grant on `public.members` is role-wide, not role+row-scoped:
-- `grant select (id, org_id, display_name, avatar_url, company_id,
-- job_title, bio, org_role, status, leaderboard_opt_out, created_at) on
-- public.members to authenticated` omits `email` for EVERY reader, admin
-- included — 0005's own comment on `me()` says so ("the column grant hides
-- `email` from the org (A33); the member sees their own through `me()`").
-- SCR-020's own table says an admin sees a member's email; nothing in 0004
-- or 0005 built that path. Widening the grant cannot fix it: a plain
-- `grant select (email)` would hand every member in the org everyone else's
-- email, not only an admin's — the same reasoning DEC-044 gave for
-- `list_session_ratings_admin()` (a policy cannot condition on a column
-- being read by the RIGHT role only; a function can). This is `me()`'s own
-- shape, widened from "my row" to "my org's rows, and only if I am an
-- admin," and it is STABLE — a read, not a privileged write — so it checks
-- `is_org_admin()` off the claim (03 §1.1's read-side rule), the same as
-- every other admin-read screen this track has built (`listVenuesForAdmin`,
-- `getScoringAdminData`). A non-admin caller gets zero rows, matching the
-- shape of every RLS-scoped select in this product, rather than an
-- exception — there is nothing here for a non-admin to be told about.

create function public.admin_list_members()
returns table (
  id                   uuid,
  email                extensions.citext,
  display_name         text,
  avatar_url           text,
  company_id           uuid,
  job_title            text,
  bio                  text,
  org_role             public.org_role,
  status               public.member_status,
  leaderboard_opt_out  boolean,
  deactivated_at       timestamptz,
  deactivated_reason   text,
  created_at           timestamptz
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.email, m.display_name, m.avatar_url, m.company_id, m.job_title, m.bio,
         m.org_role, m.status, m.leaderboard_opt_out, m.deactivated_at, m.deactivated_reason,
         m.created_at
    from public.members m
   where m.org_id = public.auth_org_id()
     and public.is_org_admin()
$$;
revoke execute on function public.admin_list_members from public, anon;
grant  execute on function public.admin_list_members to authenticated;
