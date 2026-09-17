"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { PosterMode } from "@/lib/dal/posters";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
import { attachPosterUpload, customisePoster } from "@/components/posters/actions";

// The picker's two controls — DEC-012, REQ-DSG-003, REQ-DSG-020, REQ-UIX-013.
//
// ★ BOTH ARE CONFIRMED BY NAME, and the dialog says only what is true
// (DEC-148 q3): a detached poster is never REGENERATED, and it still binds the
// brand, so a colour change reaches its next export. «Unaffected by the org's
// identity» (PosterFlow's copy) would be false, and «go back by deleting the
// copy» describes an action that does not exist.
//
// The confirm button is a plain button whose transition closes the dialog on
// success — never a `DialogClose` around a pending transition (the real-build
// timeout `takedown-button.tsx` records).

/** «خصّص» — detach, then open the studio on the document the RPC returns. */
export function CustomiseButton({
  sessionId,
  sessionTitle,
  variant = "primary",
}: {
  sessionId: string;
  sessionTitle: string;
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("designer.poster.picker");
  const ui = useTranslations("ui");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const result = await customisePoster(locale, sessionId);
      if (result.status !== "ok" || !result.documentId) {
        toast.show({ tone: "error", title: t("detach.failed") });
        return;
      }
      setOpen(false);
      router.push(`/${locale}/app/admin/designer/${result.documentId}`);
      router.refresh();
    });

  return (
    <>
      <Button type="button" variant={variant} size="md" onClick={() => setOpen(true)}>
        {t("customiseAction")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent
          title={t.rich("detach.title", { title: sessionTitle, bdi: (c) => <bdi>{c}</bdi> })}
          description={t("detach.body")}
          closeLabel={ui("dialog.close")}
        >
          <p className="text-body-sm text-fg-body">{t("detach.brand")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" size="md" pending={pending} onClick={confirm}>
              {t("detach.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t("detach.cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type UploadFailure = "file_too_large" | "rejected_content" | "too_small" | "unreadable" | "not_authorized" | "unknown";

/**
 * «ارفع ملصقًا جاهزًا» — the two Route Handlers (the bytes go straight to
 * Storage and are sniffed after they land, DEC-009), then the action that
 * makes the asset the poster. `ui/file-drop` is the PICKER, not the upload,
 * as in every other uploader here; the confirm opens before any byte moves,
 * because what it replaces is the thing that cannot come back.
 */
export function PosterUpload({
  sessionId,
  sessionTitle,
  currentMode,
  limitMb,
  minimum,
}: {
  sessionId: string;
  sessionTitle: string;
  /** What the upload would replace — `null` when there is no poster yet. */
  currentMode: PosterMode | null;
  limitMb: number;
  minimum: number;
}) {
  const t = useTranslations("designer.poster.picker");
  const ui = useTranslations("ui");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<{ code: UploadFailure; shortSide?: number } | null>(null);

  // A refusal is said AT THE CONTROL, as an alert that stays — it names the
  // file's own numbers, which a toast that times out would take away.
  // The dialog closes first, or the alert would sit under its overlay.
  const say = (code: UploadFailure, shortSide?: number) => {
    setOpen(false);
    setFailure({ code, shortSide });
  };

  const upload = () => {
    const file = files[0];
    if (!file) return;
    setFailure(null);
    start(async () => {
      try {
        const initiated = await fetch("/api/designer/assets", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({ byteSize: file.size, declaredType: file.type, sessionId }),
        }).then((r) => r.json());
        if ("status" in initiated) return say(initiated.status === "file_too_large" ? "file_too_large" : "not_authorized");

        const put = await fetch(initiated.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
        if (!put.ok) return say("unknown");

        const completed = await fetch("/api/designer/assets/complete", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({ assetId: initiated.assetId, sessionId }),
        }).then((r) => r.json());
        if (completed.status !== "ok") {
          const known: UploadFailure[] = ["file_too_large", "rejected_content", "too_small", "unreadable", "not_authorized"];
          return say(known.includes(completed.status) ? completed.status : "unknown", completed.shortSide);
        }

        const attached = await attachPosterUpload(locale, sessionId, completed.assetId);
        if (attached.status !== "ok") return say(attached.status === "not_authorized" ? "not_authorized" : "unknown");

        setOpen(false);
        setFiles([]);
        setResetKey((k) => k + 1);
        toast.show({ tone: "success", title: t("uploaded") });
        router.refresh();
      } catch {
        say("unknown");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <FileDrop
        key={resetKey}
        name="poster"
        accept={["image/png", "image/jpeg", "image/webp"]}
        maxBytes={limitMb * 1024 * 1024}
        requirements={[
          t.rich("uploadHint", { minimum: formatNumber(minimum), bdi: (c) => <bdi>{c}</bdi> }),
          t.rich("uploadFormats", { bdi: (c) => <bdi dir="ltr">{c}</bdi> }),
        ]}
        onFiles={setFiles}
        invalid={failure !== null}
        disabled={pending}
      />
      {failure ? (
        <p role="alert" className="text-body-sm text-error">
          {t.rich(`uploadErrors.${failure.code}`, {
            limit: formatNumber(limitMb),
            shortSide: formatNumber(failure.shortSide ?? 0),
            minimum: formatNumber(minimum),
            bdi: (c) => <bdi>{c}</bdi>,
          })}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="self-start"
        disabled={files.length === 0}
        pending={pending && !open}
        onClick={() => (currentMode === null ? upload() : setOpen(true))}
      >
        {t("uploadAction")}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent
          title={t.rich("replace.title", { title: sessionTitle, bdi: (c) => <bdi>{c}</bdi> })}
          description={currentMode ? t(`replace.${currentMode}`) : undefined}
          closeLabel={ui("dialog.close")}
        >
          <div className="flex flex-wrap gap-3">
            <Button type="button" size="md" pending={pending} onClick={upload}>
              {t("replace.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t("replace.cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
