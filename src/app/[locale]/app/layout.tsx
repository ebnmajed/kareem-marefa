import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/wordmark";
import { NotificationBell } from "@/components/notifications/bell";
import { getSessionState } from "@/lib/dal/session";
import { getBrandKit, type BrandKit } from "@/lib/brand/kit";

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
    (Object.keys(CSS_VAR) as (keyof BrandKit["light"])[]).map((token) => `${CSS_VAR[token]}:${set[token]}`).join(";");
  return `.brand-org{${block(kit.light)}}.brand-org .theme-dark{${block(kit.dark)}}`;
}

async function orgTheme(locale: string, state: Awaited<ReturnType<typeof getSessionState>>): Promise<{ css: string; nonce: string | undefined } | null> {
  if (state.kind !== "member") return null;
  const kit = await getBrandKit(locale, state.session.orgId);
  if (!kit.isOverridden) return null;
  return { css: themeCss(kit), nonce: (await headers()).get("x-nonce") ?? undefined };
}

// The platform shell. NO auth check here [v16]: a layout does not re-render
// on navigation under Partial Rendering, so the check lives in the DAL, at
// the data, in every page. This shell only knows its links.
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
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
  return (
    <div className={theme ? "brand-org min-h-dvh bg-canvas text-fg-body" : "min-h-dvh bg-canvas text-fg-body"}>
      {theme ? <style nonce={theme.nonce}>{theme.css}</style> : null}
      <nav aria-label={t("brand")} className="border-b border-edge bg-canvas">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-1 px-3 md:px-8">
          <ul className="flex items-center gap-1">
            <li className="me-1 md:me-2">
              <Wordmark />
            </li>
            <li>
              <Link href="/app" className="inline-flex h-10 items-center rounded-field px-2 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3">
                {t("home")}
              </Link>
            </li>
            <li>
              {/* SCR-011, browse — built in wave 3 (DEC-048); the shell link is the lead's. */}
              <Link href="/app/sessions" className="inline-flex h-10 items-center rounded-field px-2 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3">
                {t("sessions")}
              </Link>
            </li>
            <li>
              <Link href="/app/me" className="inline-flex h-10 items-center rounded-field px-2 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading md:px-3">
                {t("profile")}
              </Link>
            </li>
            {/* The notify slot (TEAM.md §2, wave 2): a server component that reads the
                session's own unread count through its DAL on every render of the
                shell. Under Partial Rendering the shell does not re-render on
                navigation, so the count refreshes on the next full request. */}
            <li>{state.kind === "member" ? <NotificationBell locale={locale} /> : null}</li>
          </ul>
          <form method="post" action="/api/auth/sign-out">
            <button type="submit" className="inline-flex h-10 items-center rounded-field px-2 text-label text-fg-muted hover:bg-silver-100 hover:text-fg-heading whitespace-nowrap md:px-3">
              {t("signOut")}
            </button>
          </form>
        </div>
      </nav>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
