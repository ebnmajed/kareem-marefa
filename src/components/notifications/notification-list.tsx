import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/components/sessions/numerals";
import { markNotificationRead } from "@/app/[locale]/app/me/notifications/actions";
import type { NotificationDTO } from "@/lib/dal/notifications";

// SCR-026's inbox half (REQ-NTF-006). Unread first by visual weight, newest
// first by order.
//
// The TITLE of a row comes from the `notifications` message catalogue keyed by
// the `MSG-*` key — never from the payload. The payload is written by whatever
// enqueued the notification and is rendered only as a bidi-isolated detail
// line, so a session title containing a Latin acronym cannot reorder the
// sentence around it.

function payloadTitle(payload: Record<string, unknown>): string | null {
  const value = payload.title ?? payload.session_title ?? payload.name;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function NotificationList({
  items,
  timeZone,
}: {
  items: NotificationDTO[];
  timeZone: string;
}) {
  const t = await getTranslations("notifications");

  if (items.length === 0) {
    return <p className="mt-6 rounded-field border border-edge p-4 text-body text-fg-muted">{t("inbox.empty")}</p>;
  }

  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => {
        const title = payloadTitle(item.payload);
        const unread = item.readAt === null;
        return (
          <li
            key={item.id}
            className={`rounded-field border p-4 ${unread ? "border-edge-strong bg-silver-100" : "border-edge"}`}
          >
            <p className={`text-label ${unread ? "text-fg-heading" : "text-fg-body"}`}>{t(`message.${item.key}`)}</p>
            {title ? (
              <p className="mt-1 text-body text-fg-body">
                <bdi>{title}</bdi>
              </p>
            ) : null}
            <p className="mt-1 text-body-sm text-fg-muted">{formatDateTime(item.createdAt, timeZone)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {item.sessionId ? (
                <Link href={`/app/sessions/${item.sessionId}`} className="text-label text-fg-heading underline underline-offset-4">
                  {t("inbox.openSession")}
                </Link>
              ) : null}
              {unread ? (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                    {t("inbox.markRead")}
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
