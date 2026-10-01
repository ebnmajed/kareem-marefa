-- 0172 · wave 20 (DEC-218 §3, REQ-UIX-072, REQ-PTS-006) — proposed by `scoring`, promoted by the lead.
-- scoring · wave 20 (DEC-216 §5.5, DEC-218, REQ-UIX-072, REQ-PTS-003, REQ-PTS-006) — the cap, EXPLAINED.
--
-- ★★ This is an explanation, never a ledger row, a view or a table. `award_points()` refuses an award once the
-- session's sum for its rule has reached `cap_per_session × points` (0148:207-214) and writes NOTHING — the ledger
-- records points, not explanations (`points.ts`'s `MissedAttendance`, `05` §8: «a capped sixth comment writes no row
-- either, and the cap is explained in place»). So `SCR-022` computes the explanation at read time from what the
-- member did and what the ledger holds, and draws it as a row with `0`.
--
-- `capped_award_explanations()`, for the CALLER only: each session where the comment cap is reached NOW and at least
-- one of the caller's own live comments earned nothing. One answer per session, not per comment — «الحد: 5 تعليقات
-- لكل جلسة» — placed at the first unpaid comment.
--
--   · ★ It claims the cap only when the cap is FULL NOW. A comment unpaid while the cap is not full was refused by
--     the cooldown (`comment`'s 60 s) or is a job not yet run, and «الحد» there would be false — so nothing is said.
--   · A deleted comment is not a capped one: its award, if any, was reversed (0032); it is left out.
--   · Comments only. `REQ-PTS-006` names comments and photos, but nothing in the tree awards a photo — no trigger or
--     job enqueues the `photo` rule — so a photo cap can never fill and is not explained. (Written for the lead: the
--     catalogue lists a photo rule that nothing pays.)
--
-- `security invoker`: the caller's own comments and own ledger rows and the org's rules are all readable to them
-- under the policies that exist; this names nobody else and writes nothing.
--
-- Additive for `main`: nothing on `main` names it.
--
-- 03 §8.2 rows:
--   | `RPC-capped_award_explanations.own` | Explains the caller's own comments only; another member's capped session never appears. |
--   | `RPC-capped_award_explanations.full_now` | An unpaid comment while the cap is not full (a cooldown) is not explained. |
--   | `RPC-capped_award_explanations.deleted` | A deleted comment is never explained as capped. |
--   | `RPC-capped_award_explanations.anon` | anon cannot execute it. |

create function public.capped_award_explanations()
returns table (session_id uuid, rule_key text, cap_per_session int, first_unpaid_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with rule as (
    select r.action_key, r.points, r.cap_per_session
      from public.scoring_rules r
     where r.org_id = public.auth_org_id()
       and r.action_key = 'comment'
       and r.enabled and r.points > 0 and r.cap_per_session is not null
  ), full_caps as (
    select l.session_id
      from public.points_ledger l
      join rule r on r.action_key = l.rule_key
     where l.member_id = public.auth_member_id()
       and l.session_id is not null
     group by l.session_id, r.points, r.cap_per_session
    having sum(l.amount) >= r.cap_per_session * r.points
  )
  select c.session_id, r.action_key, r.cap_per_session, min(c.created_at)
    from public.comments c
    join full_caps f on f.session_id = c.session_id
    cross join rule r
   where c.author_id = public.auth_member_id()
     and c.deleted_at is null
     and not exists (
           select 1 from public.points_ledger l
            where l.member_id = public.auth_member_id()
              and l.source_id = c.id
              and l.rule_key = r.action_key)
   group by c.session_id, r.action_key, r.cap_per_session
$$;
revoke execute on function public.capped_award_explanations() from public, anon;
grant  execute on function public.capped_award_explanations() to authenticated;
