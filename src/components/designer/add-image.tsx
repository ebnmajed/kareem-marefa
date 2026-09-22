"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FileDrop } from "@/components/ui/file-drop";
import { PlusIcon } from "@/components/ui/icons";
import { uploadDesignAsset, type UploadFailure } from "@/components/designer/upload-asset";

// «أضف صورة» — D1b (DEC-178), on DEC-179's asset resolution.
//
// The file goes through the one upload flow (`upload-asset.ts`): signed URL,
// PUT, then a SNIFF of the landed bytes — never SVG (DEC-009, invariant 11).
// What comes back is an asset ID, which is what the document stores; the
// signed preview URL only lets the canvas show it at once (DEC-179). The PPI
// guard then checks the new layer like any other (REQ-DSG-019).

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
/** The browser's early refusal only; the server holds the org's own limit. */
const MAX_BYTES = 50 * 1024 * 1024;

export function AddImage({ onAdded }: { onAdded: (asset: { assetId: string; width: number; height: number; previewUrl: string | null }) => void }) {
  const t = useTranslations("designer.add");
  const ui = useTranslations("ui");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [pending, start] = useTransition();

  const upload = () => {
    const file = files[0];
    if (!file) return;
    setFailure(null);
    start(async () => {
      const result = await uploadDesignAsset(file, locale);
      if (result.status !== "ok") return setFailure(result.status);
      onAdded(result);
      setFiles([]);
      setResetKey((k) => k + 1);
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Button type="button" variant="secondary" size="sm" iconStart={<PlusIcon />} onClick={() => setOpen(true)}>
        {t("image")}
      </Button>
      <DialogContent title={t("imageTitle")} closeLabel={ui("dialog.close")}>
        <div className="flex flex-col gap-3">
          <FileDrop
            key={resetKey}
            name="studio-image"
            accept={ACCEPT}
            maxBytes={MAX_BYTES}
            requirements={[t("imageFormats")]}
            onFiles={setFiles}
            invalid={failure !== null}
            disabled={pending}
          />
          {failure ? (
            <p role="alert" className="text-body-sm text-error">
              {t(`imageErrors.${failure}`)}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" size="md" pending={pending} disabled={files.length === 0} onClick={upload}>
            {t("imageUpload")}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="md" disabled={pending}>
              {ui("dialog.close")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
