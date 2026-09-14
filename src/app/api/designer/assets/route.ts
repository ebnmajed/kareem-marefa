import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateAssetInput, initiateAssetUpload } from "@/lib/dal/posters";

// POST /api/designer/assets — REQ-DSG-018, REQ-DSG-020, 07 §1.
//
// A Route Handler, not a Server Action: the browser PUTs the bytes directly
// to the signed Storage URL this returns, so an image never traverses this
// process at all. Zod first, before anything else touches the body.
//
// The response carries no extension, on purpose. An asset's type follows the
// SNIFF in the complete step (DEC-009), never the filename the browser sent
// — so there is nothing here for a caller to lie about.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = initiateAssetInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });

  const result = await initiateAssetUpload(locale, parsed.data);
  if ("status" in result) {
    if (result.status === "file_too_large") return NextResponse.json(result, { status: 413 });
    return NextResponse.json(result, { status: 403 });
  }
  return NextResponse.json(result, { status: 201 });
}
