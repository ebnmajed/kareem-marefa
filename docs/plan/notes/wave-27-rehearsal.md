# Wave 27 — `0200` – `0207` rehearsed on the production schema (2026-10-05)

**Rehearsed by the lead, in the local Docker container, on the owner's dump `/tmp/prod-schema-0199.sql`** (taken
2026-10-05 16:12, schema only, 952 KB, **0 data rows** — no `COPY`, no `INSERT`). Production was never touched. The dump
carries `0198`/`0199` (89 mentions of the story tables) and **nothing of this wave** (no `sessions_title_guard`,
`company_domains`, `seed_org_templates`; the rotation is `not null`; the certificate default is `'off'`).

## How

A throwaway database `rehearse27`; the eight extensions into `extensions` and `vault` as local has them; the local
`auth` / `storage` / `realtime` schemas before the dump and their policies again after it. **The dump loaded with ONE
error — the platform's `supabase_realtime` publication, as every wave.** A schema-only dump has no orgs, so **two were
inserted before the migrations**, standing in for production's two, to give the backfill something to do.

**The eight, each in one transaction with `ON_ERROR_STOP`, as `postgres`, in production's order — every one exit 0, no
error, no warning:** `0200`, `0201`, `0202` (from A's tree) · `0203`, `0204` (B's) · `0205`, `0206`, `0207` (C's).
The backfill's notices: `seed_org_templates rehearse-one -> 11` · `rehearse-two -> 11` — production's two lines.

## The end state, checked

| # | Check | Result |
|---|---|---|
| 1 | `sessions.certificate_mode` default | `'review'` |
| 2 | `org_settings.check_in_rotation_seconds` | nullable; the 60 – 3600 check unchanged |
| 3 | Triggers on `sessions` for the title | `sessions_title_guard`, `sessions_title_audit` |
| 4 | `company_domains` | RLS on; one policy, `company_domains_read_admin` (select) |
| 5 | Its grants | `authenticated: SELECT` only — nothing for `anon` or `service_role`, no write for anyone |
| 6 | `members.company_assigned_by` | present, `company_source` |
| 7 | ★ The member's own update grant still holds `company_id` | **yes** — the revoke is PR D's, after B's code is live |
| 8 | Function ACLs | `anon` executes none of the ten checked; `authenticated` executes `add_member`, `provision_member`, `save_company`, `set_member_company` and **not** `_issue_check_in_code`, `company_for_domain`, `company_for_sign_in`, `email_domain`, `org_missing_templates`, `seed_org_templates` |
| 9 | The backfill | 11 templates for each of the two orgs |
| 10 | ★ A NEW org, inserted after the migrations | 11 templates and 11 published versions, by the trigger alone |
| 11 | ★ Retiring every attendance template of an org | refused — `23514 last_live_template` |
| 12 | Platform rows | untouched by this batch (the removal is PR D's) |
| 13 | policies · triggers | **188 · 139 — identical to local** |
| 14 | public functions | 380 rehearsed, 379 local — the one difference is `rls_auto_enable()`, production-only, as every wave |

## What this rehearsal does not show

A schema-only dump holds no rows, so it cannot show production's own two orgs being seeded or its 24 platform
template versions being left in place — only that the same statements run on production's schema. The owner's push
prints the two `-> 11` notices for the real orgs; that line is the confirmation.

---

# PR D — `0208` – `0210` rehearsed on production's schema AND DATA (2026-10-05)

**Why with data:** what `0209` deletes or retires depends on what production's rows reference, which a schema-only dump
cannot show. The owner's two dumps (`/tmp/prod-schema-0207.sql`, 1.06 MB; `/tmp/prod-data-0207.sql`, 4.2 MB, taken
18:32 – 18:35) were loaded into a throwaway `rehearse27d` in the local container, and **both files and the database were
deleted when this note was written** — the data file held real members' personal data.

The schema loaded with the one usual error (the `supabase_realtime` publication); the data with two, both in
`storage` (`objects.archived_at`, `buckets.versioning_status` — columns the local storage schema does not have yet),
neither touching `public`.

## Production, as the migrations met it

3 orgs · 21 members, 17 with a company · 33 org templates, all live (3 × 11) · 12 platform templates (11 live, 1 already
retired) · **45 certificates, every one pinned to a platform version** · 72 design documents, **68 on a platform
version** · 3 session certificate designs, 1 naming a platform template. ★ This is far from the morning's «0
certificates, 0 documents»: a third org and its sessions arrived during the day.

## The three, each in one transaction with `ON_ERROR_STOP`, as `postgres` — every one exit 0

`0209`'s own report, row by row:

| Platform template | Outcome | Why |
|---|---|---|
| poster · إعلان, لقاء, حوار, ورشة | **deleted** | nothing references them |
| poster · جلسة (the already-retired one) | **deleted** | its last references are gone |
| poster · جلسة (the live one) | **retired** | design documents reference its version |
| certificate · حضور أفقية, تقديم أفقية, إنجاز أفقية | **retired** | certificates reference their versions |
| certificate · حضور عمودية, تقديم عمودية, إنجاز عمودية | **deleted** | nothing references them |

**8 deleted, 4 retired.** One unlocked session design was repointed from the platform's attendance template to its
org's own.

## The end state, checked

| # | Check | Result |
|---|---|---|
| 1 | Certificates | **45 before, 45 after** — all still pinned to their original version, every such version's template now retired |
| 2 | Design documents on a platform version | 68 before, 68 after — untouched |
| 3 | Session designs naming a platform template | 1 → **0** |
| 4 | Platform templates | **0 live**, 4 retired |
| 5 | Org templates | 33, untouched |
| 6 | Orgs that cannot resolve a default | **0** — the migration's own first check passed |
| 7 | The member's own update grant on `company_id` | **gone** |
| 8 | The six dropped functions | none remain |
