import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getBookmarksPageData } from "@/lib/dal/bookmarks";
import { formatNumber } from "@/components/sessions/numerals";

// SCR-024 — «المحفوظات» (REQ-DSC-006). A member's own saved sessions, most
// recently bookmarked first; `p7_self_read` (0037) is the entire boundary
// — there is nothing here another member could ever see. A fully-owned
// route, not a slot, so (unlike Materials/Photos/Tasks) it carries its own
// heading.
export default async function BookmarksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("search.bookmarksPage");
  const { sessions, numerals } = await getBookmarksPageData(locale);

  return (
    <div>
      <h1 className="text-h1 text-fg-heading">{t("heading")}</h1>

      {sessions.length === 0 ? (
        <p className="mt-4 text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <>
          <p className="mt-2 text-body-sm text-fg-muted">{t("count", { count: sessions.length, value: formatNumber(sessions.length, numerals) })}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-field border border-edge p-4">
                <Link href={`/${locale}/app/sessions/${s.id}`} className="text-body font-medium text-fg-heading hover:underline">
                  <bdi>{s.title}</bdi>
                </Link>
                <p className="mt-1 text-body-sm text-fg-body">
                  <bdi>{s.abstract}</bdi>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
