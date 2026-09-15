import { NextResponse } from "next/server";
import { z } from "zod";
import { completeAssetInput, completeAssetUpload } from "@/lib/dal/posters";
import { ppiAtA3 } from "@/lib/brand/ppi";

// POST /api/admin/branding/logo/complete — SCR-059, REQ-DSG-018, REQ-DSG-019, REQ-DSG-021.
//
// Where the bytes are actually judged (DEC-009: on the sniffed content,
// after the object has landed — never the filename). Wraps the same
// `completeAssetUpload()` `/api/designer/assets/complete` uses, and adds
// the one thing SCR-059 needs that a generic asset upload does not: the
// PPI this image yields at A3, stated the moment the org can see it.
//
// 415 for rejected content, not 400 — the request was well-formed; the
// CONTENT is what was refused. An SVG renamed `.png` (DEC-009) arrives here
// as a perfectly valid request carrying a format the brand kit never accepts.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = completeAssetInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });

  const result = await completeAssetUpload(locale, parsed.data);
  switch (result.status) {
    case "ok":
      return NextResponse.json({ ...result, a3: ppiAtA3(result.width, result.height) }, { status: 201 });
    case "rejected_content":
      return NextResponse.json(result, { status: 415 });
    case "too_small":
    case "unreadable":
      return NextResponse.json(result, { status: 422 });
    case "file_too_large":
      return NextResponse.json(result, { status: 413 });
    default:
      return NextResponse.json(result, { status: 403 });
  }
}
