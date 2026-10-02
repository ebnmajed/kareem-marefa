import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBookmarkedTimelineSessions } from "@/lib/dal/bookmarks";
import { formatNumber } from "@/components/sessions/numerals";
import { SessionRow } from "@/components/browse/session-row";
import { BookmarkList } from "@/components/me/bookmark-list";
import { HubStrip } from "@/components/shell/hub-strip";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { EmptyState } from "@/components/ui/empty-state";

// SCR-024 · «المحفوظات» — `Bookmarks.dc.html`, `M10c.md` §4, REQ-UIX-074, REQ-DSC-006. Written from the artboard in
// wave 20 after the old page was deleted (DEC-208); its kept-behaviour table is B1 – B8 in
// `docs/plan/notes/content.md`.
//
// In the artboard's order: the page's own top row (a back control to `/app/me`, the `h1`), the phone strip, then the
// saved sessions — each browse's row as it is (`SessionRow`, `011`), the filled bookmark at its end — and nothing
// else: no groups, no status lines, no count.
//
// ★ PRIVATE TO THE MEMBER (B1): `getBookmarkedTimelineSessions()` reads the session's own bookmarks through
// `p7_self_read`, most recently saved first; a session the member can no longer see has no row.
//
// ★ No «+N» on a row (B8, D12): bookmarking earns nothing, and the artboard draws no amount — `points={null}`.
//
// ★ The count the old page drew as an `h2` stays for assistive technology only (D11): without it browse's row's `h3`
// would follow the `h1` with a level skipped.
export default async function BookmarksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tSearch, tNav, sessions] = await Promise.all([
    getTranslations("profile.bookmarks"),
    getTranslations("search.bookmarksPage"),
    getTranslations("profile.nav"),
    getBookmarkedTimelineSessions(locale),
  ]);
  const now = new Date();

  const empty = <EmptyState title={t("empty")} action={{ label: tSearch("browseAction"), href: "/app/sessions" }} />;

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow title={tNav("bookmarks")} />
      <HubStrip />
      {sessions.length > 0 ? (
        <h2 className="sr-only">{tSearch("count", { count: sessions.length, value: formatNumber(sessions.length) })}</h2>
      ) : null}
      <BookmarkList
        locale={locale}
        empty={empty}
        items={sessions.map((session) => ({
          id: session.id,
          row: <SessionRow session={session} locale={locale} points={null} now={now} />,
        }))}
      />
    </div>
  );
}
