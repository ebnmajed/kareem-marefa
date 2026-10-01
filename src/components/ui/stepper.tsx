import type { StepperProps, StepperStepStatus } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";

// A process's steps, in order — REQ-UIX-064, DEC-213 §5.125, `M10b.md` §4 and §7, `Proposal.dc.html`.
//
// ★ AN ORDERED LIST, AND THE ORDER IS THE MEANING. Each step is an `<li>` of a named `<ol>`, so a screen reader
// says «3 of 5» without being told; the drawn number in the disc is therefore `aria-hidden`. The current step
// carries `aria-current="step"` — the one attribute that says where the process stands.
//
// ★ A DONE STEP IS NEVER COLOUR ALONE: the disc draws the check glyph and the step's name is followed by
// `doneLabel` («مكتملة») for assistive technology. An upcoming step keeps its number; the current one is filled.
//
// ★ THE CURRENT FILL IS A STATE COLOUR, NOT A STATUS (`DEC-073` untouched): `signal` (coral) is the drawn «needs
// you», `accent` (lime) a step reached that asks nothing of the reader. A done disc wears the accent, as drawn.
//
// At most one current: a second is rendered as upcoming, so a caller's slip can never draw two «you are here».
// Strings arrive as props; no catalogue, no data, no hook — server-safe. No animation and no hover: it is read,
// not pressed. Labels wrap under their disc and are never clipped (tashkeel sits above the line box).

const DISC = "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-bold";

const DISC_BY_STATUS: Record<StepperStepStatus, string> = {
  done: "bg-accent text-on-accent",
  current: "",
  upcoming: "border border-edge bg-raised text-fg-muted",
};

const CURRENT_DISC = { signal: "bg-signal text-on-signal", accent: "bg-accent text-on-accent" } as const;
const CURRENT_LABEL = { signal: "text-signal font-bold", accent: "text-accent font-bold pg-light:text-fg-heading" } as const;

export function Stepper({ label, steps, doneLabel, currentTone = "signal", className = "" }: StepperProps) {
  const firstCurrent = steps.findIndex((s) => s.status === "current");
  return (
    <ol aria-label={label} className={`flex items-start ${className}`}>
      {steps.map((step, index) => {
        const status: StepperStepStatus = step.status === "current" && index !== firstCurrent ? "upcoming" : step.status;
        const current = status === "current";
        return (
          <li
            key={step.id}
            aria-current={current ? "step" : undefined}
            data-status={status}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 px-0.5 text-center text-caption ${current ? CURRENT_LABEL[currentTone] : "text-fg-muted"}`}
          >
            <span aria-hidden className={`${DISC} ${current ? CURRENT_DISC[currentTone] : DISC_BY_STATUS[status]}`}>
              {status === "done" ? <CheckIcon className="size-3.5" /> : String(index + 1)}
            </span>
            <span>
              {step.label}
              {status === "done" ? <span className="sr-only">{` — ${doneLabel}`}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
