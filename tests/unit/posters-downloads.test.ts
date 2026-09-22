// Contract 1 — `getSessionPosterDownloads()` (REQ-DSG-027, DEC-176, DEC-177).
//
// ★ THE PRESENTER WHO IS NOT STAFF. The first cut asked `session_presenters`
// for an `id` column it does not have; PostgREST errored, the code read only
// `data`, and every such presenter got `null` — «render nothing» — while staff,
// the only case tested, were fine. `sessions`' hub spec found it on the lead's
// build. This fake answers the way PostgREST does: a column the table does not
// have is an ERROR, not an empty row.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const COLUMNS: Record<string, string[]> = {
  session_presenters: ["org_id", "session_id", "member_id", "accepted", "declined_at", "created_at"],
};

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let role: "admin" | "moderator" | "member" = "member";

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let columns = "*";
  const result = () => {
    const known = COLUMNS[table];
    const asked = columns === "*" ? [] : columns.split(",").map((c) => c.trim());
    const unknown = known ? asked.filter((c) => !known.includes(c)) : [];
    if (unknown.length) return { data: null, error: { code: "42703", message: `column ${table}.${unknown[0]} does not exist` } };
    return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const b = {
    select(c: string) {
      columns = c;
      return b;
    },
    eq(k: string, v: unknown) {
      filters.push((r) => r[k] === v);
      return b;
    },
    is(k: string, v: unknown) {
      filters.push((r) => (r[k] ?? null) === v);
      return b;
    },
    order() {
      return b;
    },
    maybeSingle() {
      const r = result();
      return Promise.resolve(r.error ? r : { data: r.data?.[0] ?? null, error: null });
    },
    then(resolve: (v: unknown) => void) {
      resolve(result());
    },
  };
  return b;
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { role, memberId: "m1", orgId: "o1" }, supabase: { from: (t: string) => builder(t) } }),
}));

const { getSessionPosterDownloads } = await import("@/lib/dal/posters");

const artifact = (id: string, preset: string, format: string, status = "ready") => ({
  id,
  document_id: "d1",
  preset,
  format,
  status,
  storage_path: status === "ready" ? `o1/exports/d1/${preset}.${format}` : null,
  source_fingerprint: "fp",
  width_px: 1080,
  height_px: 1350,
  byte_size: 1000,
  rendered_at: status === "ready" ? "2026-09-22T10:00:00Z" : null,
});

beforeEach(() => {
  role = "member";
  tables = {
    session_presenters: [],
    session_posters: [{ session_id: "s1", document_id: "d1" }],
    export_artifacts: [artifact("a1", "master", "png"), artifact("a2", "square", "png"), artifact("a3", "a4", "pdf", "queued")],
  };
});

describe("who gets the menu", () => {
  it("★ an ACCEPTED presenter who is not staff gets the downloads", async () => {
    tables.session_presenters = [{ session_id: "s1", member_id: "m1", accepted: true, declined_at: null }];
    const d = await getSessionPosterDownloads("ar", "s1");
    expect(d?.primary).toMatchObject({ preset: "master", format: "png", state: "ready", href: "/api/designer/downloads/a1" });
  });

  it("a presenter not yet accepted, or one who declined, gets nothing — the route would refuse them (0152)", async () => {
    tables.session_presenters = [{ session_id: "s1", member_id: "m1", accepted: false, declined_at: null }];
    expect(await getSessionPosterDownloads("ar", "s1")).toBeNull();
    tables.session_presenters = [{ session_id: "s1", member_id: "m1", accepted: true, declined_at: "2026-09-20T00:00:00Z" }];
    expect(await getSessionPosterDownloads("ar", "s1")).toBeNull();
  });

  it("a plain member who presents nothing gets nothing", async () => {
    expect(await getSessionPosterDownloads("ar", "s1")).toBeNull();
  });

  it("staff get it without the presenter check", async () => {
    role = "moderator";
    expect((await getSessionPosterDownloads("ar", "s1"))?.ready).toBe(2);
  });
});

describe("the shape", () => {
  it("pending is pending, never a link; the rest follow preset order", async () => {
    role = "admin";
    const d = await getSessionPosterDownloads("ar", "s1");
    expect(d?.others.map((o) => [o.preset, o.format, o.state, o.href])).toEqual([
      ["square", "png", "ready", "/api/designer/downloads/a2"],
      ["a4", "pdf", "pending", null],
    ]);
    expect(d?.total).toBe(3);
  });
});
