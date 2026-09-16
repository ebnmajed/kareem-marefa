import { setRequestLocale } from "next-intl/server";
import { SessionsTimeline } from "@/components/browse/sessions-timeline";

// SCR-011 · /app/sessions — the sessions timeline on its canonical address
// (DEC-112, DEC-130, REQ-UIX-021, REQ-UIX-022, REQ-DSC-003 … REQ-DSC-006).
//
// The same component as `/app`, not a redirect to or from it. This is the
// linkable, filterable URL: tag chips on an event page, the shell's search box
// and every filter control land here, and its query string is the filter
// state (`components/browse/timeline-query.ts`).
export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SessionsTimeline locale={locale} searchParams={await searchParams} />;
}
