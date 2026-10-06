import { getTranslations } from "next-intl/server";
import { formatDate, formatDateTime, formatTime, formatWeekday } from "@/components/sessions/numerals";
import { dayShortLabel } from "@/components/sessions/day-label";
import { openNotificationAction } from "@/app/[locale]/app/me/notifications/actions";
import type { Locale } from "@/i18n/routing";
import type { NotificationDTO } from "@/lib/dal/notifications";
import type { InboxGroup } from "@/components/notifications/inbox-groups";

// One inbox item — `Notifications.dc.html`, `M10c.md` §6, REQ-UIX-076. Shaped like `feed-item`, not built from it
// (D9, DEC-218 §2.4): an `<article>` with the unread dot and fill, the 36 px category tile, the title, the detail, the
// change lines, the time, and one control.
//
// ★ THE TITLE IS THE CATALOGUE'S, keyed by the `MSG-*` key — never the payload (N5, REQ-NTF-002). The payload's title is
// a detail line inside `<bdi>` (N6), so a session title with a Latin acronym cannot reorder the sentence around it.
//
// ★ ONE FORM PER ITEM (D7, DEC-218 §2.4): its button marks the item read, then an item with a session opens it and one
// without stays. It works without JavaScript. A read item with no session has nothing left to do and no control.
//
// ★ UNREAD IS NEVER COLOUR ALONE (N9, SC 1.4.1): the dot and the fill are drawn, and «غير مقروء» is in the text.

// ★ 0213 (REQ-ADM-025): an org announcement carries no title — its detail line is the admin's own text.
function payloadTitle(payload: Record<string, unknown>): string | null {
  const value = payload.title ?? payload.session_title ?? payload.name ?? payload.body;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** A `changes` entry as `session_days_changed()` and `sessions_notify()` write it (`0111`, `0036`). `day` and `days`
 *  are absent while the session has one day. */
interface PayloadChange {
  field: string;
  from: unknown;
  to: unknown;
  day?: number;
  days?: number;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** The changes to print, or `[]` — every item but a `MSG-session_changed` for a session with MORE THAN ONE DAY
 *  (N7, REQ-SES-009, REQ-SES-018's first rule: a one-day session has no day concept at all). */
function dayChanges(payload: Record<string, unknown>): PayloadChange[] {
  const raw = payload.changes;
  if (!Array.isArray(raw)) return [];
  const changes = raw.filter((c): c is PayloadChange => Boolean(c) && typeof c === "object" && "field" in (c as object));
  return changes.some((c) => Number(c.days) > 1) ? changes : [];
}

export async function InboxItem({ item, group, timeZone, locale }: { item: NotificationDTO; group: InboxGroup; timeZone: string; locale: Locale }) {
  const [t, tDays] = await Promise.all([getTranslations("notifications"), getTranslations("sessions.days")]);
  const unread = item.readAt === null;
  const detail = payloadTitle(item.payload);
  const changes = dayChanges(item.payload);

  /** An instant in the org's zone, anything else as it stands — the mail's rule, for the same reason. */
  const value = (raw: unknown) => {
    const text = raw === null || raw === undefined ? "—" : String(raw);
    return ISO_INSTANT.test(text) ? formatDateTime(text, timeZone, locale) : text;
  };

  // ★ Two strings, not one composed of the other (`tests/unit/notify-i18n.test.ts`): the day is a placeholder of the
  // line itself, so every interpolated value sits inside `<bdi>`.
  const changeLine = (change: PayloadChange) => {
    const key = `change.field.${change.field}` as "change.field.starts_at";
    const named = Number(change.days) > 1 && Number(change.day) >= 1;
    return {
      key: named ? ("change.lineWithDay" as const) : ("change.line" as const),
      values: {
        // A field with no string of its own renders under its own name: a change the member is not told about is the
        // failure REQ-SES-009 exists to prevent.
        label: t.has(key) ? t(key) : change.field,
        from: value(change.from),
        to: value(change.to),
        ...(named ? { day: dayShortLabel({ position: Number(change.day), startsAt: String(item.payload.startsAt ?? "") }, tDays) } : {}),
      },
    };
  };

  // The time as the group needs it: a clock today, a weekday and a clock this week, a date before (A20, N10).
  const time =
    group === "today"
      ? formatTime(item.createdAt, timeZone, locale)
      : group === "week"
        ? `${formatWeekday(item.createdAt, timeZone, locale)} ${formatTime(item.createdAt, timeZone, locale)}`
        : formatDate(item.createdAt, timeZone, locale);

  const control = item.sessionId ? t("inbox.openSession") : unread ? t("inbox.markRead") : null;

  return (
    <article
      data-unread={unread || undefined}
      className={`flex gap-2.5 rounded-panel border border-edge px-3.5 py-3 ${unread ? "bg-surface" : ""}`}
    >
      <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-pill ${unread ? "bg-accent" : ""}`} />
      {/* One neutral ring on every category (D13, DEC-218 §2.4) — decoration, with no glyph to learn. */}
      <span aria-hidden className="size-9 shrink-0 rounded-xl border-2 border-edge-strong bg-raised" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.4]">
        <h3 className={`text-label font-bold ${unread ? "text-fg-heading" : "text-fg-body"}`}>
          {t(`message.${item.key}`)}
          {unread ? <span className="sr-only"> — {t("inbox.unread")}</span> : null}
        </h3>
        {detail ? (
          <p className="text-body-sm text-fg-muted">
            <bdi>{detail}</bdi>
          </p>
        ) : null}
        {changes.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {changes.map((change, index) => {
              const line = changeLine(change);
              return (
                <li key={`${change.field}-${change.day ?? index}`} className="text-body-sm text-fg-body">
                  {t.rich(line.key, { ...line.values, bdi: (chunks) => <bdi>{chunks}</bdi> })}
                </li>
              );
            })}
          </ul>
        ) : null}
        {control ? (
          <form action={openNotificationAction.bind(null, locale)} className="mt-1">
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className="min-h-11 text-label font-bold text-accent underline-offset-4 hover:underline">
              {control}
            </button>
          </form>
        ) : null}
      </div>
      <span className="shrink-0 text-caption text-fg-muted">{time}</span>
    </article>
  );
}
