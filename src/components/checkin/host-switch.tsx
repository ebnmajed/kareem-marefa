"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Switch } from "@/components/ui/switch";

// The door — SCR-016's check-in switch (REQ-CHK-015, REQ-CHK-016, DEC-141; `Host.dc.html`).
//
// ★ THE SWITCH SHOWS THE SERVER'S ANSWER, AND ONLY THAT. It is controlled by `open` — what
// `getHostView()` read — and a change submits the bound action (`setCheckInOpenAction`, unchanged:
// `open` is bound at the call site, the day is the code's). The thumb moves when the redirect brings
// the new state back, never before: a door that looks shut while it is still open would be a lie
// told to a room. While the action runs the switch is disabled (`useFormStatus`), with no timer.
// ★ `set_check_in_open()` re-derives who may, and the ceiling (REQ-CHK-016) is its to refuse.
// ★ Without JavaScript the `noScript` submit — today's «أغلق/افتح تسجيل الحضور» — does the same.

function Control({ open, label, description, onChange }: { open: boolean; label: string; description?: string; onChange: () => void }) {
  const { pending } = useFormStatus();
  return <Switch checked={open} onCheckedChange={onChange} disabled={pending} label={label} description={description} />;
}

export function HostSwitch({
  open,
  action,
  label,
  description,
  noScript,
}: {
  open: boolean;
  action: () => Promise<void>;
  label: string;
  description?: string;
  noScript: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action}>
      <Control open={open} label={label} description={description} onChange={() => form.current?.requestSubmit()} />
      <noscript>{noScript}</noscript>
    </form>
  );
}
