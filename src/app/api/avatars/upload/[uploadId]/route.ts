import { NextResponse } from "next/server";
import { readAvatarUpload } from "@/lib/dal/avatars";

// GET /api/avatars/upload/{uploadId} — the sheet's poll (DEC-281; REQ-PRF-017). A Route Handler so a poll never
// queues behind the page's Server Actions.
//
//   200 { state: "pending" | "refused" | "failed" | "cancelled", href: null }
//   200 { state: "done", href }    — `avatarHref(…, 192)` of the new version, same-origin
//   404                            — no session, another member's id, an unknown or malformed one: all the same

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const upload = await readAvatarUpload(uploadId);
  if (!upload) return new NextResponse("not_found", { status: 404, headers: NO_STORE });
  return NextResponse.json(upload, { headers: NO_STORE });
}
