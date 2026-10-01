// The member's destinations, once. The tab bar draws five of them and the
// navigation rail the same five as a column (REQ-UIX-054, DEC-205 §2).
//
// ★ «الأعضاء» is drawn in the rail's artboard and is NOT here: `/app/members`
// has no index on disk (`SCR-019`, batch M10b), and the rail links only to
// routes that exist (DEC-206 §4.31).
export type NavKey = "home" | "sessions" | "propose" | "board" | "me";

export const NAV: { key: NavKey; href: string; current: (path: string) => boolean }[] = [
  { key: "home", href: "/app", current: (p) => p === "/app" },
  { key: "sessions", href: "/app/sessions", current: (p) => p === "/app/sessions" || p.startsWith("/app/sessions/") },
  { key: "propose", href: "/app/propose", current: (p) => p.startsWith("/app/propose") },
  { key: "board", href: "/app/leaderboards", current: (p) => p.startsWith("/app/leaderboards") },
  { key: "me", href: "/app/me", current: (p) => p.startsWith("/app/me") || p.startsWith("/app/members/") },
];
