// The capture's transport (REQ-STO-011, REQ-STO-016): the bytes go from the phone STRAIGHT to Storage on a signed URL
// — never through a Server Action (1 MB cap) and never through Vercel — with progress, a timeout, a cancel, and a
// retry with backoff for what is transient (no network, a 5xx, a 408/429). A 4xx is an answer, never retried.

export class UploadError extends Error {
  constructor(
    /** 0 = no response (offline, timeout, CORS); otherwise the HTTP status. */
    readonly status: number,
    /** The server's `{ error }` word when it sent one — `not_authorized`, `file_too_large` … */
    readonly code: string | null = null,
    readonly aborted = false,
  ) {
    super(code ?? (aborted ? "aborted" : `http_${status}`));
  }
  get transient(): boolean {
    return !this.aborted && (this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500);
  }
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  /** Injected by tests; `setTimeout` otherwise. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `fn` until it succeeds, a non-transient error is thrown, or the attempts run out. Backoff 1 s, 2 s, 4 s … with
 *  a little jitter, so a room full of phones on one Wi-Fi does not retry in step. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const sleep = opts.sleep ?? defaultSleep;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (opts.signal?.aborted) throw new UploadError(0, null, true);
    try {
      return await fn(i);
    } catch (e) {
      last = e;
      const transient = e instanceof UploadError ? e.transient : true;
      if (!transient || i === attempts - 1) throw e;
      await sleep(base * 2 ** i + Math.floor(Math.random() * 250));
    }
  }
  throw last;
}

/** POST JSON to one of our routes; the answer's JSON, or an `UploadError` carrying the status and the `{ error }`. */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal, credentials: "same-origin" });
  } catch (e) {
    throw new UploadError(0, null, (e as Error)?.name === "AbortError");
  }
  // ★ A redirect followed to a page (a stale session sent to sign-in) is not a success: it is HTML, not our JSON.
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || res.redirected || json === null) throw new UploadError(res.ok ? 0 : res.status, json?.error ?? null);
  return json;
}

/** Storage's answer to a PUT whose object already exists: `400 { statusCode: "409", error: "Duplicate" }`. The upload
 *  paths are fresh per take and the buckets insert-only (0199 §A — never `x-upsert`), so it means an earlier PUT of this
 *  very take landed and only its answer was lost (story-media.md §1, a). */
export function isAlreadyUploaded(e: unknown): boolean {
  return e instanceof UploadError && (e.status === 409 || ((e.status === 400 || e.status === 409) && /duplicate|already exists/i.test(e.code ?? "")));
}

/** PUT a Blob to a signed URL with progress. XHR, because `fetch` reports no upload progress. */
export function putBlob(
  url: string,
  blob: Blob,
  contentType: string,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => opts.signal?.removeEventListener("abort", abort);
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    // Time to move the bytes on a slow room Wi-Fi: a minute plus a second for every 200 kB.
    xhr.timeout = opts.timeoutMs ?? 60_000 + Math.ceil(blob.size / 200_000) * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
      } else {
        let code: string | null = null;
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string; message?: string; statusCode?: string };
          code = [body.error, body.message].filter(Boolean).join(": ") || null;
        } catch {
          // Not JSON — the status says enough.
        }
        reject(new UploadError(xhr.status, code));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new UploadError(0));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new UploadError(0, "timeout"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new UploadError(0, null, true));
    };
    if (opts.signal?.aborted) return xhr.abort();
    opts.signal?.addEventListener("abort", abort);
    xhr.send(blob);
  });
}
