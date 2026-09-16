// Which screens carry the phone tab bar, and which own their full-bleed layout.
//
// ★ Read on the CLIENT, from `usePathname()` (`tab-bar.tsx`, `shell-frame.tsx`). The
// first version decided this in `app/layout.tsx` from the `x-pathname` request
// header — right on a full load and WRONG after a client-side navigation, because a
// layout is not re-rendered when only its children change: browse → a session kept
// the tab bar and `<main>`'s container on a screen that has its own bottom action bar
// and band (found by `sessions`, wave 6). A client component still renders on the
// server with the same path, so there is no layout shift on a full load either.

/**
 * Routes where the bar is replaced by that screen's own bottom action bar.
 * Matched against the path with the locale stripped.
 *
 * `/app/sessions/[id]` matches, but `/app/sessions` must not — browse is a
 * list and keeps the tab bar. Hence the trailing-segment test rather than a
 * prefix.
 */
const IMMERSIVE: RegExp[] = [
  /^\/app\/sessions\/[^/]+(\/|$)/, // the event page and everything under it
  /^\/app\/admin\/designer\//, // the studio
  /^\/app\/admin\/emails(\/|$)/, // the email studio
];

export function isImmersive(pathname: string | null): boolean {
  if (!pathname) return false;
  const withoutLocale = pathname.replace(/^\/(ar|en)(?=\/|$)/, "");
  return IMMERSIVE.some((r) => r.test(withoutLocale));
}

/** The event page itself — `/app/sessions/[id]` and nothing under it. It owns its full-bleed
 *  dark band and its own container, and carries the bottom action bar below `md`. */
export function isEventPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/app\/sessions\/[^/]+$/.test(pathname.replace(/^\/(ar|en)(?=\/|$)/, ""));
}
