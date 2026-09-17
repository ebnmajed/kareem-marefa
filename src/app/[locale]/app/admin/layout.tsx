import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { AdminRail, type AdminRailChild, type AdminRailIconKey, type AdminRailItem } from "@/components/admin/admin-rail";

// The admin console shell — `app/admin/**`'s one shared layout, rebuilt onto
// the system for wave 6 (`16` §6.7, `DEC-130`) and regrouped into the
// fourteen-group IA for wave 7 (`DEC-137`, `docs/plan/notes/console.md`'s
// "Wave 7 plan" §1 is the plan this implements).
//
// ★ TWO REAL BUGS, BOTH FOUND ON A REAL BUILD (the lead's worktree runs),
// FIXED HERE TOGETHER, wave 6:
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
// day its screen ships.
//
// ── the fourteen-group regroup (wave 7, `DEC-137`) ────────────────────────
//
// `16` §6.7 names fifteen rail labels; the lead's sync-1 ruling is that
// «لوحة» is the rail's own root/home link and the other fourteen are the
// groups. Ten of those fourteen are still exactly one route each (rendered
// as a leaf, unchanged shape from wave 6); four disclose 2–3 routes each —
// «الإشراف» (the three moderation queues), «النقاط والتقدير» (scoring +
// recognition), «التصاميم» (the two template libraries — NOT
// `admin/designer`, which has no `page.tsx` of its own; a designer document
// is reached only from its template, as today), and «الإشعارات» (emails +
// reminders). `NAV_ENTRIES` below is the single source of truth for both:
// each entry is tagged `"leaf"` or `"group"`, and `buildRailItems()` turns
// it into `AdminRailItem[]`, applying the SAME staff/admin filter at
// whichever level the route actually sits — a leaf's own `adminOnly` gates
// it directly; a group survives only if at least one child does (so a
// moderator's rail regroups to exactly three top-level entries — «الجلسات»,
// «الإشراف» with all three children, «السجل» — five reachable routes,
// unchanged in substance from wave 6's five flat moderator-visible items,
// per `REQ-ADM-020`).
//
// `NAV_ENTRIES` has 20 leaf routes today (19 here plus `dashboard`), not the
// 19 a stale comment once claimed — counted directly off this array, not
// carried forward from an old note.
interface LeafDef {
  key: string;
  href: string;
  adminOnly: boolean;
  built: boolean;
}

type NavEntryDef = ({ kind: "leaf"; icon: AdminRailIconKey } & LeafDef) | { kind: "group"; key: string; icon: AdminRailIconKey; items: LeafDef[] };

const NAV_ENTRIES: NavEntryDef[] = [
  { kind: "leaf", key: "dashboard", href: "/app/admin", adminOnly: true, built: true, icon: "home" },
  { kind: "leaf", key: "proposals", href: "/app/admin/proposals", adminOnly: true, built: true, icon: "checkCircle" },
  // SCR-044: a moderator now sees this item too — `admin/sessions/page.tsx`
  // itself branches on role and renders a read-only, attendance-focused
  // list for a moderator, never the admin's management UI.
  { kind: "leaf", key: "sessions", href: "/app/admin/sessions", adminOnly: false, built: true, icon: "calendar" },
  { kind: "leaf", key: "members", href: "/app/admin/members", adminOnly: true, built: true, icon: "user" },
  { kind: "leaf", key: "companies", href: "/app/admin/companies", adminOnly: true, built: true, icon: "building" },
  // «التصنيفات والوسوم» — `admin.shell.nav.categories` carries the fuller
  // label (categories AND tags) to match `16` §6.7's own group name; the
  // route and screen are unchanged (tags have no separate admin screen).
  { kind: "leaf", key: "categories", href: "/app/admin/categories", adminOnly: true, built: true, icon: "tag" },
  { kind: "leaf", key: "venues", href: "/app/admin/venues", adminOnly: true, built: true, icon: "pin" },
  {
    kind: "group",
    key: "moderation",
    icon: "alertTriangle",
    items: [
      { key: "moderationComments", href: "/app/admin/moderation/comments", adminOnly: false, built: true },
      { key: "moderationPhotos", href: "/app/admin/moderation/photos", adminOnly: false, built: true },
      { key: "moderationReports", href: "/app/admin/moderation/reports", adminOnly: false, built: true },
    ],
  },
  {
    kind: "group",
    key: "points",
    icon: "star",
    items: [
      { key: "scoring", href: "/app/admin/scoring", adminOnly: true, built: true },
      { key: "recognition", href: "/app/admin/recognition", adminOnly: true, built: true },
    ],
  },
  {
    kind: "group",
    key: "designs",
    icon: "image",
    items: [
      { key: "templatesPosters", href: "/app/admin/templates/posters", adminOnly: true, built: true },
      { key: "templatesCertificates", href: "/app/admin/templates/certificates", adminOnly: true, built: true },
    ],
  },
  { kind: "leaf", key: "branding", href: "/app/admin/branding", adminOnly: true, built: true, icon: "palette" },
  {
    kind: "group",
    key: "notifications",
    icon: "bell",
    items: [
      { key: "emails", href: "/app/admin/emails", adminOnly: true, built: true },
      { key: "reminders", href: "/app/admin/reminders", adminOnly: true, built: true },
    ],
  },
  { kind: "leaf", key: "exports", href: "/app/admin/exports", adminOnly: true, built: true, icon: "download" },
  { kind: "leaf", key: "audit", href: "/app/admin/audit", adminOnly: false, built: true, icon: "lock" },
  { kind: "leaf", key: "settings", href: "/app/admin/settings", adminOnly: true, built: true, icon: "gear" },
];

// Which item is current is the rail's own decision, from `usePathname()`
// (`admin-rail.tsx`): this layout is not re-rendered on a client-side
// navigation, so a `current` computed here went stale on the first click.
function buildRailItems(isAdmin: boolean, t: Awaited<ReturnType<typeof getTranslations>>): AdminRailItem[] {
  const items: AdminRailItem[] = [];
  for (const entry of NAV_ENTRIES) {
    if (entry.kind === "leaf") {
      if (!entry.built || (entry.adminOnly && !isAdmin)) continue;
      items.push({
        key: entry.key,
        href: entry.href,
        label: t(`nav.${entry.key}`),
        icon: entry.icon,
        exact: entry.key === "dashboard",
      });
      continue;
    }
    const children: AdminRailChild[] = entry.items
      .filter((child) => child.built && (isAdmin || !child.adminOnly))
      .map((child) => ({
        key: child.key,
        href: child.href,
        label: t(`nav.${child.key}`),
      }));
    if (children.length === 0) continue;
    items.push({ key: entry.key, label: t(`groups.${entry.key}`), icon: entry.icon, children });
  }
  return items;
}

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireSession(locale);
  const t = await getTranslations("admin.shell");

  // A plain member gets no rail at all — the page underneath still 404s on
  // its own gate, which is the real boundary (see the header comment).
  const isMember = session.role === "member";
  const items: AdminRailItem[] = isMember ? [] : buildRailItems(session.role === "admin", t);

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
