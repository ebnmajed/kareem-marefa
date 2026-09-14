-- promoted by the lead at wave-2 sync 6 · notify (wave 2, M3) — changing the org's reminder schedule moves every
-- pending reminder.
--
-- Serves:  REQ-NTF-004 ("Changing the schedule reschedules pending reminders
--          rather than duplicating them") · REQ-ADM-016 (the admin screen
--          that does the changing) · REQ-RAT-007 (the prompt delay)
-- Cites:   08 §4.1, row 4 — "Org changes the reminder schedule → Old-offset
--          keys removed, new-offset keys added" · 11 §2.6 · 0034 (the
--          schedulers) · 0004 (org_settings, the admin's update grant)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `POL-org_settings.reminder_reschedule` | Changing `reminder_offsets_minutes` removes every
--     pending job under an offset that is no longer configured and adds one per new offset, for
--     every confirmed seat in the org — no duplicates and no orphans. |
--   | `POL-org_settings.prompt_delay_reschedule` | Changing `rating_prompt_delay_minutes` moves the
--     pending `rate:{session}` job of every completed session. |
--
-- ── The orphan this exists to prevent ───────────────────────────────────────
-- `schedule_session_reminders()` (0034) walks the offsets the org has NOW. An
-- admin who changes {7 d, 1 d, 2 h} to {2 d, 1 h} leaves three pending jobs
-- per member under keys the new walk never visits, and they fire — a member
-- gets «بعد أسبوع» from a schedule the org abandoned. So the OLD offsets are
-- cancelled explicitly here, from `old.reminder_offsets_minutes`, which is the
-- only place that value is still available.

create function public.org_settings_reschedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  removed  int[];
  s        record;
  r        record;
  v_offset int;
begin
  if new.reminder_offsets_minutes is distinct from old.reminder_offsets_minutes then
    -- Offsets the org no longer uses. `schedule_session_reminders()` cannot
    -- see these: it walks the new array.
    removed := array(
      select o from unnest(coalesce(old.reminder_offsets_minutes, '{}')) o
       where o <> all (coalesce(new.reminder_offsets_minutes, '{}')));

    for s in select id from public.sessions
              where org_id = new.org_id and state in ('published', 'in_progress')
    loop
      if array_length(removed, 1) is not null then
        for r in select member_id from public.rsvps where session_id = s.id loop
          foreach v_offset in array removed loop
            perform public.cancel_job(public.reminder_key(s.id, v_offset, r.member_id));
          end loop;
        end loop;
      end if;
      -- And then the new set, which moves or creates the rest by key.
      perform public.schedule_session_reminders(s.id);
    end loop;
  end if;

  if new.rating_prompt_delay_minutes is distinct from old.rating_prompt_delay_minutes then
    -- `rate:{session}` is one key per session, so re-running the scheduler
    -- moves it. Only sessions whose prompt has not yet fired matter, and a
    -- job whose moment has passed is simply not re-created (0034).
    for s in select id from public.sessions
              where org_id = new.org_id and state = 'completed' and completed_at is not null
                and completed_at > now() - interval '7 days'
    loop
      perform public.schedule_rating_prompt(s.id);
    end loop;
  end if;

  return new;
end $$;

create trigger org_settings_reschedule
  after update of reminder_offsets_minutes, rating_prompt_delay_minutes on public.org_settings
  for each row execute function public.org_settings_reschedule();
