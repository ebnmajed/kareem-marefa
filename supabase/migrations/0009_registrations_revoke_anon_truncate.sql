-- 0009 — revoke anon's TRUNCATE on the frozen registrations table. DEC-037.
--
-- The hosted project's old default privileges granted anon ALL on tables
-- created by postgres; 0001 revoked select/update/delete and 0002 granted
-- insert back, but TRUNCATE (and REFERENCES, TRIGGER) stayed. PostgREST
-- never issues TRUNCATE, so this was not reachable through the publishable
-- key — it is hygiene, approved by the owner as the one privilege change
-- DEC-002 allows on the frozen table. Nothing about the table, its rows or
-- its insert policy changes. Idempotent: safe to run again by hand.
revoke truncate on table public.registrations from anon;
