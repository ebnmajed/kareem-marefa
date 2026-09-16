import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaffSession } from "@/lib/dal/admin-dashboard";
import { AdminRail, type AdminRailItem } from "@/components/admin/admin-rail";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BellIcon,
  BookmarkFilledIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  GearIcon,
  HomeIcon,
  ImageIcon,
  LockIcon,
  PaletteIcon,
  PinIcon,
  StarIcon,
  TagIcon,
  UserIcon,
} from "@/components/ui/icons";

// The admin console shell — `app/admin/**`'s one shared layout, rebuilt onto
// the system for wave 6 (`16` §6.7, `DEC-130`). A left rail replaces the flat
// wrapping nav strip; `docs/plan/notes/console.md`'s "Wave 6" §1 is the plan
// this implements.
//
// The staff gate lives in the DAL (`requireStaffSession`, src/lib/dal/
// admin-dashboard.ts), not here: a layout does not re-render on navigation
// under Partial Rendering [v16], so it is the boundary for "reaches the
// console at all" but never the boundary for what a given screen shows —
// every page under here still runs its own narrower check (most are
// admin-only; `listVenuesForAdmin`'s `role !== "admin" → null` is the
// pattern this track inherited and keeps using).
//
// The route list below is published for `designer` and every other track
// whose routes render inside this shell — see docs/plan/notes/console.md for
// the table this is generated from, and never change a path here without
// telling the lead. `built: false` items are left out of the rendered nav on
// purpose: a dead link that 404s is worse than a nav item that appears the
// day its screen ships. All 19 currently listed routes are built; none is
// added or removed this wave, only re-skinned onto the rail (`DEC-130`'s
// ruling: the 14-group IA of `16` §6.7 is a wave-7 question).
type NavItem = { key: string; href: string; adminOnly: boolean; built: boolean; Icon: AdminRailItem["Icon"] };

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/app/admin", adminOnly: true, built: true, Icon: HomeIcon },
  { key: "proposals", href: "/app/admin/proposals", adminOnly: true, built: true, Icon: CheckCircleIcon },
  // SCR-044: a moderator now sees this item too — `admin/sessions/page.tsx`
  // itself branches on role and renders a read-only, attendance-focused
  // list for a moderator, never the admin's management UI.
  { key: "sessions", href: "/app/admin/sessions", adminOnly: false, built: true, Icon: CalendarIcon },
  { key: "venues", href: "/app/admin/venues", adminOnly: true, built: true, Icon: PinIcon },
  { key: "categories", href: "/app/admin/categories", adminOnly: true, built: true, Icon: TagIcon },
  { key: "companies", href: "/app/admin/companies", adminOnly: true, built: true, Icon: BuildingIcon },
  { key: "members", href: "/app/admin/members", adminOnly: true, built: true, Icon: UserIcon },
  { key: "moderationComments", href: "/app/admin/moderation/comments", adminOnly: false, built: true, Icon: AlertCircleIcon },
  { key: "moderationPhotos", href: "/app/admin/moderation/photos", adminOnly: false, built: true, Icon: ImageIcon },
  { key: "moderationReports", href: "/app/admin/moderation/reports", adminOnly: false, built: true, Icon: AlertTriangleIcon },
  { key: "scoring", href: "/app/admin/scoring", adminOnly: true, built: true, Icon: StarIcon },
  // ★ `recognition` does NOT reuse `StarIcon`: it is adjacent to `scoring` in
  // this list, and two neighbouring rail items sharing one glyph is a real
  // scanning problem (the same one `TagIcon`/`BuildingIcon` were requested to
  // fix for `categories`/`companies`). `BookmarkFilledIcon` — "marked as
  // notable" — is the nearest fit already in the set.
  { key: "recognition", href: "/app/admin/recognition", adminOnly: true, built: true, Icon: BookmarkFilledIcon },
  { key: "templatesPosters", href: "/app/admin/templates/posters", adminOnly: true, built: true, Icon: ImageIcon },
  // ★ Same reasoning as `recognition`: `templatesCertificates` sits right
  // beside `templatesPosters`, so it does not reuse `ImageIcon` either.
  // `CheckCircleIcon` — already used for `proposals`, far enough away in the
  // list not to collide — reads as "a completed, verified document", which a
  // certificate literally is.
  { key: "templatesCertificates", href: "/app/admin/templates/certificates", adminOnly: true, built: true, Icon: CheckCircleIcon },
  { key: "branding", href: "/app/admin/branding", adminOnly: true, built: true, Icon: PaletteIcon },
  { key: "emails", href: "/app/admin/emails", adminOnly: true, built: true, Icon: BellIcon },
  { key: "reminders", href: "/app/admin/reminders", adminOnly: true, built: true, Icon: ClockIcon },
  { key: "exports", href: "/app/admin/exports", adminOnly: true, built: true, Icon: DownloadIcon },
  { key: "audit", href: "/app/admin/audit", adminOnly: false, built: true, Icon: LockIcon },
  { key: "settings", href: "/app/admin/settings", adminOnly: true, built: true, Icon: GearIcon },
];

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireStaffSession(locale);
  const t = await getTranslations("admin.shell");
  // ★ Computed on the SERVER from the `x-pathname` header `proxy.ts` forwards
  // — the same mechanism `shell/tab-bar.tsx` uses, and for the same reason:
  // a client `usePathname()` would make the active rail item a hydration
  // result, a visible flash on every console page load.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const withoutLocale = pathname.replace(/^\/(ar|en)(?=\/|$)/, "");

  const items: AdminRailItem[] = NAV_ITEMS.filter((item) => item.built && (session.role === "admin" || !item.adminOnly)).map((item) => ({
    key: item.key,
    href: item.href,
    label: t(`nav.${item.key}`),
    Icon: item.Icon,
    current: item.key === "dashboard" ? withoutLocale === item.href : withoutLocale === item.href || withoutLocale.startsWith(`${item.href}/`),
  }));

  return (
    <div>
      {/* ★ REQ-UIX-017 — console pages carry a SECOND skip link, past the
          rail. The app shell's own skip link (`app/layout.tsx`) already
          clears the header/account-menu tab stop and lands on `#main`,
          which is this layout's own root; from there a keyboard user still
          faces the rail's items before reaching the actual page. `tabIndex={-1}`
          so activating the link actually MOVES focus, not just scroll
          position (WebAIM's standard skip-link pattern) — the shell's own
          skip link targets `id="main"` without one; this one adds it for
          correctness rather than silently repeating that gap. */}
      <a href="#admin-content" className="skip-link rounded-field bg-navy-950 px-4 py-2 text-label text-white">
        {t("skipToContent")}
      </a>
      {items.length > 0 ? (
        <div className="md:grid md:grid-cols-[auto_1fr] md:items-start md:gap-8">
          <AdminRail items={items} brand={t("brand")} collapseLabel={t("collapseRail")} expandLabel={t("expandRail")} openLabel={t("openRail")} />
          <div id="admin-content" tabIndex={-1} className="min-w-0 outline-none mt-6 md:mt-0">
            {children}
          </div>
        </div>
      ) : (
        <>
          <p className="max-w-2xl text-body text-fg-muted">{t("moderatorEmpty")}</p>
          <div id="admin-content" tabIndex={-1} className="outline-none mt-6">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
