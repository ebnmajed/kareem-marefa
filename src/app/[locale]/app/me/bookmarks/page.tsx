import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBookmarkedTimelineSessions } from "@/lib/dal/bookmarks";
import { formatNumber } from "@/components/sessions/numerals";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionCard } from "@/components/browse/session-card";

// SCR-024 — «المحفوظات» (REQ-DSC-006). `p7_self_read` (0037) is the entire
// boundary — there is nothing here another member could ever see. A
// fully-owned route, not a slot, so (unlike materials/photos/tasks) it
// carries its own `<h1>`.
//
// On the system: `getBookmarkedTimelineSessions()` (`sessions`', landed
// a424957) reads the same `TimelineSession` shape the timeline itself does,
// so the card is `SessionCard` — one row-to-card derivation, not a second
// one of this route's own. Per `sessions`' own notes on it: `pinned` stays
// off (that variant is the timeline's "next session" hero), the list sits
// under an `<h2>` so the heading levels don't skip from this page's `<h1>`
// straight to the card's own `<h3>` title, and un-bookmarking runs inside
// the card's own optimistic transition — its action already revalidates
// this path, proven in `tests/e2e/bookmarks.spec.ts` rather than only
// trusted.
export default async function BookmarksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, sessions] = await Promise.all([getTranslations("search.bookmarksPage"), getBookmarkedTimelineSessions(locale)]);

  return (
    <div>
      <PageHeader title={t("heading")} />

      {sessions.length === 0 ? (
        <EmptyState title={t("empty")} action={{ label: t("browseAction"), href: "/app/sessions" }} className="mt-6" />
      ) : (
        <div className="mt-6">
          <SectionHeader as="h2" title={t("count", { count: sessions.length, value: formatNumber(sessions.length) })} />
          <ol className="mt-4 flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionCard session={session} locale={locale} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
