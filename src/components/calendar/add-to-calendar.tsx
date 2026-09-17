import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import type { SlotProps } from "@/components/sessions/slots";
import { getSessionForCalendar } from "@/lib/dal/calendar";
import { listSessionDays } from "@/lib/dal/sessions";
import { dayShortLabel } from "@/components/sessions/day-label";
import { calendarLinks } from "@/components/calendar/links";
import { CalendarMenu } from "@/components/sessions/calendar-menu";

// The `AddToCalendar` slot on SCR-012 (TEAM.md §2, REQ-CAL-001, REQ-CAL-002).
//
// Server component, own data through the calendar DAL, ids as props and never
// rows — and NO heading of its own: the event page owns the landmark and the
// <h2>, and a slot that repeats it is announced twice by a screen reader
// (DEC-045).
//
// Renders nothing for a session with no time yet, which is every session
// before it is scheduled. The links would be meaningless and the ICS would be
// a 404.

// ★ Wave 6 (DEC-130), presentation only: the three links become ONE button
// over a menu, because after a seat is held this is the page's one primary
// action (`16` §5.4.2). The button's name is the existing `add.heading`
// «أضِف إلى تقويمك». What the links point at, and when this renders at all, is
// unchanged — the event page still gates it on `can.calendar`.
//
// `placement`: as the page's primary action, the action card from `md` up and
// the phone's bottom action bar below it — one visible button per width; as a
// secondary action (a running session, beside «تسجيل الحضور»), `inline`.
export async function AddToCalendar({
  sessionId,
  locale,
  placement = "card",
  variant = "primary",
}: SlotProps & { placement?: "card" | "bar" | "inline"; variant?: "primary" | "secondary" }) {
  const [t, tDays, session, days] = await Promise.all([
    getTranslations("calendar"),
    // Contract 7: `sessions`' own day words, read never written.
    getTranslations("sessions.days"),
    getSessionForCalendar(locale, sessionId),
    // Contract 3: days are read through `sessions`' DAL, never re-queried.
    listSessionDays(locale, sessionId),
  ]);
  if (!session || session.cancelled) return null;

  // The absolute origin, because a calendar provider fetches these URLs from
  // its own servers — a relative path would resolve against google.com.
  const host = (await headers()).get("host") ?? "kareem.pp.sa";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${proto}://${host}`;
  const icsUrl = `${origin}/api/sessions/${session.id}/ics`;

  const eventUrl = `${origin}/${locale}/app/sessions/${session.id}`;
  const place = (venue: { name: string; address: string | null } | null) =>
    venue ? [venue.name, venue.address].filter(Boolean).join("، ") : null;

  // ★ ONE LINK SET PER DAY (REQ-SES-015). The ICS download is still ONE file
  // carrying every day (`buildIcsCalendar`), because a calendar file can hold
  // several VEVENTs; Google's and Outlook's compose URLs describe exactly one
  // event each, so a three-day workshop has three of them.
  //
  // The list falls back to the session's own window only when the day read
  // came back empty, which `0100`'s backfill makes impossible for a session
  // that has a time. It is not a branch on «is it multi-day».
  const meetings = days.length > 0 ? days : [{ position: 1, startsAt: session.startsAt, endsAt: session.endsAt, venue: session.venue }];
  const groups = meetings.map((day) => ({
    label: dayShortLabel({ position: day.position, startsAt: day.startsAt }, tDays),
    links: calendarLinks({
      title: session.title,
      description: session.abstract,
      location: place(day.venue),
      startsAt: day.startsAt,
      endsAt: day.endsAt,
      timeZone: session.timeZone,
      icsUrl,
      eventUrl,
    }),
  }));

  // `groups` is `sessions`' prop (`cf87fe1`, my request in §W11.2): rendered
  // flat unless there are at least two, so a one-day menu keeps today's DOM
  // exactly — three items, no rule, no prefix. `links` stays the first day's,
  // which is what that flat rendering reads.
  return (
    <CalendarMenu
      label={t("add.heading")}
      links={{ google: groups[0].links.google, outlook: groups[0].links.outlook, ics: icsUrl }}
      labels={{ google: t("add.google"), outlook: t("add.outlook"), apple: t("add.apple") }}
      groups={groups.map((group) => ({ label: group.label, links: { google: group.links.google, outlook: group.links.outlook } }))}
      placement={placement}
      variant={variant}
    />
  );
}
