-- wave 9 (DEC-150 contract 5, DEC-151) — attendance_recorded() and
-- attendance_removed(): the two functions that own EVERY decision about what
-- a check-in earns.
-- Promoted by the lead from supabase/proposed/scoring/0001_attendance_hooks.sql.
--
-- ★ THIS FILE CHANGES NO BEHAVIOUR. It is a seam, published so `checkin` can
-- switch its three call sites (`check_in()`, `mark_checked_in_manually()`,
-- `remove_check_in()`) to a call and stop deciding about points. Both bodies
-- are lifted VERBATIM from what those RPCs do today:
--   * attendance_recorded() = 0087's enqueue block (itself 0028's, the old
--     `TODO(scoring, M4)` call site) — the same task, the same job key
--     `pts:check_in:<check_in id>`, the same payload.
--   * attendance_removed() = 0087's reversal loop and its no-show symmetry
--     block, in that order.
-- REQ-SES-017's real change — the award moving to session completion for a
-- multi-day session, and the standing-award decision DEC-151 ruled — lands in
-- a LATER file, in the bodies below. Never at a call site: `checkin` switches
-- once, against behaviour it can diff against `main`.
--
-- ★ What attendance_removed() deliberately does NOT do (DEC-151, the boundary
-- the lead drew): it does not revoke the certificate. `revoke_certificate()`
-- is `designer`'s and stays where it is in `remove_check_in()`; the
-- certificate follows the predicate through the lead's own
-- `attendance_certificate_sync()`. Contract 5 is POINTS ONLY.
--
-- Serves:  REQ-SES-017, REQ-PTS-011, REQ-PTS-012, REQ-PTS-013, REQ-CHK-009,
--          REQ-CHK-017, invariant 9 · DEC-150 contract 5, DEC-151
-- Cites:   0028 (award_points, the enqueue block), 0087 (remove_check_in —
--          the reversal loop and the no-show symmetry, copied not rewritten),
--          0088 (award_points' late-job guard, untouched here),
--          0025 (public.enqueue_job — the only way a job is enqueued),
--          0100 (check_ins.session_day_id; nothing here reads a day yet)
-- Docs:    docs/plan/notes/scoring.md "Wave 9 plan" — CONTRACT 5
--
-- 03 §8.2 rows this adds:
--   | `RPC-attendance_recorded.definer_only` | No client role can call it; only `service_role` and the function owner (so `check_in()` and `mark_checked_in_manually()`, both definer, can). |
--   | `RPC-attendance_removed.definer_only` | The same. |
--   | `RPC-attendance_recorded.enqueues_award` | A recorded attendance enqueues exactly one `award_points` job, task `award_points`, key `pts:check_in:<check_in id>`, payload `{rule:'check_in', member_id, source:'check_in', source_id:<check_in id>, session_id}` — byte for byte what `check_in()` enqueues on `main`. |
--   | `RPC-attendance_removed.reversal` | One compensating `reversal` row per not-yet-reversed `check_in`/`attendee_bonus` award keyed to that check-in: `-amount`, reason «أُلغي تسجيل الحضور», key `reversal:<ledger id>:v1`. A second call writes no second row. |
--   | `RPC-attendance_removed.no_show_symmetry` | A removed check-in whose member holds a confirmed RSVP awards the `no_show` rule under `evaluate_no_shows`' own key; a member with no confirmed RSVP earns no such row. |
--   | `RPC-attendance_hooks.terminal_row` | Either function called with a check-in id that no longer exists returns silently — the terminal-row pattern (DEC-059), never an exception into an admin's transaction. |

-- ═══════════════════════════════════════════════════════════════════════════
-- attendance_recorded — a check-in came into existence (a code entry or an
-- admin's manual mark). Today that means exactly one thing: enqueue the
-- award. The member's action never waits on it (11 §2.3) — this only writes
-- a job row, and the check-in has already committed by the time the worker
-- picks it up.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.attendance_recorded(p_check_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ci public.check_ins;
begin
  select * into ci from public.check_ins where id = p_check_in;
  if not found then
    return;   -- the row is gone (a cascade, a rolled-back caller): nothing to award
  end if;

  -- 0087's enqueue block, verbatim. enqueue_job() only (0025), never
  -- graphile_worker.add_job() directly.
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', ci.member_id, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', ci.session_id),
    'pts:check_in:' || ci.id
  );
end $$;
revoke execute on function public.attendance_recorded(uuid) from public, anon, authenticated;
grant  execute on function public.attendance_recorded(uuid) to service_role;
comment on function public.attendance_recorded(uuid) is
  'DEC-150 contract 5: the only decision about what a check-in earns. Called by check_in() and mark_checked_in_manually(); they decide nothing about points.';

-- ═══════════════════════════════════════════════════════════════════════════
-- attendance_removed — an admin retracted a check-in (REQ-CHK-017). Two
-- movements, both 0087's, in 0087's order:
--   1. a compensating row per award keyed to this check-in — the attendee's
--      own `check_in` award AND the presenter's per-check-in `attendee_bonus`,
--      which share this row's id as their source_id (0087's header explains
--      why both are reversed and a badge or a streak is not);
--   2. the no-show symmetry: the exact key evaluate_no_shows would compute,
--      so a later replay of that job can never double-award.
-- The ledger is append-only (invariant 9): a reversal is a new row, never an
-- edit, and `on conflict do nothing` is the only conflict action.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.attendance_removed(p_check_in uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ci      public.check_ins;
  ledger  public.points_ledger;
  rsvp_id uuid;
begin
  select * into ci from public.check_ins where id = p_check_in;
  if not found then
    return;
  end if;

  for ledger in
    select * from public.points_ledger l
     where l.source in ('check_in', 'attendee_bonus') and l.source_id = ci.id
       and not exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = l.id)
  loop
    insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                      reason, rule_key, idempotency_key)
    values (ledger.org_id, ledger.member_id, -ledger.amount, 'reversal', ledger.id,
            ledger.session_id, 'أُلغي تسجيل الحضور', ledger.rule_key, 'reversal:' || ledger.id || ':v1')
    on conflict (idempotency_key) do nothing;
  end loop;

  select id into rsvp_id from public.rsvps
   where session_id = ci.session_id and member_id = ci.member_id and status = 'confirmed';
  if rsvp_id is not null then
    perform public.award_points('no_show', ci.member_id, 'no_show', rsvp_id, ci.session_id);
  end if;
end $$;
revoke execute on function public.attendance_removed(uuid) from public, anon, authenticated;
grant  execute on function public.attendance_removed(uuid) to service_role;
comment on function public.attendance_removed(uuid) is
  'DEC-150 contract 5, DEC-151: POINTS ONLY — the compensating reversal and the no-show symmetry. The certificate follows the predicate through attendance_certificate_sync(), not through here.';
