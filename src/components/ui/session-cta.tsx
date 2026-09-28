"use client";

import { useId, type ReactNode } from "react";
import type { SessionCtaAct, SessionCtaProps } from "@/components/ui";
import { ButtonLink } from "@/components/ui/button";
import { CheckCircleIcon, ClockIcon, InfoIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";

// A session's one primary action, in six states — REQ-UIX-033, REQ-UIX-007,
// REQ-UIX-015, REQ-SES-013, DEC-186 §6.
//
// ★★ IT DECIDES NOTHING AND HOLDS NO STATE. Which state a viewer gets is the
// affordance matrix's answer (`checkin/session-matrix.ts`, REQ-UIX-015),
// computed by the caller; this only draws it. It never moves from «reserve» to
// «booked» on a press: the caller re-renders it after the server answers, so a
// seat is never shown as confirmed before it is (REQ-UIX-007). A seat is
// contended, so nothing here is optimistic.
//
// ★ IT COMPOSES THE LEAD'S `Button` AND NEVER OVERRIDES ONE OF ITS CLASSES
// (DEC-186 §6). The press, the pill, the display face and the 52 px height are
// `Button`'s own inside the scope; pending — the label kept, a spinner beside
// it, `aria-busy`, no second submit — is `SubmitButton`'s. `w-full` is added,
// which `Button` does not set. An `action` is the caller's bound Server Action
// (DEC-159) inside this component's own `<form>`; an `href` is a link.
//
// ★ THE FACES THAT OFFER NOTHING ARE NOT BUTTONS. «محجوز» and «حضرت» are a
// fact, not a control; «none» is a label and its reason IN WORDS, never a greyed
// control with no reason (REQ-SES-013). So none of the three is focusable, and
// «booked» holds exactly one control: the cancel beneath it.
//
// ★ THE CHIP IS PART OF THE NAME. «احجز مقعدك، 12 من 40» — what a member needs
// to decide is read with what they are deciding. It is `<bdi>` (the caller
// formats it, in Western digits), with a visually hidden «، » before it so the
// two are read as a phrase.
//
// No heading and no landmark: the event page owns the region «الحضور» (the slot
// contract). Static — the reservation's ticket and stamp are the moments' wave's.

function Chip({ children, tone }: { children: string; tone: "accent" | "signal" | "face" }) {
  const colours =
    tone === "accent" ? "bg-on-accent text-accent" : tone === "signal" ? "bg-on-signal text-signal" : "bg-accent text-on-accent";
  return (
    <>
      <span className="sr-only">، </span>
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-caption font-semibold ${colours}`}>
        <bdi>{children}</bdi>
      </span>
    </>
  );
}

function Act({
  act,
  variant,
  size,
  children,
  pending,
  pendingLabel,
  describedBy,
}: {
  act: SessionCtaAct;
  variant: "primary" | "signal" | "secondary";
  size: "lg" | "md";
  children: ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  describedBy?: string;
}) {
  if (act.href !== undefined) {
    return (
      <ButtonLink href={act.href} variant={variant} size={size} className="w-full" aria-describedby={describedBy}>
        {children}
      </ButtonLink>
    );
  }
  return (
    <form action={act.action}>
      <SubmitButton variant={variant} size={size} className="w-full" pending={pending} pendingLabel={pendingLabel} aria-describedby={describedBy}>
        {children}
      </SubmitButton>
    </form>
  );
}

/** The face of a state that is a fact — «محجوز», «حضرت» — or offers nothing. Not a control. */
function Face({ children, ringed }: { children: ReactNode; ringed: boolean }) {
  return (
    <p
      // One colour class per state, never two for one property (DEC-111): a fact is the text colour
      // in an accent ring; «none» is muted and unringed, so it never reads as a held seat.
      className={`flex min-h-12 items-center justify-center gap-2 rounded-field bg-raised px-7 text-label pg:min-h-13 pg:rounded-pill pg:font-display pg:font-extrabold pg:text-play-sm ${
        ringed ? "text-fg-heading ring-2 ring-accent ring-inset" : "text-fg-muted"
      }`}
    >
      {children}
    </p>
  );
}

export function SessionCta({ state, label, chip, pendingLabel, pending, className = "" }: SessionCtaProps) {
  const noteId = useId();

  switch (state.kind) {
    case "reserve":
    case "waitlist":
    case "checkIn": {
      const signal = state.kind === "checkIn";
      return (
        <div className={className}>
          <Act act={state.act} variant={signal ? "signal" : "primary"} size="lg" pending={pending} pendingLabel={pendingLabel}>
            {label}
            {chip ? <Chip tone={signal ? "signal" : "accent"}>{chip}</Chip> : null}
          </Act>
        </div>
      );
    }

    case "booked": {
      const { cancel } = state;
      const onWaitlist = state.hold === "waitlist";
      return (
        <div className={`flex flex-col gap-2 ${className}`}>
          <Face ringed>
            {onWaitlist ? <ClockIcon className="text-[1.25rem]" /> : <CheckCircleIcon className="text-[1.25rem]" />}
            <span>{label}</span>
            {chip ? <Chip tone="face">{chip}</Chip> : null}
          </Face>
          <Act act={cancel.act} variant="secondary" size="md" describedBy={cancel.note ? noteId : undefined}>
            {cancel.label}
          </Act>
          {cancel.note ? (
            <p id={noteId} className="text-caption text-fg-muted">
              {cancel.note}
            </p>
          ) : null}
        </div>
      );
    }

    case "attended":
      return (
        <div className={className}>
          <Face ringed>
            <CheckCircleIcon className="text-[1.25rem]" />
            <span>{label}</span>
            {chip ? <Chip tone="face">{chip}</Chip> : null}
          </Face>
        </div>
      );

    case "none":
      return (
        <div className={`flex flex-col gap-2 ${className}`}>
          <Face ringed={false}>
            <InfoIcon className="text-[1.25rem]" />
            <span>{label}</span>
          </Face>
          <p className="text-caption text-fg-muted">{state.reason}</p>
        </div>
      );
  }
}
