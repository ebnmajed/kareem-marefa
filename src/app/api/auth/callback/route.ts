import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { platformConfigured } from "@/lib/supabase/env";
import { destinationFor, PLATFORM_LOCALE, provision } from "@/lib/auth/flow";

// Google returns here. Exchange the code, provision (or recognise) the
// member, refresh the token so it carries the org claims, and land where
// the member was going. Every failure lands on a screen with an
// explanation in Arabic — never a blank page, never a redirect loop
// (REQ-AUT-006).
export async function GET(request: NextRequest) {
  if (!platformConfigured()) return new NextResponse(null, { status: 404 }); // DEC-038
  const url = request.nextUrl;
  const next = url.searchParams.get("next");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const signIn = new URL(`/${PLATFORM_LOCALE}/sign-in`, request.url);

  if (oauthError || !code) {
    // A refused sign-up (0007_before_user_created_hook) arrives as an OAuth
    // error whose description carries our identifier.
    const description = url.searchParams.get("error_description") ?? "";
    signIn.searchParams.set("error", /domain_not_allowed/.test(description) ? "domain" : "1");
    return NextResponse.redirect(signIn, 303);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    signIn.searchParams.set("error", "1");
    return NextResponse.redirect(signIn, 303);
  }

  const envelope = await provision(supabase);
  if (envelope.status === "no_match") {
    // ★ A platform admin belongs to no org, so `no_match` is their ordinary answer — and with no org
    // left at all it is everyone's (DEC-253 §7.1, DEC-261). Their session is kept and they land on the
    // console; the table is the answer, never the claim (`assert_platform_admin` raises 42501 otherwise).
    const { error: notPlatformAdmin } = await supabase.rpc("assert_platform_admin");
    if (!notPlatformAdmin) {
      return NextResponse.redirect(new URL(`/${PLATFORM_LOCALE}/app/platform`, request.url), 303);
    }
    // Defence in depth behind the before-user-created hook: no session is
    // kept for an account the platform does not recognise.
    await supabase.auth.signOut();
  } else if (envelope.status === "provisioned") {
    // The token in hand predates the member row; the hook adds the claims
    // on the next issue.
    await supabase.auth.refreshSession();
  }
  return NextResponse.redirect(new URL(destinationFor(envelope, next), request.url), 303);
}
