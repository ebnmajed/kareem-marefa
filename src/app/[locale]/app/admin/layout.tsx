import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/logo";
import { formatNumber } from "@/components/sessions/numerals";
import { AccountMenu } from "@/components/shell/account-menu";
import { adminRailGroups, type AdminNavCounts, type AdminRole } from "@/components/shell/admin-nav";
import { ConsoleFrame } from "@/components/shell/console-frame";
import { getAdminAttention, type AttentionQueue } from "@/lib/dal/admin-dashboard";
import { getMe } from "@/lib/dal/members";
import { requireSession } from "@/lib/dal/session";
import { getShellData } from "@/lib/dal/shell";

// The org console's frame — REQ-UIX-084, DEC-225 §3, DEC-226, DEC-227. Rebuilt in wave 21 from
// `AdminDashboard.dc.html` and `AdminSessionsPhone.dc.html`: deleted first, then written (`DEC-208`); the table of what
// it kept is in `docs/plan/notes/wave-21-lead.md`.
//
// ★ THE LAYOUT NEVER GATES. A `notFound()` raised in a layout under a `loading.tsx` boundary can no longer set the
// status once streaming has begun — the request answers 200 with the not-found body inside it (wave 6). So the staff
// and admin gates stay every page's own, at the data; a plain member gets no rail and the page answers its own
// streamed not-found (`DEC-134`).
//
// ★ PLAIN DATA ACROSS THE BOUNDARY. `ConsoleFrame` and `AdminRail` are client components: the rail's groups are
// strings, numbers and booleans, and each badge's accessible text is pluralised here. An icon component crossing it
// crashed every admin page in wave 6.
//
// The badges follow the data, not the artboard (`DEC-228` §3.2), through `console`'s `getAdminAttention()` — the one
// read the dashboard's tiles use: المقترحات ← proposals awaiting a decision; الجلسات ← sessions not scheduled;
// البلاغات ← open photo reports; التعليقات ← open comment reports. A moderator gets the two report badges only.

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireSession(locale);
  const role: AdminRole = session.role === "admin" ? "admin" : session.role === "moderator" ? "moderator" : "member";
  // Contract 3: the same read as the dashboard's tiles, filtered by role at the data — so a badge never counts a
  // queue its reader cannot open. A failed read draws no badge; it never takes the console down with it. Read in the
  // same batch as the rest: the role is known before any of them.
  const [t, tApp, tShell, shell, me, attention] = await Promise.all([
    getTranslations("admin.shell"),
    getTranslations("app.console"),
    getTranslations("app.shell"),
    getShellData(locale),
    getMe(locale),
    role === "member" ? null : getAdminAttention(locale).catch(() => null),
  ]);
  const BADGE: Record<AttentionQueue, "proposals" | "sessions" | "photoReports" | "commentReports"> = {
    proposals: "proposals",
    unscheduledSessions: "sessions",
    photoReports: "photoReports",
    commentReports: "commentReports",
  };
  const counts: AdminNavCounts = Object.fromEntries(
    (attention?.items ?? []).map((item) => [
      item.navKey,
      { count: item.count, label: tApp(`badge.${BADGE[item.queue]}`, { count: item.count, value: formatNumber(item.count) }) },
    ]),
  );
  const groups = adminRailGroups(role, (key) => t(`nav.${key}`), counts);
  const isStaff = role !== "member";

  return (
    <ConsoleFrame
      groups={groups}
      railLabel={t("brand")}
      openLabel={t("openRail")}
      skipLabel={t("skipToContent")}
      title={tApp("title")}
      orgName={shell.orgName ?? null}
      brand={
        // Inside the platform the mark leads home, not to the public site (REQ-UIX-027).
        <Link href="/app" aria-label={tShell("brand")} className="inline-flex items-center text-accent">
          {/* Still: a console bar's mark never moves (REQ-UIX-053, REQ-UIX-119). */}
          <Logo height={28} label={null} motion="none" />
        </Link>
      }
      toApp={
        <Link href="/app" className="text-label text-fg-muted hover:text-fg-heading">
          {tApp("toApp")}
        </Link>
      }
      account={
        <AccountMenu
          memberId={me?.id ?? null}
          displayName={me?.displayName ?? null}
          avatarUrl={me?.avatarUrl ?? null}
          teamColor={shell.teamColor}
          isStaff={isStaff}
          isPlatformAdmin={session.platformAdmin}
          labels={{
            account: tShell("account"),
            profile: tShell("profile"),
            points: tShell("points"),
            certificates: tShell("certificates"),
            bookmarks: tShell("bookmarks"),
            calendar: tShell("calendar"),
            notifications: tShell("meNotifications"),
            privacy: tShell("mePrivacy"),
            members: tShell("members"),
            admin: tShell("adminConsole"),
            platform: tShell("platform"),
            signOut: tShell("signOut"),
          }}
        />
      }
    >
      {children}
    </ConsoleFrame>
  );
}
