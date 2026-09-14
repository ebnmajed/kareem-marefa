import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateMaterialUpload, initiateMaterialUploadInput } from "@/lib/dal/materials";

// POST /api/upload/material — REQ-MAT-001, REQ-MAT-002, REQ-MAT-009, 07 §1.
//
// A Route Handler, not a Server Action: this hands the browser a signed
// Storage URL and the browser PUTs the bytes directly there — the bytes
// never traverse this process at all (07 §1's whole point; a 200 MB audio
// body through a Server Action's 1 MB cap, or even an uncapped function,
// is a timeout and a bill for nothing).
//
// Zod first, before anything else touches the body (CLAUDE.md, Validation).
// Authorisation is not re-derived here by hand — `initiateMaterialUpload()`
// performs the insert through the caller's own RLS-bound client, so
// `p8_presenter_write` (03 §5.5) is the actual boundary; a 403 below is
// this route translating that policy's refusal into a response shape a
// client can read, not a second authority check.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = initiateMaterialUploadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const result = await initiateMaterialUpload(locale, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "unknown_error";
  if (message === "not_authorized") return NextResponse.json({ error: message }, { status: 403 });
  if (message.startsWith("file_too_large")) {
    const [, limitMb] = message.split(":");
    return NextResponse.json({ error: "file_too_large", limitMb: Number(limitMb) }, { status: 413 });
  }
  return NextResponse.json({ error: "upload_failed" }, { status: 500 });
}
