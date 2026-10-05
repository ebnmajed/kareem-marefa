-- 0202 · wave 27 (DEC-254 §6, DEC-255 §3, REQ-CHK-019, STORY-CHK-009) — the check-in code may stay fixed for the day.
-- `checkin`'s function (docs/plan/notes/checkin.md, «Wave 27 — plan», W27-2), promoted by the lead TOGETHER WITH the
-- column change below as ONE migration.
--
-- ★ THE SETTING. `org_settings.check_in_rotation_seconds` drops `not null`: NULL is «لا يتغيّر». The check
-- `between 60 and 3600` (0004:114) already admits null and still binds every other value; the default stays 600, so
-- no org changes behaviour until an admin chooses «لا يتغيّر» on SCR-063. `save_org_settings()` (0187) needs nothing:
-- a JSON null is written as SQL null and its history row records it.
--
-- Additive for `main`: no org is at null until SCR-063 offers it, which is this PR's code; and the function below is
-- in place before the column can hold one.
--
-- ★★ THE ORDER IS THE SAFETY. With the column nullable and `0105`'s core still in place, a null period makes
-- `make_interval(secs => null)` null, `valid_until = now() + null` violates `not null` (0010:211), and every issuing
-- call raises `23502` — `ensure_check_in_code()`, `rotate_check_in_code()` and `revoke_check_in_code()` alike. This
-- file must therefore never be absent while the column admits null.
--
-- ★ ONLY THE CORE CHANGES, and by `create or replace`: same name, same arguments, same return type as `0105:107`.
-- No drop — `rotate_check_in_code()` is `language sql` with a hard catalogue dependency on this function
-- (0105:215), and `0105:668`'s revoke survives a replace (re-stated below anyway). `ensure_check_in_code()`,
-- `rotate_check_in_code()`, `revoke_check_in_code()` and `check_in()` are not re-created.
--
-- ★ THE ROTATING BRANCH IS 0105's TEXT VERBATIM. An org with a period issues exactly what it issued before: the same
-- query, the same «current while younger than a period», the same `valid_until = now() + rotation + grace`, and no
-- update to any existing row — except the one case below that only a whole-day code can reach.
--
-- ★ ROTATION OFF (a null period, «لا يتغيّر»): the day has ONE code, `valid_until = check_in_ceiling(day)` (0101,
-- called, never copied). The day's NEWEST code — revoked or not — is the candidate: a revoke is followed by a fresh
-- code, never by an older one still inside its grace.
--
-- ★ D3 — THE BOUND ON EVERY WRITE TO AN ISSUED CODE'S `valid_until`: never past the day's ceiling, never before
-- `now()`. `valid_until`, `check (valid_until > valid_from)` and `check_in_ceiling()` themselves are untouched.
--   · switched OFF while a code is current — it becomes the day's code: `valid_until` is raised TO the ceiling
--     (only ever raised, and only when below it; the code is current, so `valid_from ≤ now() < ceiling`);
--   · switched ON while a whole-day code is current (D1) — the successor is minted and the whole-day code keeps the
--     grace every previous code keeps: `least(old, now() + grace)`, which is `≥ now()` and `≤ old ≤ ceiling`.
--     REQ-CHK-002: exactly one current, at most one other within its grace. A rotating predecessor never reaches
--     the ceiling before its successor is minted, so an org that never switched keeps every row byte-identical.
--
-- ★ D4 — the switch takes effect at the next issuing call: the host view's or SCR-044's read (HostClock re-reads at
-- the rotation instant), or `rotate_codes`. No trigger on `org_settings`.
--
-- Serves: REQ-CHK-019, REQ-CHK-002, REQ-CHK-016, REQ-TEN-008
-- Cites:  0105 (_issue_check_in_code — re-created), 0101 (check_in_ceiling), 0010:205-217 (check_in_codes)
--
-- 03 §8.2 rows this adds:
--   | `RPC-_issue_check_in_code.rotation_off_one_code` | With rotation off, a day's code is issued once with `valid_until = check_in_ceiling(day)` and every later issuing call returns it. |
--   | `RPC-_issue_check_in_code.off_keeps_current` | Switching off while a code is current raises that code's `valid_until` to the ceiling; no new code is issued and none is shortened. |
--   | `RPC-_issue_check_in_code.on_resumes` | Switching on while a whole-day code is current issues a successor and leaves the whole-day code valid for exactly the grace — never before now(), never past the ceiling. |
--   | `RPC-check_in.fixed_code_per_day` | With rotation off, day 1's code is refused on day 2 (`invalid_code`), and day 2 has its own. |

alter table public.org_settings alter column check_in_rotation_seconds drop not null;
comment on column public.org_settings.check_in_rotation_seconds is
  'Seconds between check-in codes, 60–3600; NULL = the code does not rotate: one code per day, valid to check_in_ceiling() (REQ-CHK-019).';

create or replace function public._issue_check_in_code(p_session uuid, p_day uuid default null) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  d public.session_days;
  rotation_s int;
  grace_s int;
  cur public.check_in_codes;
  prev public.check_in_codes;
  v_ceiling timestamptz;
  v_until timestamptz;
  v_code text;
  i int;
  alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';  -- no 0/O 1/I/L 5/S 2/Z 8/B (REQ-CHK-002)
begin
  -- The SESSION lock is kept, not narrowed to the day: it is the lock that
  -- also serialises against a day write, and two days of one session minting
  -- concurrently is not a scenario worth a weaker guarantee.
  select * into s from public.sessions where id = p_session for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into d from public.session_days
   where id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and session_id = p_session;
  if d.id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- no such day, or the session has none
  end if;

  select check_in_rotation_seconds, check_in_grace_seconds into rotation_s, grace_s
    from public.org_settings where org_id = s.org_id;

  if rotation_s is null then
    -- ── REQ-CHK-019: rotation off — one code for the day, to the day's ceiling ──
    v_ceiling := public.check_in_ceiling(d.id);
    select * into cur from public.check_in_codes
     where session_day_id = d.id
     order by valid_from desc, (revoked_at is null) desc       -- a revoke and its replacement may share now()
     limit 1;
    if found and cur.revoked_at is null and cur.valid_until > now() then
      if cur.valid_until < v_ceiling then
        -- Switched off while this code was current: it becomes the day's code. Raised TO the ceiling, never past it.
        update public.check_in_codes set valid_until = v_ceiling where id = cur.id
        returning * into cur;
      end if;
      return cur;
    end if;
    if now() >= v_ceiling then
      return null;   -- the day takes no attendance: no code, and `valid_until > valid_from` could not hold
    end if;
    v_until := v_ceiling;
  else
    -- ── a period is set: 0105's text verbatim ──
    -- The most recently issued non-revoked code OF THIS DAY. If it was issued
    -- within the current rotation window it IS the current code — returned
    -- unchanged, so calling this every render does not mint every render.
    select * into cur from public.check_in_codes
     where session_day_id = d.id and revoked_at is null
     order by valid_from desc
     limit 1;

    if found and cur.valid_from > now() - make_interval(secs => rotation_s) then
      return cur;
    end if;
    prev := cur;   -- the code this one succeeds, if any (D1 below)
    v_until := now() + make_interval(secs => rotation_s + grace_s);
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      -- `unique (session_id, code)` is UNCHANGED, so two days of one workshop
      -- can never share a code. Narrowing it to the day would make yesterday's
      -- code re-mintable today, which is a worse property than the retry costs.
      insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
      values (s.org_id, p_session, d.id, v_code, now(), v_until)
      returning * into cur;
      exit;
    exception when unique_violation then
      -- collision on (session_id, code) — vanishingly rare, retried rather
      -- than assumed away.
    end;
  end loop;

  -- D1 — switched ON while a whole-day code was current: it is now the previous code and keeps exactly the grace.
  -- `least(...)` is never past its old value (≤ the ceiling) and never before now().
  if prev.id is not null and prev.valid_until >= public.check_in_ceiling(d.id) then
    update public.check_in_codes
       set valid_until = least(prev.valid_until, now() + make_interval(secs => grace_s))
     where id = prev.id;
  end if;
  return cur;
end $$;

revoke execute on function public._issue_check_in_code(uuid, uuid) from public, anon, authenticated, service_role;
