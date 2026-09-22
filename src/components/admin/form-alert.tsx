import type { ReactNode } from "react";
import { AlertCircleIcon } from "@/components/ui/icons";

// A form's own refusal — the error that belongs to no one field (a duplicate
// name, a stale row, a refused RPC). The shape `reminders-form.tsx` and the
// scoring forms already draw: the glyph and the error colour, never colour
// alone (`16` §8.2 item 3). It replaces a bordered box that borrowed the
// control's class string (`ui-lint`, REQ-UIX-001) — a message is not a control.
//
// `role="alert"` stays on the paragraph itself, so every locator that found
// the old box — by role or by text — finds this one.
export function FormAlert({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-2 text-body-sm text-error ${className}`}>
      <AlertCircleIcon className="mt-[0.2em] shrink-0" />
      <span>{children}</span>
    </p>
  );
}
