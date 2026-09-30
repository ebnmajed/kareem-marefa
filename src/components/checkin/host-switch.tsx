"use client";

import { useRef, useSyncExternalStore, type ReactNode } from "react";
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
// ★ DISABLED UNTIL HYDRATED. Before React owns the switch, a tap flips the native checkbox and submits
// nothing — the thumb says «closed» while the door is open, until hydration puts it back. A production
// run lost 7 taps in 20 that way. So the switch takes a tap only once it can act on one.

const noSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

function Control({ open, label, description, onChange }: { open: boolean; label: string; description?: string; onChange: () => void }) {
  const { pending } = useFormStatus();
  const hydrated = useHydrated();
  return <Switch checked={open} onCheckedChange={onChange} disabled={pending || !hydrated} label={label} description={description} />;
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
