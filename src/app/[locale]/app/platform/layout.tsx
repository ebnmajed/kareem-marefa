import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/logo";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";
import { platformRailGroups } from "@/components/platform/platform-nav";
import { AccountMenu } from "@/components/shell/account-menu";
import { ConsoleFrame } from "@/components/shell/console-frame";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/dal/members";
import { requirePlatformAdmin } from "@/lib/dal/platform";
import { getSessionState } from "@/lib/dal/session";
import { getShellData } from "@/lib/dal/shell";

// The platform console's frame — SCR-080 … 085, REQ-UIX-118, REQ-ADM-001, DEC-NEXT-38, DEC-249. The lead's.
// Rebuilt in wave 26 on the console frame (`M11a.md` §0, the six `Platform*.dc.html`): the same 52 px bar and 220 px
// rail as the org console, the platform's own nav set, and «لا بيانات مؤسسات هنا» in the bar. The table of what it
// kept is `docs/plan/notes/platform.md` W26.2.0 (F1 – F14); each F below is a row of it.
//
// ★ F1, F2 — THE GATE. `requirePlatformAdmin` is called here AND again at the data in every page: a layout is not
// re-rendered on navigation, so this is the boundary for «reaches the console's chrome at all» and never for a given
// screen. It answers NOT FOUND, not forbidden, to an org admin who guesses the URL (`DEC-134`, `DEC-035`) — a 403
// would confirm the console exists. (The org console's layout never gates; this one always has, and keeps doing so.)
//
// ★ F3 — the break-glass banner is FIRST, in flow, never sticky (`DEC-057` §7). ★ F4 — the frame's skip link lands on
// `#platform-content`, which takes focus. ★ F5 – F12 — the nav set, in `components/platform/platform-nav.tsx`.
// ★ F10 — under `lg` the frame's sheet behind ≡ replaces the old section switcher.
//
// ★ NOTHING HERE NEEDS A MEMBER (`DEC-057`). A super admin may have no member row; `getMe()` and `getShellData()`
// go through `sessionClient()` and would send such an account to `/no-access` from every platform screen. So they
// are read only for a session that is a member, exactly as the app shell does it, and the link back to the app is
// offered only to one.

export default async function PlatformLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin(locale, `/${locale}/app/platform`);

  const state = await getSessionState();
  const isMember = state.kind === "member";
  const isStaff = isMember && (state.session.role === "admin" || state.session.role === "moderator");
  const [t, tApp, tShell, me, shell] = await Promise.all([
    getTranslations("platform.shell"),
    getTranslations("app.console"),
    getTranslations("app.shell"),
    isMember ? getMe(locale) : null,
    isMember ? getShellData(locale) : null,
  ]);

  return (
    <ConsoleFrame
      groups={platformRailGroups((key) => t(`nav.${key}`))}
      railLabel={t("brand")}
      openLabel={tApp("platform.openRail")}
      skipLabel={t("skipToContent")}
      contentId="platform-content"
      title={t("brand")}
      orgName={null}
      banner={<ImpersonationBanner locale={locale} />}
      badge={<Badge tone="neutral">{tApp("platform.noOrgData")}</Badge>}
      brand={
        // Inside the platform the mark leads home, not to the public site (REQ-UIX-027). ★ It is the MARK, at the
        // 30 px the brand pack gives a console bar, and it never moves here (REQ-UIX-053, REQ-UIX-119): the platform
        // bar is new this wave, so it never wore the wordmark that PR E retires everywhere else.
        <Link href="/app" aria-label={tShell("brand")} className="inline-flex items-center">
          <Logo height={30} label={null} motion="none" />
        </Link>
      }
      toApp={
        isMember ? (
          <Link href="/app" className="text-label text-fg-muted hover:text-fg-heading">
            {tApp("toApp")}
          </Link>
        ) : null
      }
      account={
        <AccountMenu
          memberId={me?.id ?? null}
          displayName={me?.displayName ?? null}
          avatarUrl={me?.avatarUrl ?? null}
          teamColor={shell?.teamColor ?? null}
          isStaff={isStaff}
          isPlatformAdmin
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
