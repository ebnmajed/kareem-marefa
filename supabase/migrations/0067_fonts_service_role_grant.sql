-- 0067 — `public.fonts`: the `service_role` read grant (DEC-051, REQ-DSG-016, 03 §5.9)
--
-- 0055 revoked every privilege on `fonts` from `service_role` and the worker
-- reads the manifest as the migration owner over its session-mode
-- connection, so nothing broke. DEC-050 recorded the gap rather than
-- closing it: a job that reads `fonts` through the service-role client —
-- wave 4's retention and storage-prefix jobs walk every bucket, `fonts`
-- included — would fail `42501` with a working policy in front of it,
-- which is exactly the failure 0002 exists to remember (invariant 6).
--
-- READ only. `parity_status` is still written by `record_font()` alone
-- (0064, `security definer`, `service_role` execute) — a job that could
-- `update fonts` directly would bypass the Arabic-coverage check (A39).
-- `service_role` holds `bypassrls`, so no policy is involved; the grant is
-- the whole change.

grant select on public.fonts to service_role;
