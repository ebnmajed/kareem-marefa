// The two things every photo download route shares — REQ-ADM-021, DEC-178, DEC-182.
//
// ★ A REFUSAL OR A FAILURE IS NEVER A RAW BODY: the person pressed a link or a
// button on the event page, so they go back to it — the request's own
// same-origin Referer, at `#photos` — and the photos slot says what happened.
// Anything else (no Referer, another origin, an unparseable one) falls back to
// the app's home, so this can never be turned into an open redirect.
//
// ★ `?download=photo_failed` / `album_failed`, never `failed` (DEC-182, Q4):
// `failed` is what `sessions`' poster notice fires on, beside the poster.

export type PhotoDownloadOutcome = "photo_failed" | "album_failed" | null;

export function localeOf(request: Request): string {
  const referer = request.headers.get("referer");
  const fromReferer = referer ? /^https?:\/\/[^/]+\/(ar|en)(?:\/|$)/.exec(referer)?.[1] : undefined;
  return fromReferer ?? request.headers.get("x-locale") ?? "ar";
}

/** Back to the page the request came from, at the photos slot, with `outcome` when there is one. */
export function backToPhotos(request: Request, locale: string, outcome: PhotoDownloadOutcome): URL {
  const here = new URL(request.url);
  const referer = request.headers.get("referer");
  let back = new URL(`/${locale}/app`, here);
  if (referer) {
    try {
      const candidate = new URL(referer);
      if (candidate.origin === here.origin) back = candidate;
    } catch {
      // An unparseable Referer is the fallback, not an error.
    }
  }
  back.searchParams.delete("download");
  if (outcome) back.searchParams.set("download", outcome);
  back.hash = "photos";
  return back;
}

export const NO_STORE = { "Cache-Control": "no-store" };
