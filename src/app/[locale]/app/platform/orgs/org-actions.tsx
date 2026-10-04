"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/routing";
import type { OrgSummary } from "@/lib/dal/platform";
import { hasFailed, was } from "@/lib/form-state";
import { deleteOrgAction, reinstateOrgAction, suspendOrgAction } from "./actions";
import { emptyDeleteState, emptySuspendState, type DeleteState, type SuspendState } from "./state";

// SCR-080's row acts, in the row as `PlatformOrgs.dc.html` draws them — «أوقف» or «أعد التفعيل», «النطاقات», «احذف»
// — REQ-TEN-006, REQ-NFR-014, REQ-UIX-013. Kept (W26.2.1, O4 – O8):
//
// · ★ Suspension confirms in `ui/dialog` NAMING THE ORG and asks for a reason the org's admins will read; deletion is
//   irreversible and asks for the SLUG TYPED BACK, compared on the server (`delete_org()`'s `slug_mismatch`). The two
//   dialogs are deliberately not the same (`REQ-NFR-014`). The board draws neither; both are requirements.
// · Reinstating is one press and no confirm — restorative — and answers either way (wave 8 F4).
// · Deletion is offered on an active org as well as a suspended one (DEC-251, Q9): `delete_org()` suspends first.
// · ★ An org with a deletion requested is offered NOTHING (`0097`): the cell says so, to a reader, in one line.
// · No effect drives a toast or a close: each form's action is wrapped here, so the dialog closes and the
//   acknowledgement fires in the action's own path (wave 8 F2).
//
// Each act's accessible name carries the org — «أوقف — {org}» — because a column of «أوقف» is a column of the same
// name. A toast title is plain text, so the org's name is isolated with FSI/PDI, the character form of `<bdi>`.

const isolate = (value: string) => `⁨${value}⁩`;

/**
 * Coral text on a `ghost` act. A bare `text-error` loses to the variant's own `text-fg-heading` (same specificity, and
 * the variant's utility sorts after it), so the act drew in the heading's bone. `pg-dark:` sorts after every base
 * utility, which is how `danger` itself reaches DEC-073's on-dark error inside the scope; the platform is always
 * inside it.
 */
const CORAL = "text-error pg-dark:text-error-on-dark";

/** A 36 px pill with a 44 px hit area: the pseudo-element extends the target, not the drawing. */
const HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']";

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

  if (org.deletionPending) {
    return (
      <span className="text-caption text-fg-muted">
        <span aria-hidden>—</span>
        <span className="sr-only">{t("noActionsDeleting")}</span>
      </span>
    );
  }

  const reinstate = () =>
    startReinstate(async () => {
      const { error } = await reinstateOrgAction(locale, org.id);
      toast.show(error ? { title: tErr(error), tone: "error" } : { title: t("reinstated", { org: isolate(org.name) }), tone: "success" });
    });

  const named = (label: string) => `${label} — ${org.name}`;
  const orgTitle = (key: "suspendConfirmTitle" | "deleteConfirmTitle") => t.rich(key, { org: org.name, bdi: (c) => <bdi>{c}</bdi> });

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => setDialog(open ? dialog : null)}>
      {/* One line at a desk, as drawn: quiet pills for the reversible acts and the way to SCR-082, the destructive
          act as coral TEXT. Each pill draws 36 px and is HIT at 44: its `after:` box reaches 4 px past it on both
          sides (SC 2.5.8 asks 24; the console's floor is 44). */}
      <div role="group" aria-label={org.name} className="flex flex-wrap items-center gap-1.5 md:flex-nowrap">
        {org.status === "active" ? (
          <Button type="button" variant="quiet" size="sm" className={HIT} aria-label={named(t("suspendShort"))} onClick={() => setDialog("suspend")}>
            {t("suspendShort")}
          </Button>
        ) : (
          <Button type="button" variant="quiet" size="sm" className={HIT} aria-label={named(t("reinstate"))} pending={reinstating} onClick={reinstate}>
            {t("reinstate")}
          </Button>
        )}
        <ButtonLink href={`/app/platform/orgs/${org.id}/domains`} variant="quiet" size="sm" className={HIT} aria-label={named(t("domainsLink"))}>
          {t("domainsLink")}
        </ButtonLink>
        <Button type="button" variant="ghost" size="sm" className={`${HIT} ${CORAL}`} aria-label={named(t("deleteShort"))} onClick={() => setDialog("delete")}>
          {t("deleteShort")}
        </Button>
      </div>

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
            {/* The slug on its own line, Latin, left to right in its own isolated box: inside the sentence it wrapped
                mid-slug at 390 px (wave 8, sync 4). */}
            <div className="space-y-2">
              <p className="text-body-sm text-fg-body">{t("deleteSlugIntro")}</p>
              <p>
                <code dir="ltr" className="inline-block rounded-field bg-raised px-2 py-1 font-mono text-body-sm text-fg-heading">
                  <bdi>{org.slug}</bdi>
                </code>
              </p>
            </div>
            <Field
              id={`delete-slug-${org.id}`}
              label={t("deleteConfirmLabel")}
              required
              error={deleteState.errors.confirmSlug ? tErr(deleteState.errors.confirmSlug) : undefined}
            >
              {/* autocomplete off: a browser offering a previously typed slug would undo the point of typing it. */}
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
