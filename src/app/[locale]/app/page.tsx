import { setRequestLocale } from "next-intl/server";
import { SessionsTimeline } from "@/components/browse/sessions-timeline";

// SCR-010 · /app — where a member lands, and it IS the sessions timeline
// (DEC-112, DEC-130, REQ-UIX-021).
//
// «The landing page is the sessions list — the user lands on the available
// ones.» The «أهلًا ريم» dashboard and its rails are withdrawn; a member lands
// on something they can act on, with no second navigation.
//
// ★ It renders the timeline rather than redirecting to `/app/sessions`: sign-in
// lands here, and a redirect would cost every member a round trip on every
// landing. It shows the default view and ignores its own query string — every
// filter control links to `/app/sessions?…`, the canonical address.
export default async function AppHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SessionsTimeline locale={locale} />;
}
