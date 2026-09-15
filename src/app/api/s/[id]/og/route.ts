import { NextResponse } from "next/server";
import { getPublicCardImage } from "@/lib/dal/sessions";
import { platformConfigured } from "@/lib/supabase/env";

// GET /api/s/{id}/og — the public session card's image, for the link-preview
// crawlers. The owner's decision of 2026-09-15.
//
// ★ HOW THE BYTES GET OUT OF A PRIVATE BUCKET, and the three ways we did NOT
// do it:
//
//   1. NOT `service_role`. It is never on Vercel (invariant 7), and a request
//      any stranger can make is the last place to want a key that bypasses
//      every policy in the product.
//   2. NOT a signed URL in the `og:image` tag. A crawler CACHES that tag and
//      re-fetches the image days later — often long after a five-minute
//      signature has expired, which is a broken preview on the one link that
//      was shared. And it cuts the wrong way too: a signature minted before a
//      session was cancelled keeps working for its whole lifetime, so the
//      image would outlive the card. Reading the object per request stops at
//      the same instant the card does.
//   3. NOT a public `exports` bucket. That bucket holds every poster master,
//      every A3 print PDF and every issued CERTIFICATE, each with somebody's
//      name on it, for every org.
//
//   What we did: `POL-storage.exports.public_card` lets `anon` select exactly
//   the `og.png` objects of card-eligible sessions and nothing else, and this
//   handler reads the object as whoever called it — which for a crawler is
//   `anon`. The authorisation is a policy evaluated by Postgres, not an `if`
//   in this file.
//
// The handler is a plain proxy of those bytes. It does not resize, re-encode
// or compose anything: `@kareem/designer-runtime` is THE renderer (DEC-017,
// D66), and a second image pipeline here — `next/og`, satori, anything — is
// exactly the font-shaping drift the parity suite exists to prevent. The
// `og` preset is 1200×630 and is already rendered by the poster pipeline.

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!platformConfigured()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;

  const image = await getPublicCardImage(id);
  // No card, no poster, a draft, a cancelled session, another org's object:
  // the same 404. Nothing here distinguishes them, for the same reason the
  // card page does not.
  if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.bytes.byteLength),
      // Five minutes, deliberately short for a public image: the poster is
      // re-rendered whenever the session's details change (REQ-DSG-013), and
      // a cancellation must stop serving it quickly. Crawlers keep their own
      // copy far longer than this — that is their cache, not ours, and it is
      // the trade-off the owner accepted.
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
