"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { MenuItem } from "@/components/ui";
import type { ConsoleMembers, ConsoleMemberRow } from "@/lib/dal/admin-members";
import type { Locale } from "@/i18n/routing";
import { changeCompany, changeRole, deactivate, reactivate, removeUnbound, resendInvitation, type RowState } from "./actions";
import { emptyRowState } from "./state";

// SCR-049's ⋯ (`REQ-ADM-009`, `REQ-UIX-096`), written for wave 22 from `AdminMembers.dc.html`: the row menu changes the
// role, deactivates, reactivates — each audited by 0005's RPCs — and leads to the member's full profile.
//
// Kept, each from the wave-6 file: the deactivation dialog names the member and needs a written reason that lands in
// the audit log (`REQ-AUT-007`); the dialog closes from the RESULT, adjusted during render; the toast comes from the
// action's own result. ★ New: a role change confirms first, naming the member and the role (`REQ-UIX-013`); ★ the last
// active admin's menu SAYS WHY before the click (`REQ-UIX-096`) instead of offering a change the RPC then refuses;
// ★ reactivation toasts what the server said, never success regardless (`DEC-232` §3.1).
//
// ★ wave 25 (`REQ-TEN-009`, `DEC-244` §9): a row whose auth user is not yet bound is an ORDINARY
// member row — it keeps the role change and the deactivation — and gains two items: «أعد الإرسال»,
// and «احذف», which is the admin who mistyped an address getting the row GONE rather than
// deactivated with a reason. The delete exists only while the row is unbound; the RPC refuses it
// the moment the person has arrived, and after that the only way out is `REQ-AUT-008`.
//
// ★ wave 27 (`REQ-PRF-013`, `DEC-254` §2.6): «غيّر الشركة» — the one place a member's company is written after they
// exist. A dialog with the org's ACTIVE companies and «بلا شركة»; the RPC records it as the admin's placement, which no
// later domain edit moves, and audits the old and the new. The dialog closes from the RESULT, as the deactivation's.

const ROLES = ["admin", "moderator", "member"] as const;

export function MemberRowMenu({
  member,
  locale,
  lastAdmin,
  companies = [],
}: {
  member: ConsoleMemberRow;
  locale: Locale;
  lastAdmin: boolean;
  /** ★ wave 27: the org's companies, for «غيّر الشركة»; only the active ones are offered. */
  companies?: ConsoleMembers["companies"];
}) {
  const t = useTranslations("admin.members");
  const toast = useToast();
  const name = member.displayName ?? member.email;
  const [roleTo, setRoleTo] = useState<(typeof ROLES)[number] | null>(null);
  const [rolePending, setRolePending] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivatePending, setReactivatePending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removePending, setRemovePending] = useState(false);

  const [state, formAction, pending] = useActionState(async (prev: RowState, formData: FormData) => {
    const result = await deactivate(locale, member.id, prev, formData);
    if (result.done) toast.show({ title: t("deactivateDone"), tone: "success" });
    else if (result.error && result.error !== "reason_required") toast.show({ title: t(`error.${result.error}`), tone: "error" });
    return result;
  }, emptyRowState);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.done) setDeactivating(false);
  }

  const [placing, setPlacing] = useState(false);
  const [companyState, companyAction, companyPending] = useActionState(async (prev: RowState, formData: FormData) => {
    const result = await changeCompany(locale, member.id, prev, formData);
    toast.show(result.done ? { title: t("companyChanged"), tone: "success" } : { title: t(`error.${result.error ?? "failed"}`), tone: "error" });
    return result;
  }, emptyRowState);
  const [companyHandled, setCompanyHandled] = useState(companyState);
  if (companyState !== companyHandled) {
    setCompanyHandled(companyState);
    if (companyState.done) setPlacing(false);
  }
  const offered = companies.filter((c) => c.active !== false || c.id === member.companyId);

  async function confirmRole() {
    if (!roleTo) return;
    setRolePending(true);
    try {
      const result = await changeRole(locale, member.id, roleTo);
      toast.show(result.done ? { title: t("roleChanged"), tone: "success" } : { title: t(`error.${result.error ?? "failed"}`), tone: "error" });
      if (result.done) setRoleTo(null);
    } finally {
      setRolePending(false);
    }
  }

  async function runReactivate() {
    setReactivatePending(true);
    try {
      const result = await reactivate(locale, member.id);
      toast.show(result.done ? { title: t("reactivateDone"), tone: "success" } : { title: t(`error.${result.error ?? "failed"}`), tone: "error" });
    } finally {
      setReactivatePending(false);
    }
  }

  async function runResend() {
    setResendPending(true);
    try {
      const result = await resendInvitation(locale, member.id);
      toast.show(result.done ? { title: t("resendDone"), tone: "success" } : { title: t(`error.${result.error ?? "failed"}`), tone: "error" });
    } finally {
      setResendPending(false);
    }
  }

  async function runRemove() {
    setRemovePending(true);
    try {
      const result = await removeUnbound(locale, member.id);
      toast.show(result.done ? { title: t("removeDone"), tone: "success" } : { title: t(`error.${result.error ?? "failed"}`), tone: "error" });
      if (result.done) setRemoving(false);
    } finally {
      setRemovePending(false);
    }
  }

  const active = member.status === "active";
  const items: MenuItem[] = [
    { label: t("viewProfile"), href: `/app/members/${member.id}` },
    { label: t("changeCompany"), onSelect: () => setPlacing(true) },
  ];
  // ★ wave 25: the two items a row has only while its auth user is unbound.
  if (active && !member.hasSignedIn) {
    items.push({ label: t("resend"), onSelect: () => void runResend(), startsGroup: true, disabled: resendPending });
    items.push({ label: t("remove"), tone: "error", onSelect: () => setRemoving(true), disabled: removePending });
  }
  if (!active) {
    items.push({ label: t("reactivate"), onSelect: () => void runReactivate(), startsGroup: true, disabled: reactivatePending });
  } else if (lastAdmin) {
    // The RPC refuses `last_admin` either way; the menu says so before anyone tries.
    items.push({ label: t("lastAdmin"), disabled: true, startsGroup: true });
  } else {
    ROLES.filter((r) => r !== member.role).forEach((r, i) =>
      items.push({ label: t("changeRoleTo", { role: t(`role.${r}`) }), onSelect: () => setRoleTo(r), startsGroup: i === 0 }),
    );
    items.push({ label: t("deactivate"), tone: "error", onSelect: () => setDeactivating(true), startsGroup: true });
  }

  return (
    <>
      <Menu
        align="end"
        trigger={
          <IconButton label={t.markup("moreActions", { name, t: (chunks) => chunks })} size="sm">
            <MoreIcon />
          </IconButton>
        }
        items={items}
      />

      <ConfirmDialog
        open={roleTo !== null}
        onOpenChange={(open) => (open ? undefined : setRoleTo(null))}
        title={t.rich("roleConfirmTitle", { name, role: roleTo ? t(`role.${roleTo}`) : "", t: (chunks) => <bdi>{chunks}</bdi> })}
        body={<p>{t("roleConfirmBody")}</p>}
        confirmLabel={t("changeRole")}
        cancelLabel={t("cancelDialogCancel")}
        closeLabel={t("closeDialog")}
        tone="primary"
        pending={rolePending}
        onConfirm={() => void confirmRole()}
      />

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t.rich("removeConfirmTitle", { name, t: (chunks) => <bdi>{chunks}</bdi> })}
        body={<p>{t("removeConfirmBody")}</p>}
        confirmLabel={t("remove")}
        cancelLabel={t("cancelDialogCancel")}
        closeLabel={t("closeDialog")}
        tone="danger"
        pending={removePending}
        onConfirm={() => void runRemove()}
      />

      <Dialog open={placing} onOpenChange={setPlacing}>
        <DialogContent title={t.rich("companyTitle", { name, t: (chunks) => <bdi>{chunks}</bdi> })} closeLabel={t("closeDialog")}>
          <form action={companyAction} noValidate>
            <Field id={`member-company-${member.id}`} label={t("columnCompany")}>
              <Select name="companyId" defaultValue={member.companyId ?? "none"}>
                <option value="none">{t("noCompany")}</option>
                {offered.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" pending={companyPending} disabled={companyPending}>
                {t("companySave")}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("cancelDialogCancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivating} onOpenChange={setDeactivating}>
        <DialogContent title={t.rich("deactivateConfirmTitle", { name, t: (chunks) => <bdi>{chunks}</bdi> })} closeLabel={t("closeDialog")}>
          <form action={formAction} noValidate>
            <Field
              id={`deactivate-reason-${member.id}`}
              label={t("reasonLabel")}
              hint={t("reasonHint")}
              required
              error={state.error === "reason_required" ? t("error.reason_required") : undefined}
            >
              <Textarea name="reason" rows={3} maxLength={300} />
            </Field>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" variant="danger" pending={pending} disabled={pending}>
                {t("send")}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("cancelDialogCancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
