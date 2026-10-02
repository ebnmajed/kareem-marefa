"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { MenuItem } from "@/components/ui";

// The ⋯ of a managed list's row — venues, categories, companies (`SCR-046` – `048`, wave 22). The artboards draw no
// status column and no row of buttons: the row's decisions live here.
//
//  · «عدّل» is a LINK to `?edit=<id>`, so the edit form opens from the URL (`DEC-232` §5.5).
//  · «عطّل» confirms first, naming the object and the consequence (`REQ-UIX-013`); «أعد التفعيل» does not — it
//    takes nothing away.
//  · ★ The toast comes from what the server says it WROTE (`DEC-232` §3.1): `{ ok: false }` — the row RLS filtered
//    away, the update that matched nothing — is «لم يُحفظ», never a success. The old toggle said «تم التعطيل.» either way.

export interface ListRowMenuLabels {
  /** «مزيد من الإجراءات على …» — names the row. */
  trigger: string;
  edit: string;
  deactivate: string;
  reactivate: string;
  confirmTitle: ReactNode;
  confirmBody: ReactNode;
  confirmAction: string;
  cancel: string;
  close: string;
  deactivated: string;
  reactivated: string;
  notWritten: string;
}

export function ListRowMenu({
  editHref,
  active,
  onSetActive,
  labels,
  extra = [],
}: {
  editHref: string;
  active: boolean;
  onSetActive: (active: boolean) => Promise<{ ok: boolean }>;
  labels: ListRowMenuLabels;
  /** Items before the edit — a link to the member list, say. */
  extra?: MenuItem[];
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function set(next: boolean) {
    setPending(true);
    try {
      const { ok } = await onSetActive(next);
      toast.show(ok ? { title: next ? labels.reactivated : labels.deactivated, tone: "success" } : { title: labels.notWritten, tone: "error" });
      if (ok) setConfirming(false);
    } catch {
      toast.show({ title: labels.notWritten, tone: "error" });
    } finally {
      setPending(false);
    }
  }

  const items: MenuItem[] = [
    ...extra,
    { label: labels.edit, href: editHref },
    active
      ? { label: labels.deactivate, tone: "error", onSelect: () => setConfirming(true), startsGroup: true, disabled: pending }
      : { label: labels.reactivate, onSelect: () => void set(true), startsGroup: true, disabled: pending },
  ];

  return (
    <>
      <Menu
        align="end"
        trigger={
          <IconButton label={labels.trigger} size="sm">
            <MoreIcon />
          </IconButton>
        }
        items={items}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={labels.confirmTitle}
        body={<p>{labels.confirmBody}</p>}
        confirmLabel={labels.confirmAction}
        cancelLabel={labels.cancel}
        closeLabel={labels.close}
        pending={pending}
        onConfirm={() => void set(false)}
      />
    </>
  );
}
