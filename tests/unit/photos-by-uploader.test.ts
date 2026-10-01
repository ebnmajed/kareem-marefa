// Contract 3 (DEC-213 §5.119, DEC-214 §2): `listPhotosByUploader()` — a member's visible photographs, newest
// first, with a count, for the profile's «صور رفعتها».
//
// WHICH photographs the caller may see at all is `photos_read`'s (RLS, 03 §6) and is not provable with a stub.
// What IS this function's: it asks by uploader and by nothing else, it leaves a hidden or removed photograph out
// for every caller (staff included — a profile shows what a colleague sees), the count is the count and not the
// page's length, the order is newest first with `id` as the tiebreak, a failed signature drops a tile and never
// the count, and a malformed id never reaches the database.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: { rows: Row[]; queried: number; unsigned: Set<string>; role: string } = { rows: [], queried: 0, unsigned: new Set(), role: "member" };

function stub() {
  return {
    from(table: string) {
      expect(table).toBe("photos");
      state.queried += 1;
      let rows = [...state.rows];
      let head = false;
      const orders: { column: string; ascending: boolean }[] = [];
      let limit = Infinity;
      const query = {
        select: (_columns: string, opts?: { count?: string; head?: boolean }) => ((head = !!opts?.head), query),
        eq: (column: string, expected: unknown) => ((rows = rows.filter((r) => r[column] === expected)), query),
        is: (column: string, expected: unknown) => ((rows = rows.filter((r) => (r[column] ?? null) === expected)), query),
        order: (column: string, opts: { ascending: boolean }) => (orders.push({ column, ascending: opts.ascending }), query),
        limit: (n: number) => ((limit = n), query),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          const sorted = [...rows].sort((a, b) => {
            for (const { column, ascending } of orders) {
              const x = String(a[column]);
              const y = String(b[column]);
              if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          const result = head ? { data: null, count: rows.length, error: null } : { data: sorted.slice(0, limit), count: null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => {
          expect(bucket).toBe("photos");
          return {
            data: paths.map((path) => ({ path, signedUrl: state.unsigned.has(path) ? "" : `https://storage.test/${path}?token=t` })),
            error: null,
          };
        },
      }),
    },
  };
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: "viewer", orgId: "org", role: state.role }, supabase: stub() }),
}));

const { listPhotosByUploader } = await import("@/lib/dal/photos");

const ME = "00000000-0000-4000-8000-000000000a01";
const OTHER = "00000000-0000-4000-8000-000000000a02";
const S1 = "00000000-0000-4000-8000-000000000b01";

const photo = (n: number, over: Row = {}): Row => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  uploader_id: ME,
  session_id: S1,
  storage_path: `org/sessions/${S1}/photos/${n}.webp`,
  width: 1600,
  height: 1200,
  created_at: `2026-09-${String(n).padStart(2, "0")}T10:00:00Z`,
  removed_at: null,
  hidden_at: null,
  ...over,
});

beforeEach(() => {
  state.rows = [];
  state.queried = 0;
  state.unsigned = new Set();
  state.role = "member";
});

describe("listPhotosByUploader — contract 3", () => {
  it("returns only this member's photographs, newest first, with the session each belongs to", async () => {
    state.rows = [photo(1), photo(3), photo(2), photo(4, { uploader_id: OTHER })];
    const result = await listPhotosByUploader("ar", ME);
    expect(result.count).toBe(3);
    expect(result.photos.map((p) => p.createdAt)).toEqual(["2026-09-03T10:00:00Z", "2026-09-02T10:00:00Z", "2026-09-01T10:00:00Z"]);
    expect(result.photos[0]).toMatchObject({ sessionId: S1, width: 1600, height: 1200 });
    expect(result.photos[0].url).toMatch(/^https:\/\/storage\.test\//);
  });

  it("★ leaves a hidden or removed photograph out — for staff too", async () => {
    state.role = "admin";
    state.rows = [photo(1), photo(2, { hidden_at: "2026-09-20T00:00:00Z" }), photo(3, { removed_at: "2026-09-20T00:00:00Z" })];
    const result = await listPhotosByUploader("ar", ME);
    expect(result.count).toBe(1);
    expect(result.photos.map((p) => p.id)).toEqual([photo(1).id]);
  });

  it("★ the count is a count, never the page's length (DEC-213 §5.120's lesson)", async () => {
    state.rows = Array.from({ length: 9 }, (_, i) => photo(i + 1));
    const result = await listPhotosByUploader("ar", ME);
    expect(result.count).toBe(9);
    expect(result.photos).toHaveLength(6); // the default: five tiles and «+N»
    const three = await listPhotosByUploader("ar", ME, { limit: 3 });
    expect(three.count).toBe(9);
    expect(three.photos).toHaveLength(3);
  });

  it("caps the page at 48 and never asks for a negative one", async () => {
    state.rows = Array.from({ length: 60 }, (_, i) => photo(i + 1, { created_at: `2026-09-01T10:${String(i).padStart(2, "0")}:00Z` }));
    expect((await listPhotosByUploader("ar", ME, { limit: 500 })).photos).toHaveLength(48);
    const none = await listPhotosByUploader("ar", ME, { limit: -4 });
    expect(none).toEqual({ count: 60, photos: [] });
  });

  it("breaks a tie on the instant by id, so two photographs written together keep one order", async () => {
    const at = "2026-09-10T10:00:00Z";
    state.rows = [photo(1, { created_at: at }), photo(2, { created_at: at })];
    const result = await listPhotosByUploader("ar", ME);
    expect(result.photos.map((p) => p.id)).toEqual([photo(2).id, photo(1).id]);
  });

  it("a signature that fails drops its tile and keeps the count", async () => {
    state.rows = [photo(1), photo(2)];
    state.unsigned.add(photo(2).storage_path as string);
    const result = await listPhotosByUploader("ar", ME);
    expect(result.count).toBe(2);
    expect(result.photos.map((p) => p.id)).toEqual([photo(1).id]);
  });

  it("a malformed member id never reaches the database", async () => {
    expect(await listPhotosByUploader("ar", "not-a-uuid")).toEqual({ count: 0, photos: [] });
    expect(state.queried).toBe(0);
  });
});
