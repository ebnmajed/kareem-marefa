-- designer (wave 24, M26) — supersede one baseline template row: delete it where the database
-- permits, retire it where `on delete restrict` refuses, and SAY WHICH.
-- Promoted with 0005 as a single migration; this file comes FIRST in it, because 0005 calls it.
--
-- Serves:  REQ-DSG-034 (the superseded baseline leaves the library),
--          REQ-CRT-014 (a certificate issued against a version still renders as that version),
--          REQ-DSG-008 (the platform library an org duplicates from)
-- Cites:   DEC-242 §3 (the owner chose a hard delete; the schema refuses part of it, deliberately),
--          DEC-043 (no write-then-raise), 0055, 0057, 0063, 0065, 0066, 0096, 0099, 0127
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `RPC-supersede_baseline_template.deleted` | A platform template nothing references is DELETED, its versions cascading with it, and the function returns `('deleted', null)`. |
--   | `RPC-supersede_baseline_template.retired_by_certificate` | A platform template one of whose versions a CERTIFICATE references is RETIRED, not deleted: the row survives with `retired_at` set and `is_default` cleared, the certificate's `template_version_id` is unchanged, and the function returns `('retired', <the FK's own message>)`. |
--   | `RPC-supersede_baseline_template.retired_by_document` | The same for a version a `design_documents` row references — the automatic poster path. |
--   | `RPC-supersede_baseline_template.retired_by_design` | The same for a template a `session_certificate_designs` row names directly. |
--   | `RPC-supersede_baseline_template.not_callable` | No role may execute it: `public`, `anon`, `authenticated` and `service_role` are all revoked, so it is owner-only and invisible to PostgREST (`definer-exposure`). |
--
-- ★★ WHY THIS CANNOT JUST BE A DELETE, which is the whole point of the file.
-- The owner asked for a hard delete. The schema grants part of it and refuses the rest, and the
-- refusal is correct:
--
--   · `design_template_versions.template_id` → ON DELETE CASCADE (0055:111) — deleting a template
--     takes its versions, which is what makes the two restricts below bite on the PARENT.
--   · `certificates.template_version_id`     → ON DELETE RESTRICT, NOT NULL (0055:288).
--   · `design_documents.template_version_id` → ON DELETE RESTRICT (0055:135).
--   · `session_certificate_designs.template_id` → ON DELETE RESTRICT (0099:63) — a fourth path, on
--     the TEMPLATE rather than a version: an admin who picked this template on SCR-045.
--
-- ★ And a certificate points at the PLATFORM row DIRECTLY. `issue_certificate()` (0127:263-271)
-- resolves «the org's default for this kind, ELSE the platform's» — `t.org_id is null` is in the
-- predicate — and `issue_achievement_certificate()` (0066:84) does the same for `family =
-- 'achievement'`. So wherever an org never authored its own certificate template, every certificate
-- it issued references a platform baseline version, and the delete IS REFUSED BY THE DATABASE.
-- That refusal is REQ-CRT-014 made structural. It is correct and nothing here works around it.
--
-- ★ The poster path is the same shape through a different table: `poster_render_context()`
-- (0063:113-121) resolves the `talk` family — and ONLY `talk` — and `regenerate_poster` then writes
-- a `design_documents` row carrying that version. The owner's production read at wave 24's sync 1
-- bears it out exactly: of the eleven platform rows, `certs = 0` on all eleven and `docs = 0` on
-- all but `poster/talk`, which has 2. So production expects TEN DELETED and `talk` RETIRED.
-- ★ The function is defensive anyway, because a certificate can be issued between that read and the
-- push, and local, CI and every future environment differ. It decides at runtime; it never assumes.
--
-- ★ WHAT IS NOT DONE, however the instruction reads (DEC-242 §3, the lead's brief §3): no `cascade`;
-- no detaching a certificate from its version; no nulling `template_version_id`; no touching
-- `recipient_name_snapshot` or a pinned `font_hashes`; and NO `design_document` is deleted to clear
-- the way. A platform row cannot have a draft document in any case — `createTemplateDraft()` refuses
-- a template whose scope is not `org` (`src/lib/dal/templates.ts`), and `draft_for_template_id` is
-- the only cascading child.
--
-- ★ `is_default` IS CLEARED WITH `retired_at`, matching what the console's own retire does
-- (`src/lib/dal/templates.ts`: `{ retired_at, is_default: false }`) and what 0057's trigger has
-- already done by the time this runs — 0005 inserts the new default first, and
-- `design_templates_single_default` clears the previous one in the same statement. Setting it here
-- too makes the function correct when called alone, which is how its test calls it.
--
-- ★ A SUBTRANSACTION, NOT A PRE-FLIGHT COUNT. `restrict` raises 23503 immediately, so the
-- `exception` block is the only way to learn the answer without racing a concurrent issuance
-- between the count and the delete. The rollback undoes the failed DELETE and nothing else, and
-- DEC-043 is not in play: this function catches, it never writes then raises.
--
-- ★ RETIRING WRITES NO AUDIT ROW, and that is 0191 working as designed: both
-- `design_template_audit()` and `design_template_version_audit()` return early when `org_id is
-- null`, because a platform template's changes are the platform's and not an org's log. Nor does
-- either trigger fire on DELETE.
--
-- Forward-only and idempotent: a row already retired is returned as `already_retired` without a
-- second write, so a re-run of the migration reports nothing new.

create or replace function public.supersede_baseline_template(p_template uuid)
returns table (outcome text, refused_by text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_row public.design_templates;
begin
  select * into v_row from public.design_templates t where t.id = p_template;
  if v_row.id is null then
    return query select 'absent'::text, null::text;
    return;
  end if;
  -- Platform scope only. An org's own template is its own property (REQ-DSG-008) and is never
  -- superseded by a platform seed, however much its document resembles the baseline's.
  if v_row.scope <> 'platform' then
    raise exception 'not_a_platform_template' using errcode = '42501';
  end if;
  if v_row.retired_at is not null then
    return query select 'already_retired'::text, null::text;
    return;
  end if;

  begin
    delete from public.design_templates where id = p_template;
    return query select 'deleted'::text, null::text;
  exception when foreign_key_violation then
    -- REQ-CRT-014, structurally. Something a member is holding renders from a version of this
    -- template, so the row stays — invisible to the library, to SCR-045's picker and to issuance,
    -- every one of which filters `retired_at is null`.
    update public.design_templates
       set retired_at = now(), is_default = false
     where id = p_template;
    return query select 'retired'::text, sqlerrm;
  end;
end $fn$;

-- Owner-only. No role executes it: it is called by the migration that promotes it, as the owner,
-- and by its own test. A function with no grant is invisible through PostgREST
-- (`tests/rls/definer-exposure.test.ts`).
revoke execute on function public.supersede_baseline_template(uuid) from public, anon, authenticated, service_role;

comment on function public.supersede_baseline_template(uuid) is
  'DEC-242 §3 — supersede one PLATFORM design template: delete it where the database permits, retire it where on-delete-restrict refuses (REQ-CRT-014), and report which. Owner-only.';
