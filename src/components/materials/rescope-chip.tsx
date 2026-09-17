"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { Menu } from "@/components/ui/menu";

// REQ-SES-018/DEC-121 — "afterwards the item carries a scope chip («اليوم الثاني ▾») which can be
// changed in one tap." ONE shared component for materials/photos/tasks (`ui-lint`'s own finding,
// DEC-087/REQ-UIX-001: three near-identical files were each hand-rolling the floating-panel
// control class string `ui/menu` already owns) — `rescopeAction` is the one thing that differs per
// item kind, so it is the only thing each caller supplies; the trigger, the option list and the
// pending/error handling live here once. `tasks/rescope-chip.tsx` and `photos/rescope-chip.tsx`
// are gone; `task-item.tsx` and `gallery.tsx` import this file directly — all three directories
// are this track's own, so the cross-directory import is not a boundary crossing.
//
// `ui/menu` (`console`'s, held by the lead as custodian this wave) replaces the native
// `<details>`/`<div>` this first shipped with at sync 1 — Radix owns focus trapping, typeahead and
// closing, and its floating panel is the system's own rather than a hand-rolled one carrying the
// same control-class string a second time. After a successful move `revalidatePath()` inside the
// server action re-renders the slot, which re-groups the item into its new bucket — there is no
// local "which group am I in" state to keep in sync by hand.
//
// ★ The lead's real-build finding: `list.tsx`/`task-item.tsx`/`gallery.tsx` are Server Components,
// and every one of them used to build an inline arrow function — `(dayId) => rescopeXAction(locale,
// sessionId, id, dayId)` — and pass it here as a prop. React cannot serialise an ordinary closure
// across the Server→Client boundary ("Event handlers cannot be passed to Client Component props"),
// and jsdom renders everything client-side, so no component test could ever see it — only a real
// build crashes. The fix is `rescopeAction: rescopeXAction.bind(null, locale, sessionId, id)` at
// each call site: a `.bind()` of an actual `"use server"` export crosses as a REFERENCE (Next's own
// documented "passing additional arguments" pattern), never as a closure — and the prop is named
// `rescopeAction`, ending in "Action", because Next's TypeScript plugin only allows a function-typed
// Client Component prop across the boundary when it is named `action` or ends in `Action`; any
// other name is flagged even when the value would in fact serialise correctly.

export interface RescopeOption {
  /** `null` is the session itself — the chip's other direction. */
  id: string | null;
  label: string;
}

interface RescopeChipProps {
  currentLabel: string;
  options: RescopeOption[];
  triggerAriaLabel: string;
  failedLabel: string;
  /** A Server Action reference, pre-bound by the caller to its own item kind and id —
   *  `rescopeMaterialAction.bind(null, locale, sessionId, itemId)` (or the task/photo twin) —
   *  never an inline arrow function; see the file header for why that crashes a real build. */
  rescopeAction: (dayId: string | null) => Promise<{ error: string | null }>;
  /** Spacing above the trigger. Materials'/tasks' own containers have no `gap` of their own and
   *  pass `"mt-2"`; photos' grid item already spaces its children with `gap-2` and passes nothing
   *  — folding a margin in here unconditionally would double that spacing for photos alone. */
  className?: string;
}

export function RescopeChip({ currentLabel, options, triggerAriaLabel, failedLabel, rescopeAction, className }: RescopeChipProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function choose(dayId: string | null) {
    startTransition(async () => {
      const result = await rescopeAction(dayId);
      if (result.error) toast.show({ tone: "error", title: failedLabel });
    });
  }

  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={triggerAriaLabel}
          disabled={pending}
          className={`inline-flex items-center gap-1 self-start text-body-sm text-fg-body hover:text-fg-heading disabled:opacity-50 ${className ?? ""}`}
        >
          <bdi>{currentLabel}</bdi>
          <span aria-hidden="true">▾</span>
        </button>
      }
      items={options.map((opt) => ({
        label: opt.label,
        onSelect: () => choose(opt.id),
        disabled: pending,
      }))}
    />
  );
}
