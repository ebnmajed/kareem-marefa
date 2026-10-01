// The member's destinations, once. The tab bar draws five of them and the
// navigation rail the same five as a column (REQ-UIX-054, DEC-205 §2).
//
// ★ «الأعضاء» is the rail's alone (`MEMBERS` below): the tab bar keeps five
// (DEC-205 §2). It joined when `/app/members` was built (wave 19, DEC-213 §3.3).
export type NavKey = "home" | "sessions" | "propose" | "board" | "me";

export const NAV: { key: NavKey; href: string; current: (path: string) => boolean }[] = [
  { key: "home", href: "/app", current: (p) => p === "/app" },
  { key: "sessions", href: "/app/sessions", current: (p) => p === "/app/sessions" || p.startsWith("/app/sessions/") },
  { key: "propose", href: "/app/propose", current: (p) => p.startsWith("/app/propose") },
  { key: "board", href: "/app/leaderboards", current: (p) => p.startsWith("/app/leaderboards") },
  // ★ wave 19 (DEC-213 §3.3): another member's profile is «الأعضاء», not «حسابي».
  // `startsWith("/app/me")` alone would match «/app/members».
  { key: "me", href: "/app/me", current: (p) => p === "/app/me" || p.startsWith("/app/me/") },
];

/** The directory (`SCR-019`), current on it and on every profile. The rail draws it after «الجلسات»;
 *  the phone reaches it from the account menu and from a profile's breadcrumb. */
export const MEMBERS = { key: "members" as const, href: "/app/members", current: (p: string) => p === "/app/members" || p.startsWith("/app/members/") };
