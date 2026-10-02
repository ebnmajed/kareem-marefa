"use client";

import { useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";

// «غير المقروء فقط» — `Notifications.dc.html`'s checkbox, REQ-UIX-076, kept behaviour N2.
//
// A GET form, so the filter is a URL (`?unread=1`) and works without JavaScript: the `<noscript>` submit posts it.
// With JavaScript a change submits at once. It drops `?before=` by construction — a filtered list starts at its
// first page.
export function UnreadFilter({ checked, label, apply }: { checked: boolean; label: string; apply: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" className="flex items-center gap-2">
      <Checkbox name="unread" value="1" defaultChecked={checked} label={label} onChange={() => form.current?.requestSubmit()} className="text-body-sm" />
      <noscript>
        <button type="submit" className="min-h-11 text-label font-bold text-fg-heading underline underline-offset-4">
          {apply}
        </button>
      </noscript>
    </form>
  );
}
