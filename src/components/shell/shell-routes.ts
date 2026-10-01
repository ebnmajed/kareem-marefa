// Which parts of the shell a route wears. One place, read by the tab bar, the
// navigation rail and the frame, so the three can never disagree (REQ-UIX-054).
//
// Every test here is on the path with the locale stripped.

/**
 * Routes where the tab bar is replaced by that screen's own bottom action bar.
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

/** The console: it has its own rail and its own width (DEC-199 §1.1), so the member's
 *  navigation rail never stands beside it. */
const CONSOLE = /^\/app\/(admin|platform)(\/|$)/;

const strip = (pathname: string) => pathname.replace(/^\/(ar|en)(?=\/|$)/, "");

export function isImmersive(pathname: string | null): boolean {
  if (!pathname) return false;
  const path = strip(pathname);
  return IMMERSIVE.some((r) => r.test(path));
}

/** The event page itself — `/app/sessions/[id]` and nothing under it. It owns its full
 *  width and carries the bottom action bar below `lg`. */
export function isEventPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/app\/sessions\/[^/]+$/.test(strip(pathname));
}

export function isConsole(pathname: string | null): boolean {
  if (!pathname) return false;
  return CONSOLE.test(strip(pathname));
}

/** The member's three-column frame: every route that is neither immersive nor the
 *  console. The event page owns its band and its width (`M10a.md` §0). */
export function hasNavRail(pathname: string | null): boolean {
  if (!pathname) return false;
  return !isImmersive(pathname) && !isConsole(pathname);
}

/** ★ wave 18 (DEC-207 Q2, DEC-209): routes whose PHONE top row is the page's own. `Browse.dc.html` draws
 *  the page's title and the bell in one row and no wordmark; the event page, check-in and the host view draw
 *  their own back or close control. Below `lg` the shell's row gives way to it; from `lg` the shell's bar is
 *  always there (`EventDesktop.dc.html` draws it). */
const OWN_TOP_ROW = /^\/app\/sessions(\/[^/]+(\/(check-in|host))?)?$/;

export function ownsTopRow(pathname: string | null): boolean {
  if (!pathname) return false;
  return OWN_TOP_ROW.test(strip(pathname));
}

/** ★ wave 18 (DEC-209): routes that carry a fixed bottom `action-bar` of their own — the event page and
 *  check-in — so `<main>` clears it as it clears the tab bar. */
export function hasActionBar(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/app\/sessions\/[^/]+(\/check-in)?$/.test(strip(pathname));
}

/** The path the tab bar and the rail compare their links with. */
export function shellPath(pathname: string | null): string {
  return strip(pathname ?? "");
}
