import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { formatDate, formatNumber, formatTime, formatWeekday } from "@/components/sessions/numerals";
import { teamColorOrNull } from "@/components/ui/avatar";
import { Link } from "@/components/ui/link";
import { getNextForMe, type NextForMeItem } from "@/lib/dal/search";

// «التالية لك» — the game rail's fourth card (`HomeDesktop.dc.html`, `M10a.md` §5,
// DEC-206 §4.59, DEC-207 §2). The member's own coming sessions, a seat or a
// waitlist place, live first and then the soonest; each a link to its event page.
// It is THE «التالية لك»: the home and browse both pass it to `GameRail`.
//
// ★ NOTHING IS DRAWN WITH NO ITEMS. A card that says «nothing is next» is a card
// about nothing; the rail simply has three.
//
// ★ THE TITLE WRAPS. The artboard ellipsises it on one line with `overflow: hidden`,
// which clips an Arabic line's marks (`10` §1); two lines of a 13 px title fit.
//
// The thumb is the poster scaled whole when one has rendered, else the lead
// presenter's team colour as a tile — decoration beside a title that is already
// read, so it is `aria-hidden`. The card's frame is the rail's own (scoring's cards
// beside it): the surface, its rule, the panel radius.

const WEEK_MS = 6 * 86_400_000;

function when(item: NextForMeItem, locale: string, now: Date): string | null {
  if (!item.startsAt) return null;
  const near = Date.parse(item.startsAt) - now.getTime() < WEEK_MS;
  const day = near ? formatWeekday(item.startsAt, item.timeZone, locale) : formatDate(item.startsAt, item.timeZone, locale);
  return `${day} ${formatTime(item.startsAt, item.timeZone, locale)}`;
}

export async function NextForMe({ locale, limit = 3 }: { locale: string; limit?: number }) {
  const items = await getNextForMe(locale, limit);
  if (items.length === 0) return null;
  const t = await getTranslations("browse.next");
  const now = new Date();

  return (
    <section aria-labelledby="next-for-me" className="flex flex-col gap-2 rounded-panel border border-edge bg-surface p-4">
      <h2 id="next-for-me" className="text-caption font-bold text-fg-muted">
        {t("heading")}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const colour = teamColorOrNull(item.teamColor);
          const at = item.phase === "live" ? t("live") : when(item, locale, now);
          const hold =
            item.hold === "seat"
              ? t("seat")
              : item.waitlistPosition !== null
                ? t.rich("waitlist", { position: formatNumber(item.waitlistPosition), bdi: (c) => <bdi>{c}</bdi> })
                : t("waitlistNoPosition");
          return (
            <li key={item.id}>
              <Link href={item.href} quiet className="flex items-center gap-2.5 text-fg-heading no-underline">
                <span
                  aria-hidden="true"
                  style={colour ? ({ "--team": colour } as CSSProperties) : undefined}
                  className={`flex h-[2.625rem] w-[2.125rem] shrink-0 items-center justify-center overflow-hidden rounded-tile ${colour ? "bg-team" : "bg-raised"}`}
                >
                  {item.posterUrl ? (
                    // A thumb of the signed poster — scaled whole, never cropped (REQ-UIX-026).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.posterUrl} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-sm font-bold leading-snug">
                    <bdi>{item.title}</bdi>
                  </span>
                  <span className="text-caption text-fg-muted">
                    {at ? (
                      <>
                        <bdi>{at}</bdi>
                        {" · "}
                      </>
                    ) : null}
                    {hold}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
