// The worker's own reads and writes against Supabase Storage — 07 §4, DEC-047,
// DEC-058. Raw fetch to Storage's REST API with the service-role Bearer
// token, not the @supabase/supabase-js client: worker/package.json carries
// only `pg`, `graphile-worker` and `puppeteer-core`, and this needs nothing
// the SDK provides beyond three requests. `SUPABASE_URL` and
// `SUPABASE_SERVICE_ROLE_KEY` are worker-only variables (04 §10) — never on
// Vercel (CLAUDE.md invariant 7).
//
// Until DEC-058 this file also minted short-lived signed URLs for the
// credential-free converter (DEC-032). With uploads PDF-only and the page
// rendering done by poppler in this image, every content job reads and
// writes its OWN bytes here, the way process_photo.ts always did, and there
// is no third party left to hand a URL to.

function requireEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("content/storage: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
  }
  return { url, key };
}

/** Outbound timeouts — a hung socket would otherwise hold a job (and its lock) forever. A whole
 *  object moves in one request, so a transfer gets far longer than a listing or a delete. */
export const STORAGE_TIMEOUT_MS = 30_000;
export const STORAGE_TRANSFER_TIMEOUT_MS = 120_000;

/** A Storage request that answered with a non-2xx — the status kept so a caller can tell a
 *  missing object (terminal) from an outage (retried). */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/** True when Storage said the object does not exist. Storage answers a missing object with a
 *  404, or — on the versions this project has run — a 400 whose body says `not_found` /
 *  «Object not found»; any other 400 is not a missing object. */
export function isNotFound(e: unknown): boolean {
  if (!(e instanceof StorageError)) return false;
  if (e.status === 404) return true;
  return e.status === 400 && /not[_ ]found/i.test(e.body);
}

/** `a/b c/d?.pdf` → `a/b%20c/d%3F.pdf`: each segment encoded, the separators kept, so a name
 *  holding `?`, `#`, `%` or a space addresses the object rather than a query or a fragment. */
export function encodeObjectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function fail(op: string, bucket: string, path: string, res: Response): Promise<never> {
  const body = await res.text();
  throw new StorageError(`content/storage: ${op} ${bucket}/${path} failed: ${res.status} ${body}`, res.status, body);
}

/** The raw object's bytes — the one read `photos_storage_read` (03 §6) denies to every
 *  RLS-bound client until a `public.photos` row exists (docs/plan/notes/content.md §1.6),
 *  which is exactly why this has to be the worker and not the Route Handler (CLAUDE.md
 *  invariant 7: `service_role` is never on Vercel). */
export async function downloadObject(bucket: string, path: string): Promise<Uint8Array> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeObjectPath(path)}`, {
    headers: { authorization: `Bearer ${key}`, apikey: key },
    signal: AbortSignal.timeout(STORAGE_TRANSFER_TIMEOUT_MS),
  });
  if (!res.ok) await fail("download", bucket, path, res);
  return new Uint8Array(await res.arrayBuffer());
}

/** Overwrites (or creates) the object at `path` — `x-upsert: true` since process_photo.ts writes
 *  the stripped bytes back to the exact path the browser's raw upload used. */
export async function uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeObjectPath(path)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": contentType, "x-upsert": "true" },
    // Node's fetch accepts a Buffer body at runtime; the cast is only for the
    // root tsconfig's mixed DOM+@types/node lib, which (only when the root's
    // broader `tsc --noEmit` walks this file, not worker's own NodeNext
    // build) resolves `BodyInit` to a narrower union that excludes it.
    body: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as BodyInit,
    signal: AbortSignal.timeout(STORAGE_TRANSFER_TIMEOUT_MS),
  });
  if (!res.ok) await fail("upload", bucket, path, res);
}

/** Deletes an object outright — process_photo.ts's DEC-009 path, when a photo's raw bytes sniff
 *  as SVG (or anything else not jpeg/png/webp): the object is removed rather than left sitting in
 *  Storage forever with no `photos` row ever pointing at it. */
export async function deleteObject(bucket: string, path: string): Promise<void> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeObjectPath(path)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${key}`, apikey: key },
    signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
  });
  if (!res.ok) await fail("delete", bucket, path, res);
}

interface ListEntry {
  name: string;
  /** `null` for a folder — Storage's listing is one level deep. */
  id: string | null;
}

/** Every object under `prefix`, walking at most `depth` folders down — the zip job lists one
 *  session's album prefix (builds, then their parts) to delete the builds a new one replaced. */
export async function listObjects(bucket: string, prefix: string, depth = 2): Promise<string[]> {
  const { url, key } = requireEnv();
  const PAGE = 1000;
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`content/storage: list ${bucket}/${prefix} failed: ${res.status} ${await res.text()}`);
    const entries = (await res.json()) as ListEntry[];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        if (depth > 0) out.push(...(await listObjects(bucket, path, depth - 1)));
      } else out.push(path);
    }
    if (entries.length < PAGE) break;
  }
  return out;
}
