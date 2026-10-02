import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUnreadCount, listInbox } from "@/lib/dal/notifications";
import { groupInbox } from "@/components/notifications/inbox-groups";
import { InboxItem } from "@/components/notifications/inbox-item";
import { UnreadFilter } from "@/components/notifications/unread-filter";
import { HubStrip } from "@/components/shell/hub-strip";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { EmptyState } from "@/components/ui/empty-state";
import { GearIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { markAllNotificationsRead } from "./actions";

// SCR-026 · «الإشعارات» — `Notifications.dc.html`, `M10c.md` §6, REQ-UIX-076. Written from the artboard in wave 20
// after the old page was deleted (DEC-208); its kept-behaviour table is N1 – N16 in `docs/plan/notes/notify.md` (§W2).
//
// The inbox and nothing else (DEC-216 §5.13): the top row, the strip, a toolbar — «غير المقروء فقط», «تعليم الكل كمقروء»
// (or «لا شيء غير مقروء» when nothing is), «ما يصلني» to `/app/me/settings` — then the items grouped by day, and
// «عرض الأقدم». No preference is set here; they live on `029`.
//
// ★ Everything works without JavaScript: the filter is a GET form, mark-all and each item are forms whose actions
// redirect, and «عرض الأقدم» is a link carrying the page's cursor.
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unread?: string; before?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { unread, before, error } = await searchParams;
  const unreadOnly = unread === "1";

  const [t, page, unreadCount] = await Promise.all([
    getTranslations("notifications"),
    listInbox(locale, { unreadOnly, before }),
    getUnreadCount(locale),
  ]);
  const groups = groupInbox(page.items, new Date(), page.timeZone);
  const olderHref = page.nextCursor ? `/app/me/notifications?${new URLSearchParams({ ...(unreadOnly ? { unread: "1" } : {}), before: page.nextCursor })}` : null;

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow title={t("title")} />
      <HubStrip />

      {error ? (
        <div role="alert">
          <Panel tone="error" className="p-3 text-body text-fg-heading">
            {t("inbox.error")}
          </Panel>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <UnreadFilter checked={unreadOnly} label={t("inbox.unreadOnly")} apply={t("inbox.apply")} />
        <div className="flex items-center gap-4">
          {unreadCount > 0 ? (
            <form action={markAllNotificationsRead.bind(null, locale as Locale)}>
              <button type="submit" className="min-h-11 text-label font-bold text-accent underline-offset-4 hover:underline">
                {t("inbox.markAllRead")}
              </button>
            </form>
          ) : (
            <p role="status" className="text-label text-fg-muted">
              {t("inbox.allRead")}
            </p>
          )}
          <Link href="/app/me/settings" className="inline-flex min-h-11 items-center gap-1.5 text-label font-bold text-fg-muted hover:text-fg-heading">
            <GearIcon aria-hidden />
            {t("inbox.prefsLink")}
          </Link>
        </div>
      </div>

      {page.items.length === 0 ? (
        <div role="status">
          {unreadOnly ? (
            <EmptyState title={t("inbox.allRead")} action={{ label: t("inbox.showAll"), href: "/app/me/notifications" }} />
          ) : (
            <EmptyState title={t("inbox.empty")} action={{ label: t("inbox.browse"), href: "/app/sessions" }} />
          )}
        </div>
      ) : (
        groups.map(({ group, items }, index) => (
          <section key={`${group}-${index}`} aria-labelledby={`inbox-${group}-${index}`} className="flex flex-col gap-2">
            <SectionHeader id={`inbox-${group}-${index}`} title={t(`inbox.group.${group}`)} />
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id}>
                  <InboxItem item={item} group={group} timeZone={page.timeZone} locale={locale as Locale} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {olderHref ? (
        <Link href={olderHref} className="self-center py-2 text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
          {t("inbox.older")}
        </Link>
      ) : null}
    </div>
  );
}
