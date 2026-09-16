import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BookmarkButton } from "@/components/search/bookmark-button";
import { SessionPoster } from "@/components/posters/session-poster";
import { formatDateTime } from "@/components/sessions/numerals";
import type { SearchResultSession } from "@/lib/dal/search";

// One SCR-011 result card. `searchSessions()`'s own return shape
// (`src/lib/dal/search.ts`, content-owned and unchanged by this track) is
// `{id, title, abstract, level, language, startsAt, state}` — no venue,
// category or presenter name, so the card shows what that shape carries and
// nothing more was added to `search.ts` for it (out of this track's edit
// list). The date/time is formatted in the ORG's own time zone
// (`getOrgPrefs()`), not the session's own venue override, for the same
// reason — the exact per-venue time is what the event page (SCR-012) shows
// once opened.
export async function SessionCard({
  session,
  locale,
  timeZone,
  bookmarked,
}: {
  session: SearchResultSession;
  locale: string;
  timeZone: string;
  bookmarked: boolean;
}) {
  const t = await getTranslations("browse.card");

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-field border border-edge p-4">
      <Link href={`/app/sessions/${session.id}`} className="block min-w-0">
        <SessionPoster sessionId={session.id} locale={locale} />
        <h3 className="mt-2 text-label text-fg-heading">
          <bdi>{session.title}</bdi>
        </h3>
      </Link>

      <p className="line-clamp-2 text-body-sm text-fg-muted">
        <bdi>{session.abstract}</bdi>
      </p>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-fg-body">
        {session.startsAt ? (
          <div>
            <dt className="sr-only">{t("whenLabel")}</dt>
            <dd>
              <bdi>{formatDateTime(session.startsAt, timeZone, locale)}</bdi>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t("levelLabel")}</dt>
          <dd>{t(`level.${session.level}`)}</dd>
        </div>
        <div>
          <dt className="sr-only">{t("languageLabel")}</dt>
          <dd>{t(`language.${session.language}`)}</dd>
        </div>
      </dl>

      {session.state === "cancelled" ? <p className="text-body-sm text-fg-heading">{t("cancelledBadge")}</p> : null}
      {session.state === "in_progress" ? <p className="text-body-sm text-fg-heading">{t("inProgressBadge")}</p> : null}

      <div className="mt-auto">
        <BookmarkButton locale={locale} sessionId={session.id} initialBookmarked={bookmarked} />
      </div>
    </li>
  );
}
