import "server-only";
import { z } from "zod";
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
  /** How many sessions carry this category — context for the decision to
   *  deactivate, not a guard (deactivation is always available; `category_id`
   *  is `not null` on both `proposals` and `sessions`, so a category already
   *  in use can never be deleted regardless — the same structural fact
   *  `listVenuesForAdmin`'s own count documents). */
  sessionCount: number;
}

export interface AdminCompany {
  id: string;
  name: string;
  deactivatedAt: string | null;
  /** How many members currently carry this company. */
  memberCount: number;
}

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

export async function listCategoriesForAdmin(locale: string): Promise<AdminCategory[] | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { supabase } = client;

  const { data, error } = await supabase.from("categories").select("id, name, deactivated_at").order("deactivated_at", { nullsFirst: true }).order("name");
  if (error) throw new Error(`categories: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: sessionRows, error: sErr } = await supabase.from("sessions").select("category_id");
  if (sErr) throw new Error(`sessions: ${sErr.message}`);
  const counts = new Map<string, number>();
  for (const s of sessionRows ?? []) counts.set(s.category_id as string, (counts.get(s.category_id as string) ?? 0) + 1);

  return rows.map((c) => ({ id: c.id, name: c.name, deactivatedAt: c.deactivated_at, sessionCount: counts.get(c.id) ?? 0 }));
}

export const categoryInput = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export type CategoryInput = z.infer<typeof categoryInput>;

/** Plain insert: `p2_admin_insert` on `categories` already says who may (0004). */
export async function createCategory(locale: string, input: CategoryInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("categories").insert({ org_id: session.orgId, name: input.name });
  if (error) throw new Error(`categories.insert: ${error.message}`);
}

/** Deactivate or restore — the only exit a category has (REQ-ADM-007). */
export async function setCategoryActive(locale: string, categoryId: string, active: boolean): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("categories")
    .update({ deactivated_at: active ? null : new Date().toISOString() })
    .eq("id", categoryId);
  if (error) throw new Error(`categories.update: ${error.message}`);
}

export async function listCompaniesForAdmin(locale: string): Promise<AdminCompany[] | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { supabase } = client;

  const { data, error } = await supabase.from("companies").select("id, name, deactivated_at").order("deactivated_at", { nullsFirst: true }).order("name");
  if (error) throw new Error(`companies: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: memberRows, error: mErr } = await supabase.from("members").select("company_id").not("company_id", "is", null);
  if (mErr) throw new Error(`members: ${mErr.message}`);
  const counts = new Map<string, number>();
  for (const m of memberRows ?? []) counts.set(m.company_id as string, (counts.get(m.company_id as string) ?? 0) + 1);

  return rows.map((c) => ({ id: c.id, name: c.name, deactivatedAt: c.deactivated_at, memberCount: counts.get(c.id) ?? 0 }));
}

export const companyInput = z.object({ name: z.string().trim().min(1).max(120) }).strict();
export type CompanyInput = z.infer<typeof companyInput>;

/** Plain insert: `p2_admin_insert` on `companies` already says who may (0004). */
export async function createCompany(locale: string, input: CompanyInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("companies").insert({ org_id: session.orgId, name: input.name });
  if (error) throw new Error(`companies.insert: ${error.message}`);
}

/** Deactivate or restore — the only exit a company has (REQ-ADM-008). */
export async function setCompanyActive(locale: string, companyId: string, active: boolean): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("companies")
    .update({ deactivated_at: active ? null : new Date().toISOString() })
    .eq("id", companyId);
  if (error) throw new Error(`companies.update: ${error.message}`);
}
