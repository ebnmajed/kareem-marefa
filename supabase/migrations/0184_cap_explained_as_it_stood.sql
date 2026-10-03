-- 0184 · promoted by the lead (wave 22, DEC-232) from supabase/proposed/scoring/cap_explained_as_it_stood.sql, unchanged below this line.
-- proposed by `scoring` (wave 22, PR B) · DEC-232 §4.1, REQ-PTS-003, REQ-PTS-006, REQ-UIX-100 — the cap, explained by
-- the rule AS IT STOOD when the content was posted, not as it stands today.
--
-- ★ THE DEFECT (DEC-232 §4, row 1). `capped_award_explanations()` (0172, 0177) judged «this session's comments were
-- capped» from the CURRENT rule: `sum(amount) >= cap_per_session * points`. An admin who raised a rule's points or cap
-- after a member had hit the cap made that false, and SCR-022's explanation vanished — leaving a comment that earned
-- nothing, unexplained. Disabling the rule removed every past explanation. That breaks REQ-PTS-003 («every point a
-- member holds is explainable … without asking anyone») the moment SCR-053 is used, which is the promise
-- DEC-231 §0.3 says the catalogue must keep.
--
-- ★ THE FIX. Each unpaid item is judged by the rule's points, enabled flag and cap AS THEY STOOD AT THE ITEM'S TIME —
-- the moment `award_points()` would have applied them — read from `scoring_config_history`, the record every rule
-- change writes (0027's trigger). The engine's own test is unchanged: the session's standing sum for that rule against
-- cap × points. The explanation names the cap that applied, not today's.
--
-- `scoring_rule_as_of()` is a definer because `scoring_config_history` is admin-only (0004): a member may not read the
-- history, but may learn what a rule of their own org was worth at a moment — the rule itself is org-readable today
-- (`scoring_rules`, 0027). It returns three values for the CALLER's org and one action, and nothing about who changed
-- them. Executable by `authenticated` only.
--
-- Same signature for `capped_award_explanations()`, so SCR-022's DAL (`points.ts`) and its markup are unchanged.
--
-- 03 §8.2 rows proven by tests/rls/scoring-cap-as-it-stood.test.ts:
--   RPC-capped_award_explanations.rule_as_it_stood — raising points, raising the cap or disabling the rule after a
--                                                    member hit the cap leaves the explanation, with the cap that applied.
--   RPC-capped_award_explanations.not_before       — a cap introduced AFTER the content explains nothing about it.
--   RPC-scoring_rule_as_of.own_org                 — the caller's org only; anon cannot execute it.

create function public.scoring_rule_as_of(p_action_key text, p_at timestamptz)
returns table (points int, enabled boolean, cap_per_session int)
language sql stable security definer set search_path = '' as $$
  with r as (
    select sr.id, sr.points, sr.enabled, sr.cap_per_session
      from public.scoring_rules sr
     where sr.org_id = public.auth_org_id() and sr.action_key = p_action_key
  ), v as (
    -- A field's value at p_at: the newest change at or before it; else the value the first later change replaced;
    -- else the rule as it stands (never changed). jsonb `null` is a value (a cap cleared), SQL NULL is «no row».
    select f.field,
           coalesce(
             -- Two changes to one field in one transaction share `changed_at` (now()); the chain decides which came
             -- last — the row no same-instant row continues from — so a tie never resolves at random.
             (select h.new_value from public.scoring_config_history h
               where h.entity_id = r.id and h.scope = 'scoring' and h.field = f.field and h.changed_at <= p_at
               order by h.changed_at desc,
                        exists (select 1 from public.scoring_config_history n
                                 where n.entity_id = h.entity_id and n.scope = 'scoring' and n.field = h.field
                                   and n.changed_at = h.changed_at and n.id <> h.id
                                   and n.old_value is not distinct from h.new_value)
               limit 1),
             (select h.old_value from public.scoring_config_history h
               where h.entity_id = r.id and h.scope = 'scoring' and h.field = f.field and h.changed_at > p_at
               order by h.changed_at asc,
                        exists (select 1 from public.scoring_config_history p
                                 where p.entity_id = h.entity_id and p.scope = 'scoring' and p.field = h.field
                                   and p.changed_at = h.changed_at and p.id <> h.id
                                   and p.new_value is not distinct from h.old_value)
               limit 1),
             case f.field when 'points' then to_jsonb(r.points)
                          when 'enabled' then to_jsonb(r.enabled)
                          else to_jsonb(r.cap_per_session) end) as value
      from r cross join (values ('points'), ('enabled'), ('cap_per_session')) as f(field)
  )
  select (select (value #>> '{}')::int from v where field = 'points'),
         (select (value #>> '{}')::boolean from v where field = 'enabled'),
         (select (value #>> '{}')::int from v where field = 'cap_per_session')
   where exists (select 1 from r)
$$;
revoke execute on function public.scoring_rule_as_of(text, timestamptz) from public, anon;
grant execute on function public.scoring_rule_as_of(text, timestamptz) to authenticated;

create or replace function public.capped_award_explanations()
returns table (session_id uuid, rule_key text, cap_per_session int, first_unpaid_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with items as (
    select 'comment'::text as rule_key, c.id, c.session_id, c.created_at
      from public.comments c
     where c.author_id = public.auth_member_id() and c.deleted_at is null
    union all
    select 'photo', p.id, p.session_id, p.created_at
      from public.photos p
     where p.uploader_id = public.auth_member_id() and p.hidden_at is null and p.removed_at is null
  ), unpaid as (
    select i.*
      from items i
     where i.session_id is not null
       and not exists (
             select 1 from public.points_ledger l
              where l.member_id = public.auth_member_id()
                and l.source_id = i.id
                and l.rule_key = i.rule_key)
  ), judged as (
    -- The rule as it stood when the item was posted, and the session's standing sum for that rule (the engine's test).
    select u.session_id, u.rule_key, u.created_at, ra.cap_per_session
      from unpaid u
      cross join lateral public.scoring_rule_as_of(u.rule_key, u.created_at) ra
     where ra.enabled and ra.points > 0 and ra.cap_per_session is not null
       and (select coalesce(sum(l.amount), 0) from public.points_ledger l
             where l.member_id = public.auth_member_id()
               and l.session_id = u.session_id
               and l.rule_key = u.rule_key) >= ra.cap_per_session * ra.points
  )
  select distinct on (j.session_id, j.rule_key) j.session_id, j.rule_key, j.cap_per_session, j.created_at
    from judged j
   order by j.session_id, j.rule_key, j.created_at
$$;
