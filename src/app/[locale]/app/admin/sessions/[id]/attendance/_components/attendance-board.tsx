"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { DataTableColumn, MenuItem } from "@/components/ui";
import type { ManualMarkState, RemoveState } from "../actions";
import { emptyManualMarkState, emptyRemoveState } from "../state";

// SCR-044's toolbar, table, manual-mark sheet and revoke dialog (REQ-UIX-090, REQ-CHK-008, REQ-CHK-012, REQ-CHK-017).
//
// A client component because `data-table`'s columns are functions and the sheet and the dialog hold open state. Every
// row arrives already decided by the page — its status on the selected day, whether it may be marked, whether it may
// be revoked — so nothing here re-derives a rule; it draws and it posts.
//
// ★ THE REVOKE IS `remove_check_in()`, through the kept `removeCheckInAction` (W21.3): soft-delete, `DEC-172`'s
// compensating `reversal:<ledger_id>:v1` row, the certificate revoked — nothing new. It confirms in `ui/dialog`, which
// names the member and the session (REQ-UIX-013), with the mandatory reason inside it; confirming calls
// `requestSubmit()` from a plain button, never `DialogClose` wrapping a pending submit (the takedown-button timeout).
//
// ★ The manual mark keeps what was typed through a failed submit (controlled fields, DEC-149 §1), clears for the next
// attendee on success (K11), and sends the day it was opened on (K6, DEC-119). `noValidate` on both forms: the app's
// own Arabic error is the only validator (K12).

export interface BoardRow {
  memberId: string;
  name: string | null;
  avatarUrl: string | null;
  teamColor: string | null;
  reservation: "confirmed" | "waitlisted" | "cancelled" | "late_cancelled" | "none";
  /** The arrival on the selected day, already formatted. */
  time: string | null;
  method: { kind: "code" } | { kind: "manual"; by: string | null } | null;
  /** On the selected day. `none` draws «—»: no seat, or the day has not begun (D7). */
  status: "present" | "absent" | "removed" | "none";
  removal: { reason: string | null; by: string | null } | null;
  /** «2 من 3», above one day only. */
  days: string | null;
  complete: boolean;
  canMark: boolean;
  canRevoke: boolean;
}

export function AttendanceBoard({
  rows,
  candidates,
  dayId,
  sessionTitle,
  paysOnCompletion,
  canMark,
  manyDays,
  csvHref,
  markAction,
  removeAction,
  filters,
}: {
  rows: BoardRow[];
  candidates: { value: string; label: string }[];
  dayId: string | null;
  sessionTitle: string;
  paysOnCompletion: boolean;
  canMark: boolean;
  manyDays: boolean;
  csvHref: string | null;
  markAction: (prev: ManualMarkState, formData: FormData) => Promise<ManualMarkState>;
  removeAction: (prev: RemoveState, formData: FormData) => Promise<RemoveState>;
  filters: ReactNode;
}) {
  const t = useTranslations("checkin.attendance");
  const tUi = useTranslations("ui");

  // ── the manual mark ──
  const [sheetOpen, setSheetOpen] = useState(false);
  const [member, setMember] = useState("");
  const [reason, setReason] = useState("");
  const [markState, markFormAction, marking] = useActionState(markAction, emptyManualMarkState);
  const [lastMark, setLastMark] = useState(markState);
  if (markState !== lastMark) {
    setLastMark(markState);
    if (markState.done) {
      setSheetOpen(false);
      setMember("");
      setReason("");
    }
  }
  function openSheet(memberId = "") {
    setMember(memberId);
    setSheetOpen(true);
  }

  // ── the revoke ──
  const [target, setTarget] = useState<BoardRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const revokeForm = useRef<HTMLFormElement>(null);
  const [removeState, removeFormAction, removing] = useActionState(removeAction, emptyRemoveState);
  const [lastRemove, setLastRemove] = useState(removeState);
  if (removeState !== lastRemove) {
    setLastRemove(removeState);
    if (removeState.done) {
      setTarget(null);
      setRevokeReason("");
    }
  }

  const nameOf = (r: BoardRow) => r.name ?? r.memberId;
  const bold = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

  const columns: DataTableColumn<BoardRow>[] = [
    {
      key: "member",
      header: t("col.member"),
      cell: (r) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Avatar memberId={r.memberId} displayName={r.name} src={r.avatarUrl} teamColor={r.teamColor} size={24} decorative />
          <bdi className="min-w-0 text-fg-heading">{nameOf(r)}</bdi>
        </span>
      ),
    },
    { key: "reservation", header: t("col.reservation"), onCard: true, cell: (r) => t(`reservation.${r.reservation}`) },
    { key: "time", header: t("col.time"), onCard: true, cell: (r) => (r.time ? <bdi>{r.time}</bdi> : "—") },
    {
      key: "method",
      header: t("col.method"),
      onCard: true,
      cell: (r) =>
        r.method === null ? "—" : r.method.kind === "code" ? t("method.code") : r.method.by ? t.rich("method.manualBy", { name: r.method.by, bdi: bold }) : t("method.manual"),
    },
    ...(manyDays
      ? [
          {
            key: "days",
            header: t("colDays"),
            onCard: true,
            cell: (r: BoardRow) => (
              <span>
                <bdi>{r.days}</bdi>
                {r.complete ? <span className="ms-2 text-fg-heading">{t("complete")}</span> : null}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "status",
      header: t("col.status"),
      onCard: true,
      cell: (r) =>
        r.status === "present" ? (
          <Badge tone="success" size="sm">
            {t("status.present")}
          </Badge>
        ) : r.status === "absent" ? (
          <Badge size="sm">{t("status.absent")}</Badge>
        ) : r.status === "removed" ? (
          // K21: removed, with why and by whom — never read as a plain no-show.
          <span className="flex flex-col gap-0.5">
            <Badge size="sm" outline>
              {t("status.removed")}
            </Badge>
            {r.removal?.reason ? (
              <span className="text-caption text-fg-muted">
                {r.removal.by ? t.rich("removedBy", { reason: r.removal.reason, name: r.removal.by, bdi: bold }) : <bdi>{r.removal.reason}</bdi>}
              </span>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: t("col.actions"),
      onCard: true,
      align: "end",
      cell: (r) => {
        const items: MenuItem[] = [];
        if (r.canMark) items.push({ label: t("rowMark"), onSelect: () => openSheet(r.memberId) });
        if (r.canRevoke) items.push({ label: t("rowRevoke"), tone: "error", onSelect: () => setTarget(r) });
        if (items.length === 0) return null;
        return (
          <Menu
            align="end"
            items={items}
            trigger={
              <IconButton label={t("rowMenuPlain", { name: nameOf(r) })} size="sm">
                <MoreIcon />
              </IconButton>
            }
          />
        );
      },
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {filters}
        <span className="flex-1" />
        {canMark ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => openSheet()}>
            {t("manualOpen")}
          </Button>
        ) : null}
        {/* K29: the audited Route Handler, admin-only — a download, never a Server Action. */}
        {csvHref ? (
          <a href={csvHref} className={buttonClass("secondary", "sm")}>
            {t("csv")}
          </a>
        ) : null}
      </div>

      {/* K32: the empty line is the page's own — `EmptyState` requires an action, and there is none to offer here. */}
      {rows.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <DataTable<BoardRow> label={t("tableLabel")} columns={columns} rows={rows} rowKey={(r) => r.memberId} empty={{ title: t("empty"), action: { label: t("empty") } }} />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={t("manualTitle")} side="inline-end">
        <form action={markFormAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="dayId" value={dayId ?? ""} />
          {candidates.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("sheetEmpty")}</p>
          ) : (
            <>
              <Field id="manual-member" label={t("sheetMember")} required>
                <Combobox
                  key={`${dayId}-${sheetOpen}`}
                  name="memberId"
                  options={candidates}
                  value={member ? [member] : []}
                  onChange={(v) => setMember(v[0] ?? "")}
                  placeholder={t("memberPlaceholder")}
                />
              </Field>
              <Field id="manual-reason" label={t("reasonLabel")} required>
                <Textarea name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
              </Field>
              <SubmitButton pending={marking}>{t("mark")}</SubmitButton>
            </>
          )}
          {markState.error ? (
            <p role="alert" className="text-body-sm text-fg-heading">
              {t(`error.${markState.error}`)}
            </p>
          ) : null}
        </form>
      </Sheet>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        {target ? (
          <DialogContent
            title={t.rich("revokeTitle", { name: nameOf(target), bdi: bold })}
            description={t.rich(paysOnCompletion ? "revokeBodyOpen" : "revokeBody", { session: sessionTitle, bdi: bold })}
            closeLabel={tUi("dialog.close")}
          >
            <form ref={revokeForm} action={removeFormAction} noValidate className="flex flex-col gap-4">
              <input type="hidden" name="memberId" value={target.memberId} />
              <input type="hidden" name="dayId" value={dayId ?? ""} />
              <Field id="revoke-reason" label={t("removeReasonLabel")} required>
                <Textarea name="reason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} rows={2} maxLength={300} />
              </Field>
              {removeState.error ? (
                <p role="alert" className="text-body-sm text-fg-heading">
                  {t(`removeError.${removeState.error}`)}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="danger" pending={removing} disabled={revokeReason.trim().length === 0} onClick={() => revokeForm.current?.requestSubmit()}>
                  {t("removeSubmit")}
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                </DialogClose>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
