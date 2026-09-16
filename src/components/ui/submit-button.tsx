"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui";

// The button that knows about the form it is inside — REQ-UIX-007, `16` §7.1.
//
// ★ It is a separate module from `ui/button` ON PURPOSE. `useFormStatus`
// requires a client component, and `ui/button` must stay server-safe because
// the frozen marketing page imports `ButtonLink` from it (invariant 1, until
// M13). Splitting costs one import and keeps a live public page out of the
// client graph.
//
// ★ It is also the honest boundary: `useFormStatus` reports the status of the
// nearest enclosing `<form>`, so it is only meaningful on a control that
// SUBMITS that form. A `<SubmitButton>` outside a form simply never lights up —
// the hook returns `false` — which is the right failure mode, but the name
// says what it is for.
//
// Pending keeps the label and adds a spinner; the control is `aria-busy` and
// cannot be submitted twice. `pending` as a prop overrides, for an action that
// is not this form's.

export function SubmitButton({ pending, ...props }: ButtonProps) {
  const status = useFormStatus();
  return <Button type="submit" pending={pending ?? status.pending} {...props} />;
}
