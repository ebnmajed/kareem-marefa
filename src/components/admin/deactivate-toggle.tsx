"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

// The shared deactivate/reactivate control for `venues`, `categories` and
// `companies` — "one list pattern three times," `DEC-137`'s own framing
// (`docs/plan/notes/console.md`'s "Wave 7 plan" §2). Reactivate is a single
// click, no confirmation — reversible, restorative, the same asymmetry
// `admin/members/members-table.tsx`'s `ActionsCell` already established for
// a member's own deactivate/reactivate pair. Deactivate confirms in
// `ui/dialog`, naming the entity (`REQ-UIX-013`'s pattern, generalised past
// proposals) — but carries NO reason field: `setVenueActive()` /
// `setCategoryActive()` / `setCompanyActive()` take none, and
// `REQ-ADM-006`/`007`/`008`'s acceptance criteria don't ask for one, unlike
// `REQ-ADM-009`'s member deactivation.
//
// ★ Labels are PROPS, not `useTranslations()` here — this file is shared
// across THREE different message namespaces (`admin.venues`, `admin.
// categories`, `admin.companies`), each with its own already-established
// `deactivate`/`activate`/`deactivateConfirm*` keys; a fourth shared
// namespace would just be a second source of truth to keep in sync with the
// three real ones.
export function DeactivateToggle({
  active,
  activateLabel,
  deactivateLabel,
  confirmTitle,
  confirmBody,
  confirmAction,
  cancelLabel,
  closeLabel,
  deactivateDoneLabel,
  reactivateDoneLabel,
  onActivate,
  onDeactivate,
}: {
  active: boolean;
  activateLabel: string;
  deactivateLabel: string;
  confirmTitle: React.ReactNode;
  confirmBody: string;
  confirmAction: string;
  cancelLabel: string;
  closeLabel: string;
  deactivateDoneLabel: string;
  reactivateDoneLabel: string;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // Same shape as `members-table.tsx`'s `handleReactivate` — a plain async
  // handler with manual pending state, not `useActionState`: these DAL calls
  // take no `FormData`, so there is no form to drive one from.
  async function handleActivate() {
    setPending(true);
    try {
      await onActivate();
      toast.show({ title: reactivateDoneLabel, tone: "success" });
    } finally {
      setPending(false);
    }
  }

  async function handleDeactivate() {
    setPending(true);
    try {
      await onDeactivate();
      toast.show({ title: deactivateDoneLabel, tone: "success" });
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  }

  if (!active) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleActivate}>
        {activateLabel}
      </Button>
    );
  }

  // The dialog is `confirm-dialog.tsx` since wave 8 — one confirmation shape for
  // the whole console; this component's props did not change.
  return (
    <>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setConfirmOpen(true)}>
        {deactivateLabel}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        body={<p>{confirmBody}</p>}
        confirmLabel={confirmAction}
        cancelLabel={cancelLabel}
        closeLabel={closeLabel}
        pending={pending}
        onConfirm={handleDeactivate}
      />
    </>
  );
}
