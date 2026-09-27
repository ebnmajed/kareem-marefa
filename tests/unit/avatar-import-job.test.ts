// JOB-import_avatar — worker/src/tasks/import_avatar.ts (11 §2.4; REQ-PRF-008,
// REQ-PRF-011; DEC-182). The reconcile: storage made to match the row. A fake
// `helpers.query` plays the three definer doors, a fake storage records every
// upload and delete, and a fake fetch and runner stand in for Google and cwebp.
import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { makeImportAvatar } from "../../worker/src/tasks/import_avatar";

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const PREFIX = `${ORG}/members/${MEMBER}`;
const SOURCE = "https://lh3.googleusercontent.com/a/ACg8ocTEST=s96-c";
const NOW = 1790000000000;

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
function jpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, ...u16be(16), ...Array.from("Exif\0\0", (c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 0,
    0xff, 0xc0, ...u16be(17), 8, ...u16be(96), ...u16be(96), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, ...u16be(12), 3, 1, 0, 2, 17, 3, 17, 0, 63, 0,
    0xaa, 0xbb, 0xff, 0xd9,
  ]);
}
const WEBP = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([4, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0))));

type Target = { org_id: string; answer: "accepted" | "declined" | null; source_url: string | null; version: number | null; anonymised: boolean };

function harness(target: Target | null, opts: { record?: { status: "recorded" | "stale"; version: number | null }; existing?: string[]; fetchStatus?: number; body?: Uint8Array } = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const uploads: string[] = [];
  const deleted: string[] = [];
  const helpers = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes("avatar_job_target")) return { rows: [{ target }] };
      if (sql.includes("record_avatar_copy")) return { rows: [{ result: opts.record ?? { status: "recorded", version: Number(params[1]) } }] };
      return { rows: [] };
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
  const task = makeImportAvatar({
    now: () => NOW,
    fetcher: async () => new Response(new Blob([(opts.body ?? jpeg()) as BlobPart]), { status: opts.fetchStatus ?? 200 }),
    run: async (_cmd, args) => writeFile(args[args.indexOf("-o") + 1], WEBP),
    upload: async (_bucket, path) => {
      uploads.push(path);
    },
    list: async (_bucket, prefix) => [...(opts.existing ?? []), ...uploads].filter((p) => p.startsWith(`${prefix}/`)),
    remove: async (_bucket, paths) => {
      deleted.push(...paths);
      return paths.length;
    },
  });
  return { run: () => task({ member_id: MEMBER }, helpers as never), queries, uploads, deleted, helpers };
}

const accepted: Target = { org_id: ORG, answer: "accepted", source_url: SOURCE, version: null, anonymised: false };

describe("import_avatar — the copy", () => {
  it("copies 96 and 192 px under a new version, records it against THIS source, then removes every older version", async () => {
    const old = [`${PREFIX}/1700000000000/96.webp`, `${PREFIX}/1700000000000/192.webp`];
    const h = harness({ ...accepted, version: 1700000000000 }, { existing: old });
    await h.run();
    expect(h.uploads).toEqual([`${PREFIX}/${NOW}/96.webp`, `${PREFIX}/${NOW}/192.webp`]);
    const record = h.queries.find((q) => q.sql.includes("record_avatar_copy"));
    expect(record?.params).toEqual([MEMBER, String(NOW), SOURCE]);
    expect(h.deleted.sort()).toEqual(old.sort());
  });

  it("a version never repeats, even when the clock is behind the current copy", async () => {
    const h = harness({ ...accepted, version: NOW + 5 });
    await h.run();
    expect(h.uploads[0]).toBe(`${PREFIX}/${NOW + 6}/96.webp`);
  });

  it("★ stale — the member said no, or signed in with a new photo, while this ran: the new copy is discarded, nothing recorded stays", async () => {
    const h = harness(accepted, { record: { status: "stale", version: null } });
    await h.run();
    expect(h.deleted.sort()).toEqual([`${PREFIX}/${NOW}/192.webp`, `${PREFIX}/${NOW}/96.webp`]);
  });
});

describe("import_avatar — a failure never sets a version", () => {
  it.each([
    ["a host that is not Google's", { ...accepted, source_url: "https://evil.example/a.jpg" }, {}],
    ["Google answering 404", accepted, { fetchStatus: 404 }],
    ["an SVG", accepted, { body: Uint8Array.from('<svg xmlns="http://www.w3.org/2000/svg"/>', (c) => c.charCodeAt(0)) }],
  ])("%s → returns, uploads nothing, records nothing, deletes nothing", async (_label, target, opts) => {
    const h = harness(target as Target, opts);
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.uploads).toEqual([]);
    expect(h.deleted).toEqual([]);
    expect(h.queries.some((q) => q.sql.includes("record_avatar_copy"))).toBe(false);
    expect(h.helpers.logger.warn).toHaveBeenCalled();
  });

  it("a 503 is rethrown for the retry, with nothing recorded", async () => {
    const h = harness(accepted, { fetchStatus: 503 });
    await expect(h.run()).rejects.toThrow(/503/);
    expect(h.queries.some((q) => q.sql.includes("record_avatar_copy"))).toBe(false);
  });
});

describe("import_avatar — removal (REQ-PRF-011, «removal is immediate and real»)", () => {
  const stored = [`${PREFIX}/1700000000000/96.webp`, `${PREFIX}/1700000000000/192.webp`];

  it.each([
    ["declined", { ...accepted, answer: "declined" as const, version: null }],
    ["unanswered", { ...accepted, answer: null, version: null }],
    ["anonymised", { ...accepted, source_url: null, version: null, anonymised: true }],
  ])("%s → every object under the member's prefix is deleted, and nothing is fetched", async (_label, target) => {
    const h = harness(target, { existing: stored });
    await h.run();
    expect(h.deleted.sort()).toEqual([...stored].sort());
    expect(h.uploads).toEqual([]);
  });

  it("a member who no longer exists is a warning, not a retry", async () => {
    const h = harness(null);
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.helpers.logger.warn).toHaveBeenCalledWith(expect.stringContaining("no longer exists"));
  });
});
