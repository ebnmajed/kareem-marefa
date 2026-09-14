import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/wordmark";
import { NotificationBell } from "@/components/notifications/bell";

// The platform shell. NO auth check here [v16]: a layout does not re-render
// on navigation under Partial Rendering, so the check lives in the DAL, at
// the data, in every page. This shell only knows its links.
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("app.shell");
  return (
    <div className="min-h-dvh bg-canvas text-fg-body">
      <nav aria-label={t("brand")} className="border-b border-edge bg-canvas">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
          <ul className="flex items-center gap-1">
            <li className="me-2">
              <Wordmark />
            </li>
            <li>
              <Link href="/app" className="inline-flex h-10 items-center rounded-field px-3 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading">
                {t("home")}
              </Link>
            </li>
            <li>
              <Link href="/app/me" className="inline-flex h-10 items-center rounded-field px-3 text-label text-fg-body hover:bg-silver-100 hover:text-fg-heading">
                {t("profile")}
              </Link>
            </li>
            {/* The notify slot (TEAM.md §2, wave 2): a server component that reads the
                session's own unread count through its DAL on every render of the
                shell. Under Partial Rendering the shell does not re-render on
                navigation, so the count refreshes on the next full request. */}
            <li>
              <NotificationBell locale={locale} />
            </li>
          </ul>
          <form method="post" action="/api/auth/sign-out">
            <button type="submit" className="inline-flex h-10 items-center rounded-field px-3 text-label text-fg-muted hover:bg-silver-100 hover:text-fg-heading">
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
