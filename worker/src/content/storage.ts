// Signed Storage URLs for the converter (DEC-032: it holds no credentials
// of its own — it gets two short-lived signed URLs per request and
// nothing else). Raw fetch to Supabase Storage's REST API, not the
// @supabase/supabase-js client: worker/package.json carries only `pg` and
// `graphile-worker`, and this needs nothing the SDK provides beyond two
// POSTs. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are new worker env vars
// — flagged to the lead alongside `CONVERTER_URL` (docs/plan/notes/
// content.md §3b): this is the worker's first time talking to Supabase's
// REST surface at all rather than only its own `DATABASE_URL`.

function requireEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("content/storage: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
  }
  return { url, key };
}

/** A signed GET URL, valid for `expiresInSeconds` (default 5 minutes, matching
 *  the source-download expiry 07 §6 sets for `materials`). */
export async function signReadUrl(bucket: string, path: string, expiresInSeconds = 300): Promise<string> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`content/storage: sign (read) ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error(`content/storage: sign (read) ${bucket}/${path} returned no signedURL`);
  return `${url}/storage/v1${data.signedURL}`;
}

/** A signed PUT URL — the converter uploads directly to it with a plain
 *  `PUT`, no extra header (converter/server.mjs's own `upload()`), so the
 *  token in the query string has to be everything it needs. */
export async function signUploadUrl(bucket: string, path: string): Promise<string> {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/upload/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) throw new Error(`content/storage: sign (upload) ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error(`content/storage: sign (upload) ${bucket}/${path} returned no url`);
  return `${url}/storage/v1${data.url}`;
}
