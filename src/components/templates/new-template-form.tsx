"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { initialTemplateActionState, type TemplateActionState } from "@/app/[locale]/app/admin/templates/state";

// SCR-055's «قالب جديد» (wave 23): a name, the kind it serves, and for a certificate its page — then the studio. The
// action redirects on success; a refusal comes back here, the name's at the field (`noValidate`, wave 7).

export function NewTemplateForm({
  action,
  purpose,
  families,
}: {
  action: (previous: TemplateActionState, form: FormData) => Promise<TemplateActionState>;
  purpose: "poster" | "certificate";
  families: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("templates");
  const toast = useToast();
  const [state, dispatch] = useActionState(async (previous: TemplateActionState, form: FormData) => {
    const result = await action(previous, form);
    if (result.status === "not_authorized") toast.show({ tone: "error", title: t("result.notAuthorized") });
    else if (result.status === "invalid") toast.show({ tone: "error", title: t("result.invalidToast") });
    return result;
  }, initialTemplateActionState);

  return (
    <form action={dispatch} noValidate className="flex flex-col gap-5">
      <Field label={t("create.name")} required error={state.status === "invalid_field" ? t(`create.${state.error}`) : undefined}>
        <Input name="name" maxLength={120} autoComplete="off" />
      </Field>
      <RadioGroup name="family" legend={t("create.kind")} defaultValue={families[0]?.value} options={families} />
      {purpose === "certificate" ? (
        <RadioGroup
          name="orientation"
          legend={t("create.orientation")}
          defaultValue="landscape"
          options={[
            { value: "landscape", label: `A4 ${t("card.page.landscape")}` },
            { value: "portrait", label: `A4 ${t("card.page.portrait")}` },
          ]}
        />
      ) : null}
      <SubmitButton size="md" className="self-start">
        {t("create.submit")}
      </SubmitButton>
    </form>
  );
}
