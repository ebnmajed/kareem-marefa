// SCR-049's query (`REQ-UIX-096`, wave 22): the search, the two chips and the page, read from the URL and written
// back to it — so a filtered list is a link, and the toolbar is a GET form that works without JS (`042`'s shape).
// Pure, no `server-only`: the page parses it, the table builds its links with it, and the DAL and the CSV filter with
// the same predicate, so the file the admin downloads is exactly the list the screen shows (`DEC-232` §2.8).

export const MEMBER_ROLE_FILTERS = ["admin", "moderator", "member", "deactivated"] as const;
export type MemberRoleFilter = (typeof MEMBER_ROLE_FILTERS)[number];

/** The company chip's value for members who name no company. */
export const NO_COMPANY = "none";

export const MEMBERS_PAGE_SIZE = 25;

export interface MemberQuery {
  q: string;
  /** A company id, `NO_COMPANY`, or null for all. */
  company: string | null;
  role: MemberRoleFilter | null;
  page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Every value that does not parse is dropped, never refused: a stale link shows the whole list. */
export function parseMemberQuery(sp: Record<string, string | string[] | undefined>): MemberQuery {
  const q = (one(sp.q) ?? "").trim().slice(0, 120);
  const company = one(sp.company);
  const role = one(sp.role);
  const page = Number(one(sp.page));
  return {
    q,
    company: company === NO_COMPANY || (company && UUID.test(company)) ? company : null,
    role: (MEMBER_ROLE_FILTERS as readonly string[]).includes(role ?? "") ? (role as MemberRoleFilter) : null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The query as URL parameters — empty values left out. */
export function memberQueryParams(query: MemberQuery, patch: Partial<{ q: string; company: string | null; role: MemberRoleFilter | null; page: number }> = {}): URLSearchParams {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.company) params.set("company", next.company);
  if (next.role) params.set("role", next.role);
  if (next.page > 1) params.set("page", String(next.page));
  return params;
}

export function membersHref(query: MemberQuery, patch: Parameters<typeof memberQueryParams>[1] = {}): string {
  const qs = memberQueryParams(query, patch).toString();
  return qs ? `/app/admin/members?${qs}` : "/app/admin/members";
}

const normalize = (s: string) => s.toLowerCase().trim();

/** The one predicate the screen and its CSV share. */
export function matchesMemberQuery(
  member: { displayName: string | null; email: string; companyId: string | null; role: "admin" | "moderator" | "member"; status: "active" | "deactivated" },
  query: Pick<MemberQuery, "q" | "company" | "role">,
): boolean {
  const needle = normalize(query.q);
  if (needle && !normalize(member.displayName ?? "").includes(needle) && !normalize(member.email).includes(needle)) return false;
  if (query.company === NO_COMPANY ? member.companyId !== null : query.company && member.companyId !== query.company) return false;
  if (query.role === "deactivated") return member.status === "deactivated";
  if (query.role && (member.role !== query.role || member.status !== "active")) return false;
  return true;
}
