"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { revokeIssued } from "./actions";

// SCR-045's «ألغِ» — REQ-CRT-011: the reason is MANDATORY, refused at the field and kept where it was typed; the act is
// `revoke_certificate()`, audited with the reason (`certificate.revoked`), and /verify then says «هذه الشهادة ملغاة.» and
// never the reason; the PDF is not deleted. Rendered in `EditorSurface` from `?revoke=<id>`: a sheet with JS, a region
// without. `onSubmit`, not a form action: an action resets its fields when it settles, and a refused reason must stay.

export function RevokeForm({ locale, sessionId, certificateId, closeHref }: { locale: string; sessionId: string; certificateId: string; closeHref: string }) {
  const t = useTranslations("certificates.session");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reasonError, setReasonError] = useState(false);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await revokeIssued(locale, sessionId, certificateId, form);
          if (result.status === "ok") {
            toast.show({ tone: "success", title: t("revokeDone") });
            router.replace(closeHref, { scroll: false });
          } else if (result.status === "reason_required") {
            setReasonError(true);
          } else {
            toast.show({ tone: "error", title: t(result.status === "not_authorized" ? "notAuthorized" : "failed") });
          }
        });
      }}
    >
      <Field id="revoke-reason" label={t("reasonLabel")} hint={t("reasonHint")} error={reasonError ? t("reasonRequired") : undefined} required>
        <Textarea name="reason" rows={3} maxLength={500} onChange={() => reasonError && setReasonError(false)} />
      </Field>
      <Button type="submit" variant="danger" size="md" className="self-start" pending={pending}>
        {t("revokeConfirm")}
      </Button>
    </form>
  );
}
