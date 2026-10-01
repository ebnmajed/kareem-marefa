import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AwardState, readAward } from "@/components/checkin/award-state";
import { CheckInMoment } from "@/components/checkin/moment-check-in";
import { formatNumber, formatTime } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { CoinObject } from "@/components/ui/objects/coin";

// Moment 2's static state — SCR-014 (REQ-UIX-046, REQ-CHK-018, REQ-UIX-062).
//
// The coin at rest and three lines, drawn by the server from the data: a reload, a
// back navigation and a moment that has just played all show the same thing, and
// `CheckInMoment` (kept, DEC-209) only moves it.
//
// ★ ONE TRUTH, SAID ONCE. Line 2 IS `AwardState` — the same DTO, the same words as the
// event page — and the coin's figure is the same `cache()`d read, drawn only for an
// amount there is: pending or paid, above zero. `none`, `incomplete` or a failed read
// draw no number, and a `+0` is never drawn. The coin is `aria-hidden`, so the figure
// is heard once, in line 2.

const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

export async function CheckInRest({
  sessionId,
  locale,
  arrivedAt,
  timeZone,
  teamColor,
}: {
  sessionId: string;
  locale: string;
  arrivedAt: string | null;
  timeZone: string;
  teamColor: string | null;
}) {
  const [award, t, line2] = await Promise.all([readAward(locale, sessionId), getTranslations("checkin.moment"), AwardState({ sessionId, locale, variant: "moment" })]);
  const amount = award && (award.state === "pending" || award.state === "paid") && award.points > 0 ? `+${formatNumber(award.points)}` : undefined;
  const eventHref = `/app/sessions/${sessionId}`;

  return (
    <CheckInMoment
      teamColor={teamColor}
      eventHref={eventHref}
      coin={<CoinObject size={160} amount={amount} />}
      lines={
        <>
          <h2 className="font-display text-play-xl text-accent">{t("here")}</h2>
          {line2}
          {arrivedAt ? (
            <p className="rounded-pill border border-edge bg-raised px-3 py-1 text-body-sm font-medium text-fg-heading">
              {t.rich("recordedAt", { time: formatTime(arrivedAt, timeZone, locale), bdi })}
            </p>
          ) : null}
        </>
      }
      link={
        <ButtonLink href={eventHref} variant="secondary">
          {t("toSession")}
        </ButtonLink>
      }
    />
  );
}
