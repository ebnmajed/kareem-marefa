"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/routing";
import { addToOrg, type AddState } from "./actions";
import { emptyAddState } from "./state";

// SCR-049's «أضف عضوًا» (`REQ-TEN-009`, `REQ-UIX-113`, `DEC-243` §7, `DEC-244` §9).
//
// ★ One control for one address and for a pasted list, because they are the same thing: the
// textarea splits on newlines, commas and semicolons, and ONE address takes the richer path that
// also carries الاسم and المسمى الوظيفي. Two controls would drift.
//
// ★ The role offers عضو and مشرف محتوى only. `DEC-244` §5.4: an addition is a standing grant to
// whoever controls a mailbox, so مشرف المؤسسة is granted to a member who has ARRIVED, through the
// role change in the row menu, which guards the last admin and audits. The database refuses it too
// — this select is the shape, not the authority.
//
// ★ No explainer paragraph (`DEC-NEXT-25`). The one sentence that earns its place is the note that
// the person is a member at once and will be mailed — it changes what the admin does next (they do
// not need to tell them separately), and it is the only thing about this screen that is not
// visible in the row it creates.

export function AddMember({ locale, companies }: { locale: Locale; companies: { id: string; name: string }[] }) {
  const t = useTranslations("admin.members.add");
  const te = useTranslations("admin.members");
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const [state, formAction] = useActionState(async (prev: AddState, formData: FormData) => {
    const result = await addToOrg(locale, prev, formData);
    if (result.done) {
      const added = result.report.filter((line) => line.outcome === "added").length;
      // Six ICU forms, and the number arrives PRE-FORMATTED as `value`: ICU's `#` would print it
      // in the locale's own numbering system, and the numerals are Western everywhere (`DEC-124`,
      // `tests/unit/messages-numerals.test.ts`).
      toast.show({ title: t("done", { count: added, value: formatNumber(added) }), tone: added > 0 ? "success" : "error" });
    } else if (result.error) {
      toast.show({ title: te(`error.${result.error}`), tone: "error" });
    }
    return result;
  }, emptyAddState);

  // Closed from the RESULT, and only when every line landed — a report with a refusal stays open so
  // the admin can read it (the row-menu dialogs' pattern, adjusted during render).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.done && state.report.every((line) => line.outcome === "added")) setOpen(false);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {t("open")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={t("title")} description={t("note")}>
        <form action={formAction} className="space-y-4">
          <Field label={t("emails")} hint={t("emailsHint")} required>
            <Textarea name="emails" rows={3} required dir="ltr" autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={t("displayName")} hint={t("oneOnly")}>
            <Input name="displayName" maxLength={120} autoComplete="off" />
          </Field>
          <Field label={t("jobTitle")} hint={t("oneOnly")}>
            <Input name="jobTitle" maxLength={120} autoComplete="off" />
          </Field>
          <Field label={t("company")}>
            <Select name="companyId" defaultValue="">
              <option value="">{te("noValue")}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("role")}>
            <Select name="role" defaultValue="member">
              <option value="member">{te("role.member")}</option>
              <option value="moderator">{te("role.moderator")}</option>
              <option value="admin">{te("role.admin")}</option>
            </Select>
          </Field>

          {state.report.length > 0 ? (
            <ul className="space-y-1 text-caption" aria-live="polite" aria-label={t("reportLabel")}>
              {state.report.map((line) => (
                <li key={line.email} className={line.outcome === "added" ? "text-fg-body" : "text-error"}>
                  <bdi dir="ltr">{line.email}</bdi> — {t(`outcome.${line.outcome}`)}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {te("cancelDialogCancel")}
            </Button>
            <SubmitButton>{t("submit")}</SubmitButton>
          </div>
        </form>
      </Sheet>
    </>
  );
}
