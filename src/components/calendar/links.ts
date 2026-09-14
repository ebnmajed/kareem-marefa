// Add-to-calendar links — REQ-CAL-002, 08 §6.2.
//
// "Each pre-filled and URL-encoded — and tested with Arabic titles, which is
// where naive encoding breaks."
//
// THE TRAP, and the reason this does not use `URLSearchParams`: that class
// encodes a space as `+`, because it implements
// `application/x-www-form-urlencoded`, not percent-encoding for a URI query.
// Google tolerates it; Outlook's `subject` shows the literal plus signs. And
// Arabic has plenty of spaces. `encodeURIComponent` percent-encodes both the
// spaces and the Arabic, which is what every provider actually parses.

export interface CalendarLinkInput {
  title: string;
  description: string;
  location: string | null;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  timeZone: string;
  /** Absolute URL of the ICS download, which is also the Apple link. */
  icsUrl: string;
  /** Absolute URL of the event page, appended to the description. */
  eventUrl: string;
}

export interface CalendarLinks {
  google: string;
  outlook: string;
  apple: string;
}

const q = (value: string) => encodeURIComponent(value);

/** `20261001T150000Z` — Google wants UTC instants and a separate `ctz`. */
const compactUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function calendarLinks(input: CalendarLinkInput): CalendarLinks {
  const details = [input.description, input.eventUrl].filter(Boolean).join("\n\n");

  const google =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${q(input.title)}` +
    `&dates=${compactUtc(input.startsAt)}/${compactUtc(input.endsAt)}` +
    `&details=${q(details)}` +
    (input.location ? `&location=${q(input.location)}` : "") +
    // The instants above are UTC; `ctz` is what makes Google show the hour in
    // the session's own zone rather than the reader's (08 §6.1's rule, again).
    `&ctz=${q(input.timeZone)}`;

  const outlook =
    "https://outlook.office.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent" +
    `&subject=${q(input.title)}` +
    `&startdt=${q(new Date(input.startsAt).toISOString())}` +
    `&enddt=${q(new Date(input.endsAt).toISOString())}` +
    `&body=${q(details)}` +
    (input.location ? `&location=${q(input.location)}` : "");

  // Apple Calendar has no web compose URL; the ICS download IS the link, and
  // macOS and iOS both open `text/calendar` with it.
  return { google, outlook, apple: input.icsUrl };
}
