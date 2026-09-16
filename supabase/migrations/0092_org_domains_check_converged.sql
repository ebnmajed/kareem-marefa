-- supabase/migrations/0092_org_domains_check_converged.sql — the lead, wave 8 (DEC-147, row L3)
--
-- ★ One CHECK, one meaning, in every environment.
--
-- `0004` wrote `check (domain ~ '<pattern>')` on an `extensions.citext` column.
-- Which `~` that resolves to depends on what is on the search path when the
-- constraint is created: locally it became citext's case-INSENSITIVE match
-- (`CHECK (domain ~ '…'::citext)`), and on production — read from its schema
-- dump in wave 7's rehearsal — text's case-SENSITIVE one
-- (`CHECK ((domain)::text ~ '…'::text)`). Same migration, two constraints.
--
-- ★ What that drift did NOT do, measured before it was written down (DEC-147):
-- no member was ever refused. `org_domains_normalise` (0004) is a BEFORE INSERT
-- OR UPDATE trigger, and a BEFORE trigger rewrites the row before a CHECK runs,
-- so every domain reaches either check already lowercase; provisioning compares
-- `lower()` on both sides (0005, 0007) and never writes this table. The drift
-- was harmless only because of the trigger — which is exactly the kind of
-- guarantee that should not depend on how a migration happened to land.
--
-- So the check is re-stated with an explicit cast: `domain::text ~ '…'` is
-- text's operator whatever the search path, and case-sensitive everywhere —
-- the production meaning, and the one the trigger's lowercasing promises. Every
-- stored row is lowercase already (the trigger has run on every write since
-- 0004), so validating the new constraint cannot fail on existing data; a
-- rehearsal against production's schema confirms it before promotion.
--
-- Serves: REQ-TEN-002 (the allowed-domain list), invariant 3.
-- 03 §8.2 rows this proves (tests/rls/org-domains-check.test.ts):
--   CHK-org_domains.domain_lowercase_everywhere — the check is text's,
--     case-sensitive, identical in every environment; a mixed-case domain
--     written through the table is stored lowercase and accepted; one that
--     bypasses the normalise trigger is refused.

alter table public.org_domains drop constraint org_domains_domain_check;

alter table public.org_domains
  add constraint org_domains_domain_check
  check ((domain)::text ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');
