import { getTranslations } from "next-intl/server";
import { getAttendanceRulePoints } from "@/lib/dal/search";
import { readAward } from "@/components/checkin/award-state";
import { formatNumber } from "@/components/sessions/numerals";
import { Panel } from "@/components/ui/panel";
import { Sticker } from "@/components/ui/sticker";

// SCR-014's earn panel (`CheckIn.dc.html`, REQ-UIX-062, REQ-CHK-018): before the check-in, what
// attending pays and that it arrives when the session ends.
//
// ★ THE FIGURE IS THE RULE'S, READ — never a literal «+50» (DEC-206 §4.45, contract 7): the org's
// attendance rule through `sessions'` `getAttendanceRulePoints()`, the one reader the feed uses too.
// Off, zero or a failed read draws nothing, so a `+0` is never drawn. Streamed by the page.
// ★ IT SPEAKS ONLY WHEN THE AWARD STATE HAS NOTHING TO SAY. Once a member holds a pending, paid or
// incomplete award — day 2 of 3 — the page's `AwardState` says it in this place, from the computed
// DTO; two panels would say two different things about one sum.
// ★ NOT the region «نقاط هذه الجلسة»: that name is the award state's, and before the check-in there
// is none (`wave12-checkin-acknowledgement.spec.ts`). No streak line (DEC-206 §4.49).

export async function EarnPanel({
  sessionId,
  locale,
  allDays,
}: {
  sessionId: string;
  locale: string;
  /** The amount needs every day of a multi-day session (REQ-SES-017). */
  allDays: boolean;
}) {
  const [amount, award] = await Promise.all([getAttendanceRulePoints(locale).catch(() => null), readAward(locale, sessionId)]);
  if (amount === null || amount <= 0) return null;
  if (award && award.state !== "none") return null;
  const t = await getTranslations("checkin.earn");
  return (
    <Panel className="flex items-center justify-center gap-3 text-center text-body-sm text-fg-muted">
      <Sticker fill="accent" rotate={-4} size="sm" informative className="shrink-0">
        +{formatNumber(amount)}
      </Sticker>
      <span>{t(allDays ? "whenAllDays" : "when")}</span>
    </Panel>
  );
}
