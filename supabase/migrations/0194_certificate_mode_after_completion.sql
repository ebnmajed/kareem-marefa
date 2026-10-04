-- supabase/migrations/0194_certificate_mode_after_completion.sql — the lead (hotfix, DEC-245)
--
-- Serves:  REQ-CRT-017 (new), REQ-CRT-002, REQ-CRT-001, REQ-SES-017
-- Cites:   0154 (set_session_certificate_mode — THE LIVE TEXT this file re-creates, with two
--          changes and nothing else) · 0010:88 (`certificate_mode not null default 'off'`) ·
--          0065:74-85 (sessions_certificate_hook — the fan-out's only caller until now) ·
--          0108:63 (fan_out_certificates — re-runnable, and this file's whole argument) ·
--          0127 (issue_certificate — idempotent over a live row, and never replaces a
--          for-cause revocation) · 0005 (assert_fresh_admin, write_audit)
-- Docs:    DEC-245, which amends DEC-178 ruling 2 and discharges its deferral
--
-- ★★ THE LIVE DEFECT THIS CLOSES, as the owner reported it: «the default for the certificate is
-- that the session has no certificate and the settings for enabling and disabling disappeared».
-- Both halves are true, and together they are a dead end:
--
--   1. `sessions.certificate_mode` is `not null default 'off'` (0010:88), and since 0154
--      `schedule_session()`'s `p_certificate_mode` defaults to null = unchanged. So a session
--      nobody DELIBERATELY switched on completes at 'off'. That is the normal path, not an edge.
--   2. Certificates fan out from exactly one place — `sessions_certificate_hook`, an
--      `after update` trigger that fires only on the EDGE into 'completed' (0065:78) — and
--      `fan_out_certificates()` returns 0 at once when the mode is 'off' (0108:70-73).
--   3. And then `set_session_certificate_mode()` refused 'completed'/'archived' (0154), so
--      SCR-045 rendered no control at all: `{!closed && isAdmin ? …}`. The admin saw one
--      sentence — «لا تصدر شهادات لهذه الجلسة.» — and had no way to anything.
--
-- ★★ WHY THE REFUSAL'S PREMISE WAS WRONG. DEC-178 ruling 2 refused the mode after completion
-- «because changing it then does nothing», and deferred the remedy in the same breath:
-- «"Issue now" for a late switch is not this wave». But a mode changed after completion does
-- nothing only because NOTHING CALLS THE FAN-OUT A SECOND TIME. The function itself is
-- re-runnable by construction, and every part of that is checkable:
--
--   · it reads the mode LIVE and returns 0 at 'off' (0108:70-73), so it can never issue
--     against a mode that is off;
--   · its job key is `cert:{session}:{member}:{kind}` and goes through `enqueue_job`, so a
--     re-run MOVES each pending job rather than duplicating it — 0108's own comment says
--     «a re-run moves each rather than duplicating it»;
--   · `issue_certificate()` is idempotent over a live row (REQ-CRT-003), raises
--     `revoked_for_cause` rather than overruling an admin's deliberate revocation (0127), and
--     re-derives eligibility AT CALL TIME from active `check_ins` and accepted
--     `session_presenters` through `session_attendance_complete()` (REQ-SES-017).
--
-- So a late switch attests exactly the attendance the database holds at the moment of the
-- switch. That is the same guarantee the completion fan-out gives, from the same function.
--
-- ★ TWO CHANGES, AND NOTHING ELSE. The signature is 0154's, unchanged, so `create or replace`
-- keeps the grants and no second overload can appear. The grants are restated anyway, so this
-- file reads whole (the 0002 trap, and 0154's own habit).
--
--   1. The 'completed' / 'archived' refusal GOES. 'cancelled' STAYS: a cancelled session has no
--      attendance to attest, and SCR-045's «أُلغيت الجلسة، فلا تصدر لها شهادات.» is right.
--   2. When the session is ALREADY closed-but-completed and the new mode is not 'off', the
--      function fans out in the SAME transaction and returns 'fanned_out', so the screen can say
--      the certificates are being prepared rather than appearing to have done nothing. The
--      worker creates the rows; a third return value is what keeps the UI honest about that.
--
-- ★ WHAT IS DELIBERATELY NOT DONE.
--   · Nothing changes `certificate_mode`'s DEFAULT. Moving it off 'off' would switch
--     certificates on for every session in the product and is the owner's call, not a hotfix's
--     (DEC-245 §4). This file makes the default RECOVERABLE, which is the actual defect.
--   · Turning the mode back to 'off' after a fan-out is still allowed and still deletes
--     nothing: it only stops future issuance, because `issue_certificate()` raises
--     `certificates_off`. What has reached a member is governed by `release_certificates()` and
--     `revoke_certificate()`, which is where it belongs. Refusing 'off' once certificates exist
--     is a separate question, left open in DEC-245 §4.
--   · No trigger is added and no job is invented. The one new behaviour is one `perform` of a
--     function that has existed since 0065.
--
-- ★ ADDITIVE, because `main` runs on it first. `main`'s app calls this RPC with the same two
-- named arguments and reads `data === 'unchanged' ? 'unchanged' : 'ok'` (`lib/dal/sessions.ts`),
-- so 'fanned_out' reads as 'ok' on the old code — the toast is less specific and nothing else
-- differs. `main`'s SCR-045 renders no control for a completed session, so on the new schema
-- with the old code the new path is simply unreachable. The reverse never runs: migrations are
-- pushed before the merge, always.
--
-- 03 §8.2 rows this adds, and the one it replaces:
--   | `RPC-set_session_certificate_mode.after_completion` | A COMPLETED or ARCHIVED session accepts a mode change: the mode is written, one `session.certificate_mode_changed` audit row carries the old and the new, and a mode other than 'off' fans out in the same transaction — one `issue_certificates` job per eligible recipient per kind, under 11 §2.5's key. |
--   | `RPC-set_session_certificate_mode.after_completion_off` | Switching a completed session back to 'off' is accepted, writes its audit row, and enqueues NOTHING; certificates already issued are untouched. |
--   | `RPC-set_session_certificate_mode.refusals` | ★ REPLACES 0154's row: a CANCELLED session is refused `session_cancelled` (23514) with no write and no audit. A completed one is no longer refused. |
--   | `RPC-set_session_certificate_mode.late_switch_is_idempotent` | Setting the same non-'off' mode twice on a completed session returns `unchanged` the second time and enqueues no second job; a re-run after the first fan-out moves each pending job rather than duplicating it. |

create or replace function public.set_session_certificate_mode(p_session uuid, p_mode public.certificate_mode)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_fresh_admin();
  s     public.sessions;
  v_n   int;
begin
  if p_mode is null then
    raise exception 'mode_required' using errcode = '22004';
  end if;
  select * into s from public.sessions where id = p_session and org_id = actor.org_id for update;
  if s.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  -- ★ DEC-245: 'completed' and 'archived' are no longer refused. A cancelled session still is —
  -- it has no attendance to attest, and no fan-out will ever run for it.
  if s.state = 'cancelled' then
    raise exception 'session_cancelled' using errcode = '23514';
  end if;
  if s.certificate_mode = p_mode then
    return 'unchanged';
  end if;

  update public.sessions set certificate_mode = p_mode where id = s.id;
  perform public.write_audit(actor.org_id, 'session.certificate_mode_changed', 'session', s.id,
                             jsonb_build_object('certificate_mode', s.certificate_mode),
                             jsonb_build_object('certificate_mode', p_mode),
                             null, 'admin', actor.id);

  -- ★ THE LATE SWITCH (REQ-CRT-017). The completion fan-out has already run (or has run and
  -- returned 0 against 'off'), so switching on now has to do the work the edge into 'completed'
  -- would have done. Only for a session that IS completed or archived: before completion the
  -- trigger will do it, and fanning out early would issue against an attendance list that is
  -- still being written.
  --
  -- `fan_out_certificates()` is `grant execute … to service_role` and revoked from
  -- `authenticated` (0065:67-68) — reached here because this function is SECURITY DEFINER and
  -- EXECUTE is checked against the owner, which is exactly why `sessions_certificate_hook()` is
  -- definer too (0065:70-73).
  if p_mode <> 'off' and s.state in ('completed', 'archived') then
    v_n := public.fan_out_certificates(s.id);
    -- Returned whatever the count, including 0: «switched on, and nobody qualifies» is a real
    -- and useful answer, and the screen's «من يستحق» already shows why.
    return 'fanned_out';
  end if;

  return 'ok';
end $$;
revoke execute on function public.set_session_certificate_mode(uuid, public.certificate_mode) from public, anon;
grant  execute on function public.set_session_certificate_mode(uuid, public.certificate_mode) to authenticated;
comment on function public.set_session_certificate_mode(uuid, public.certificate_mode) is
  'REQ-CRT-002, REQ-CRT-017. SCR-045 is the mode''s one writer. Admin only, audited. A cancelled session is refused; a COMPLETED or ARCHIVED one is accepted and fans out in the same transaction (DEC-245, amending DEC-178 ruling 2), returning ''fanned_out''.';
