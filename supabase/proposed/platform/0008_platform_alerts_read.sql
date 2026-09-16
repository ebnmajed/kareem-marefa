-- platform (wave 8) — the console reads the alert states. Follows `0075`.
--
-- Serves:  REQ-ADM-003 («… job health, error rates — aggregate only»),
--          REQ-ADM-001, REQ-NFR-016
-- Cites:   11 §3.2, 09 §6 (SCR-084), DEC-014, DEC-147, DEC-148
--
-- ── Why a door and not a copy ─────────────────────────────────────────────
-- `evaluate_alerts()` (0075) holds `11` §3.2's eight thresholds in one place,
-- and it is the worker's: `service_role` only. SCR-084 needs the same eight
-- readings to show «error rates» (the bounce rate, consecutive render failures
-- and the rest), and the console's home page needs them to say what is wrong
-- right now. Writing «oldest pending > 5 minutes» a second time in TypeScript
-- would be a copy of a threshold, and a copy is the thing that drifts.
--
-- So this is the narrowest door: a platform admin, re-read from the table by
-- `assert_platform_admin()`, reads exactly the rows the worker reads.
--
-- ── What it returns, and must never be widened to return ──────────────────
-- `evaluate_alerts()`'s rows unchanged — `alert`, `fired`, `detail` — and every
-- `detail` key there is a count, an age, a rate or a threshold. No org id, no
-- member, no session, no content (REQ-ADM-003). The `aggregate` case pins the
-- key set, so a later change to `0075` that adds an identifier breaks a test
-- rather than a requirement.
--
-- No table, no policy, no grant beyond `execute`. The no-data-plane sweep
-- (DEC-014, invariant 8) is untouched: this reads nothing an org could call
-- its own.
--
-- ── 03 §8.2 rows this file needs ──────────────────────────────────────────
--   | `RPC-platform_alerts.platform_only` | An org admin, a moderator and a
--     member are refused `not_platform_admin`; `anon` is refused `42501` on
--     the grant. |
--   | `RPC-platform_alerts.aggregate` | A platform admin reads all eight alerts
--     of `11` §3.2, firing or not, and every `detail` key is a count, an age, a
--     rate or a threshold. |

create function public.platform_alerts()
returns table (alert text, fired boolean, detail jsonb)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query select e.alert, e.fired, e.detail from public.evaluate_alerts() e;
end $fn$;
revoke execute on function public.platform_alerts() from public, anon;
grant  execute on function public.platform_alerts() to authenticated;
