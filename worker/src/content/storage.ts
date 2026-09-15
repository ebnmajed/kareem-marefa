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

/** The raw object's bytes — the one read `photos_storage_read` (03 §6) denies to every
 *  RLS-bound client until a `public.photos` row exists (docs/plan/notes/content.md §1.6),
 *  which is exactly why this has to be the worker and not the Route Handler (CLAUDE.md
 *  invariant 7: `service_role` is never on Vercel). */
export async function downloadObject(bucket: string, path: string): Promise<Uint8Array> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: { authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) throw new Error(`content/storage: download ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Overwrites (or creates) the object at `path` — `x-upsert: true` since process_photo.ts writes
 *  the stripped bytes back to the exact path the browser's raw upload used. */
export async function uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": contentType, "x-upsert": "true" },
    // Node's fetch accepts a Buffer body at runtime; the cast is only for the
    // root tsconfig's mixed DOM+@types/node lib, which (only when the root's
    // broader `tsc --noEmit` walks this file, not worker's own NodeNext
    // build) resolves `BodyInit` to a narrower union that excludes it.
    body: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`content/storage: upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}

/** Deletes an object outright — process_photo.ts's DEC-009 path, when a photo's raw bytes sniff
 *  as SVG (or anything else not jpeg/png/webp): the object is removed rather than left sitting in
 *  Storage forever with no `photos` row ever pointing at it. */
export async function deleteObject(bucket: string, path: string): Promise<void> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) throw new Error(`content/storage: delete ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
}
