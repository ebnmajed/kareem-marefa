// REQ-AUT-005: sign-in preserves the intended destination — a poster QR
// scanned while signed out must land on that session, not on a dashboard.
// The value is validated as an internal path before use; anything else is
// discarded. Pure, so it is unit-tested and shared by proxy, the sign-in
// route and the callback.

import { routing } from "@/i18n/routing";

const LOCALES = routing.locales as readonly string[];

/** The platform's home for a locale. */
export function appHome(locale: string): string {
  return `/${LOCALES.includes(locale) ? locale : routing.defaultLocale}/app`;
}

/**
 * Returns `candidate` if it is a safe internal path — starts with a single
 * `/`, carries no scheme or host, and points into the platform — otherwise
 * the app home. Query strings are kept; fragments are dropped.
 */
export function safeNextPath(candidate: string | null | undefined, locale: string): string {
  const fallback = appHome(locale);
  if (!candidate) return fallback;
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }
  // Only a root-relative path. `//host`, `/\host`, `http:`, `javascript:`
  // and friends all fail here.
  if (!/^\/(?![/\\])/.test(decoded)) return fallback;
  // No whitespace and no control character. Written with explicit escapes:
  // the class once carried the two range endpoints as literal invisible
  // bytes, which a viewer hides and a formatter can strip — one reader took
  // the class for «space or hyphen», which would have discarded every uuid.
  if (/[\s\u0000-\u001f]/.test(decoded)) return fallback;
  const withoutFragment = decoded.split("#")[0];
  // Must be a localised platform route.
  const m = withoutFragment.match(/^\/([a-z]{2})(\/app(?:\/|$|\?))/);
  if (!m || !LOCALES.includes(m[1])) return fallback;
  return withoutFragment;
}

/** True for a path under `/{locale}/app`. */
export function isPlatformPath(pathname: string): boolean {
  return /^\/[a-z]{2}\/app(\/|$)/.test(pathname);
}

/** True for the unauthenticated platform screens (SCR-002 … SCR-004). */
export function isAuthScreenPath(pathname: string): boolean {
  return /^\/[a-z]{2}\/(sign-in|choose-org|no-access)(\/|$)/.test(pathname);
}

/**
 * True for the PUBLIC platform routes — platform code that serves a visitor
 * with no session: `/verify/[code]` (SCR-006, REQ-CRT-007), `/legal/*`
 * (SCR-005) and `/s/[id]` (the public session card, post-launch — the
 * owner's decision to let a shared link preview). They are outside `isPlatformPath()` on purpose — a stranger
 * holding a printed certificate must never be redirected to sign-in — but
 * they are platform code all the same, so they carry the platform's CSP
 * nonce and answer 404 while the platform is unconfigured (DEC-038).
 * `/verify` served a 500 on the live site until wave 3 guarded the page
 * itself (`notes/designer.md` §2.10); this predicate is the honest fix.
 */
export function isPublicPlatformPath(pathname: string): boolean {
  // ★ wave 30 (REQ-NTF-019): `/unsubscribe` — a member stops a message from the message, signed in or not.
  return /^\/[a-z]{2}\/(verify|legal|s|unsubscribe)(\/|$)/.test(pathname);
}

/**
 * Every route DEC-038's unconfigured gate covers: the session-required
 * platform, the auth screens, and the public platform routes. The frozen
 * marketing routes (`/`, `/{locale}`, `/{locale}/register`) never match.
 */
export function isUnconfiguredGatedPath(pathname: string): boolean {
  return isPlatformPath(pathname) || isAuthScreenPath(pathname) || isPublicPlatformPath(pathname);
}
