import { NextResponse } from "next/server";
import {
  exportAllAttendanceCsv,
  exportCertificatesCsv,
  exportMembersCsv,
  exportPointsCsv,
  exportRatingsCsv,
  exportRsvpsCsv,
  exportSessionsCsv,
} from "@/lib/dal/admin-exports";

// GET /api/admin/exports/[type] — SCR-061's six org-wide exports
// (REQ-ADM-017). A Route Handler, never a Server Action (CLAUDE.md): this
// is a download. Authorisation and the audit write both live in each
// `export*Csv()` function (`src/lib/dal/admin-exports.ts`), at the data —
// a non-admin gets 404, same as `ics/route.ts`'s own precedent.

export const runtime = "nodejs";

const EXPORTS: Record<string, { fn: (locale: string) => Promise<string | null>; filenameAr: string }> = {
  sessions: { fn: exportSessionsCsv, filenameAr: "الجلسات" },
  rsvps: { fn: exportRsvpsCsv, filenameAr: "الحجوزات" },
  attendance: { fn: exportAllAttendanceCsv, filenameAr: "الحضور" },
  ratings: { fn: exportRatingsCsv, filenameAr: "التقييمات" },
  points: { fn: exportPointsCsv, filenameAr: "النقاط" },
  certificates: { fn: exportCertificatesCsv, filenameAr: "الشهادات" },
  members: { fn: exportMembersCsv, filenameAr: "الأعضاء" },
};

function contentDisposition(type: string, filenameAr: string): string {
  const utf8 = encodeURIComponent(`${filenameAr}.csv`).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${type}.csv"; filename*=UTF-8''${utf8}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ type: string }> }) {
  // [v16] params is async. Always await.
  const { type } = await params;

  const entry = EXPORTS[type];
  if (!entry) return new NextResponse("not_found", { status: 404 });

  const csv = await entry.fn("ar");
  if (csv === null) return new NextResponse("not_found", { status: 404 });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(type, entry.filenameAr),
      "cache-control": "no-store",
    },
  });
}
