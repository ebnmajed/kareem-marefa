// The upload's two requests (REQ-PRF-017, `platform`'s contract 3, DEC-281 §2): `POST /api/avatars/upload` with the
// JPEG as the raw body, then `GET /api/avatars/upload/{id}` until the worker answers. Route Handlers, not Server
// Actions — the body may be close to 1 MB, and a poll must not queue behind the page's actions.
//
// ★ This is a read loop with its own budget and four named outcomes, not a nudge on a pending control (DEC-146): the
// button is pending because a request is in flight, and the loop ends in exactly one of them.

import type { AvatarUploadState } from "@/lib/avatar-upload";

/** The route's cap, from `platform`'s module — one number for the encoder, the route and the bucket (DEC-281 §2). */
export { MAX_UPLOAD_BYTES } from "@/lib/avatar-upload";
/** The chosen file's cap, before the crop opens (`AVATARS.md`: «أكبر من 20 م.ب»). */
export const MAX_SOURCE_MB = 20;
export const MAX_SOURCE_BYTES = MAX_SOURCE_MB * 1024 * 1024;

export type UploadOutcome = { state: "done"; href: string | null } | { state: "refused" } | { state: "failed" };

/** The waits between reads, in ms — about 20 s in all. */
export const POLL_STEPS = [1000, 1000, 2000, 2000, 4000, 4000, 6000] as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Sends the JPEG and waits for the worker. `refused` is the server's sniff (an SVG renamed `.png`, a GIF); everything
 * else that is not `done` — a non-2xx, a `failed` or `cancelled` state, a 404, a network error, the budget spent — is
 * `failed`. An abort rejects (the member pressed «إلغاء»).
 */
export async function uploadPicture(blob: Blob, signal: AbortSignal, steps: readonly number[] = POLL_STEPS): Promise<UploadOutcome> {
  let uploadId: string;
  try {
    const response = await fetch("/api/avatars/upload", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob, signal });
    if (response.status === 415) return { state: "refused" };
    if (response.status !== 202) return { state: "failed" };
    const body = (await response.json()) as { uploadId?: unknown };
    if (typeof body.uploadId !== "string") return { state: "failed" };
    uploadId = body.uploadId;
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: "failed" };
  }

  for (const wait of steps) {
    await sleep(wait, signal);
    try {
      const response = await fetch(`/api/avatars/upload/${encodeURIComponent(uploadId)}`, { cache: "no-store", signal });
      if (!response.ok) return { state: "failed" };
      const body = (await response.json()) as { state?: AvatarUploadState; href?: unknown };
      if (body.state === "pending") continue;
      if (body.state === "done") return { state: "done", href: typeof body.href === "string" ? body.href : null };
      if (body.state === "refused") return { state: "refused" };
      return { state: "failed" };
    } catch (error) {
      if (signal.aborted) throw error;
      return { state: "failed" };
    }
  }
  return { state: "failed" };
}
