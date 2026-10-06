"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { DeletionImpact } from "@/lib/dal/sessions";
import { emptyDeleteState, type DeleteState } from "./delete-state";

// Deleting an event — REQ-SES-023, DEC-271, 0215. ONE confirm for SCR-042's row «احذف», its selection's «احذف المحدّد»
// and the hub header's «احذف الفعالية». It names the event (or «N فعاليات»), then says what the delete takes back,
// read from `session_deletion_impact()` BEFORE anything moves — each non-zero part one line, a zero part not drawn.
// An optional reason, then a danger «احذف».
//
// ★ The impact is read when the dialog is OPENED (an event handler), never from an effect. ★ The toast fires from
// inside the action wrapper (the row it names leaves the table in the same commit — `review-card`'s lesson). ★ The
// dialog closes from the RESULT, adjusted during render, never on click. A failed id in a bulk run is named by the
// title the screen already holds, never by its id.

export type DeletionTarget = { id: string; title: string };

type Preview = (ids: string[]) => Promise<DeletionImpact | null>;
type Run = (prev: DeleteState, formData: FormData) => Promise<DeleteState>;

type Impact = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; value: DeletionImpact };

/** FSI … PDI: a title inside a toast's plain string is isolated as `<bdi>` would isolate it. */
const isolate = (s: string) => `⁨${s}⁩`;

export function useSessionDeletion({ preview, run, onDone }: { preview: Preview; run: Run; onDone?: (state: DeleteState) => void }): {
  open: (targets: DeletionTarget[]) => void;
  dialog: ReactNode;
} {
  const t = useTranslations("admin.sessions.delete");
  const toast = useToast();
  const [targets, setTargets] = useState<DeletionTarget[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [impact, setImpact] = useState<Impact>({ kind: "loading" });

  const [state, formAction, pending] = useActionState(async (prev: DeleteState, formData: FormData) => {
    const result = await run(prev, formData);
    const n = result.deleted.length;
    if (n > 0) {
      const parts = [t("done", { count: n, value: formatNumber(n) })];
      if (result.pointsReversed > 0) parts.push(t("donePoints"));
      if (result.certificatesRevoked > 0) parts.push(t("doneCertificates", { count: result.certificatesRevoked, value: formatNumber(result.certificatesRevoked) }));
      toast.show({ title: parts.join(" · "), tone: "success" });
    }
    if (result.failed.length > 0) {
      const titles = new Map(targets.map((x) => [x.id, x.title]));
      const names = result.failed.map((id) => isolate(`«${titles.get(id) ?? id}»`)).join("، ");
      const why = result.error === "refused" ? t("refused") : result.error === "tooMany" ? t("tooMany") : undefined;
      toast.show({ title: t("failedNamed", { list: names }), description: why, tone: "error" });
    } else if (result.error) {
      toast.show({ title: t(result.error === "refused" ? "refused" : result.error === "tooMany" ? "tooMany" : "failed"), tone: "error" });
    }
    onDone?.(result);
    return result;
  }, emptyDeleteState);

  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setOpen(false);
  }

  const open = (next: DeletionTarget[]) => {
    if (next.length === 0) return;
    setTargets(next);
    setImpact({ kind: "loading" });
    setOpen(true);
    const ids = next.map((x) => x.id);
    startTransition(async () => {
      let value: DeletionImpact | null = null;
      try {
        value = await preview(ids);
      } catch {
        value = null;
      }
      setImpact(value ? { kind: "ready", value } : { kind: "failed" });
    });
  };

  const count = targets.length;
  const title =
    count === 1
      ? t.rich("titleOne", { title: targets[0]?.title ?? "", t: (chunks) => <bdi>{chunks}</bdi> })
      : t("titleMany", { count, value: formatNumber(count) });

  const lines: string[] = [];
  if (impact.kind === "ready") {
    const v = impact.value;
    if (v.toCancel > 0) lines.push(t("toCancel", { count: v.toCancel, value: formatNumber(v.toCancel) }));
    if (v.membersWithPoints > 0) lines.push(t("members", { count: v.membersWithPoints, value: formatNumber(v.membersWithPoints) }));
    if (v.certificates > 0) lines.push(t("certificates", { count: v.certificates, value: formatNumber(v.certificates) }));
  }

  const dialog = (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent title={title} closeLabel={t("close")}>
        <form action={formAction} noValidate className="space-y-4">
          {targets.map((x) => (
            <input key={x.id} type="hidden" name="ids" value={x.id} />
          ))}
          {count > 1 ? (
            <ul className="list-disc space-y-1 ps-5 text-body-sm text-fg-body">
              {targets.map((x) => (
                <li key={x.id}>
                  <bdi>{x.title}</bdi>
                </li>
              ))}
            </ul>
          ) : null}
          {impact.kind === "loading" ? (
            <p role="status" className="text-body-sm text-fg-muted">
              {t("impactLoading")}
            </p>
          ) : impact.kind === "failed" ? (
            <p className="text-body-sm text-fg-muted">{t("impactFailed")}</p>
          ) : lines.length > 0 ? (
            <ul data-testid="deletion-impact" className="space-y-1 text-body-sm text-fg-body">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <Field label={t("reasonLabel")}>
            <Textarea name="reason" rows={2} maxLength={300} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" size="md" pending={pending} pendingLabel={t("pending")}>
              {t("confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("keep")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { open, dialog };
}

/** The hub header's «احذف الفعالية»: the same dialog, one event, and on success back to the sessions list. */
export function DeleteSessionButton({
  target,
  preview,
  run,
  redirectTo,
}: {
  target: DeletionTarget;
  preview: Preview;
  run: Run;
  /** Where the admin lands once the event is gone — its hub no longer exists for anyone. */
  redirectTo: string;
}) {
  const t = useTranslations("admin.sessions.delete");
  const router = useRouter();
  const { open, dialog } = useSessionDeletion({
    preview,
    run,
    onDone: (s) => {
      if (s.deleted.includes(target.id)) router.replace(redirectTo);
    },
  });
  return (
    <>
      <Button type="button" variant="quiet" size="md" onClick={() => open([target])}>
        {t("hubAction")}
      </Button>
      {dialog}
    </>
  );
}
