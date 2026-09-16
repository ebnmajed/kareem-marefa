import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/wordmark";
import { NotificationBell } from "@/components/notifications/bell";
import { getSessionState } from "@/lib/dal/session";
import { getBrandKit, type BrandKit } from "@/lib/brand/kit";
import { getMe } from "@/lib/dal/members";
import { AccountMenu } from "@/components/shell/account-menu";
import { SearchEntry } from "@/components/shell/search-entry";
import { TabBar, isEventPage, isImmersive } from "@/components/shell/tab-bar";
import { ChevronIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { RouteProgress } from "@/components/ui/route-progress";
import { ToastProvider } from "@/components/ui/toast";

// The org theme layer — 06 §8.3's first consumer, DEC-003's layering, wave 4
// (DEC-052). The brand kit's tokens are emitted as CSS custom properties
// scoped to the shell, over globals.css's platform values: `.brand-org`
// beats `:root` and `.brand-org .theme-dark` beats `.theme-dark`, and the
// `@theme inline` block resolves `var(--fg-heading)` at use, so every
// `bg-canvas` / `text-fg-body` utility below picks the org's value up. No
// row is the identity override: nothing is emitted and every page is
// byte-identical to today. This is a READ, not an auth check — the pages
// still gate themselves at the data (the [v16] rule below); the layout only
// asks whether a member session exists so it never redirects.
const CSS_VAR: Record<keyof BrandKit["light"], string> = {
  canvas: "--canvas",
  surface: "--surface",
  fgHeading: "--fg-heading",
  fgBody: "--fg-body",
  fgMuted: "--fg-muted",
  edge: "--edge",
  edgeStrong: "--edge-strong",
  spine: "--spine",
  node: "--node",
};

function themeCss(kit: BrandKit): string {
  const block = (set: BrandKit["light"]) =>
    (Object.keys(CSS_VAR) as (keyof BrandKit["light"])[])
      .map((token) => `${CSS_VAR[token]}:${set[token]}`)
      .join(";");
  return `.brand-org{${block(kit.light)}}.brand-org .theme-dark{${block(kit.dark)}}`;
}

async function orgTheme(
  locale: string,
  state: Awaited<ReturnType<typeof getSessionState>>,
): Promise<{ css: string; nonce: string | undefined } | null> {
  if (state.kind !== "member") return null;
  const kit = await getBrandKit(locale, state.session.orgId);
  if (!kit.isOverridden) return null;
  return {
    css: themeCss(kit),
    nonce: (await headers()).get("x-nonce") ?? undefined,
  };
}

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
  // session gets no bell and no org theme, which is also the honest answer.
  const state = await getSessionState();
  const theme = await orgTheme(locale, state);
  const isMember = state.kind === "member";
  const isStaff =
    isMember &&
    (state.session.role === "admin" || state.session.role === "moderator");
  const isPlatformAdmin =
    (isMember && state.session.platformAdmin) ||
    (state.kind === "no_org" && state.platformAdmin);
  // `proxy.ts` forwards the path so the shell can decide, on the SERVER,
  // whether this screen carries the tab bar (DEC-098) — and `<main>`'s bottom
  // padding follows the same decision rather than a hydration result.
  const pathname = (await headers()).get("x-pathname");
  const hasTabBar = !isImmersive(pathname);
  // The event page owns its full-bleed band and its own container (sessions R-L1): `<main>`
  // gives it no max-width and no padding there, and it clears the page's bottom ACTION bar
  // exactly as it clears the tab bar elsewhere — `--tabbar-h` carries whichever bar exists.
  const fullBleed = isEventPage(pathname);
  const clearsBottomBar = hasTabBar || fullBleed;
  // ★ Guarded on `isMember`, and that guard is DEC-057's lesson, not caution:
  // `getMe()` goes through `sessionClient()`, and a platform admin with no
  // member row would be redirected to /no-access from EVERY console screen —
  // which is exactly the shell bug `platform` found at wave-4 sync 3. One
  // classification, taken once, gates everything that needs a member.
  //
  // The avatar itself is M10 (DEC-099): the value already travels the whole
  // stack and no component has ever drawn it, and drawing it properly means
  // retiring the Google hotlink first. In M9 this supplies the INITIAL, which
  // is the permanent fallback and therefore never wasted work.
  const me = isMember ? await getMe(locale) : null;

  const navLink =
    "inline-flex h-11 items-center rounded-field px-2 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3";

  // The catalogue entry. A two-column panel of categories with counts is
  // §6.1's desktop design and belongs with browse in M10; in M9 it is the
  // link, so nothing is URL-only and the shell is complete.
  const browse: { href: string; label: string }[] = isMember
    ? [
        { href: "/app/sessions", label: t("sessions") },
        { href: "/app/propose", label: t("propose") },
        { href: "/app/members", label: t("members") },
        { href: "/app/leaderboards", label: t("leaderboards") },
      ]
    : [];

  return (
    // ★ The provider wraps the shell rather than each screen: an action's
    // acknowledgement must survive the navigation the action caused, and a
    // per-screen provider unmounts with the screen that triggered it.
    <ToastProvider closeLabel={t("toastClose")}>
      <div
        className={
          theme
            ? "brand-org min-h-dvh bg-canvas text-fg-body"
            : "min-h-dvh bg-canvas text-fg-body"
        }
      >
        {theme ? <style nonce={theme.nonce}>{theme.css}</style> : null}

        {/* Layer 1 of the loading model (`16` §7.1.1): a bar only past 150 ms,
            fed by every `ui/link`. */}
        <RouteProgress />

        {/* ★ SC 2.4.1 — the first focusable element in the shell. Visually
          hidden until focused (.skip-link in globals.css). Today it saves a
          keyboard user three tabs; after the account menu and M11's
          fifteen-item admin rail it is what stands between them and a long tab
          trap in front of every console page. */}
        <a
          href="#main"
          className="skip-link rounded-field bg-navy-950 px-4 py-2 text-label text-white"
        >
          {t("skipToContent")}
        </a>

        {/* The header. `--header-h` in globals.css is 68px and the scroll padding
          computes from it, so this row's height and that token move together. */}
        <header className="sticky top-0 z-30 border-b border-edge bg-canvas">
          <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-2 px-3 md:gap-4 md:px-8">
            <Wordmark />

            {/* تصفّح ▾ — desktop only; the phone reaches all of it from the tab
              bar and the account menu, which is the point of having them.
              ★ `ui/menu`, not `<details>` (DEC-111): it closes when a link in
              it is followed, on an outside click and on Escape, and never
              stays open over the page it navigated to. The wrapper, not the
              trigger, carries `hidden md:block`, so no element pairs two
              `display` utilities. */}
            {browse.length ? (
              <div className="hidden md:block">
                <Menu
                  trigger={
                    <button type="button" className={`${navLink} gap-1`}>
                      {t("browse")}
                      <ChevronIcon direction="down" className="text-fg-muted" />
                    </button>
                  }
                  items={browse.map((link) => ({ label: link.label, href: link.href }))}
                />
              </div>
            ) : null}

            {/* The spacer that pushes the actions to the inline END on a phone,
              where the search FIELD (which is `flex-1` from `md`) is only an icon.
              Without it the search glyph, the bell and the avatar bunched beside
              the wordmark and left the far side of the bar empty (DEC-111). */}
            <span aria-hidden className={isMember ? "flex-1 md:hidden" : "flex-1"} />
            {isMember ? <SearchEntry locale={locale} /> : null}

            {/* The bell keeps its wave-2 server-component contract and DEC-057's
              classification: a platform admin with no member row gets no bell
              and no org theme, because `getSessionState()` answered once for
              the whole shell. */}
            {isMember ? <NotificationBell locale={locale} /> : null}

            <AccountMenu
              memberId={me?.id ?? null}
              displayName={me?.displayName ?? null}
              avatarUrl={null}
              isStaff={isStaff}
              isPlatformAdmin={isPlatformAdmin}
              labels={{
                account: t("account"),
                profile: t("profile"),
                rsvps: t("rsvps"),
                points: t("points"),
                certificates: t("certificates"),
                bookmarks: t("bookmarks"),
                calendar: t("calendar"),
                admin: t("admin"),
                platform: t("platform"),
                signOut: t("signOut"),
              }}
            />
          </div>
        </header>

        {/* ★★ THE PADDING SHIPS IN THE SAME COMMIT AS THE BAR, and this is why:
          `<main>` had NO bottom padding, so a fixed, safe-area-padded bottom
          bar covers the last ~64 px of ALL 49 SCREENS EVER WRITTEN at once —
          including every one this milestone has not reached yet. The proof
          capture is a 390 px screenshot of an OLD, UNTOUCHED screen, not a new
          one (`16` §3.1).

          It is applied only when the bar is actually present, and only below
          `md`, where the bar is. */}
        <main
          id="main"
          className={fullBleed ? undefined : "mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12"}
          style={
            clearsBottomBar
              ? {
                  paddingBlockEnd:
                    "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 1rem)",
                }
              : undefined
          }
        >
          {children}
        </main>

        <footer
          className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-body-sm text-fg-muted md:px-8"
          style={
            clearsBottomBar
              ? {
                  paddingBlockEnd:
                    "calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 1rem)",
                }
              : undefined
          }
        >
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
        </footer>

        {isMember ? (
          <TabBar
            pathname={pathname}
            labels={{
              nav: t("primaryNav"),
              sessions: t("sessions"),
              propose: t("proposeShort"),
              me: t("account"),
            }}
          />
        ) : null}
      </div>
    </ToastProvider>
  );
}
