import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPreferenceMatrix, listNotifications } from "@/lib/dal/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { PreferenceMatrix } from "@/components/notifications/preference-matrix";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Panel } from "@/components/ui/panel";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { markAllNotificationsRead } from "./actions";

// SCR-026 · /app/me/notifications — the inbox and the preference matrix
// (REQ-NTF-001, REQ-NTF-003, REQ-NTF-006).
//
// One page, two sections, rather than a tab widget: at 390 px a tab strip
// costs a row of chrome and hides half the screen's purpose behind a tap,
// and both halves are short. The in-page links at the top are the tabs for
// anyone who wants them and cost nothing to a screen reader.
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; unread?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { saved, error, unread } = await searchParams;
  const unreadOnly = unread === "1";

  const [t, items, preferences] = await Promise.all([
    getTranslations("notifications"),
    listNotifications(locale, { unreadOnly }),
    getPreferenceMatrix(locale),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("preferences.intro")} />

      <nav aria-label={t("title")} className="mt-4 flex flex-wrap gap-4">
        <a href="#inbox" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.inbox")}
        </a>
        <a href="#preferences" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.preferences")}
        </a>
      </nav>

      {saved ? (
        <div role="status">
          <Panel tone="success" className="mt-4 p-3 text-body text-fg-heading">
            {t("preferences.saved")}
          </Panel>
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <Panel tone="error" className="mt-4 p-3 text-body text-fg-heading">
            {t("preferences.error")}
          </Panel>
        </div>
      ) : null}

      <section id="inbox" aria-labelledby="inbox-heading" className="mt-10">
        <SectionHeader
          id="inbox-heading"
          title={t("inbox.heading")}
          actions={
            <>
              {/* A link, not a toggle button: it changes the URL, so `aria-current`
                  is the right announcement and `aria-pressed` is not supported on
                  role=link at all. */}
              <Link
                href={unreadOnly ? "/app/me/notifications" : "/app/me/notifications?unread=1"}
                aria-current={unreadOnly ? "true" : undefined}
                className={`text-label underline underline-offset-4 hover:text-fg-heading ${unreadOnly ? "text-fg-heading" : "text-fg-muted"}`}
              >
                {t("inbox.unreadOnly")}
              </Link>
              <form action={markAllNotificationsRead.bind(null, locale as Locale)}>
                <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                  {t("inbox.markAllRead")}
                </button>
              </form>
            </>
          }
        />
        <NotificationList items={items} timeZone={preferences.timeZone} locale={locale as Locale} />
      </section>

      <section id="preferences" aria-labelledby="preferences-heading" className="mt-12">
        <SectionHeader id="preferences-heading" title={t("preferences.heading")} />
        <PreferenceMatrix rows={preferences.rows} locale={locale as Locale} />
      </section>
    </>
  );
}
