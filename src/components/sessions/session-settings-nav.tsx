import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionSettingsNav, type SessionSettingsKey } from "@/lib/dal/sessions";
import { SessionSettingsStrip, type SessionSettingsStripItem } from "./session-settings-strip";

// The session settings hub — REQ-SES-020, DEC-176, DEC-178. One sub-nav over
// the screens a session already has, rendered by `admin/sessions/[id]/layout.tsx`.
// Not a screen of its own: it joins the four admin screens and the event page,
// where materials, tasks and photos are managed.
//
// ★ NO AUTH DECISION HERE. The items are only what `getSessionSettingsNav()`
// says the viewer may open, and `null` renders nothing — every page below
// still checks at its own data and 404s on its own. A layout that 404'd would
// answer 200 with a not-found body once streaming began (`admin/layout.tsx`,
// bug 1).

const ROUTES: Record<SessionSettingsKey, { href: (id: string) => string; segment: string | null }> = {
  schedule: { href: (id) => `/app/admin/sessions/${id}/schedule`, segment: "schedule" },
  attendance: { href: (id) => `/app/admin/sessions/${id}/attendance`, segment: "attendance" },
  certificates: { href: (id) => `/app/admin/sessions/${id}/certificates`, segment: "certificates" },
  survey: { href: (id) => `/app/admin/sessions/${id}/survey`, segment: "survey" },
  // Out of the hub: never «current».
  event: { href: (id) => `/app/sessions/${id}`, segment: null },
};

export async function SessionSettingsNav({ locale, sessionId }: { locale: string; sessionId: string }) {
  const [nav, t] = await Promise.all([getSessionSettingsNav(locale, sessionId), getTranslations("sessions.hub")]);
  if (!nav || nav.items.length === 0) return null;
  const items: SessionSettingsStripItem[] = nav.items.map((key) => ({
    key,
    href: ROUTES[key].href(sessionId),
    segment: ROUTES[key].segment,
    label: t(`items.${key}`),
  }));
  return <SessionSettingsStrip label={t("label")} items={items} />;
}

/** The strip's place while its one query runs — no text, so no layout shift and nothing to translate. */
export function SessionSettingsNavSkeleton() {
  return (
    <div aria-hidden="true" className="mb-6 flex h-[calc(2.75rem+1px)] items-center border-b border-edge">
      <Skeleton width="16rem" className="max-w-full" />
    </div>
  );
}
