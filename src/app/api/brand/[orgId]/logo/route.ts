import { NextResponse } from "next/server";
import { getPublicOrgLogo } from "@/lib/brand/public-logo";
import { platformConfigured } from "@/lib/supabase/env";

// GET /api/brand/{orgId}/logo — an active org's logo, for a MAIL CLIENT.
// `04` §4 (DEC-161), `0126`, REQ-NTF-014, REQ-DSG-021.
//
// A mail is opened with no session, often months after it was sent, and
// `design-assets` is a private bucket whose every app-minted URL is a
// five-minute signature. This is `/api/s/{id}/og`'s answer, for one more
// object, and that file's header sets out the three things neither route does:
// no `service_role` (invariant 7), no signed URL, no public bucket. A POLICY
// lets `anon` select exactly the PNG or JPEG an active org's brand kit names
// as its logo; this handler reads it as whoever called and proxies the bytes.
//
// It does not resize, re-encode or compose: the upload route already sniffed
// the bytes and refused anything that is not a raster image (DEC-009), and the
// content type served is the SNIFFED one from `design_assets`, never the
// file's extension.
//
// No org, a suspended org, an org with no logo, a WebP logo, a malformed id:
// the same 404, and nothing distinguishes them.

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  if (!platformConfigured()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { orgId } = await params;

  const logo = await getPublicOrgLogo(orgId);
  if (!logo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.contentType,
      "content-length": String(logo.bytes.byteLength),
      // An hour, not the public card's five minutes: a logo changes rarely and
      // nothing about it is time-critical the way a cancelled session's poster
      // is. Mail proxies (Gmail's among them) keep their own copy far longer —
      // that is their cache, not ours. A replaced logo is refused by the policy
      // the moment the brand kit changes; this only bounds how long an edge
      // keeps serving the old bytes it already has.
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      // The bytes are an org's own upload. Never let them be framed or run.
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
