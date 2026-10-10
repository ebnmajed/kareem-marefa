import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HomeMark } from "@/components/shell/home-mark";
import { NotificationBell } from "@/components/notifications/bell";
import { getSessionState } from "@/lib/dal/session";
import { getMe } from "@/lib/dal/members";
import { getShellData } from "@/lib/dal/shell";
import { formatNumber } from "@/components/sessions/numerals";
import { AccountMenu } from "@/components/shell/account-menu";
import { FocusClearance } from "@/components/shell/focus-clearance";
import { NavRail } from "@/components/shell/nav-rail";
import { ShellHeader } from "@/components/shell/shell-header";
import { SearchEntry } from "@/components/shell/search-entry";
import { ShellFooter, ShellMain } from "@/components/shell/shell-frame";
import { TabBar } from "@/components/shell/tab-bar";
import { RouteProgress } from "@/components/ui/route-progress";
import { RouteMotion } from "@/components/shell/route-motion";
import { PlayScope } from "@/components/ui/scope";
import { ToastProvider } from "@/components/ui/toast";

// ★★ WAVE 17 (DEC-199 §1.3, REQ-UIX-049): THE SHELL IS INSIDE THE PLAYGROUND, AND
// SO IS EVERY SCREEN UNDER IT. `PlayScope root` wraps the whole shell — the
// header, the page, the tab bar, the toast region — so no screen and no component
// wraps itself any more (scopes do not nest), and a dialog, a sheet or a menu
// opened anywhere lands in the scope through its one landing element (DEC-188).
//
// ★ THE ORG THEME LAYER IS NOT EMITTED HERE ANY MORE (DEC-199 §1.3.7). Until wave
// 17 this layout wrote an org's brand kit as `.brand-org{--fg-heading:…}` over the
// platform's values. `.brand-org` names the same context variables the scope
// reassigns, and it was written later in the document, so it would win — an org's
// light palette on the dark ground. The kit keeps its three other consumers —
// posters, certificates and mail — and its logo; `getBrandKit()` and `SCR-059`
// are unchanged. A brand-aware playground is a design `docs/design/` does not
// contain, and the owner's to ask for.

// ★★ WAVE 18 (DEC-205 §2, DEC-206, REQ-UIX-054): THE SHELL IS REBUILT from
// `docs/design/screens/m10a/Home.dc.html` and `HomeDesktop.dc.html`.
//   · phone: a top row — the wordmark, search, the bell — and a bottom bar of FIVE
//     tabs, the third raised;
//   · from `lg`: a 64 px top bar — the wordmark in the rail's column, the search
//     field, the bell, the account menu — over a navigation rail and the content.
//     A page that has a game rail passes it through `PageFrame`, the one slot.
// The one-row header with its «تصفّح» menu is gone: its four links are the rail
// and the tab bar now. `/app/members` (`SCR-019`, wave 19) is the rail's and the
// account menu's — no sixth tab (DEC-213 §3.3, §3.4).
//
// ★ THE PHONE KEEPS THE ACCOUNT MENU, which the artboard does not draw (DEC-206
// §4.33, measured): `/app/me` carries neither the console's link nor sign-out
// today, and it is not rebuilt until batch M10c. Removing the menu now would leave
// a member on a phone with no way to sign out.

// The platform shell. NO auth check here [v16]: a layout does not re-render
// on navigation under Partial Rendering, so the check lives in the DAL, at
// the data, in every page. This shell only knows its links.
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("app.shell");
  // One classification for the whole shell (cache()d). A platform admin on
  // /app/platform/** has no member row: the bell's unread count would call
  // requireSession() and redirect every console screen to /no-access — the
  // shell bug platform found at wave-4 sync 3 (DEC-057). A non-member
  // session gets no bell, no rail and no tab bar, which is also the honest answer.
  const state = await getSessionState();
  const isMember = state.kind === "member";
  const isStaff =
    isMember &&
    (state.session.role === "admin" || state.session.role === "moderator");
  const isPlatformAdmin =
    (isMember && state.session.platformAdmin) ||
    (state.kind === "no_org" && state.platformAdmin);
  // ★ Guarded on `isMember`, and that guard is DEC-057's lesson, not caution:
  // `getMe()` and `getShellData()` go through `sessionClient()`, and a platform
  // admin with no member row would be redirected to /no-access from EVERY console
  // screen. One classification, taken once, gates everything that needs a member.
  const [me, shell] = isMember ? await Promise.all([getMe(locale), getShellData(locale)]) : [null, null];
  const attention = shell?.attention?.total ? shell.attention.total : 0;

  return (
    // ★ The provider wraps the shell rather than each screen: an action's
    // acknowledgement must survive the navigation the action caused, and a
    // per-screen provider unmounts with the screen that triggered it.
    // ★ The toast region is inside the scope with the shell (DEC-199 §1.3.6).
    <PlayScope root className="min-h-dvh">
    <ToastProvider closeLabel={t("toastClose")} label={t("toastLabel")}>
      <div className="min-h-dvh bg-canvas text-fg-body">

        {/* Layer 1 of the loading model (`16` §7.1.1): a bar only past 150 ms,
            fed by every `ui/link`. */}
        <RouteProgress />
        {/* SC 2.4.11 — keeps a focused control out from under the sticky header
            and the fixed bars, on every route. */}
        <FocusClearance />

        {/* ★ SC 2.4.1 — the first focusable element in the shell. Visually
          hidden until focused (.skip-link in globals.css). */}
        <a
          href="#main"
          className="skip-link rounded-field bg-accent px-4 py-2 text-label text-on-accent"
        >
          {t("skipToContent")}
        </a>

        {/* The top bar: 64 px. On a phone — the wordmark at the start, search and
            the bell at the end. From `lg` — the wordmark in the rail's 196 px
            column, then the search field, then the bell and the account menu. On a route that
            draws its own phone top row — browse — the bar gives way to it below `lg` (DEC-207). */}
        <ShellHeader>
          <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-4 lg:gap-6 lg:px-6">
            {/* Inside the platform the mark leads home, not to the public site (REQ-UIX-027). */}
            <Link
              href="/app"
              aria-label={t("brand")}
              className="inline-flex items-center text-accent lg:w-[196px] focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"
            >
              <HomeMark height={34} />
            </Link>

            {isMember ? <SearchEntry locale={locale} /> : null}
            {/* Pushes the actions to the inline END. On a phone the search entry brings
                its own spacer, so search and the bell stand together as drawn. */}
            <span aria-hidden className={isMember ? "hidden flex-1 lg:block" : "flex-1"} />

            {/* A platform admin with no member row gets no bell (DEC-057). */}
            {isMember ? <NotificationBell locale={locale} /> : null}

            <AccountMenu
              memberId={me?.id ?? null}
              displayName={me?.displayName ?? null}
              avatarUrl={me?.avatarUrl ?? null}
              teamColor={shell ? shell.teamColor : undefined}
              isStaff={isStaff}
              isPlatformAdmin={isPlatformAdmin}
              labels={{
                account: t("account"),
                profile: t("profile"),
                points: t("points"),
                certificates: t("certificates"),
                bookmarks: t("bookmarks"),
                calendar: t("calendar"),
                notifications: t("meNotifications"),
                privacy: t("mePrivacy"),
                members: t("members"),
                admin: t("adminConsole"),
                platform: t("platform"),
                signOut: t("signOut"),
              }}
            />
          </div>
        </ShellHeader>

        {/* ★ `<main>`'s bottom padding clears whichever fixed bar is on the page and
            reads ONE token, `--tabbar-h` (globals.css); the bar and the padding move
            together (`16` §3.1). The rail is passed in, not rendered by the frame,
            because it needs what only the server knows. */}
        <ShellMain
          rail={
            isMember ? (
              <NavRail
                isStaff={isStaff}
                isPlatformAdmin={isPlatformAdmin}
                attentionCount={attention > 0 ? formatNumber(attention) : null}
                labels={{
                  nav: t("primaryNav"),
                  propose: t("propose"),
                  home: t("home"),
                  sessions: t("sessions"),
                  members: t("members"),
                  board: t("leaderboards"),
                  me: t("account"),
                  staffSection: t("staffSection"),
                  admin: t("adminConsole"),
                  platform: t("platform"),
                  attention: attention > 0 ? t("attention", { count: attention, value: formatNumber(attention) }) : null,
                }}
              />
            ) : null
          }
        >
          {/* ★ Wave 29 (DEC-280 §5): the page's one transition boundary; the console and the platform cut. */}
          <RouteMotion>{children}</RouteMotion>
        </ShellMain>

        <ShellFooter>
          <Link
            href="/legal/privacy"
            className="underline underline-offset-4 hover:text-fg-heading"
          >
            {t("privacy")}
          </Link>
          {" · "}
          <Link
            href="/legal/terms"
            className="underline underline-offset-4 hover:text-fg-heading"
          >
            {t("terms")}
          </Link>
        </ShellFooter>

        {isMember ? (
          <TabBar
            labels={{
              nav: t("primaryNav"),
              home: t("home"),
              sessions: t("sessions"),
              propose: t("proposeShort"),
              proposeFull: t("propose"),
              board: t("board"),
              me: t("account"),
            }}
          />
        ) : null}
      </div>
    </ToastProvider>
    </PlayScope>
  );
}
