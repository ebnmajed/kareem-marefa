"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { reportPhotoAction } from "@/components/photos/actions";
import { formatNumber } from "@/components/sessions/numerals";

/** `report_photo()`'s bounds on a reason — read here only to say them; the function is the check. */
const REASON = { min: formatNumber(3), max: formatNumber(1000) };
const plain = (chunks: string) => chunks;

// REQ-EVT-008, wave 22 (F1) — «إبلاغ» for the photograph on screen in the lightbox, the comment report's shape: a
// dialog, a reason, «إرسال البلاغ»; afterwards a line in place of the button. The photograph stays visible pending
// review — nothing here hides it (the takedown beside it is the member's own «hide»). The rules — visible photos only,
// never one's own, once per member — are `report_photo()`'s; the caller simply does not offer it on one's own photo.
//
// ★ The dialog is CONTROLLED and its submit a plain button inside a `noValidate` form: the reason is checked by the
// function and said at the field (16 §8.2), and closing waits for the answer (the takedown button's real-build lesson).

export function ReportPhotoButton({ locale, sessionId, photoId, reported }: { locale: string; sessionId: string; photoId: string; reported: boolean }) {
  const t = useTranslations("photos.report");
  const toast = useToast();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(reported);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const reason = formData.get("reason")?.toString() ?? "";
    setFieldError(null);
    startTransition(async () => {
      let outcome: string;
      try {
        outcome = (await reportPhotoAction(locale, sessionId, photoId, reason)).outcome;
      } catch {
        outcome = "unknown";
      }
      if (outcome === "reported" || outcome === "already_reported") {
        setOpen(false);
        setDone(true);
        toast.show({ tone: "success", title: outcome === "reported" ? t("success") : t("already") });
      } else if (outcome === "reason_required") {
        setFieldError(t.markup("errors.reason_required", { ...REASON, bdi: plain }));
      } else {
        setOpen(false);
        toast.show({ tone: "error", title: t(`errors.${outcome === "own_photo" || outcome === "not_visible" ? outcome : "unknown"}`) });
      }
    });
  }

  if (done) return <p className="text-body-sm text-fg-muted">{t("already")}</p>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-auto! min-h-9 self-start px-3 py-2">
          {t("action")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} closeLabel={t("close")}>
        {/* `onSubmit`, not `action`: React resets a form after an action, and a refused reason must stay typed. */}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <Field id={reasonId} label={t("reasonLabel")} hint={t.markup("reasonHint", { ...REASON, bdi: plain })} required error={fieldError ?? undefined}>
            <Textarea name="reason" rows={3} maxLength={1000} onChange={() => setFieldError(null)} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button type="submit" pending={pending} pendingLabel={t("sending")}>
              {t("submit")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
