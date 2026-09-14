import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaffSession } from "@/lib/dal/admin-dashboard";

// The admin console shell — `app/admin/**`'s one shared layout.
//
// The staff gate lives in the DAL (`requireStaffSession`, src/lib/dal/
// admin-dashboard.ts), not here: a layout does not re-render on navigation
// under Partial Rendering [v16], so it is the boundary for "reaches the
// console at all" but never the boundary for what a given screen shows —
// every page under here still runs its own narrower check (most are
// admin-only; `listVenuesForAdmin`'s `role !== "admin" → null` is the
// pattern this track inherited and keeps using).
//
// The route list below is published for `designer`, whose three folders
// (`designer/`, `templates/`, `sessions/[id]/certificates/`) render inside
// this same shell — see docs/plan/notes/console.md for the full table this
// is generated from, and never change a path here without telling the lead.
// `built: false` items are left out of the rendered nav on purpose: a
// dead link that 404s is worse than a nav item that appears the day its
// screen ships. `/app/admin/branding` (SCR-059, wave 4, DEC-048 Decision 2)
// is never listed at all.
type NavItem = { key: string; href: string; adminOnly: boolean; built: boolean };

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/app/admin", adminOnly: true, built: true },
  { key: "proposals", href: "/app/admin/proposals", adminOnly: true, built: true },
  // Moderator scoping (a read-only, attendance-focused view of this same
  // route) is SCR-044's story (console.md) — `adminOnly` flips once that
  // DAL scoping exists, not before.
  { key: "sessions", href: "/app/admin/sessions", adminOnly: true, built: true },
  { key: "venues", href: "/app/admin/venues", adminOnly: true, built: true },
  { key: "categories", href: "/app/admin/categories", adminOnly: true, built: true },
  { key: "companies", href: "/app/admin/companies", adminOnly: true, built: true },
  { key: "members", href: "/app/admin/members", adminOnly: true, built: false },
  { key: "moderationComments", href: "/app/admin/moderation/comments", adminOnly: false, built: false },
  { key: "moderationPhotos", href: "/app/admin/moderation/photos", adminOnly: false, built: false },
  { key: "moderationReports", href: "/app/admin/moderation/reports", adminOnly: false, built: false },
  { key: "scoring", href: "/app/admin/scoring", adminOnly: true, built: true },
  { key: "recognition", href: "/app/admin/recognition", adminOnly: true, built: true },
  // designer's — admin-only per REQ-ADM-013, listed here so their pages
  // pick up this shell the moment they land.
  { key: "templatesPosters", href: "/app/admin/templates/posters", adminOnly: true, built: false },
  { key: "templatesCertificates", href: "/app/admin/templates/certificates", adminOnly: true, built: false },
  { key: "emails", href: "/app/admin/emails", adminOnly: true, built: true },
  { key: "reminders", href: "/app/admin/reminders", adminOnly: true, built: true },
  { key: "exports", href: "/app/admin/exports", adminOnly: true, built: false },
  { key: "audit", href: "/app/admin/audit", adminOnly: false, built: false },
  { key: "settings", href: "/app/admin/settings", adminOnly: true, built: false },
];

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireStaffSession(locale);
  const t = await getTranslations("admin.shell");
  const items = NAV_ITEMS.filter((item) => item.built && (session.role === "admin" || !item.adminOnly));

  return (
    <div>
      {items.length > 0 ? (
        <nav aria-label={t("brand")} className="border-b border-edge pb-3">
          <ul className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="inline-flex h-10 items-center rounded-field px-3 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p className="max-w-2xl text-body text-fg-muted">{t("moderatorEmpty")}</p>
      )}
      <div className={items.length > 0 ? "mt-8" : "mt-6"}>{children}</div>
    </div>
  );
}
