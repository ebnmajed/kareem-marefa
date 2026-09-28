-- 0160 · wave 15 (DEC-183 §3 and §4.11, DEC-186 §8) — a company's team colour.
--
-- «Companies are houses» (docs/design/00-direction.md): a company's colour
-- rings every member's avatar and colours its race bar and its poster's
-- placeholder. It is COMPANY DATA, not the brand kit's and not a status — and
-- it rings an avatar, it never fills one (REQ-PRF-009, REQ-UIX-043).
--
--   companies.team_color   `#rrggbb`, lower case, or null for a company that
--                          has none. One stored form, so a value read back is
--                          the value written, and what reaches an element as
--                          `--team` has a shape the primitive can re-check.
--
-- ★ THIS MIGRATION WRITES NO COLOUR ONTO ANY COMPANY (DEC-183 §4.11). The
-- design proposes a colour for each of the first org's seven companies, keyed
-- by the company's NAME. That is data, and a migration is schema: it runs in
-- every environment for ever, and a name is not a key. The colours are set on
-- SCR-048 by an org admin, or by the owner in one scoped statement after
-- reading the rows.
--
-- No new policy and no new grant. The column is read through `p1_org_read` and
-- written through `p2_admin_update`, as `name` and `deactivated_at` are
-- (0004:201-210), and the table-level grant there covers a new column.
--
-- ★ The audit is not here. A company's edits have never been audited — neither
-- has a category's or a venue's (DEC-186 §8). The team colour's audit is a
-- definer trigger `console` proposes and the lead promotes after this file.
--
-- Additive for `main`, which runs this schema before it runs the code: `main`'s
-- app names its columns — `select id, name, deactivated_at`, `insert {org_id,
-- name}`, `update {deactivated_at}` (lib/dal/admin-lists.ts) — and `main`'s
-- worker never reads `companies`. In the gap, nothing moves.
--
-- Refs: REQ-UIX-043, REQ-ADM-008, REQ-PRF-009, REQ-NFR-020

alter table public.companies
  add column team_color text
  constraint companies_team_color_is_hex check (team_color ~ '^#[0-9a-f]{6}$');

comment on column public.companies.team_color is
  'A #rrggbb team colour, or null. It rings a member''s avatar and never fills it (REQ-UIX-043, REQ-PRF-009). Set on SCR-048; no migration writes one (DEC-183 §4.11).';
