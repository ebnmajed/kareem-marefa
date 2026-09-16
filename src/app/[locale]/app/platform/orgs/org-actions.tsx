"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/routing";
import type { OrgSummary } from "@/lib/dal/platform";
import { hasFailed, was } from "@/lib/form-state";
import { deleteOrgAction, reinstateOrgAction, suspendOrgAction } from "./actions";
import { emptyDeleteState, emptySuspendState, type DeleteState, type SuspendState } from "./state";

// SCR-080's per-row acts — REQ-TEN-006, REQ-NFR-014, REQ-UIX-013, wave 8
// (`docs/plan/notes/platform.md` W8.3).
//
// One `ui/menu` per row, and each destructive act confirms in `ui/dialog` NAMING
// THE ORG with the consequence stated before the press — the members table's
// Menu→Dialog shape, proven on a real build. The two dialogs are deliberately
// not the same (`REQ-NFR-014`): suspension is reversible and asks for a
// sentence the org's admins will read; deletion is not, and asks the operator
// to type the slug back, compared ON THE SERVER.
//
// ★ No effect drives a toast or a close. Each form's action is wrapped here, so
// the dialog closes and the acknowledgement fires in the action's own path —
// an effect keyed on state is the shape that silently never runs when the
// component re-renders away (wave 6's «effect toasts in unmounting cards»,
// notes W8.0 F2).
//
// Reinstating is one press and no confirm: it is restorative, the asymmetry
// `DeactivateToggle` already records. It answers either way (F4).
//
// ★ An org with a deletion requested gets NO acts at all (sync 3's ruling,
// `0010`): `reinstate_org()` refuses it, and suspending or deleting it again
// changes nothing. Principle 7 — what cannot be done is not offered; the row's
// status badge says why.
//
// A toast title is plain text, so an org's name inside it is isolated with
// FSI/PDI — the character form of `<bdi>`.

const isolate = (value: string) => `⁨${value}⁩`;

export function OrgActions({ org, locale }: { org: OrgSummary; locale: Locale }) {
  const t = useTranslations("platform.orgs");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const [dialog, setDialog] = useState<"suspend" | "delete" | null>(null);
  const [reinstating, startReinstate] = useTransition();

  const [suspendState, suspendAction, suspendPending] = useActionState(async (prev: SuspendState, formData: FormData) => {
    const next = await suspendOrgAction(locale, org.id, prev, formData);
    if (!hasFailed(next)) {
      setDialog(null);
      toast.show({ title: t("suspended", { org: isolate(org.name) }), tone: "success" });
    }
    return next;
  }, emptySuspendState());

  const [deleteState, deleteAction, deletePending] = useActionState(async (prev: DeleteState, formData: FormData) => {
    const next = await deleteOrgAction(locale, org.id, prev, formData);
    if (!hasFailed(next)) {
      setDialog(null);
      toast.show({ title: t("deleteQueued"), tone: "success" });
    }
    return next;
  }, emptyDeleteState());

  const reinstate = () =>
    startReinstate(async () => {
      const { error } = await reinstateOrgAction(locale, org.id);
      toast.show(error ? { title: tErr(error), tone: "error" } : { title: t("reinstated", { org: isolate(org.name) }), tone: "success" });
    });

  const orgTitle = (key: "suspendConfirmTitle" | "deleteConfirmTitle") => t.rich(key, { org: org.name, bdi: (c) => <bdi>{c}</bdi> });

  if (org.deletionPending) return null;

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => setDialog(open ? dialog : null)}>
      <Menu
        align="end"
        trigger={
          <IconButton label={t("actionsFor", { org: org.name })} size="sm" pending={reinstating}>
            <MoreIcon />
          </IconButton>
        }
        items={[
          org.status === "active"
            ? { label: t("suspendTitle"), onSelect: () => setDialog("suspend") }
            : { label: t("reinstate"), onSelect: reinstate },
          { label: t("deleteTitle"), onSelect: () => setDialog("delete"), tone: "error", startsGroup: true },
        ]}
      />

      {dialog === "suspend" ? (
        <DialogContent title={orgTitle("suspendConfirmTitle")} description={t("suspendHint")} closeLabel={t("closeDialog")}>
          <form action={suspendAction} noValidate className="space-y-5">
            {suspendState.formError ? <FormError message={tErr(suspendState.formError)} /> : null}
            <Field
              id={`suspend-reason-${org.id}`}
              label={t("suspendReasonLabel")}
              hint={t("suspendReasonHint")}
              required
              error={suspendState.errors.reason ? tErr(suspendState.errors.reason) : undefined}
            >
              <Textarea name="reason" rows={3} maxLength={300} defaultValue={was(suspendState, "reason")} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <SubmitButton variant="danger" size="md" pending={suspendPending}>
                {t("suspend")}
              </SubmitButton>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md">
                  {t("cancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      ) : null}

      {dialog === "delete" ? (
        <DialogContent title={orgTitle("deleteConfirmTitle")} description={t("deleteHint")} closeLabel={t("closeDialog")}>
          <form action={deleteAction} noValidate className="space-y-5">
            {deleteState.formError ? <FormError message={tErr(deleteState.formError)} /> : null}
            <p className="text-body-sm text-fg-body">
              {t("deleteSlugIntro")}{" "}
              {/* A slug is Latin in an Arabic sentence, and it types left to right. */}
              <code dir="ltr" className="rounded-field bg-silver-100 px-1.5 py-0.5 font-mono text-fg-heading">
                <bdi>{org.slug}</bdi>
              </code>
            </p>
            <Field
              id={`delete-slug-${org.id}`}
              label={t("deleteConfirmLabel")}
              required
              error={deleteState.errors.confirmSlug ? tErr(deleteState.errors.confirmSlug) : undefined}
            >
              {/* autocomplete off: a browser offering a previously typed slug
                  would undo the point of typing it. */}
              <Input name="confirmSlug" dir="ltr" autoComplete="off" spellCheck={false} className="font-mono" defaultValue={was(deleteState, "confirmSlug")} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <SubmitButton variant="danger" size="md" pending={deletePending}>
                {t("delete")}
              </SubmitButton>
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="md">
                  {t("cancel")}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <Panel tone="error">
      <p role="alert" className="text-body-sm text-fg-heading">
        {message}
      </p>
    </Panel>
  );
}
