import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPreferenceMatrix, listNotifications } from "@/lib/dal/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { PreferenceMatrix } from "@/components/notifications/preference-matrix";
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
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{t("preferences.intro")}</p>

      <nav aria-label={t("title")} className="mt-4 flex flex-wrap gap-4">
        <a href="#inbox" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.inbox")}
        </a>
        <a href="#preferences" className="text-label text-fg-heading underline underline-offset-4">
          {t("tabs.preferences")}
        </a>
      </nav>

      {saved ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("preferences.saved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t("preferences.error")}
        </p>
      ) : null}

      <section id="inbox" aria-labelledby="inbox-heading" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="inbox-heading" className="text-h2 text-fg-heading">
            {t("inbox.heading")}
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            {/* A link, not a toggle button: it changes the URL, so `aria-current`
                is the right announcement and `aria-pressed` is not supported on
                role=link at all. */}
            <a
              href={unreadOnly ? "?" : "?unread=1"}
              aria-current={unreadOnly ? "true" : undefined}
              className={`text-label underline underline-offset-4 hover:text-fg-heading ${unreadOnly ? "text-fg-heading" : "text-fg-muted"}`}
            >
              {t("inbox.unreadOnly")}
            </a>
            <form action={markAllNotificationsRead}>
              <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                {t("inbox.markAllRead")}
              </button>
            </form>
          </div>
        </div>
        <NotificationList items={items} numerals={preferences.numerals} timeZone={preferences.timeZone} />
      </section>

      <section id="preferences" aria-labelledby="preferences-heading" className="mt-12">
        <h2 id="preferences-heading" className="text-h2 text-fg-heading">
          {t("preferences.heading")}
        </h2>
        <PreferenceMatrix rows={preferences.rows} />
      </section>
    </>
  );
}
