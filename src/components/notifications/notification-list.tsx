import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/components/sessions/numerals";
import { dayShortLabel } from "@/components/sessions/day-label";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { markNotificationRead } from "@/app/[locale]/app/me/notifications/actions";
import type { Locale } from "@/i18n/routing";
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

/** A `changes` entry as `session_days_changed()` and `sessions_notify()` write
 *  it (migrations `0111`, `0036`). `day` and `days` are absent while the
 *  session has one day, which is what keeps a one-day card unchanged. */
interface PayloadChange {
  field: string;
  from: unknown;
  to: unknown;
  day?: number;
  days?: number;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * The changes to print, or `[]` — which is every card except a
 * `MSG-session_changed` for a session with MORE THAN ONE DAY.
 *
 * ★ `REQ-SES-018`'s first rule, applied to the inbox: a session with one day
 * has no day concept at all, so its card stays exactly what it has been since
 * M3 — the title, the time, the two actions — and
 * `tests/components/notifications/notification-list.test.tsx` pins that
 * unmodified. At several days «تغيّرت تفاصيل جلسة» alone makes a member open
 * the session and work out which evening moved, which is the diffing `08` §3.3
 * says not to hand them.
 */
function dayChanges(payload: Record<string, unknown>): PayloadChange[] {
  const raw = payload.changes;
  if (!Array.isArray(raw)) return [];
  const changes = raw.filter((c): c is PayloadChange => Boolean(c) && typeof c === "object" && "field" in (c as object));
  return changes.some((c) => Number(c.days) > 1) ? changes : [];
}

export async function NotificationList({
  items,
  timeZone,
  locale,
}: {
  items: NotificationDTO[];
  timeZone: string;
  locale: Locale;
}) {
  const [t, tDays] = await Promise.all([
    getTranslations("notifications"),
    // Contract 7: the day is named in `sessions`' words on every surface.
    getTranslations("sessions.days"),
  ]);

  /** An instant in the org's zone, anything else as it stands. Same rule the
   *  mail applies (`worker/src/mail/render.ts`), for the same reason: the
   *  session happens in a room and the room's clock is the one that matters. */
  const value = (raw: unknown) => {
    const text = raw === null || raw === undefined ? "—" : String(raw);
    return ISO_INSTANT.test(text) ? formatDateTime(text, timeZone, locale) : text;
  };

  // ★ TWO STRINGS, NOT ONE COMPOSED OF THE OTHER. `tests/unit/notify-i18n.test.ts`
  // requires every interpolated value in this namespace to sit inside `<bdi>`,
  // and a label built by one `t()` and then fed to another would either carry
  // its tags through as literal text or reach `line` unisolated. So the day is
  // a placeholder of the line itself.
  const changeLine = (change: PayloadChange, startsAt: unknown) => {
    // A field with no string of its own renders under its own name rather than
    // being dropped: a change the member is not told about is the failure
    // `REQ-SES-009` exists to prevent (`worker/src/mail/render.ts` says the
    // same thing about the mail's labels).
    const key = `change.field.${change.field}` as "change.field.starts_at";
    const named = Number(change.days) > 1 && Number(change.day) >= 1;
    return {
      key: named ? ("change.lineWithDay" as const) : ("change.line" as const),
      values: {
        label: t.has(key) ? t(key) : change.field,
        from: value(change.from),
        to: value(change.to),
        ...(named ? { day: dayShortLabel({ position: Number(change.day), startsAt: String(startsAt ?? "") }, tDays) } : {}),
      },
    };
  };

  if (items.length === 0) {
    return (
      <div role="status">
        <Panel className="mt-6 text-body text-fg-muted">{t("inbox.empty")}</Panel>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => {
        const title = payloadTitle(item.payload);
        const unread = item.readAt === null;
        return (
          <li key={item.id}>
            <Panel tone={unread ? "info" : "neutral"} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className={`text-label ${unread ? "text-fg-heading" : "text-fg-body"}`}>{t(`message.${item.key}`)}</p>
                {unread ? (
                  <Badge tone="info" size="sm">
                    {t("inbox.unread")}
                  </Badge>
                ) : null}
              </div>
              {title ? (
                <p className="mt-1 text-body text-fg-body">
                  <bdi>{title}</bdi>
                </p>
              ) : null}
              {/* ★ WHICH DAY, AND WHAT MOVED (REQ-SES-009). Empty for every
                  card but a change on a session with more than one day, so a
                  one-day inbox is exactly today's. */}
              {dayChanges(item.payload).length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {dayChanges(item.payload).map((change, index) => {
                    const line = changeLine(change, item.payload.startsAt);
                    return (
                      <li key={`${change.field}-${change.day ?? index}`} className="text-body-sm text-fg-body">
                        {t.rich(line.key, { ...line.values, bdi: (chunks) => <bdi>{chunks}</bdi> })}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <p className="mt-1 text-body-sm text-fg-muted">{formatDateTime(item.createdAt, timeZone)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {item.sessionId ? (
                  <Link href={`/app/sessions/${item.sessionId}`} className="text-label text-fg-heading underline underline-offset-4">
                    {t("inbox.openSession")}
                  </Link>
                ) : null}
                {unread ? (
                  <form action={markNotificationRead.bind(null, locale)}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
                      {t("inbox.markRead")}
                    </button>
                  </form>
                ) : null}
              </div>
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
