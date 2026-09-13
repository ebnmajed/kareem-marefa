import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";
import { isPlatformPath } from "@/lib/auth/next-path";

// proxy.ts — three jobs, none of them authorization (04 §6, REQ-NFR-003,
// REQ-AUT-005, DEC-036).
//
//   1. next-intl locale routing — the existing behaviour, unchanged.
//   2. A per-request CSP nonce and the security headers. The policy is
//      REPORT-ONLY everywhere in this PR: the frozen marketing routes carry
//      inline scripts and style attributes that a nonce policy would break,
//      and enforcing on the platform routes waits on the report review
//      (DEC-036, OQ-028). Nothing is blocked; violations are reported.
//   3. The optimistic session check for /{locale}/app: cookie presence, and
//      a token refresh when the access token has expired — because this is
//      the only place the refreshed cookies can be written. No database
//      call. A forged cookie passes here and is rejected by getClaims() and
//      RLS at the data, which is the correct ordering.

const intl = createMiddleware(routing);

const PLATFORM_LOCALE = routing.defaultLocale;
// The English catalogue for the platform is not written yet (STORY-INT-004):
// /en/app/* and the auth screens redirect to Arabic; marketing /en stays.
const EN_PLATFORM = /^\/en(\/(app|sign-in|choose-org|no-access)(\/|$))/;

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (EN_PLATFORM.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/en/, `/${PLATFORM_LOCALE}`);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  // On platform routes, forward the nonce and the policy to the render so
  // Next nonces its own inline scripts and a layout can read `x-nonce`. On
  // the frozen marketing routes the policy is a RESPONSE header only: their
  // HTML stays byte-identical (REQ-NFR-019), and the reports simply say what
  // an enforced policy would break there.
  const platform = isPlatformPath(pathname);
  const requestHeaders = new Headers(request.headers);
  if (platform) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy-report-only", csp);
  }
  const forwarded = platform ? new NextRequest(request, { headers: requestHeaders }) : request;

  let response: NextResponse;
  if (platform) {
    response = intl(forwarded);
    const signedIn = await refreshSession(forwarded, response);
    if (!signedIn) {
      const locale = pathname.slice(1, 3);
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/sign-in`;
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      response = NextResponse.redirect(url);
    }
  } else {
    response = intl(forwarded);
  }

  response.headers.set("content-security-policy-report-only", csp);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^http/, "ws")}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
}

/**
 * True when a session cookie is present and verifiable. Refreshes an expired
 * access token and writes the new cookies onto the response. Never touches
 * the database: getClaims() verifies locally against the project's JWKS
 * (asymmetric keys) and only calls Auth to refresh.
 */
async function refreshSession(request: NextRequest, response: NextResponse): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  if (!request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name))) return false;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}

export const config = {
  matcher: "/((?!_next|_vercel|api/csp-report|.*\\..*).*)",
};
