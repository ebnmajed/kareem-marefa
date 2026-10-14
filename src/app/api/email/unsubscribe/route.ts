import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailUnsubscribe } from "@/lib/dal/email-unsubscribe";
import { platformConfigured } from "@/lib/supabase/env";

// POST /api/email/unsubscribe?t=<token> — RFC 8058's one-click unsubscribe, `REQ-NTF-019`, `DEC-289`.
//
// A mail client posts `List-Unsubscribe=One-Click` to the URL in the `List-Unsubscribe` header, with no cookie and no
// page. ★ POST only: a GET is what a link scanner sends, and a scanner must never switch a member's mail off — the
// link in the mail's footer opens `/ar/unsubscribe`, which asks first. The token is the whole authority and the
// database checks it (`apply_email_unsubscribe()`, `0224`). Every outcome is 200 or 400 with no body worth reading:
// nothing here says whether a member or a category exists.

export const runtime = "nodejs";

const Query = z.object({ t: z.string().min(1).max(200) });

export async function POST(request: Request) {
  if (!platformConfigured()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const outcome = await applyEmailUnsubscribe(parsed.data.t);
  return new NextResponse(null, { status: outcome.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
