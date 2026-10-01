"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { AlertCircleIcon, PlusIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AddCoPresentersOutcome, NameableMember } from "@/lib/dal/proposals";

// SCR-018's «+ أضف مُقدِّمًا مشاركًا» — the proposer names more co-presenters after the proposal was written
// (DEC-213 §5.102, REQ-PRO-003). The page renders it for the proposer, while the proposal is open and a slot is left.
//
// A `sheet` holding the same search the form uses (`ui/combobox`, REQ-UIX-008): the members not already on the
// proposal, at most the slots left. The form is a real <form> around the bound Server Action; the database decides
// the rest and writes each invitation unanswered (`0168`), and the invitation is sent as at creation (`0039`). A
// refusal is said inside the sheet, where the member pressed; success closes it and the page under it refreshes.

export function AddCoPresenter({
  members,
  slots,
  limitLabel,
  action,
}: {
  members: NameableMember[];
  slots: number;
  limitLabel: string;
  action: (prev: { outcome: AddCoPresentersOutcome | null }, formData: FormData) => Promise<{ outcome: AddCoPresentersOutcome | null }>;
}) {
  const t = useTranslations("proposals.proposal.add");
  const tp = useTranslations("proposals.propose.form");
  const tq = useTranslations("proposals.proposal");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: { outcome: AddCoPresentersOutcome | null }, formData: FormData) => {
    const next = await action(prev, formData);
    if (next.outcome === "ok") setOpen(false);
    return next;
  }, { outcome: null });
  const refused = state.outcome && state.outcome !== "ok" ? state.outcome : null;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        {t("action")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={t("title")} description={limitLabel}>
        <form action={formAction} className="flex flex-col gap-4">
          {refused ? (
            <p role="alert" className="flex items-start gap-2 text-caption text-error pg-dark:text-error-on-dark">
              <AlertCircleIcon className="mt-[0.2em]" />
              <span>{t(`errors.${refused}`)}</span>
            </p>
          ) : null}
          {members.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("none")}</p>
          ) : (
            <Field id="add-coPresenters" label={tp("coPresentersLabel")} hint={tp("coPresentersHint")}>
              <Combobox
                name="coPresenters"
                multiple
                max={slots}
                options={members.map((m) => ({ value: m.id, label: m.displayName ?? "", hint: m.jobTitle ?? undefined, teamColor: m.teamColor ?? null }))}
                placeholder={tp("coPresentersPlaceholder")}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            {members.length > 0 ? <SubmitButton size="md">{t("submit")}</SubmitButton> : null}
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)}>
              {tq("cancel")}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
