import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

// SCR-064's «أزل الاستبانة» — offered only when it can actually work.
//
// ★ A CONTROL THAT LEADS TO A REFUSAL IS NOT A CONTROL. `survey_detach()`
// refuses once anyone has answered (the question set is frozen, so a detach
// would take real answers with it), and the screen used to offer the button
// anyway and show «لا يمكن إزالة استبانة أجاب عنها أحد» after the press. The
// sentence is the same; saying it BEFORE the press is the difference between a
// rule and a trap.
//
// ★ The refusal path stays exactly where it was: between this render and the
// press, someone may answer. The database is the boundary; this is courtesy.
//
// Two steps, server-side: the first press asks, the second does it. No dialog
// primitive, no client state, and it survives a reload — `?confirm=1`.
//
// ★ Plain strings and a bound action, no translator and no `async`: a server
// component that a component test can render like any function, which is what
// `results.tsx`'s own lesson was (a nested async component is renderable by
// nothing but a Server Component).

export function DetachControl({
  canDetach,
  confirming,
  confirmHref,
  action,
  detachLabel,
  confirmText,
  blockedText,
}: {
  /** False once any response is stored — the database would refuse it. */
  canDetach: boolean;
  confirming: boolean;
  confirmHref: string;
  action: (formData: FormData) => void | Promise<void>;
  detachLabel: string;
  confirmText: string;
  blockedText: string;
}) {
  if (!canDetach) {
    return <p className="text-body-sm text-fg-muted">{blockedText}</p>;
  }

  if (!confirming) {
    return (
      <ButtonLink href={confirmHref} variant="secondary" size="md">
        {detachLabel}
      </ButtonLink>
    );
  }

  return (
    <form action={action}>
      <p className="text-body-sm text-fg-body">{confirmText}</p>
      <div className="mt-3">
        <SubmitButton variant="secondary">{detachLabel}</SubmitButton>
      </div>
    </form>
  );
}
