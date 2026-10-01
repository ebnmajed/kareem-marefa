// The directory's state — SCR-019, REQ-UIX-068, DEC-213 §5.110.
//
// ★ THE URL IS THE STATE, as on browse (`browse/timeline-query.ts`): every control on the directory is a link to the
// next state of it or a GET form, so the list works before JavaScript has loaded, a cold URL renders the same list,
// and the back button undoes one step. Pure — read by the server page and by `auto-more.tsx`.
//
// ★ AN INVALID VALUE IS DROPPED, NEVER ECHOED: a hand-edited `?company=abc` is ignored rather than failing the page.
import { z } from "zod";
import type { DirectoryOrder, DirectoryQuery } from "@/lib/dal/members";

export interface DirectoryState extends DirectoryQuery {
  q: string;
}

const uuid = z.uuid();
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseDirectoryQuery(params: Record<string, string | string[] | undefined>): DirectoryState {
  const q = (one(params.q) ?? "").trim().slice(0, 80);
  const company = one(params.company);
  const interest = one(params.interest);
  const order: DirectoryOrder = one(params.order) === "name" ? "name" : "active";
  const page = Number.parseInt(one(params.page) ?? "1", 10);
  return {
    q,
    companyId: company && uuid.safeParse(company).success ? company : undefined,
    interestId: interest && uuid.safeParse(interest).success ? interest : undefined,
    order,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    includeDeactivated: one(params.inactive) === "1",
  };
}

/** The address of a state — locale-less, as every house `href` is. Defaults are left out, so the bare route is the
 *  default list. */
export function directoryHref(state: DirectoryState, change: Partial<DirectoryState> = {}): string {
  const next = { ...state, ...change };
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.companyId) search.set("company", next.companyId);
  if (next.interestId) search.set("interest", next.interestId);
  if (next.order === "name") search.set("order", "name");
  if (next.includeDeactivated) search.set("inactive", "1");
  if (next.page > 1) search.set("page", String(next.page));
  const qs = search.toString();
  return qs ? `/app/members?${qs}` : "/app/members";
}
