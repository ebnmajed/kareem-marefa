import type { AdminRailLink } from "@/components/ui";

// The console's destinations — REQ-UIX-084, DEC-226, DEC-227. The lead's: the one table both the rail and the sheet
// read, and the one place a route's role and readiness are decided for the nav.
//
// ★ SIX RULED GROUPS, TWENTY LEAVES, ONE LEVEL (`DEC-226`). `DEC-137`'s fourteen top-level items with three disclosure
// groups are gone; the six groups are the artboard's (`AdminDashboard.dc.html`), in its order. «التذكيرات» sits with
// the points group and `DEC-137`'s «الإشعارات» group dissolves (`DEC-227` §5.4) — no key moves by mistake.
//
// Kept from the old `admin/layout.tsx`, by name (the kept-behaviour table, `notes/wave-21-lead.md`):
//   · `built: false` is never drawn — «a dead link that 404s is worse than a nav item that appears the day its screen
//     ships»;
//   · `adminOnly` hides a route from a moderator, who reaches six (`REQ-ADM-020`): الجلسات, الاستبانات, the three
//     moderation queues, سجل التدقيق;
//   · a plain member reaches none, and the page underneath answers its own not-found — the layout never gates.

export type AdminRole = "admin" | "moderator" | "member";

export interface AdminNavLeaf {
  key: string;
  href: string;
  adminOnly: boolean;
  built: boolean;
  /** The dashboard: current on its own path alone. */
  exact?: boolean;
}

export const ADMIN_NAV: readonly (readonly AdminNavLeaf[])[] = [
  [
    { key: "dashboard", href: "/app/admin", adminOnly: true, built: true, exact: true },
    { key: "proposals", href: "/app/admin/proposals", adminOnly: true, built: true },
    // SCR-044: a moderator sees this item — the page branches on role (a read-only, attendance-focused list).
    { key: "sessions", href: "/app/admin/sessions", adminOnly: false, built: true },
    // ★ 0213 (REQ-ADM-025, DEC-267): an org's announcements — admin only, as 0164's write policies are.
    { key: "announcements", href: "/app/admin/announcements", adminOnly: true, built: true },
    // SCR-065: both staff roles, as `assert_survey_staff()` enforces.
    { key: "surveys", href: "/app/admin/surveys", adminOnly: false, built: true },
  ],
  [
    { key: "members", href: "/app/admin/members", adminOnly: true, built: true },
    { key: "companies", href: "/app/admin/companies", adminOnly: true, built: true },
    { key: "categories", href: "/app/admin/categories", adminOnly: true, built: true },
    { key: "venues", href: "/app/admin/venues", adminOnly: true, built: true },
  ],
  [
    // ★ wave 22 (DEC-230 §3, DEC-231 §5): moderation is TWO screens — comment reports moved to `/moderation/reports`,
    // and `/moderation/comments` redirects there. The leaf stays, unbuilt, so the rail drops to nineteen by the
    // mechanism above rather than by deleting a row a later wave would have to re-derive.
    { key: "moderationComments", href: "/app/admin/moderation/comments", adminOnly: false, built: false },
    { key: "moderationPhotos", href: "/app/admin/moderation/photos", adminOnly: false, built: true },
    { key: "moderationReports", href: "/app/admin/moderation/reports", adminOnly: false, built: true },
  ],
  [
    { key: "scoring", href: "/app/admin/scoring", adminOnly: true, built: true },
    { key: "recognition", href: "/app/admin/recognition", adminOnly: true, built: true },
    { key: "reminders", href: "/app/admin/reminders", adminOnly: true, built: true },
  ],
  [
    // `/app/admin/templates` redirects to `posters` (DEC-178); the studio is reached from a template, never the rail.
    { key: "templates", href: "/app/admin/templates", adminOnly: true, built: true },
    { key: "emails", href: "/app/admin/emails", adminOnly: true, built: true },
    { key: "branding", href: "/app/admin/branding", adminOnly: true, built: true },
  ],
  [
    { key: "exports", href: "/app/admin/exports", adminOnly: true, built: true },
    { key: "audit", href: "/app/admin/audit", adminOnly: false, built: true },
    { key: "settings", href: "/app/admin/settings", adminOnly: true, built: true },
  ],
];

/** A badge for a nav key: the count and its already-pluralised accessible text. */
export type AdminNavCounts = Readonly<Record<string, { count: number; label: string }>>;

/** The rail's groups for a role — plain data, ready to cross into the client rail. */
export function adminRailGroups(role: AdminRole, label: (key: string) => string, counts: AdminNavCounts = {}): AdminRailLink[][] {
  if (role === "member") return [];
  return ADMIN_NAV.map((group) =>
    group
      .filter((leaf) => leaf.built && (role === "admin" || !leaf.adminOnly))
      .map((leaf) => {
        const badge = counts[leaf.key];
        return {
          key: leaf.key,
          href: leaf.href,
          label: label(leaf.key),
          ...(leaf.exact ? { exact: true } : {}),
          ...(badge && badge.count > 0 ? { count: badge.count, countLabel: badge.label } : {}),
        };
      }),
  );
}
