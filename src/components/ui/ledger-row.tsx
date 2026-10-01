import type { ReactNode } from "react";
import type { LedgerRowProps } from "@/components/ui";

// scoring's file — REQ-UIX-081, REQ-UIX-072, REQ-PTS-003, REQ-NFR-007, DEC-216 §5.5, §5.9.
//
// One line of a points history (`SCR-022`, `docs/design/screens/m10c/Points.dc.html`): the signed figure in the
// display face at the inline-start, the row's own reason, and a quiet line under it — the session and the time. It
// reads nothing and formats nothing: the figure arrives as the caller's string, sign included.
//
// Four forms, from props:
//   · `entry`    — a ledger row. A gain in the accent, a loss in the signal.
//   · `cap`      — ★ an EXPLANATION, never a ledger row (`points.ts`'s `MissedAttendance` precedent, `05` §8): a
//                  dashed outline on the ground, everything muted, the figure `0`.
//   · `reversal` — the compensating row and, beneath it inside the same row, the row it reverses, struck through at
//                  70 % (`DEC-216` §5.9). Both are ledger rows; both are drawn, once each.
//   · `notice`   — an explanation with NO figure (`REQ-SES-017`'s missed day): the absence of a number is the fact.
//
// ★ A LOSS IS NEVER COLOUR ALONE (REQ-NFR-007): the caller's figure carries its minus, and it is drawn in
// `<bdi dir="ltr">`, so the sign sits at the numeral's inline-start in any surrounding text. The tone follows
// `value`'s sign and nothing else.
//
// The drawn figure is `aria-hidden` and heard once as `figureLabel`, so «+50» is never read as «plus fifty».
// Nothing here transitions, and nothing scales on hover. On the light ground the accent is 1.07:1 on paper
// (DEC-186 §2), so a gain takes the heading ink there — `pg-light:` — as `rank-row`'s rise does.

type Tone = "gain" | "loss" | "none";

const TONE: Record<Tone, string> = {
  gain: "text-accent pg-light:text-fg-heading",
  loss: "text-signal pg-light:text-signal-deep",
  none: "text-fg-muted",
};

function toneOf(value: number | undefined): Tone {
  if (value === undefined || !Number.isFinite(value) || value === 0) return "none";
  return value > 0 ? "gain" : "loss";
}

function Figure({ figure, label, tone }: { figure: string; label?: string; tone: Tone }) {
  return (
    <span data-slot="figure" className={`w-14 shrink-0 font-display text-play-sm font-extrabold ${TONE[tone]}`}>
      {label ? <span className="sr-only">{label}</span> : null}
      <bdi dir="ltr" aria-hidden={label ? true : undefined}>
        {figure}
      </bdi>
    </span>
  );
}

function Text({ title, meta, titleClass = "text-fg-heading", struck = false }: { title: ReactNode; meta?: ReactNode; titleClass?: string; struck?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span data-slot="title" className={`text-body-sm font-bold ${titleClass} ${struck ? "line-through" : ""}`}>
        {title}
      </span>
      {meta ? (
        <span data-slot="meta" className="text-caption text-fg-muted">
          {meta}
        </span>
      ) : null}
    </span>
  );
}

export function LedgerRow({ kind = "entry", value, figure, figureLabel, title, meta, reversed = null, as = "li", className = "" }: LedgerRowProps) {
  const Tag = as;
  const tone = toneOf(value);

  if (kind === "notice") {
    return (
      <Tag data-kind="notice" className={`flex items-start gap-3 rounded-tile border border-edge bg-surface px-3.5 py-3 ${className}`}>
        <Text title={title} meta={meta} />
      </Tag>
    );
  }

  if (kind === "cap") {
    return (
      <Tag data-kind="cap" className={`flex items-center gap-3 rounded-tile border border-dashed border-edge bg-canvas px-3.5 py-3 ${className}`}>
        <Figure figure={figure ?? "0"} label={figureLabel} tone="none" />
        <Text title={title} meta={meta} titleClass="text-fg-muted" />
      </Tag>
    );
  }

  if (kind === "reversal") {
    return (
      <Tag data-kind="reversal" className={`flex flex-col gap-1.5 rounded-tile border border-edge bg-surface px-3 py-2.5 ${className}`}>
        <span className="flex items-center gap-3">
          <Figure figure={figure ?? ""} label={figureLabel} tone={tone} />
          <Text title={title} meta={meta} titleClass={tone === "loss" ? TONE.loss : "text-fg-heading"} />
        </span>
        {reversed ? (
          <span data-slot="reversed" className="flex items-center gap-3 border-t border-dashed border-edge pt-1.5 opacity-70">
            {/* The reversed row is the compensating row's opposite, always — its tone is read from that, never from
                the caller's string. */}
            <Figure figure={reversed.figure} label={reversed.figureLabel} tone={tone === "loss" ? "gain" : tone === "gain" ? "loss" : "none"} />
            <Text title={reversed.title} meta={reversed.meta} struck />
          </span>
        ) : null}
      </Tag>
    );
  }

  return (
    <Tag data-kind="entry" className={`flex items-center gap-3 rounded-tile border border-edge bg-surface px-3.5 py-3 ${className}`}>
      <Figure figure={figure ?? ""} label={figureLabel} tone={tone} />
      <Text title={title} meta={meta} />
    </Tag>
  );
}
