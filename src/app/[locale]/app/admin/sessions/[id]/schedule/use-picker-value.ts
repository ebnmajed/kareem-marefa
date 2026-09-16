"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Tell the form when `RtlDateTimePicker` commits a value.
 *
 * The picker is an uncontrolled field with no `onChange` of its own
 * (`components/admin/rtl-datetime-picker.tsx`, `console`'s). What IS observable
 * without editing it: its trigger's `aria-expanded` is an attribute, and a
 * value is committed when the popover closes — the same seam `ui/date-time`
 * uses. The end sentence and the deadline presets follow the start from here.
 *
 * ★ Temporary by design. The request is routed to `console` (wave 8, sync 1):
 * the picker gains `onValueChange`, and this file is deleted with its callers.
 */
export function usePickerValue(containerRef: RefObject<HTMLElement | null>, id: string, onCommit: (value: string) => void, enabled = true) {
  const last = useRef<string | null>(null);
  const callback = useRef(onCommit);
  useEffect(() => {
    callback.current = onCommit;
  });

  useEffect(() => {
    if (!enabled) return;
    const root = containerRef.current;
    const trigger = root?.querySelector<HTMLButtonElement>(`#${CSS.escape(id)}-trigger`);
    const hidden = root?.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
    if (!trigger || !hidden) return;
    last.current = hidden.value;
    const observer = new MutationObserver(() => {
      if (trigger.getAttribute("aria-expanded") === "false" && hidden.value !== last.current) {
        last.current = hidden.value;
        callback.current(hidden.value);
      }
    });
    observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"] });
    return () => observer.disconnect();
  }, [containerRef, id, enabled]);
}
