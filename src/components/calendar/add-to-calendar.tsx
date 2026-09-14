import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import type { SlotProps } from "@/components/sessions/slots";
import { getSessionForCalendar } from "@/lib/dal/calendar";
import { calendarLinks } from "@/components/calendar/links";

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

const linkClass =
  "inline-flex h-11 items-center rounded-field border border-edge px-4 text-label text-fg-body hover:border-edge-strong hover:text-fg-heading";

export async function AddToCalendar({ sessionId, locale }: SlotProps) {
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
    <div>
      <h3 className="text-label text-fg-heading">{t("add.heading")}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        <li>
          {/* `rel="noreferrer"` on every outbound one: the event page's URL
              carries a session id, and a calendar provider has no need of it. */}
          <a href={links.google} target="_blank" rel="noreferrer" className={linkClass}>
            {t("add.google")}
          </a>
        </li>
        <li>
          <a href={links.outlook} target="_blank" rel="noreferrer" className={linkClass}>
            {t("add.outlook")}
          </a>
        </li>
        <li>
          <a href={icsUrl} className={linkClass}>
            {t("add.apple")}
          </a>
        </li>
      </ul>
      <p className="mt-2 text-body-sm text-fg-muted">{t("add.hint")}</p>
    </div>
  );
}
