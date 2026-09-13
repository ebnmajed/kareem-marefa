import { NextResponse } from "next/server";

// CSP violation reports (DEC-036). The policy is report-only until the
// reports say it can be enforced. Nothing is stored yet — the reports are
// logged, which is enough to review a preview deployment — and the body is
// capped so this endpoint cannot be used to fill logs.
export async function POST(request: Request) {
  const text = (await request.text()).slice(0, 4096);
  try {
    const body = JSON.parse(text) as { "csp-report"?: Record<string, unknown> };
    const r = body["csp-report"];
    if (r) {
      console.warn(
        `csp-report: ${String(r["violated-directive"] ?? r["effective-directive"] ?? "?")} blocked ${String(r["blocked-uri"] ?? "?")} on ${String(r["document-uri"] ?? "?")}`,
      );
    }
  } catch {
    // not JSON: ignore
  }
  return new NextResponse(null, { status: 204 });
}
