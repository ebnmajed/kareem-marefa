import { NextResponse } from "next/server";
import { z } from "zod";
import { completeAssetInput, completeAssetUpload } from "@/lib/dal/posters";

// POST /api/designer/assets/complete — REQ-DSG-018, REQ-DSG-020, DEC-009.
//
// Where the bytes are actually judged. The object has landed; this reads it
// back, sniffs it, measures it and writes the row — and deletes the object
// when the answer is no, so nothing is left in the bucket that no row points
// at.
//
// 415 for rejected content rather than 400: the request was well-formed and
// the CONTENT is what was refused. An SVG renamed `.png` arrives here as a
// perfectly valid request carrying a format we do not accept.

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
      return NextResponse.json(result, { status: 201 });
    case "rejected_content":
      return NextResponse.json(result, { status: 415 });
    case "too_small":
      return NextResponse.json(result, { status: 422 });
    case "unreadable":
      return NextResponse.json(result, { status: 422 });
    case "file_too_large":
      return NextResponse.json(result, { status: 413 });
    default:
      return NextResponse.json(result, { status: 403 });
  }
}
