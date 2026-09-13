import "server-only";
import { sessionClient } from "@/lib/dal/session";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
}

/** The member's own org. RLS returns exactly one row or none. */
export async function getOrg(locale: string): Promise<OrgSummary> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("orgs").select("id, name, slug").eq("id", session.orgId).single();
  if (error || !data) throw new Error(`orgs: ${error?.message ?? "no row"}`);
  return { id: data.id, name: data.name, slug: data.slug };
}
