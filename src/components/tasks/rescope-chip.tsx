"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { rescopeTaskAction } from "@/components/tasks/actions";

// REQ-SES-018/DEC-121 — the twin of `materials/rescope-chip.tsx`; see its own header for the
// design reasoning (native `<details>`, no `ui/menu` request, `revalidatePath` re-groups).

export interface RescopeOption {
  /** `null` is the session itself — the chip's other direction. */
  id: string | null;
  label: string;
}

interface RescopeChipProps {
  locale: string;
  sessionId: string;
  taskId: string;
  currentLabel: string;
  options: RescopeOption[];
  triggerAriaLabel: string;
  failedLabel: string;
}

export function RescopeChip({ locale, sessionId, taskId, currentLabel, options, triggerAriaLabel, failedLabel }: RescopeChipProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function choose(dayId: string | null) {
    startTransition(async () => {
      const result = await rescopeTaskAction(locale, sessionId, taskId, dayId);
      if (result.error) toast.show({ tone: "error", title: failedLabel });
    });
  }

  return (
    <details className="relative mt-2 inline-block">
      <summary
        aria-label={triggerAriaLabel}
        aria-disabled={pending || undefined}
        className="inline-flex cursor-pointer list-none items-center gap-1 text-body-sm text-fg-body marker:content-none hover:text-fg-heading"
      >
        <bdi>{currentLabel}</bdi>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute z-10 mt-1 flex min-w-40 flex-col gap-0.5 rounded-field border border-edge bg-canvas p-1 shadow-md">
        {options.map((opt) => (
          <button
            key={opt.id ?? "session"}
            type="button"
            disabled={pending}
            onClick={() => choose(opt.id)}
            className="rounded-field px-2 py-1.5 text-start text-body-sm text-fg-body hover:bg-surface disabled:opacity-50"
          >
            <bdi>{opt.label}</bdi>
          </button>
        ))}
      </div>
    </details>
  );
}
