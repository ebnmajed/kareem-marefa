-- 0218 — A settings-history row never blocks an org's deletion, and never names another org's member. DEC-275.
--
-- Found on production (2026-10-06): the owner, a platform admin, could not be added to an organisation. Their login was
-- bound to a member row in an org they had deleted — and `JOB-delete_org` had failed thirteen times on
-- `scoring_config_history_actor_id_fkey`, so the org, its member row and the binding never went away (one login, one
-- org: `members.auth_user_id` is unique, A2). The sixteen blocking rows were not in the deleted org: when the platform
-- admin CREATED another org, its seeded settings were written under their session, and the history triggers recorded
-- `auth_member_id()` — their member row in a DIFFERENT org — as the actor.
--
-- 1. `actor_id` becomes `on delete set null`: a deleted member leaves the change in the history and takes their name out
--    of it. Nothing in the table forbids an update (no trigger, no append-only rule), and the column is nullable.
-- 2. A `before insert` trigger keeps the actor only when they are a member of the row's own org; anyone else is null.
--    One place, so every history writer (org settings, scoring, company scoring, recognition, brand kits) is covered.
--
-- No data fix: the stuck job's next retry deletes the org, and the sixteen rows lose an actor that belongs to nobody.

alter table public.scoring_config_history drop constraint scoring_config_history_actor_id_fkey;
alter table public.scoring_config_history
  add constraint scoring_config_history_actor_id_fkey
  foreign key (actor_id) references public.members(id) on delete set null;

create or replace function public.scoring_config_history_actor_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_id is not null
     and not exists (select 1 from public.members m where m.id = new.actor_id and m.org_id = new.org_id) then
    new.actor_id := null;
  end if;
  return new;
end
$$;
revoke execute on function public.scoring_config_history_actor_same_org() from public, anon, authenticated;

drop trigger if exists scoring_config_history_actor_same_org on public.scoring_config_history;
create trigger scoring_config_history_actor_same_org
  before insert on public.scoring_config_history
  for each row execute function public.scoring_config_history_actor_same_org();
