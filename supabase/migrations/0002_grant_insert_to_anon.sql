-- 0001 gave `anon` an RLS policy to insert, but not the table-level INSERT
-- privilege — and a Supabase project no longer grants table privileges to
-- `anon` by default, so every registration failed with 42501 (permission
-- denied for table registrations). The policy only narrows what a role may
-- insert; it cannot substitute for the grant.
--
-- Insert only. Select/update/delete stay revoked (0001), so a leaked
-- publishable key can add rows and never read them.
grant insert on table public.registrations to anon;
