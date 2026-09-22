import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { formatNumber } from "@/components/sessions/numerals";
import { dayShortName } from "@/components/checkin/day-name";
import { getSessionAwardState, type SessionAwardState } from "@/lib/dal/points";
import { Link } from "@/i18n/navigation";
import { Panel } from "@/components/ui/panel";
import { CheckCircleIcon, ClockIcon, InfoIcon } from "@/components/ui/icons";

// AwardState — REQ-CHK-018, DEC-172, DEC-174 (contract 1).
//
// What the member has earned from this session and when it arrives. It is a
// STATE READ FROM THE DATA, not a message fired once: every render asks
// `getSessionAwardState()` again, so a reload, the event page tomorrow and the
// check-in screen straight after the code all say the same thing. It replaces
// the feedback a one-day check-in's ledger row used to give (REQ-PTS-015).
//
// ★ Nothing here computes an amount or reads `points_ledger`. The number is
// `scoring`'s function's, which shares every condition with `award_points()`,
// so what is shown is what the completion pass writes.
//
// ★ Never `role="status"` or `role="alert"`. A state present on load is
// content, not an announcement — and SCR-014's own status line
// («تم تسجيل حضورك») is asserted as the page's ONLY status by
// `checkin.spec.ts` and `sessions-screens.spec.ts`.
//
// ★ Self-gated on the DTO alone, never on phase or relation: the matrix only
// knows «attended» once a session has ended, and a member who checked in an
// hour ago — or on day one of three — must be told now. `none` renders
// nothing, so this is safe in every cell and the matrix does not move.
//
// Two variants of one body, so the two surfaces cannot disagree:
//   · "section" — SCR-014: its own <h2> and a Panel (the page owns the <h1>);
//   · "inline"  — the event page's action card: no heading (16 §5.4.1a(b)),
//                 no Panel of its own — the card spaces and frames its parts.

type Variant = "section" | "inline";

/** A failed read renders nothing and is logged (DEC-174 Q4): the check-in
 *  screen never breaks on a points read. The log names the session only. */
async function readAward(locale: string, sessionId: string): Promise<SessionAwardState | null> {
  try {
    return await getSessionAwardState(locale, sessionId);
  } catch (error) {
    console.error(`[award-state] session ${sessionId}: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
}

const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

export async function AwardState({ sessionId, locale, variant = "inline" }: Pick<SlotProps, "sessionId" | "locale"> & { variant?: Variant }) {
  const award = await readAward(locale, sessionId);
  if (!award || award.state === "none") return null;
  const [t, tDays] = await Promise.all([getTranslations("checkin.award"), getTranslations("sessions.days")]);

  let tone: "info" | "success" | "ended";
  let icon: ReactNode;
  const lines: ReactNode[] = [];
  let lead: ReactNode;

  if (award.state === "pending") {
    tone = "info";
    icon = <ClockIcon className="text-[1.25rem] text-fg-muted" />;
    lead = t.rich("pending.amount", { count: award.points, value: formatNumber(award.points), bdi });
    // Days only when more than one is REQUIRED — a relaxed workshop reads like a talk.
    if (award.daysRequired > 1) {
      lines.push(t.rich("pending.days", { count: award.daysRequired, value: formatNumber(award.daysRequired), attended: formatNumber(award.daysAttended), bdi }));
    }
    lines.push(award.daysAttended < award.daysRequired ? t("pending.whenRemaining") : t("pending.when"));
  } else if (award.state === "paid") {
    tone = "success";
    icon = <CheckCircleIcon className="text-[1.25rem] text-success" />;
    lead = t.rich("paid.amount", { count: award.points, value: formatNumber(award.points), bdi });
    lines.push(
      <Link key="history" href="/app/me/points" className="text-fg-heading underline underline-offset-4">
        {t("paid.link")}
      </Link>,
    );
  } else {
    tone = "ended";
    icon = <InfoIcon className="text-[1.25rem] text-fg-muted" />;
    lead = t("incomplete.title");
    const names = award.missedDays.map((d) => dayShortName(d, award.dayCount, tDays)).filter((n): n is string => n !== null);
    if (names.length > 0) lines.push(t.rich("incomplete.missed", { count: names.length, days: names.join("، "), bdi }));
    lines.push(t("incomplete.rule"));
  }

  const body = (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className={variant === "section" ? "text-h3 text-fg-heading" : "text-body font-medium text-fg-heading"}>{lead}</p>
        {lines.map((line, i) => (
          <p key={i} className="mt-1 text-body-sm text-fg-body">
            {line}
          </p>
        ))}
      </div>
    </div>
  );

  if (variant === "inline") return <div data-award-state={award.state}>{body}</div>;

  return (
    <section aria-labelledby="award-heading" data-award-state={award.state} className="mt-4 max-w-prose">
      <h2 id="award-heading" className="text-label text-fg-muted">
        {t("heading")}
      </h2>
      <Panel tone={tone} className="mt-2 text-fg-heading">
        {body}
      </Panel>
    </section>
  );
}
