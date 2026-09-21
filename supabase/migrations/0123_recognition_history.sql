-- 0123 — recognition edits are recorded: badges, levels, perks and streak rules
-- write `scoring_config_history`, as every other configuration table already does.
--
-- Serves: REQ-REC-001 … REQ-REC-005, REQ-PTS-005 («every configuration change, one
--         history»), REQ-ADM-018 · carried since wave 8 (`DEC-149`, `DEC-151`,
--         `DEC-155`) · closed as row L9 of wave 10 (`DEC-160`).
--
-- WHAT WAS MISSING. `scoring_config_history` (`0004`) has admitted the scopes
-- `badges`, `levels`, `perks` and `streaks` since M1, and nothing has ever written
-- one. `scoring_rules` (`0027`), `org_settings` (`0004`), `company_scoring_rules`
-- (`0081`) and `brand_kits` (`0068`) each carry a history trigger; the four
-- recognition tables were created beside `scoring_rules` in the same file and
-- did not get theirs. So an admin could retire a badge, move a level's threshold,
-- switch a perk on or change a streak's bonus, and the org had no record that it
-- happened, by whom, or what the value was before — on the tables that decide
-- who is recognised.
--
-- WHY A TRIGGER AND NOT THE DAL. `src/lib/dal/scoring-admin.ts` writes all four
-- tables straight through RLS (`p2_admin_insert`, `p2_admin_update`), so a
-- trigger sees every writer there is or will be, and no screen changes. It is
-- `security definer` because `scoring_config_history` is revoked from
-- `authenticated` for insert — the history is evidence, and a writer who could
-- insert it could forge it.
--
-- WHAT IS RECORDED.
--   · an UPDATE — one row per changed column, old and new value, the actor:
--     the exact shape `scoring_rules_history()` established.
--   · an INSERT **made by a person** — one row, `field = 'created'`, the new
--     row as its value. A custom badge is the one thing an admin creates here.
--     An insert with no member behind it is `_seed_org_scoring()` filling a new
--     org's catalogue: a seed is not a change anybody made, and thirty rows
--     saying so at the top of every org's history would bury the first real one.
--   · nothing on DELETE: none of the four tables has a delete policy or grant.
--   Bookkeeping columns are skipped. `sort_order` on `levels` is NOT skipped:
--   nothing writes it today, and if something ever does, that is a change.
--
-- ADDITIVE (wave 10's rule): `main`'s app writes these tables exactly as it does
-- today and gains a history row it never reads. No column, policy, grant or
-- function that exists is touched. A trigger function cannot be called directly
-- whatever its ACL, so `definer-exposure.test.ts` has nothing to list.
--
-- 03 §8.2 rows:
--   | `POL-badges.history`       | An admin's edit of a badge appends one `scoring_config_history` row per changed column (`scope = 'badges'`), retiring included; a custom badge's creation appends one `created` row; the org's seed appends none. |
--   | `POL-levels.history`       | An admin's edit of a level appends one row per changed column (`scope = 'levels'`), with the old and the new threshold. |
--   | `POL-perks.history`        | An admin's edit of a perk appends one row per changed column (`scope = 'perks'`). |
--   | `POL-streak_rules.history` | An admin's edit of a streak rule appends one row per changed column (`scope = 'streaks'`). |
--   | `POL-recognition.history.no_forgery` | A moderator's refused edit appends nothing; no client role can insert a history row directly. |

create function public.recognition_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_scope text := tg_argv[0];
  v_actor uuid := public.auth_member_id();
  col     text;
  oldj    jsonb;
  newj    jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    -- A seed has no member behind it, and is not a change anybody made.
    if v_actor is null then
      return new;
    end if;
    insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
    values (new.org_id, v_scope, new.id, 'created', null,
            newj - 'id' - 'org_id' - 'created_at' - 'updated_at', v_actor);
    return new;
  end if;

  oldj := to_jsonb(old);
  for col in select key from jsonb_each(newj) loop
    if col in ('id', 'org_id', 'created_at', 'updated_at') then continue; end if;
    if oldj -> col is distinct from newj -> col then
      insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
      values (new.org_id, v_scope, new.id, col, oldj -> col, newj -> col, v_actor);
    end if;
  end loop;
  return new;
end $$;

create trigger badges_history after insert or update on public.badges
  for each row execute function public.recognition_history('badges');
create trigger levels_history after insert or update on public.levels
  for each row execute function public.recognition_history('levels');
create trigger perks_history after insert or update on public.perks
  for each row execute function public.recognition_history('perks');
create trigger streak_rules_history after insert or update on public.streak_rules
  for each row execute function public.recognition_history('streaks');
