// JOB-process_avatar_upload — worker/src/tasks/process_avatar_upload.ts (DEC-280 §2, DEC-281; REQ-PRF-010,
// REQ-PRF-017). A fake `helpers.query` plays the definer doors, a fake storage records every read, write and delete
// BY BUCKET, and a fake runner stands in for cwebp.
//
// ★ The two cases the wave names here: an SVG renamed `.png` is refused AFTER it landed (no version moves, the staged
//   file is deleted, the sheet reads «PNG أو JPG فقط»), and an upload REPLACES a Google copy and deletes its objects.
import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { makeProcessAvatarUpload, refusalState } from "../../worker/src/tasks/process_avatar_upload";
import { StorageError } from "../../worker/src/content/storage";

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c01";
const PREFIX = `${ORG}/members/${MEMBER}`;
const STAGED = `${PREFIX}/${UPLOAD}`;
const NOW = 1790000000000;

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
/** A JPEG carrying an EXIF segment — the strip must remove it. */
function jpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, ...u16be(16), ...Array.from("Exif\0\0", (c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 0,
    0xff, 0xc0, ...u16be(17), 8, ...u16be(1024), ...u16be(1024), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, ...u16be(12), 3, 1, 0, 2, 17, 3, 17, 0, 63, 0,
    0xaa, 0xbb, 0xff, 0xd9,
  ]);
}
const SVG = Uint8Array.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', (c) => c.charCodeAt(0));
const WEBP = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([4, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0))));

type Upload = { id: string; state: "pending" | "done" | "refused" | "failed" | "cancelled" } | null;
type Target = { org_id: string; version: number | null; anonymised: boolean; upload: Upload; source?: string | null };

function harness(
  target: Target | null,
  opts: {
    staged?: Uint8Array | "missing" | "boom";
    existing?: Record<string, string[]>;
    record?: { status: "recorded" | "stale"; version: number | null };
    job?: { attempts: number; max_attempts: number };
  } = {},
) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const uploads: string[] = [];
  const deleted: Record<string, string[]> = { avatars: [], "avatar-staging": [] };
  const store: Record<string, string[]> = { avatars: [...(opts.existing?.avatars ?? [])], "avatar-staging": [...(opts.existing?.["avatar-staging"] ?? [STAGED])] };
  const runs: string[][] = [];
  let inputBytes: Uint8Array | null = null;
  const helpers = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes("avatar_job_target")) return { rows: [{ target }] };
      if (sql.includes("record_avatar_upload")) return { rows: [{ result: opts.record ?? { status: "recorded", version: Number(params[2]) } }] };
      if (sql.includes("fail_avatar_upload")) return { rows: [{ result: { status: "recorded" } }] };
      return { rows: [] };
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    job: opts.job ?? { attempts: 1, max_attempts: 5 },
  };
  const task = makeProcessAvatarUpload({
    now: () => NOW,
    download: async (bucket, path) => {
      expect(bucket).toBe("avatar-staging");
      expect(path).toBe(STAGED);
      if (opts.staged === "missing") throw new StorageError("missing", 400, '{"statusCode":"404","error":"not_found","message":"Object not found"}');
      if (opts.staged === "boom") throw new StorageError("boom", 503, "unavailable");
      return opts.staged ?? jpeg();
    },
    run: async (_cmd, args) => {
      runs.push(args);
      const { readFile } = await import("node:fs/promises");
      inputBytes ??= new Uint8Array(await readFile(args[args.length - 3]));
      await writeFile(args[args.indexOf("-o") + 1], WEBP);
    },
    upload: async (bucket, path) => {
      expect(bucket).toBe("avatars");
      uploads.push(path);
      store.avatars.push(path);
    },
    list: async (bucket, prefix) => (store[bucket] ?? []).filter((p) => p.startsWith(`${prefix}/`)),
    remove: async (bucket, paths) => {
      deleted[bucket].push(...paths);
      store[bucket] = store[bucket].filter((p) => !paths.includes(p));
      return paths.length;
    },
  });
  return {
    run: () => task({ member_id: MEMBER }, helpers as never),
    queries,
    uploads,
    deleted,
    store,
    runs,
    helpers,
    input: () => inputBytes,
    called: (fn: string) => queries.filter((q) => q.sql.includes(fn)),
  };
}

const pending: Target = { org_id: ORG, version: null, anonymised: false, upload: { id: UPLOAD, state: "pending" } };
const googleCopy = [`${PREFIX}/1700000000000/96.webp`, `${PREFIX}/1700000000000/192.webp`];

describe("process_avatar_upload — the upload", () => {
  it("★ replaces a Google copy: 96 and 192 px under a new version, recorded, then the copy's objects and the staged file deleted", async () => {
    const h = harness({ ...pending, version: 1700000000000, source: "google" }, { existing: { avatars: googleCopy } });
    await h.run();
    expect(h.uploads).toEqual([`${PREFIX}/${NOW}/96.webp`, `${PREFIX}/${NOW}/192.webp`]);
    expect(h.called("record_avatar_upload")[0].params).toEqual([MEMBER, UPLOAD, String(NOW)]);
    expect(h.deleted.avatars.sort()).toEqual([...googleCopy].sort());
    expect(h.deleted["avatar-staging"]).toEqual([STAGED]);
    expect(h.store.avatars.sort()).toEqual([`${PREFIX}/${NOW}/192.webp`, `${PREFIX}/${NOW}/96.webp`]);
  });

  it("★ the bytes cwebp sees carry no EXIF — stripped and proven gone before any binary runs", async () => {
    const h = harness(pending);
    await h.run();
    const seen = h.input();
    expect(seen).not.toBeNull();
    expect(Buffer.from(seen!).includes(Buffer.from("Exif\0\0"))).toBe(false);
    for (const args of h.runs) expect(args.slice(0, 3)).toEqual(["-quiet", "-metadata", "none"]);
  });

  it("a version never repeats, even when the clock is behind the current photo", async () => {
    const h = harness({ ...pending, version: NOW + 5 });
    await h.run();
    expect(h.uploads[0]).toBe(`${PREFIX}/${NOW + 6}/96.webp`);
  });

  it("stale — a pick, a removal or a newer upload while this ran: what was written is deleted, the current photo kept", async () => {
    const current = [`${PREFIX}/1790000000900/96.webp`, `${PREFIX}/1790000000900/192.webp`];
    const h = harness(pending, { existing: { avatars: current }, record: { status: "stale", version: 1790000000900 } });
    await h.run();
    expect(h.deleted.avatars.sort()).toEqual([`${PREFIX}/${NOW}/192.webp`, `${PREFIX}/${NOW}/96.webp`]);
    expect(h.store.avatars.sort()).toEqual([...current].sort());
    expect(h.deleted["avatar-staging"]).toEqual([STAGED]);
  });
});

describe("process_avatar_upload — a refusal never moves a version", () => {
  it("★ an SVG renamed `.png` is refused AFTER it landed: `refused`, nothing uploaded or recorded, the staged file deleted", async () => {
    const h = harness({ ...pending, version: 1700000000000 }, { staged: SVG, existing: { avatars: googleCopy } });
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.uploads).toEqual([]);
    expect(h.called("record_avatar_upload")).toHaveLength(0);
    expect(h.called("fail_avatar_upload")[0].params).toEqual([MEMBER, UPLOAD, "refused"]);
    expect(h.deleted["avatar-staging"]).toEqual([STAGED]);
    expect(h.deleted.avatars).toEqual([]); // the photo the member had stays
  });

  it.each([
    ["a WebP", Uint8Array.from([...WEBP, 0, 0])],
    ["garbage", Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])],
  ])("%s is `refused` the same way", async (_label, bytes) => {
    const h = harness(pending, { staged: bytes });
    await h.run();
    expect(h.called("fail_avatar_upload")[0].params[2]).toBe("refused");
  });

  it("a staged file that is gone is `failed`, not retried", async () => {
    const h = harness(pending, { staged: "missing" });
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.called("fail_avatar_upload")[0].params[2]).toBe("failed");
  });

  it("a transient error is rethrown for the retry, with nothing written to the row", async () => {
    const h = harness(pending, { staged: "boom" });
    await expect(h.run()).rejects.toThrow(/boom/);
    expect(h.called("fail_avatar_upload")).toHaveLength(0);
    expect(h.deleted["avatar-staging"]).toEqual([]);
  });

  it("★ on the LAST attempt it is `failed` first, so the sheet stops polling — and still rethrown", async () => {
    const h = harness(pending, { staged: "boom", job: { attempts: 5, max_attempts: 5 } });
    await expect(h.run()).rejects.toThrow(/boom/);
    expect(h.called("fail_avatar_upload")[0].params[2]).toBe("failed");
    expect(h.deleted["avatar-staging"]).toEqual([STAGED]);
  });

  it("refusalState: kind and malformed are «PNG أو JPG فقط»; anything else is «تعذّر الرفع»", () => {
    expect(refusalState("kind_svg")).toBe("refused");
    expect(refusalState("kind_unknown")).toBe("refused");
    expect(refusalState("malformed")).toBe("refused");
    expect(refusalState("too_many_pixels")).toBe("failed");
    expect(refusalState("metadata_remains")).toBe("failed");
  });
});

describe("process_avatar_upload — nothing to process", () => {
  it.each([["cancelled"], ["done"], ["refused"]] as const)("an upload that is %s is not processed; the staging prefix is emptied", async (s) => {
    const h = harness({ ...pending, upload: { id: UPLOAD, state: s } });
    await h.run();
    expect(h.called("record_avatar_upload")).toHaveLength(0);
    expect(h.uploads).toEqual([]);
    expect(h.deleted["avatar-staging"]).toEqual([STAGED]);
  });

  it("★ anonymised — every object under both prefixes is deleted", async () => {
    const h = harness({ ...pending, anonymised: true }, { existing: { avatars: googleCopy } });
    await h.run();
    expect(h.deleted.avatars.sort()).toEqual([...googleCopy].sort());
    expect(h.deleted["avatar-staging"]).toEqual([STAGED]);
    expect(h.uploads).toEqual([]);
  });

  it("a member who no longer exists is a warning, not a retry", async () => {
    const h = harness(null);
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.helpers.logger.warn).toHaveBeenCalledWith(expect.stringContaining("no longer exists"));
  });
});
