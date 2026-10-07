// JOB-backfill_story_derivatives — DEC-278, REQ-STO-012. `helpers.query` plays the two definer doors, a fake Storage
// records every read and write, and `renderStoryDerivative()` is stubbed (the real cwebp is the image's, proven by
// story-derivative's own suite). What the JOB owns, proven here: each wanted photograph's derivative written at the one
// path builder's place and marked; a missing object, a non-image or a failed render left unmarked for the next run; one
// failure never stops the others.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Uint8Array>();
const uploads: { bucket: string; path: string; contentType: string }[] = [];
vi.mock("../../worker/src/content/storage", () => ({
  downloadObject: async (bucket: string, path: string) => {
    const bytes = store.get(`${bucket}/${path}`);
    if (!bytes) throw Object.assign(new Error(`no object ${bucket}/${path}`), { status: 404 });
    return bytes;
  },
  uploadObject: async (bucket: string, path: string, _bytes: Uint8Array, contentType: string) => {
    uploads.push({ bucket, path, contentType });
  },
  isNotFound: (e: unknown) => (e as { status?: number }).status === 404,
}));
const render = vi.fn(async (): Promise<Uint8Array | null> => new Uint8Array([1, 2, 3]));
vi.mock("../../worker/src/content/story-derivative", () => ({ renderStoryDerivative: (...a: unknown[]) => render(...(a as [])) }));

const { backfill_story_derivatives } = await import("../../worker/src/tasks/backfill_story_derivatives");
const { photoStoryPath } = await import("@kareem/storage-paths");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ORG = "11111111-1111-4111-8111-111111111111";
const SES = "22222222-2222-4222-8222-222222222222";
const row = (id: string) => ({ photo_id: id, org_id: ORG, session_id: SES, storage_path: `${ORG}/sessions/${SES}/photos/${id}.png`, width: 1600, height: 1067 });

function helpers(rows: ReturnType<typeof row>[]) {
  const marked: string[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("story_derivatives_wanted")) return { rows };
    if (sql.includes("mark_story_derivative_ready")) marked.push(String(params?.[0]));
    return { rows: [] };
  });
  return { marked, h: { query, logger: { info: vi.fn(), warn: vi.fn() } } as never };
}

beforeEach(() => {
  store.clear();
  uploads.length = 0;
  render.mockClear();
});

describe("JOB-backfill_story_derivatives", () => {
  it("writes each wanted photograph's derivative at the path builder's place and marks it", async () => {
    const a = row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    store.set(`photos/${a.storage_path}`, PNG);
    const { marked, h } = helpers([a]);
    await backfill_story_derivatives({}, h);
    expect(uploads).toEqual([{ bucket: "photos", path: photoStoryPath(ORG, SES, a.photo_id), contentType: "image/webp" }]);
    expect(render).toHaveBeenCalledWith(PNG, "png", 1600, 1067);
    expect(marked).toEqual([a.photo_id]);
  });

  it("a missing object, a non-image or a failed render is left unmarked — and the next photograph is still made", async () => {
    const gone = row("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const junk = row("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    const fails = row("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const good = row("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    store.set(`photos/${junk.storage_path}`, new Uint8Array([1, 2, 3, 4]));
    store.set(`photos/${fails.storage_path}`, PNG);
    store.set(`photos/${good.storage_path}`, PNG);
    render.mockResolvedValueOnce(null);
    const { marked, h } = helpers([gone, junk, fails, good]);
    await backfill_story_derivatives({}, h);
    expect(marked).toEqual([good.photo_id]);
    expect(uploads.map((u) => u.path)).toEqual([photoStoryPath(ORG, SES, good.photo_id)]);
  });
});
