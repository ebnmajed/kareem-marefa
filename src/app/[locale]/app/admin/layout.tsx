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
// screen ships. The template libraries (wave 3) and branding (wave 4) are
// listed since Launch — they had shipped with the flag still false, and the
// owner found them reachable by URL only.
type NavItem = { key: string; href: string; adminOnly: boolean; built: boolean };

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/app/admin", adminOnly: true, built: true },
  { key: "proposals", href: "/app/admin/proposals", adminOnly: true, built: true },
  // SCR-044: a moderator now sees this item too — `admin/sessions/page.tsx`
  // itself branches on role and renders a read-only, attendance-focused
  // list for a moderator, never the admin's management UI.
  { key: "sessions", href: "/app/admin/sessions", adminOnly: false, built: true },
  { key: "venues", href: "/app/admin/venues", adminOnly: true, built: true },
  { key: "categories", href: "/app/admin/categories", adminOnly: true, built: true },
  { key: "companies", href: "/app/admin/companies", adminOnly: true, built: true },
  { key: "members", href: "/app/admin/members", adminOnly: true, built: true },
  { key: "moderationComments", href: "/app/admin/moderation/comments", adminOnly: false, built: true },
  { key: "moderationPhotos", href: "/app/admin/moderation/photos", adminOnly: false, built: true },
  { key: "moderationReports", href: "/app/admin/moderation/reports", adminOnly: false, built: true },
  { key: "scoring", href: "/app/admin/scoring", adminOnly: true, built: true },
  { key: "recognition", href: "/app/admin/recognition", adminOnly: true, built: true },
  // designer's — admin-only per REQ-ADM-013, listed here so their pages
  // pick up this shell the moment they land.
  { key: "templatesPosters", href: "/app/admin/templates/posters", adminOnly: true, built: true },
  { key: "templatesCertificates", href: "/app/admin/templates/certificates", adminOnly: true, built: true },
  { key: "branding", href: "/app/admin/branding", adminOnly: true, built: true },
  { key: "emails", href: "/app/admin/emails", adminOnly: true, built: true },
  { key: "reminders", href: "/app/admin/reminders", adminOnly: true, built: true },
  { key: "exports", href: "/app/admin/exports", adminOnly: true, built: true },
  { key: "audit", href: "/app/admin/audit", adminOnly: false, built: true },
  { key: "settings", href: "/app/admin/settings", adminOnly: true, built: true },
];

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireStaffSession(locale);
  const t = await getTranslations("admin.shell");
  const items = NAV_ITEMS.filter((item) => item.built && (session.role === "admin" || !item.adminOnly));

  return (
    <div>
      {/* ★ REQ-UIX-017 — console pages carry a SECOND skip link, past the
          nav. The app shell's own skip link (`app/layout.tsx`) already
          clears the header/account-menu tab stop and lands on `#main`,
          which is this layout's own root; from there a keyboard user still
          faces this nav's ~20 items before reaching the actual page. That is
          the "long tab trap in front of every console page" `app/layout.tsx`'s
          own comment already names, and it exists today — the visual rail
          replacing this nav is M11's, but the trap it wards off is real now.
          `tabIndex={-1}` so activating the link actually MOVES focus, not
          just scroll position (WebAIM's standard skip-link pattern) — the
          shell's own skip link targets `id="main"` without one; this one
          adds it for correctness rather than silently repeating that gap. */}
      <a href="#admin-content" className="skip-link rounded-field bg-navy-950 px-4 py-2 text-label text-white">
        {t("skipToContent")}
      </a>
      {items.length > 0 ? (
        <nav aria-label={t("brand")} className="border-b border-edge pb-3">
          {/* A wrapping row, not `overflow-x-auto`: an item scrolled out of
              an internally-scrollable strip still reads as "off the page" to
              the 390 px review's own layout-viewport check (and to anyone
              who does not think to swipe a plain nav sideways) — the same
              reasoning that keeps every other screen in this product free of
              horizontal scroll outside a table. Wrapping to two or three
              rows at 390 px is the honest fix, not a scroll a reader has to
              discover. */}
          <ul className="flex flex-wrap items-center gap-1">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="inline-flex h-10 items-center rounded-field px-2 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3"
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
      <div id="admin-content" tabIndex={-1} className={`outline-none ${items.length > 0 ? "mt-8" : "mt-6"}`}>
        {children}
      </div>
    </div>
  );
}
