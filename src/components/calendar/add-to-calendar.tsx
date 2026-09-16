import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import type { SlotProps } from "@/components/sessions/slots";
import { getSessionForCalendar } from "@/lib/dal/calendar";
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
// `placement`: the action card from `md` up, the phone's bottom action bar
// below it — one visible button per width.
export async function AddToCalendar({ sessionId, locale, placement = "card" }: SlotProps & { placement?: "card" | "bar" }) {
  const [t, session] = await Promise.all([getTranslations("calendar"), getSessionForCalendar(locale, sessionId)]);
  if (!session || session.cancelled) return null;

  // The absolute origin, because a calendar provider fetches these URLs from
  // its own servers — a relative path would resolve against google.com.
  const host = (await headers()).get("host") ?? "kareem.pp.sa";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${proto}://${host}`;
  const icsUrl = `${origin}/api/sessions/${session.id}/ics`;

  const links = calendarLinks({
    title: session.title,
    description: session.abstract,
    location: session.venue ? [session.venue.name, session.venue.address].filter(Boolean).join("، ") : null,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timeZone: session.timeZone,
    icsUrl,
    eventUrl: `${origin}/${locale}/app/sessions/${session.id}`,
  });

  return (
    <CalendarMenu
      label={t("add.heading")}
      links={{ google: links.google, outlook: links.outlook, ics: icsUrl }}
      labels={{ google: t("add.google"), outlook: t("add.outlook"), apple: t("add.apple") }}
      placement={placement}
    />
  );
}
