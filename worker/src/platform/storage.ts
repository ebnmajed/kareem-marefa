// Storage, for the two platform jobs that need to walk it — 03 §6, DEC-049.
//
// Raw fetch against Supabase Storage's REST API with the service-role key, the
// way `worker/src/content/storage.ts` does it: worker/package.json carries only
// `pg` and `graphile-worker`, and the SDK would add nothing here.
//
// ★ These two functions exist because storage paths are the ONLY place in the
// design where isolation depends on application correctness rather than on a
// constraint (03 §6). Everywhere else a forgotten predicate returns zero rows;
// here a path built wrong puts an object in another org's prefix and the policy
// dutifully allows it. `assert_storage_prefixes` is the third containment and
// the only one that would catch a path builder that had been wrong for a week.

function requireEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("platform/storage: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
  }
  return { url, key };
}

type ListEntry = { name: string; id: string | null };

/**
 * Every object path under `prefix`, recursively.
 *
 * Storage's list endpoint returns ONE level at a time, and a folder comes back
 * as an entry whose `id` is null — that is the only way to tell a folder from
 * an object, since both are just names. Paging is by `offset`, and a bucket
 * with more than `PAGE` entries at one level would silently truncate without
 * the loop below, which on this job would look exactly like "no violations".
 */
export async function listObjects(bucket: string, prefix = "", depth = 0): Promise<string[]> {
  const { url, key } = requireEnv();
  const PAGE = 1000;
  // A prefix nested deeper than this is not a path this product builds; the
  // cap stops a pathological tree from turning a nightly job into a walk that
  // never ends.
  if (depth > 8) return [];

  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`platform/storage: list ${bucket}/${prefix} failed: ${res.status} ${await res.text()}`);
    const entries = (await res.json()) as ListEntry[];
    if (entries.length === 0) break;

    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listObjects(bucket, path, depth + 1)));
      else out.push(path);
    }
    if (entries.length < PAGE) break;
  }
  return out;
}

/** Removes objects in batches. Storage's delete endpoint takes a list. */
export async function deleteObjects(bucket: string, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const { url, key } = requireEnv();
  const BATCH = 500;
  let removed = 0;
  for (let i = 0; i < paths.length; i += BATCH) {
    const slice = paths.slice(i, i + BATCH);
    const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: slice }),
    });
    if (!res.ok) throw new Error(`platform/storage: delete ${bucket} failed: ${res.status} ${await res.text()}`);
    removed += slice.length;
  }
  return removed;
}

/**
 * The buckets, and whether each is org-prefixed (03 §6).
 *
 * ★ `fonts` is the one deliberately un-prefixed bucket: fonts are
 * content-addressed by SHA-256 and shared platform-wide, because the whole
 * point of `REQ-DSG-016` is that the editor, the worker's Chromium and the
 * worker's LibreOffice load THE SAME BYTES (06 §6.4, DEC-049). The assertion
 * job reports it as such rather than skipping it — a skipped bucket and a
 * forgotten bucket look identical in a log.
 */
export const BUCKETS: { name: string; orgPrefixed: boolean }[] = [
  { name: "materials", orgPrefixed: true },
  { name: "material-pages", orgPrefixed: true },
  { name: "photos", orgPrefixed: true },
  { name: "design-assets", orgPrefixed: true },
  { name: "exports", orgPrefixed: true },
  { name: "fonts", orgPrefixed: false },
];
