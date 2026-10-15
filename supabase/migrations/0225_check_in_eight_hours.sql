-- 0225 · Check-in stays open until eight hours after the day's end (DEC-294, amends REQ-CHK-016).
--
-- The owner, 2026-10-14: «i want it to stay visible until 8 hours after the session». The button and the gate move
-- together — a button the database refuses is the confusion DEC-293 removed — so the ONE ceiling every check-in gate
-- calls (`check_in()`, `ensure_check_in_code()`, `set_check_in_open()`, `rotate_check_in_code()`,
-- `mark_checked_in_manually()`, `resolve_session_day()`) moves from `ends_at + 2 h` to `ends_at + 8 h`. DEC-151's cap is
-- unchanged: a day still stops taking attendance the moment the next day of the same session begins.
--
-- Forward-only, a `create or replace` of one function with the same signature; its grants survive the replace.
create or replace function public.check_in_ceiling(p_day uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select least(
           d.ends_at + interval '8 hours',                       -- REQ-CHK-016 as amended by DEC-294
           (select min(n.starts_at) from public.session_days n   -- DEC-151: the next meeting has begun
             where n.session_id = d.session_id and n.starts_at > d.starts_at)
         )                                                       -- least() ignores a null: no next day, no cap
    from public.session_days d
   where d.id = p_day
$$;
comment on function public.check_in_ceiling(uuid) is
  'DEC-151, DEC-294: the instant a day stops taking attendance — least(ends_at + 8 h, the next day''s start). At one day: ends_at + 8 h. The ONE definition; check-in gates call it, never copy it.';
