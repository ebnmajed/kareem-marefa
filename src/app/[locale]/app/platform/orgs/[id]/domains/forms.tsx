"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { hasFailed, was } from "@/lib/form-state";
import { emptyAddDomainState, emptyFirstAdminState, type AddDomainState, type FirstAdminState } from "./state";

// SCR-082's two forms — REQ-TEN-007, REQ-TEN-002, onto the form model for wave 8
// (`docs/plan/notes/platform.md` W8.5).
//
// Both are Latin-valued and keep `dir="ltr"` on the control alone, so the label,
// the hint and the error stay in the page's direction. Both are `noValidate`,
// with the app's error beside its field. The acknowledgement fires in the
// action's own path, never from an effect.
//
// ★ Contract 4: any case is accepted, and the toast names the domain AS STORED
// — the same lowercase form the list re-renders — so what the operator reads
// is what provisioning will compare against. A toast title is plain text, so
// the domain is isolated with FSI/PDI, the character form of `<bdi>`.

const isolate = (value: string) => `⁨${value}⁩`;

function FormError({ message }: { message: string }) {
  return (
    <Panel tone="error">
      <p role="alert" className="text-body-sm text-fg-heading">
        {message}
      </p>
    </Panel>
  );
}

export function AddDomainForm({ action }: { action: (prev: AddDomainState, formData: FormData) => Promise<AddDomainState> }) {
  const t = useTranslations("platform.domains");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(async (prev: AddDomainState, formData: FormData) => {
    const next = await action(prev, formData);
    if (next.done === "added") toast.show({ title: t("added", { domain: isolate(next.stored) }), tone: "success" });
    if (next.done === "present") toast.show({ title: t("alreadyPresent", { domain: isolate(next.stored) }), tone: "info" });
    return next;
  }, emptyAddDomainState());

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-4">
      {state.formError ? <FormError message={tErr(state.formError)} /> : null}
      <Field id="domain" label={t("domainLabel")} hint={t("domainHint")} required error={state.errors.domain ? tErr(state.errors.domain) : undefined}>
        <Input name="domain" dir="ltr" autoComplete="off" spellCheck={false} maxLength={253} className="font-mono" defaultValue={was(state, "domain")} />
      </Field>
      <SubmitButton size="md" pending={pending}>
        {t("add")}
      </SubmitButton>
    </form>
  );
}

export function FirstAdminForm({
  current,
  action,
}: {
  current: string | null;
  action: (prev: FirstAdminState, formData: FormData) => Promise<FirstAdminState>;
}) {
  const t = useTranslations("platform.domains");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const [state, formAction, pending] = useActionState(async (prev: FirstAdminState, formData: FormData) => {
    const next = await action(prev, formData);
    if (!hasFailed(next)) toast.show({ title: t("firstAdminSaved"), tone: "success" });
    return next;
  }, emptyFirstAdminState());

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-4">
      <p className="text-body-sm text-fg-muted">
        {t("firstAdminCurrent")}
        {": "}
        {current ? (
          <bdi dir="ltr" className="text-fg-heading">
            {current}
          </bdi>
        ) : (
          t("firstAdminNone")
        )}
      </p>
      {state.formError ? <FormError message={tErr(state.formError)} /> : null}
      <Field id="email" label={t("firstAdminLabel")} hint={t("firstAdminHint")} required error={state.errors.email ? tErr(state.errors.email) : undefined}>
        {/* After a save the field shows the stored address; after a refusal, what was typed. */}
        <Input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="off"
          maxLength={254}
          defaultValue={state.attempt > 0 ? was(state, "email") : (current ?? "")}
        />
      </Field>
      <SubmitButton size="md" pending={pending}>
        {t("setFirstAdmin")}
      </SubmitButton>
    </form>
  );
}
