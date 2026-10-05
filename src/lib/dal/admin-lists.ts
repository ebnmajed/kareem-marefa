import "server-only";
import { z } from "zod";
import { readAll } from "@/lib/dal/admin-paging";
import { sessionClient } from "@/lib/dal/session";

// SCR-047 (categories) and SCR-048 (companies) — REQ-ADM-007, REQ-ADM-008,
// D60 · D17 · D12 · A15. Same shape as `sessions.ts`'s `venues.ts` section
// (SCR-046, DEC-042's pattern this track inherited): a plain managed list,
// admin-only, "deactivate, not delete" as a PRIVILEGE, not a code path —
// `categories` and `companies` both carry `grant select, insert, update`
// and **no delete grant, no delete policy** (0004), so there is no delete
// button because there is no delete door, in use or not (REQ-ADM-006's
// sentence, restated for these two tables).

export interface AdminCategory {
  id: string;
  name: string;
  deactivatedAt: string | null;
  /** How many sessions carry this category — context for the decision to deactivate, not a guard: `category_id` is
   *  `not null` on both `proposals` and `sessions`, so a category in use can never be deleted regardless. */
  sessionCount: number;
  /** ★ wave 22 (`DEC-232` §4.4): a category a proposal alone carries is in use too. */
  proposalCount: number;
}

export interface AdminCompany {
  id: string;
  name: string;
  deactivatedAt: string | null;
  /** How many members currently carry this company. */
  memberCount: number;
  /** ★ wave 22: how many of them are active — not deactivated (`members.status`). */
  activeMemberCount: number;
  /** `#rrggbb`, or `null` — the ring, never the avatar's fill (REQ-UIX-043,
   *  REQ-PRF-009). Set on this screen; no migration ever writes one
   *  (DEC-183 §4.11). */
  teamColor: string | null;
  /** ★ wave 27 (`REQ-ADM-024`): the company's email domains, lowercase, sorted — read from `company_domains`, which
   *  only an admin may read (0203). LTR text: every rendering wraps each in `<bdi dir="ltr">`. */
  domains: string[];
}

/** What a write did — never success for a write that matched no row (`DEC-232` §3.1). */
export type ListWrite = { ok: boolean };

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

/** Counts a column's values over every row — paged, because an unranged read stops at `max_rows` (`admin-paging.ts`). */
function countBy<T>(rows: T[], key: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** A write's answer: exactly one row came back, or it did not write. */
function wrote(result: { data: unknown[] | null; error: unknown }): ListWrite {
  return { ok: !result.error && (result.data ?? []).length === 1 };
}

export async function listCategoriesForAdmin(locale: string): Promise<AdminCategory[] | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { supabase } = client;

  const rows = await readAll("categories", (from, to) => supabase.from("categories").select("id, name, deactivated_at").order("id").range(from, to));
  if (rows.length === 0) return [];

  const [sessionRows, proposalRows] = await Promise.all([
    readAll("sessions", (from, to) => supabase.from("sessions").select("id, category_id").order("id").range(from, to)),
    readAll("proposals", (from, to) => supabase.from("proposals").select("id, category_id").order("id").range(from, to)),
  ]);
  const sessions = countBy(sessionRows, (s) => s.category_id as string | null);
  const proposals = countBy(proposalRows, (p) => p.category_id as string | null);

  return rows
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      deactivatedAt: c.deactivated_at as string | null,
      sessionCount: sessions.get(c.id as string) ?? 0,
      proposalCount: proposals.get(c.id as string) ?? 0,
    }))
    .sort((a, b) => Number(a.deactivatedAt !== null) - Number(b.deactivatedAt !== null) || a.name.localeCompare(b.name, "ar"));
}

export const categoryInput = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export type CategoryInput = z.infer<typeof categoryInput>;

/** Plain insert: `p2_admin_insert` on `categories` already says who may (0004). Audited by the database's trigger. */
export async function createCategory(locale: string, input: CategoryInput): Promise<ListWrite> {
  const { session, supabase } = await sessionClient(locale);
  return wrote(await supabase.from("categories").insert({ org_id: session.orgId, name: input.name }).select("id"));
}

/** ★ wave 22: the rename (`REQ-UIX-094`). Audited by the database's trigger (`category.changed`). */
export async function updateCategory(locale: string, categoryId: string, input: CategoryInput): Promise<ListWrite> {
  if (!z.uuid().safeParse(categoryId).success) return { ok: false };
  const { supabase } = await sessionClient(locale);
  return wrote(await supabase.from("categories").update({ name: input.name }).eq("id", categoryId).select("id"));
}

/** Deactivate or restore — the only exit a category has (REQ-ADM-007). */
export async function setCategoryActive(locale: string, categoryId: string, active: boolean): Promise<ListWrite> {
  const { supabase } = await sessionClient(locale);
  return wrote(
    await supabase
      .from("categories")
      .update({ deactivated_at: active ? null : new Date().toISOString() })
      .eq("id", categoryId)
      .select("id"),
  );
}

export async function listCompaniesForAdmin(locale: string): Promise<AdminCompany[] | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { supabase } = client;

  const rows = await readAll("companies", (from, to) => supabase.from("companies").select("id, name, deactivated_at, team_color").order("id").range(from, to));
  if (rows.length === 0) return [];

  const memberRows = await readAll("members", (from, to) =>
    supabase.from("members").select("id, company_id, status").not("company_id", "is", null).order("id").range(from, to),
  );
  const members = countBy(memberRows, (m) => m.company_id as string | null);
  const active = countBy(memberRows, (m) => (m.status === "active" ? (m.company_id as string) : null));
  const domainRows = await readAll("company_domains", (from, to) => supabase.from("company_domains").select("id, company_id, domain").order("id").range(from, to));
  const domains = new Map<string, string[]>();
  for (const d of domainRows) domains.set(d.company_id as string, [...(domains.get(d.company_id as string) ?? []), d.domain as string]);

  return rows
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      deactivatedAt: c.deactivated_at as string | null,
      memberCount: members.get(c.id as string) ?? 0,
      activeMemberCount: active.get(c.id as string) ?? 0,
      teamColor: c.team_color as string | null,
      domains: (domains.get(c.id as string) ?? []).sort(),
    }))
    .sort((a, b) => Number(a.deactivatedAt !== null) - Number(b.deactivatedAt !== null) || a.name.localeCompare(b.name, "ar"));
}

export const companyInput = z.object({ name: z.string().trim().min(1).max(120) }).strict();
export type CompanyInput = z.infer<typeof companyInput>;

/** Plain insert: `p2_admin_insert` on `companies` already says who may (0004).
 *  ★ wave 16 (DEC-195 §3): the team colour travels with the insert, `null` for
 *  «بلا لون». The caller has turned a closed name into `#rrggbb`; the column's
 *  check (`0160`) is the boundary. ★ wave 22: audited by the database's trigger, `company.created` carrying the
 *  colour (`DEC-232` §2.2). */
export async function createCompany(locale: string, input: CompanyInput, teamColorHex: string | null = null): Promise<ListWrite> {
  const { session, supabase } = await sessionClient(locale);
  return wrote(await supabase.from("companies").insert({ org_id: session.orgId, name: input.name, team_color: teamColorHex }).select("id"));
}

/** ★ wave 22: the edit sheet's one save — name and colour in one update (`REQ-UIX-095`). The database writes
 *  `company.changed` for the name and `company.team_color_changed` (`0161`) for the colour, each only if it moved. */
export async function updateCompany(locale: string, companyId: string, input: CompanyInput, teamColorHex: string | null): Promise<ListWrite> {
  if (!z.uuid().safeParse(companyId).success) return { ok: false };
  const { supabase } = await sessionClient(locale);
  return wrote(await supabase.from("companies").update({ name: input.name, team_color: teamColorHex }).eq("id", companyId).select("id"));
}

/** Deactivate or restore — the only exit a company has (REQ-ADM-008). */
export async function setCompanyActive(locale: string, companyId: string, active: boolean): Promise<ListWrite> {
  const { supabase } = await sessionClient(locale);
  return wrote(
    await supabase
      .from("companies")
      .update({ deactivated_at: active ? null : new Date().toISOString() })
      .eq("id", companyId)
      .select("id"),
  );
}

// ★ wave 27 — a company carries its domains, and the save asks before it moves anyone (`REQ-ADM-024`, `REQ-PRF-012`,
// `DEC-254` §2.7, `DEC-255` §4). One definer function, `save_company()` (`supabase/proposed/console/`), writes the
// company, its domains and the members they place, in one transaction: a dry run first, then the confirm with the
// token the dry run returned. The audit rows are the function's and the companies table's triggers' — never this file's.

export const companyDomainsInput = z.array(z.string().max(253)).max(200);

export type CompanyDomainError = { domain: string | null; reason: "malformed" | "taken" | "too_many"; company?: string };

export type CompanySave =
  | { status: "invalid"; errors: CompanyDomainError[] }
  /** `moving` and `held` are counts and `companyName` is the DESTINATION's — no member's name is ever returned. */
  | { status: "preview" | "changed"; moving: number; held: number; token: string; companyName: string }
  | { status: "saved"; companyId: string; moved: number; held: number }
  | { status: "failed" };

export async function saveCompanyWithDomains(
  locale: string,
  input: { companyId: string | null; name: string; teamColorHex: string | null; domains: string[]; confirm: boolean; expected: string | null },
): Promise<CompanySave> {
  if (input.companyId !== null && !z.uuid().safeParse(input.companyId).success) return { status: "failed" };
  if (!companyDomainsInput.safeParse(input.domains).success) return { status: "invalid", errors: [{ domain: null, reason: "too_many" }] };
  const client = await requireAdmin(locale);
  if (!client) return { status: "failed" };
  const { data, error } = await client.supabase.rpc("save_company", {
    p_company: input.companyId,
    p_name: input.name,
    p_team_color: input.teamColorHex,
    p_domains: input.domains,
    p_confirm: input.confirm,
    p_expected: input.expected,
  });
  if (error || !data) return { status: "failed" };
  const r = data as { status: string; errors?: CompanyDomainError[]; moving?: number; held?: number; moved?: number; token?: string; company_name?: string; company_id?: string };
  switch (r.status) {
    case "invalid":
      return { status: "invalid", errors: r.errors ?? [] };
    case "preview":
    case "changed":
      return { status: r.status, moving: r.moving ?? 0, held: r.held ?? 0, token: r.token ?? "", companyName: r.company_name ?? "" };
    case "saved":
      return { status: "saved", companyId: r.company_id ?? "", moved: r.moved ?? 0, held: r.held ?? 0 };
    default:
      return { status: "failed" };
  }
}
