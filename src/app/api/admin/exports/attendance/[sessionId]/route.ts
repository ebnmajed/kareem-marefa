import { NextResponse } from "next/server";
import { exportAttendanceCsv } from "@/lib/dal/admin-exports";

// GET /api/admin/exports/attendance/[sessionId] — SCR-044's CSV (REQ-CHK-012,
// REQ-ADM-017). A Route Handler, never a Server Action (CLAUDE.md): this is
// a download, not a mutation. Authorisation and the audit write both live in
// `exportAttendanceCsv` (`src/lib/dal/admin-exports.ts`), at the data —
// a non-admin gets 404, indistinguishable from a session that does not
// exist, the same answer `ics/route.ts` gives for the same reason.

export const runtime = "nodejs";

function contentDisposition(sessionId: string, title: string): string {
  const utf8 = encodeURIComponent(`حضور-${title}.csv`).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="attendance-${sessionId}.csv"; filename*=UTF-8''${utf8}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  // [v16] params is async. Always await.
  const { sessionId } = await params;

  const result = await exportAttendanceCsv("ar", sessionId);
  if (!result) return new NextResponse("not_found", { status: 404 });

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(sessionId, result.sessionTitle),
      "cache-control": "no-store",
    },
  });
}
