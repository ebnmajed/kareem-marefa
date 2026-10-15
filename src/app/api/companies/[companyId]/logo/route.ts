import { NextResponse } from "next/server";
import { readCompanyLogo } from "@/lib/dal/company-logo";

// GET /api/companies/{companyId}/logo?v={assetId} — a company's logo for its own org's members (DEC-298, `0230`;
// REQ-LDR-004, REQ-UIX-079). `/api/avatars/[memberId]`'s shape: the bytes are PROXIED, read as the viewer, so the
// policy re-checks the org on every request — never a redirect to a signed URL (outside `img-src`, uncacheable).
//
// Every refusal is the same 404: no session, another org's company, no logo, a malformed id.

export const runtime = "nodejs";

const NOT_FOUND = new Headers({ "cache-control": "no-store" });

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const version = new URL(request.url).searchParams.get("v") ?? "";

  const logo = await readCompanyLogo(companyId, version);
  if (!logo) return new NextResponse("not_found", { status: 404, headers: NOT_FOUND });

  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      // The SNIFFED type from `design_assets`, never an extension (DEC-009).
      "content-type": logo.contentType,
      "content-length": String(logo.bytes.byteLength),
      // The asset id is the version: a current link never changes under its URL. `private`: one org's members only.
      "cache-control": logo.current ? "private, max-age=86400, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
