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
// ★ A CHIP IS A FEW CHARACTERS, AND IT NEVER WRAPS — «12 من 40», «+50», «ترتيبك 3».
// A sentence is not a chip: «تصل عند انتهاء الجلسة» belongs in a note beneath,
// where `booked` puts its own. On a button the chip is `Button`'s own `trailing`
// slot — a second flex child after the label, kept while pending, the label at
// the start and the chip at the end inside the scope (the lead's b33b04ef). Put
// inside the label's run, it touched the label with no gap (the lead's review of
// the 390 px captures). The faces below are this file's own markup and take the
// same shape: the word at the start, the chip at the end, a real gap, and a
// minimum height that grows with a label that wraps — never a fixed one.
//
// No heading and no landmark: the event page owns the region «الحضور» (the slot
// contract). Static — the reservation's ticket and stamp are the moments' wave's.
//
// ★ Wave 18 — the phases as the artboards draw them (REQ-UIX-057, DEC-207 §2),
// three additions and every existing face unchanged:
//   · `rate` — «قيّم الجلسة», a link to SCR-015, drawn as `reserve` is (the accent
//     face, its chip the window's end). Its own kind so the matrix's answer is not
//     smuggled through `reserve`;
//   · `size` and `width` — the desktop feed post draws a 44 px action beside the
//     reaction pills, not a full-width one (`HomeDesktop.dc.html`);
//   · `booked` with no `cancel` — the feed shows a held seat as a fact and offers no
//     cancel there (DEC-206 §4.57, N10; since DEC-276 the feed reserves, but cancelling stays on the event page).

function Chip({ children, tone }: { children: string; tone: "accent" | "signal" | "face" }) {
  const colours =
    tone === "accent" ? "bg-on-accent text-accent" : tone === "signal" ? "bg-on-signal text-signal" : "bg-accent text-on-accent";
  return (
    <span className="shrink-0">
      <span className="sr-only">، </span>
      <span data-part="chip" className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold ${colours}`}>
        <bdi>{children}</bdi>
      </span>
    </span>
  );
}

function Act({
  act,
  variant,
  size,
  children,
  trailing,
  pending,
  pendingLabel,
  describedBy,
  full = true,
}: {
  act: SessionCtaAct;
  variant: "primary" | "signal" | "secondary";
  size: "lg" | "md";
  children: ReactNode;
  trailing?: ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  describedBy?: string;
  /** `w-full` unless the caller asked for the control's own width. */
  full?: boolean;
}) {
  const width = full ? "w-full" : "";
  if (act.href !== undefined) {
    return (
      <ButtonLink href={act.href} variant={variant} size={size} trailing={trailing} className={width} aria-describedby={describedBy}>
        <span data-part="label">{children}</span>
      </ButtonLink>
    );
  }
  return (
    <form action={act.action}>
      <SubmitButton
        variant={variant}
        size={size}
        trailing={trailing}
        className={width}
        pending={pending}
        pendingLabel={pendingLabel}
        aria-describedby={describedBy}
      >
        <span data-part="label">{children}</span>
      </SubmitButton>
    </form>
  );
}

/**
 * The face of a state that is a fact — «محجوز», «حضرت» — or offers nothing. Not a control. The
 * glyph and the word at the start, the chip at the end; 52 px at least inside the scope, and taller
 * when the word wraps.
 */
function Face({ glyph, label, chip, ringed, describedBy }: { glyph: ReactNode; label: string; chip?: ReactNode; ringed: boolean; describedBy?: string }) {
  return (
    <p
      data-part="face"
      aria-describedby={describedBy}
      // One colour class per state, never two for one property (DEC-111): a fact is the text colour
      // in an accent ring; «none» is muted and unringed, so it never reads as a held seat.
      className={`flex min-h-12 items-center justify-between gap-3 rounded-field bg-raised px-7 py-2 text-start text-label pg:min-h-13 pg:rounded-pill pg:font-display pg:font-extrabold pg:text-play-sm ${
        ringed ? "text-fg-heading ring-2 ring-accent ring-inset" : "text-fg-muted"
      }`}
    >
      <span data-part="label" className="flex min-w-0 items-center gap-2">
        {glyph}
        <span>{label}</span>
      </span>
      {chip}
    </p>
  );
}

export function SessionCta({ state, label, chip, pendingLabel, pending, size = "lg", width = "full", className = "" }: SessionCtaProps) {
  const noteId = useId();
  const full = width === "full";

  switch (state.kind) {
    case "reserve":
    case "waitlist":
    case "rate":
    case "checkIn": {
      const signal = state.kind === "checkIn";
      return (
        <div className={className}>
          <Act
            act={state.act}
            variant={signal ? "signal" : "primary"}
            size={size}
            full={full}
            trailing={chip ? <Chip tone={signal ? "signal" : "accent"}>{chip}</Chip> : undefined}
            pending={pending}
            pendingLabel={pendingLabel}
          >
            {label}
          </Act>
        </div>
      );
    }

    case "booked": {
      const { cancel } = state;
      const onWaitlist = state.hold === "waitlist";
      return (
        <div className={`flex flex-col gap-2 ${className}`}>
          <Face
            ringed
            glyph={onWaitlist ? <ClockIcon className="text-[1.25rem]" /> : <CheckCircleIcon className="text-[1.25rem]" />}
            label={label}
            chip={chip ? <Chip tone="face">{chip}</Chip> : undefined}
          />
          {/* wave 16 (R4, DEC-197): the calendar, between the fact and the cancel — `16` §5.4.2's order. */}
          {state.between}
          {cancel ? (
            <Act act={cancel.act} variant="secondary" size="md" full={full} describedBy={cancel.note ? noteId : undefined}>
              {cancel.label}
            </Act>
          ) : null}
          {cancel?.note ? (
            <p id={noteId} className="text-caption text-fg-muted">
              {cancel.note}
            </p>
          ) : null}
        </div>
      );
    }

    case "attended":
      // The sentence a chip must not be — «تصل النقاط عند انتهاء الجلسة» — is the state's note,
      // beneath the face and tied to it, as `booked`'s cancel note is.
      return (
        <div className={`flex flex-col gap-2 ${className}`}>
          <Face
            ringed
            glyph={<CheckCircleIcon className="text-[1.25rem]" />}
            label={label}
            chip={chip ? <Chip tone="face">{chip}</Chip> : undefined}
            describedBy={state.note ? noteId : undefined}
          />
          {state.note ? (
            <p id={noteId} className="text-caption text-fg-muted">
              {state.note}
            </p>
          ) : null}
        </div>
      );

    case "none":
      return (
        <div className={`flex flex-col gap-2 ${className}`}>
          <Face ringed={false} glyph={<InfoIcon className="text-[1.25rem]" />} label={label} />
          <p className="text-caption text-fg-muted">{state.reason}</p>
        </div>
      );
  }
}
