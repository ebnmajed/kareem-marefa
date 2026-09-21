import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// `/api/webhooks/resend` — 08 §5.2, REQ-NTF-008.
//
// ★ THIS HANDLER HOLDS NOTHING, AND THAT IS THE DESIGN.
//
// Invariant 7: `service_role` is never on Vercel. The only door into
// `email_deliveries` — `update_email_delivery_by_provider()` (0030) — is
// granted to `service_role` alone, so this handler cannot reach it and must
// not be given a key that could.
//
// So it forwards four strings and decides nothing. The signature is verified
// inside `public.resend_webhook()` against a secret that lives in the vault
// and never leaves the database; there is no `RESEND_WEBHOOK_SECRET` on Vercel
// to leak, and rotating it is one statement rather than a redeploy. A handler
// compromised end to end still cannot do more than forward bytes that fail to
// verify.
//
// ★ THE RAW BODY IS THE SIGNED BODY. `request.text()`, never `request.json()`
// and never a re-serialised object: a signature is over bytes, and JSON
// round-tripping reorders keys and rewrites whitespace. Every such body would
// fail to verify for a reason no log would explain.

/** Svix's three headers, which is what Resend sends. */
const ID = "svix-id";
const TIMESTAMP = "svix-timestamp";
const SIGNATURE = "svix-signature";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const id = request.headers.get(ID);
  const timestamp = request.headers.get(TIMESTAMP);
  const signature = request.headers.get(SIGNATURE);

  // ★ 200 ON EVERY OUTCOME BUT AN UNREACHABLE DATABASE.
  //
  // A provider retries a non-2xx for days. A forged body, a stale one, a
  // message this deployment never sent and an event we ignore are all answered
  // and done with — answering 4xx would teach an attacker which of their
  // guesses was closer, and answering 5xx would turn one malformed request
  // into a storm. The only 5xx left is the one a retry can actually fix.
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ status: "rejected" }, { status: 200 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("resend_webhook", {
    p_id: id,
    p_timestamp: timestamp,
    p_signature: signature,
    p_body: body,
  });

  if (error) {
    // Unreachable or misconfigured database: the one case where a retry helps.
    return NextResponse.json({ status: "error" }, { status: 503 });
  }

  const outcome = (data ?? { status: "rejected" }) as { status: string };
  // ★ NEVER THE BODY, NEVER THE SIGNATURE. A webhook body carries a member's
  // email address, and a log line is not the delivery log.
  if (outcome.status !== "applied") {
    console.warn(`[webhooks/resend] ${outcome.status}`);
  }
  return NextResponse.json(outcome, { status: 200 });
}

// A provider sometimes probes the endpoint with a GET before enabling it.
// Nothing here answers one, and a 405 is the honest reply.
export async function GET(): Promise<Response> {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
