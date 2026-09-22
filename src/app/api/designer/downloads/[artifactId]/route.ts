import { NextResponse } from "next/server";
import { z } from "zod";
import { recordExportDownload } from "@/lib/dal/posters";

// GET /api/designer/downloads/{artifactId} — THE download, REQ-DSG-027,
// REQ-ADM-021, DEC-176 contract 1, DEC-177, DEC-178.
//
// ★ EVERY FILE A PERSON TAKES AWAY COMES THROUGH HERE: «تنزيل الملصق» on the
// event page and the hub, a certificate on SCR-045, a member's own certificate
// on /app/me/certificates, and the studio's export panel. A URL signed at
// render time behind a bare `<a download>` writes no audit row on the click;
// this route audits first (`record_export_download()`, which also decides who
// may) and only then redirects to the one signer's five-minute URL.
//
// ★ A REFUSAL OR A FAILURE IS NEVER A RAW BODY (DEC-178, `sessions`' R4): the
// person clicked a link on a page, so they go back to that page with
// `?download=failed` and the page says so. The page is the request's own
// same-origin Referer; anything else — none, or another origin — falls back to
// the app's home, so this can never be turned into an open redirect.
//
// GET with a side effect is deliberate: the link is a plain `<a>`, never a
// `<Link>`, so nothing prefetches it, and a download is exactly one audit row.

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function backTo(request: Request, locale: string): URL {
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
  back.searchParams.set("download", "failed");
  return back;
}

function localeOf(request: Request): string {
  const referer = request.headers.get("referer");
  const fromReferer = referer ? /^https?:\/\/[^/]+\/(ar|en)(?:\/|$)/.exec(referer)?.[1] : undefined;
  return fromReferer ?? request.headers.get("x-locale") ?? "ar";
}

export async function GET(request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;
  const locale = localeOf(request);
  if (!z.uuid().safeParse(artifactId).success) {
    return NextResponse.redirect(backTo(request, locale), { status: 303, headers: NO_STORE });
  }

  const result = await recordExportDownload(locale, artifactId);
  if (result.status !== "ok") {
    return NextResponse.redirect(backTo(request, locale), { status: 303, headers: NO_STORE });
  }
  return NextResponse.redirect(result.url, { status: 303, headers: NO_STORE });
}
