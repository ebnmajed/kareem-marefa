import { NextResponse } from "next/server";
import { z } from "zod";
import { completeMaterialUpload, materialKindSchema } from "@/lib/dal/materials";

// POST /api/upload/material/complete — REQ-MAT-012, DEC-009, 07 §1/§2.1.
//
// ★ The one place an SVG renamed `.png` is rejected: `completeMaterialUpload()`
// downloads the OBJECT ITSELF and sniffs its bytes — never the declared kind,
// never the filename's extension, never a client-supplied Content-Type. A
// mismatch deletes the object before this ever returns 200, so it is never
// given a retrievable URL (REQ-MAT-012).

export const runtime = "nodejs";

const completeInput = z.object({
  materialId: z.uuid(),
  path: z.string().trim().min(1).max(1024),
  declaredKind: materialKindSchema.exclude(["video_link", "external_link"]),
});

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = completeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const result = await completeMaterialUpload(locale, parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "unknown_error";
  if (message === "not_authorized") return NextResponse.json({ error: message }, { status: 403 });
  if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
  if (message.startsWith("sniff_mismatch")) {
    const [, sniffedKind] = message.split(":");
    return NextResponse.json({ error: "sniff_mismatch", sniffedKind }, { status: 415 });
  }
  if (message.startsWith("file_too_large")) {
    const [, limitMb] = message.split(":");
    return NextResponse.json({ error: "file_too_large", limitMb: Number(limitMb) }, { status: 413 });
  }
  return NextResponse.json({ error: "upload_failed" }, { status: 500 });
}
