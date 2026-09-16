import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { AdminRail, type AdminRailIconKey, type AdminRailItem } from "@/components/admin/admin-rail";

// The admin console shell — `app/admin/**`'s one shared layout, rebuilt onto
// the system for wave 6 (`16` §6.7, `DEC-130`). A left rail replaces the flat
// wrapping nav strip; `docs/plan/notes/console.md`'s "Wave 6" §1 is the plan
// this implements.
//
// ★ TWO REAL BUGS, BOTH FOUND ON A REAL BUILD (the lead's worktree runs),
// FIXED HERE TOGETHER:
//
// 1. `requireStaffSession()` (this layout's old gate) calls `notFound()` for
//    a plain member. Under Next 16's streaming contract, a `notFound()`
//    raised inside a LAYOUT that sits under a `loading.tsx` boundary
//    (`admin/loading.tsx`, unchanged, wraps this whole segment in an implicit
//    `<Suspense>`) can no longer set the response's status code once
//    streaming has begun — the request answers 200 with the not-found body
//    inside it, not a real 404. `admin-dashboard.spec.ts`'s "a member gets a
//    real 404" caught this on both projects. A PAGE-level `notFound()` is
//    unaffected (the moderator-only equivalent test passed), which is why
//    the fix is to stop gating HERE at all: `requireSession()` (never
//    notFound()s an authenticated member, only redirects an unauthenticated
//    one) replaces `requireStaffSession()`, and the staff/admin gate goes
//    back to being every individual page's own job — exactly the pattern
//    this file's own header comment already described before this bug
//    existed ("every page under here still runs its own narrower check").
//    A plain member gets an EMPTY rail (`items.length === 0` below), and the
//    page they land on still 404s correctly, from the page.
//
// 2. `AdminRailItem` used to carry the icon as a component reference
//    (`Icon: ComponentType<...>`), built here and passed to `AdminRail`
//    ("use client"). `icons.tsx` is not a client module, so every icon it
//    exports is a plain function, and React Flight refuses to serialise a
//    function crossing the server/client boundary — every admin page
//    crashed («تعذّر تحميل هذا القسم») for every staff member until this
//    was fixed. `admin-rail.tsx` now owns the icon→component map itself
//    (it is the client module, so the actual functions never have to
//    leave it); this file passes a STRING KEY per item instead.
//
// The route list below is published for `designer` and every other track
// whose routes render inside this shell — see docs/plan/notes/console.md for
// the table this is generated from, and never change a path here without
// telling the lead. `built: false` items are left out of the rendered nav on
// purpose: a dead link that 404s is worse than a nav item that appears the
// day its screen ships. All 19 currently listed routes are built; none is
// added or removed this wave, only re-skinned onto the rail (`DEC-130`'s
// ruling: the 14-group IA of `16` §6.7 is a wave-7 question).
type NavItem = { key: string; href: string; adminOnly: boolean; built: boolean; icon: AdminRailIconKey };

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/app/admin", adminOnly: true, built: true, icon: "home" },
  { key: "proposals", href: "/app/admin/proposals", adminOnly: true, built: true, icon: "checkCircle" },
  // SCR-044: a moderator now sees this item too — `admin/sessions/page.tsx`
  // itself branches on role and renders a read-only, attendance-focused
  // list for a moderator, never the admin's management UI.
  { key: "sessions", href: "/app/admin/sessions", adminOnly: false, built: true, icon: "calendar" },
  { key: "venues", href: "/app/admin/venues", adminOnly: true, built: true, icon: "pin" },
  { key: "categories", href: "/app/admin/categories", adminOnly: true, built: true, icon: "tag" },
  { key: "companies", href: "/app/admin/companies", adminOnly: true, built: true, icon: "building" },
  { key: "members", href: "/app/admin/members", adminOnly: true, built: true, icon: "user" },
  { key: "moderationComments", href: "/app/admin/moderation/comments", adminOnly: false, built: true, icon: "alertCircle" },
  { key: "moderationPhotos", href: "/app/admin/moderation/photos", adminOnly: false, built: true, icon: "image" },
  { key: "moderationReports", href: "/app/admin/moderation/reports", adminOnly: false, built: true, icon: "alertTriangle" },
  { key: "scoring", href: "/app/admin/scoring", adminOnly: true, built: true, icon: "star" },
  // ★ `recognition` does NOT reuse the star: it is adjacent to `scoring` in
  // this list, and two neighbouring rail items sharing one glyph is a real
  // scanning problem (the same one `tag`/`building` were requested to fix
  // for `categories`/`companies`). "Marked as notable" is the nearest fit
  // already in the set.
  { key: "recognition", href: "/app/admin/recognition", adminOnly: true, built: true, icon: "bookmarkFilled" },
  { key: "templatesPosters", href: "/app/admin/templates/posters", adminOnly: true, built: true, icon: "image" },
  // ★ Same reasoning as `recognition`: `templatesCertificates` sits right
  // beside `templatesPosters`, so it does not reuse the image glyph either.
  // The check-circle — already used for `proposals`, far enough away in the
  // list not to collide — reads as "a completed, verified document", which
  // a certificate literally is.
  { key: "templatesCertificates", href: "/app/admin/templates/certificates", adminOnly: true, built: true, icon: "checkCircle" },
  { key: "branding", href: "/app/admin/branding", adminOnly: true, built: true, icon: "palette" },
  { key: "emails", href: "/app/admin/emails", adminOnly: true, built: true, icon: "bell" },
  { key: "reminders", href: "/app/admin/reminders", adminOnly: true, built: true, icon: "clock" },
  { key: "exports", href: "/app/admin/exports", adminOnly: true, built: true, icon: "download" },
  { key: "audit", href: "/app/admin/audit", adminOnly: false, built: true, icon: "lock" },
  { key: "settings", href: "/app/admin/settings", adminOnly: true, built: true, icon: "gear" },
];

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireSession(locale);
  const t = await getTranslations("admin.shell");
  // ★ Computed on the SERVER from the `x-pathname` header `proxy.ts` forwards
  // — the same mechanism `shell/tab-bar.tsx` uses, and for the same reason:
  // a client `usePathname()` would make the active rail item a hydration
  // result, a visible flash on every console page load.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const withoutLocale = pathname.replace(/^\/(ar|en)(?=\/|$)/, "");

  // A plain member gets no rail at all — the page underneath still 404s on
  // its own gate, which is the real boundary (see the header comment).
  const isMember = session.role === "member";
  const items: AdminRailItem[] = isMember
    ? []
    : NAV_ITEMS.filter((item) => item.built && (session.role === "admin" || !item.adminOnly)).map((item) => ({
        key: item.key,
        href: item.href,
        label: t(`nav.${item.key}`),
        icon: item.icon,
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
      ) : isMember ? (
        // No rail, no interstitial text: the page underneath calls its own
        // `notFound()` (every admin/moderator page's own gate), and that is
        // the ONLY thing a plain member should see — not a "the moderation
        // console is still being built" message stacked above a 404, which
        // `moderatorEmpty`'s copy would read as if shown here.
        <div id="admin-content" tabIndex={-1} className="outline-none">
          {children}
        </div>
      ) : (
        // Reachable in principle (a moderator whose staff-visible item set is
        // somehow empty) though not by any role/item combination today — kept
        // as the honest fallback rather than assuming it can never happen.
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
