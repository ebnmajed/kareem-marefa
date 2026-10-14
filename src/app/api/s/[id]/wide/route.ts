import { NextResponse } from "next/server";
import { getPublicWidePoster } from "@/lib/dal/sessions";
import { platformConfigured } from "@/lib/supabase/env";

// GET /api/s/{id}/wide — the session poster at 16:9 (1920 × 1080), for the new-session mail (`DEC-289` §5,
// `REQ-NTF-018`). The `og` route's twin and its rules, verbatim: no `service_role`, no signed URL, no public bucket —
// the object is read as whoever asked (a mail client is `anon`), through a policy that admits exactly the
// `landscape` and `og` PNGs of a card-eligible session. A draft, a cancelled session or no render: the same 404.

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!platformConfigured()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const image = await getPublicWidePoster(id);
  if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.bytes.byteLength),
      // As `og`'s: a re-render or a cancellation must stop serving it quickly; a mail client keeps its own copy.
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
