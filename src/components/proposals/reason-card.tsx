import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { formatDateTime } from "@/components/sessions/numerals";

// What the reviewer wrote — SCR-018's reason card and SCR-017's resubmit state (`Proposal.dc.html`, `M10b.md` §3 – §4,
// REQ-PRO-005).
//
// ★ NOBODY'S NAME (DEC-213 §5.99): no column records who decided, so the card says «ما كتبه المشرف» and the time —
// never an avatar, a name or a role it would have to invent.
// ★ THE TIME IS SOUND: in changes requested and rejected the last write to the row is the reviewer's — the proposer
// cannot update either state, and presenter changes do not touch `proposals` — so `updatedAt` is the decision's.
// Bordered in the signal while it needs the member (changes requested), muted once it does not (rejected): a state
// colour, never a status (`DEC-073`). The one primary, when there is one, is the caller's.

export async function ReasonCard({
  reason,
  decidedAt,
  timeZone,
  locale,
  tone,
  action,
}: {
  reason: string;
  decidedAt: string;
  timeZone: string;
  locale: string;
  tone: "signal" | "muted";
  action?: ReactNode;
}) {
  const t = await getTranslations("proposals.proposal");
  return (
    <section
      aria-labelledby="reason"
      className={`flex flex-col gap-2.5 rounded-panel border bg-surface p-3.5 ${tone === "signal" ? "border-signal" : "border-edge"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="reason" className="text-label font-bold text-fg-heading">
          {t("reasonLabel")}
        </h2>
        <p className="text-caption text-fg-muted">
          <bdi>{formatDateTime(decidedAt, timeZone, locale)}</bdi>
        </p>
      </div>
      <blockquote className="whitespace-pre-line rounded-tile bg-raised px-3.5 py-2.5 text-body">
        <bdi>{reason}</bdi>
      </blockquote>
      {action}
    </section>
  );
}
