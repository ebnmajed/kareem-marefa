// JOB-zip_session_photos — REQ-ADM-021, DEC-182. `helpers.query` plays the
// three definer doors (proposed/content/0158), a fake Storage records every
// read, write, list and delete, and — where the machine has one — the real
// `zip` binary writes the part, which a stored-zip reader then opens.
//
// What the SQL proves elsewhere (tests/rls/photos-album-build.test.ts): which
// photographs are visible, the lock, the trigger. What is the JOB's, and is
// proven here: parts under the cap, never a photograph split or dropped; only
// the bytes whose SHA-256 is the row's; a hide mid-build retried, a replaced
// build's parts deleted, the older builds removed once ready; «failed» written
// only when no retry is left; the expiry deleting only the build it names.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readStoredZip } from "./photos-zip-reader";

const store = new Map<string, Uint8Array>();
const uploads: { bucket: string; path: string; bytes: Uint8Array; contentType: string }[] = [];
const deleted: string[] = [];
let listed: string[] = [];

vi.mock("../../worker/src/content/storage", () => ({
  downloadObject: async (bucket: string, path: string) => {
    const bytes = store.get(`${bucket}/${path}`);
    if (!bytes) throw new Error(`no object ${bucket}/${path}`);
    return bytes;
  },
  uploadObject: async (bucket: string, path: string, bytes: Uint8Array, contentType: string) => {
    uploads.push({ bucket, path, bytes: new Uint8Array(bytes), contentType });
  },
  deleteObject: async (bucket: string, path: string) => {
    deleted.push(`${bucket}/${path}`);
  },
  listObjects: async () => listed,
}));

const HAS_ZIP = (() => {
  try {
    execFileSync("zip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Where there is no `zip` on the machine, the part is a marker file and the reader is not used.
vi.mock("../../worker/src/content/zip", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../worker/src/content/zip")>();
  return {
    ...real,
    zipFiles: HAS_ZIP ? real.zipFiles : async (output: string, files: string[]) => writeFileSync(output, files.join("\n")),
  };
});

const { zip_session_photos, partition, entryName, partBytes, DEFAULT_PART_BYTES } = await import("../../worker/src/tasks/zip_session_photos");
const { ZIP_ARGS, zipFiles } = await import("../../worker/src/content/zip");
const { photoAlbumPartPath, photoAlbumBuildPrefix, photoAlbumPrefix } = await import("@kareem/storage-paths");

const ORG = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const ALBUM = "33333333-3333-4333-8333-333333333333";
const BUILD = "44444444-4444-4444-8444-444444444444";
const OLD_BUILD = "55555555-5555-4555-8555-555555555555";
const PAYLOAD = { album_id: ALBUM, build_id: BUILD, session_id: SESSION, org_id: ORG };

function photo(n: number, size: number) {
  const id = `6666666${n}-6666-4666-8666-66666666666${n}`;
  const bytes = new Uint8Array(size).fill(n);
  const path = `${ORG}/sessions/${SESSION}/photos/${id}.jpg`;
  store.set(`photos/${path}`, bytes);
  return { photo_id: id, storage_path: path, byte_size: String(size), sha256: createHash("sha256").update(bytes).digest("hex") };
}

function harness(opts: { rows: ReturnType<typeof photo>[]; outcome?: string; attempts?: number; album?: { build_id: string; expires_at: string | null } }) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const helpers = {
    job: { attempts: opts.attempts ?? 1, max_attempts: 3 },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes("begin_photo_album_build")) return { rows: opts.rows };
      if (sql.includes("record_photo_album_built")) return { rows: [{ outcome: opts.outcome ?? "ready" }] };
      if (sql.includes("from public.photo_albums")) return { rows: opts.album ? [opts.album] : [] };
      return { rows: [] };
    }),
  };
  return { helpers, queries, run: (payload: unknown = PAYLOAD) => zip_session_photos(payload as never, helpers as never) };
}

beforeEach(() => {
  store.clear();
  uploads.length = 0;
  deleted.length = 0;
  listed = [];
  delete process.env.PHOTO_ALBUM_PART_BYTES;
});

describe("partition — the album in parts under the cap", () => {
  const p = (n: number, size: number) => ({ photo_id: String(n), storage_path: `${n}.jpg`, byte_size: size, sha256: "" });

  it("one part when the whole album fits", () => {
    expect(partition([p(1, 10), p(2, 10), p(3, 10)], 30).map((g) => g.length)).toEqual([3]);
  });

  it("a new part whenever the next photograph would pass the cap, in order", () => {
    expect(partition([p(1, 20), p(2, 20), p(3, 5), p(4, 30)], 30).map((g) => g.map((x) => x.photo_id))).toEqual([["1"], ["2", "3"], ["4"]]);
  });

  it("a photograph larger than the cap is a part of its own — never split, never dropped", () => {
    expect(partition([p(1, 5), p(2, 100), p(3, 5)], 30).map((g) => g.map((x) => x.photo_id))).toEqual([["1"], ["2"], ["3"]]);
  });

  it("45 MiB by default; PHOTO_ALBUM_PART_BYTES overrides it, and a nonsense value does not", () => {
    expect(DEFAULT_PART_BYTES).toBe(45 * 1024 * 1024);
    expect(partBytes({})).toBe(DEFAULT_PART_BYTES);
    expect(partBytes({ PHOTO_ALBUM_PART_BYTES: "1000" })).toBe(1000);
    expect(partBytes({ PHOTO_ALBUM_PART_BYTES: "-3" })).toBe(DEFAULT_PART_BYTES);
    expect(partBytes({ PHOTO_ALBUM_PART_BYTES: "lots" })).toBe(DEFAULT_PART_BYTES);
  });

  it("entry names are ASCII, ordered, unique, and keep the stored kind's extension", () => {
    expect(entryName(7, { photo_id: "3f2a9c1b-0000-4000-8000-000000000000", storage_path: "o/sessions/s/photos/x.PNG" })).toBe("007-3f2a9c1b.png");
    expect(entryName(120, { photo_id: "aaaaaaaa-0000-4000-8000-000000000000", storage_path: "o/x.webp" })).toBe("120-aaaaaaaa.webp");
  });
});

describe("the one path builder — photo-albums", () => {
  it("names the session at [3] and the build at [5], as photo_albums_storage_read reads them", () => {
    const path = photoAlbumPartPath(ORG, SESSION, BUILD, 2);
    expect(path).toBe(`${ORG}/sessions/${SESSION}/albums/${BUILD}/part-2.zip`);
    const segments = path.split("/");
    expect([segments[0], segments[2], segments[4]]).toEqual([ORG, SESSION, BUILD]);
    expect(photoAlbumBuildPrefix(ORG, SESSION, BUILD)).toBe(`${ORG}/sessions/${SESSION}/albums/${BUILD}`);
    expect(photoAlbumPrefix(ORG, SESSION)).toBe(`${ORG}/sessions/${SESSION}/albums`);
  });

  it("refuses anything that is not a uuid or a part number", () => {
    expect(() => photoAlbumPartPath("../x", SESSION, BUILD, 1)).toThrow();
    expect(() => photoAlbumPartPath(ORG, SESSION, "b", 1)).toThrow();
    expect(() => photoAlbumPartPath(ORG, SESSION, BUILD, 0)).toThrow();
  });
});

describe("JOB-zip_session_photos — build", () => {
  it("★ zips the rows' photographs into parts under the cap, records them, and deletes the older builds", async () => {
    process.env.PHOTO_ALBUM_PART_BYTES = "250";
    const rows = [photo(1, 100), photo(2, 100), photo(3, 100)];
    const stale = `${photoAlbumBuildPrefix(ORG, SESSION, OLD_BUILD)}/part-1.zip`;
    listed = [stale, photoAlbumPartPath(ORG, SESSION, BUILD, 1), photoAlbumPartPath(ORG, SESSION, BUILD, 2)];
    const h = harness({ rows });
    await h.run();

    expect(uploads.map((u) => [u.bucket, u.path, u.contentType])).toEqual([
      ["photo-albums", photoAlbumPartPath(ORG, SESSION, BUILD, 1), "application/zip"],
      ["photo-albums", photoAlbumPartPath(ORG, SESSION, BUILD, 2), "application/zip"],
    ]);
    const record = h.queries.find((q) => q.sql.includes("record_photo_album_built"))!;
    expect(record.params[0]).toBe(BUILD);
    expect(JSON.parse(record.params[1] as string)).toEqual([
      { path: photoAlbumPartPath(ORG, SESSION, BUILD, 1), byteSize: uploads[0].bytes.byteLength, photoCount: 2 },
      { path: photoAlbumPartPath(ORG, SESSION, BUILD, 2), byteSize: uploads[1].bytes.byteLength, photoCount: 1 },
    ]);
    expect(record.params[2]).toEqual(rows.map((r) => r.photo_id));
    // Only the older build's bytes go; this build's stay.
    expect(deleted).toEqual([`photo-albums/${stale}`]);
    expect(h.queries.some((q) => q.sql.includes("fail_photo_album"))).toBe(false);
  });

  it.skipIf(!HAS_ZIP)("★ with the real zip: every entry is stored, carries no extra field, and is byte-for-byte the row's object", async () => {
    const rows = [photo(1, 300), photo(2, 200)];
    await harness({ rows }).run();
    const entries = readStoredZip(Buffer.from(uploads[0].bytes));
    expect(entries.map((e) => e.name)).toEqual([entryName(1, rows[0]), entryName(2, rows[1])]);
    for (const [i, entry] of entries.entries()) {
      expect(entry.method).toBe(0);
      expect(entry.extraLength).toBe(0);
      expect(createHash("sha256").update(entry.data).digest("hex")).toBe(rows[i].sha256);
    }
  });

  it("★ an object whose bytes are not the row's stripped file refuses the album — nothing is uploaded or recorded", async () => {
    const rows = [photo(1, 100)];
    rows[0].sha256 = "0".repeat(64);
    const h = harness({ rows });
    await expect(h.run()).rejects.toThrow(/not the stripped file/);
    expect(uploads).toHaveLength(0);
    expect(h.queries.some((q) => q.sql.includes("record_photo_album_built"))).toBe(false);
    expect(h.queries.some((q) => q.sql.includes("fail_photo_album"))).toBe(false);
  });

  it("«failed» is written on the LAST attempt only, then the error is rethrown", async () => {
    const rows = [photo(1, 100)];
    rows[0].sha256 = "0".repeat(64);
    const h = harness({ rows, attempts: 3 });
    await expect(h.run()).rejects.toThrow();
    const fail = h.queries.find((q) => q.sql.includes("fail_photo_album"))!;
    expect(fail.params[0]).toBe(BUILD);
    expect(String(fail.params[1])).toMatch(/not the stripped file/);
  });

  it("★ a photograph hidden during the build: 'stale' throws, so the retry reads the visible set again", async () => {
    const h = harness({ rows: [photo(1, 100)], outcome: "stale" });
    await expect(h.run()).rejects.toThrow(/hidden during build/);
  });

  it("a build replaced while it ran deletes the parts it wrote, and nothing else", async () => {
    listed = ["should-not-be-touched"];
    const h = harness({ rows: [photo(1, 100)], outcome: "superseded" });
    await h.run();
    expect(deleted).toEqual([`photo-albums/${photoAlbumPartPath(ORG, SESSION, BUILD, 1)}`]);
  });

  it("no rows: the album fails as empty (a no-op on a replaced build), and nothing is zipped", async () => {
    const h = harness({ rows: [] });
    await h.run();
    const fail = h.queries.find((q) => q.sql.includes("fail_photo_album"))!;
    expect(fail.params).toEqual([BUILD, "album_empty"]);
    expect(uploads).toHaveLength(0);
  });

  it("a malformed payload touches nothing", async () => {
    const h = harness({ rows: [photo(1, 100)] });
    await h.run({ ...PAYLOAD, build_id: "nope" });
    await h.run({ ...PAYLOAD, mode: "shred" });
    expect(h.queries).toHaveLength(0);
    expect(h.helpers.logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("JOB-zip_session_photos — expire", () => {
  const PAST = new Date(Date.now() - 60_000).toISOString();
  const FUTURE = new Date(Date.now() + 60_000).toISOString();

  it("deletes the parts of the build it names when that build is current and lapsed", async () => {
    listed = [photoAlbumPartPath(ORG, SESSION, BUILD, 1), photoAlbumPartPath(ORG, SESSION, BUILD, 2)];
    await harness({ rows: [], album: { build_id: BUILD, expires_at: PAST } }).run({ ...PAYLOAD, mode: "expire" });
    expect(deleted).toEqual(listed.map((p) => `photo-albums/${p}`));
  });

  it("touches nothing when the album was rebuilt, is not yet lapsed, or is gone", async () => {
    listed = [photoAlbumPartPath(ORG, SESSION, BUILD, 1)];
    for (const album of [{ build_id: OLD_BUILD, expires_at: PAST }, { build_id: BUILD, expires_at: FUTURE }, undefined]) {
      await harness({ rows: [], album }).run({ ...PAYLOAD, mode: "expire" });
    }
    expect(deleted).toEqual([]);
  });
});

describe("zipFiles — the binary", () => {
  it("calls zip quiet, without attributes, stored, with bare names", () => {
    expect(ZIP_ARGS).toEqual(["-q", "-X", "-0", "-j"]);
  });

  it.skipIf(!HAS_ZIP)("writes a zip the reader opens, entries in the order given", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
    try {
      writeFileSync(join(dir, "b.jpg"), "second");
      writeFileSync(join(dir, "a.jpg"), "first");
      await zipFiles(join(dir, "out.zip"), [join(dir, "b.jpg"), join(dir, "a.jpg")]);
      const entries = readStoredZip(readFileSync(join(dir, "out.zip")));
      expect(entries.map((e) => [e.name, e.data.toString()])).toEqual([
        ["b.jpg", "second"],
        ["a.jpg", "first"],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an empty list rather than writing an empty archive", async () => {
    await expect(zipFiles("/tmp/never.zip", [])).rejects.toThrow(/nothing to zip/);
  });
});
