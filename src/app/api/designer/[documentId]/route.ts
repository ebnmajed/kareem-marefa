import { NextResponse } from "next/server";
import { z } from "zod";
import { autosaveInput, saveDesignDocument } from "@/lib/dal/designer";

// PUT /api/designer/{documentId} — SCR-057's autosave, REQ-DSG-005, 06 §10.
//
// A ROUTE HANDLER, NOT A SERVER ACTION, and the reason is a hard limit rather
// than a preference: Server Actions cap the request body at 1 MB (`04` §4.2)
// and a layer tree exceeds it. An autosave that fails at the cap fails after
// the admin has already done the work, which is the one failure an editor
// must not have.
//
// Zod first, before anything else touches the body (CLAUDE.md, Validation) —
// and then the document tree itself is validated by the runtime's own
// `validateDocument()`, the same function the worker runs before it drives
// Chromium. Validation checks SHAPE; authority is re-derived server-side by
// the DAL from the session, and the actual boundary is `p2_admin_update`
// (03 §5.9) on the caller's own client.

export const runtime = "nodejs";

/** A layer tree is large by design; something in the megabytes is a program,
 *  not a poster. Rejected before the body is parsed, not after. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!z.uuid().safeParse(documentId).success) {
    return NextResponse.json({ error: "invalid_document_id" }, { status: 400 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "document_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = autosaveInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const locale = request.headers.get("x-locale") ?? "ar";
  const result = await saveDesignDocument(locale, documentId, parsed.data);

  switch (result.status) {
    case "saved":
      return NextResponse.json(result, { status: 200 });
    case "invalid":
      // The issues carry a path and a code each, so the editor can point at
      // the layer rather than saying "something is wrong".
      return NextResponse.json(result, { status: 422 });
    case "conflict":
      // Another admin saved since this editor loaded. Refused, never merged:
      // silently discarding someone's layout is not recoverable.
      return NextResponse.json(result, { status: 409 });
    case "locked_region":
      return NextResponse.json(result, { status: 409 });
    case "not_authorized":
      return NextResponse.json(result, { status: 403 });
  }
}
