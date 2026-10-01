"use client";

import { useId, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { DownloadIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { requestMaterialDownload } from "@/app/[locale]/app/sessions/[id]/materials/[materialId]/actions";

// SCR-013's download — REQ-MAT-005, `07` §6, DEC-214 §3 (N2, N3).
//
// ★ The caller renders this only for a viewer who may FETCH the file: `allow_download`, or the session's presenter,
// or staff — whom `materials_storage_read` signs for (`0116:114-120`), exactly `DEC-209`'s rule for the audio row.
// A denied member gets neither this control nor a URL: the URL is minted on click by the server action, never in
// page data, and Storage refuses the signature for them (`getMaterialDownloadUrl()`). There is no client fallback.
//
// ★ «سيُسجَّل هذا التحميل» is an ADMIN's alone — only an admin's download is audited (`record_material_download()`,
// `0049`). The old button told every downloader so. From `lg` it stands beside the control; on the phone it is the
// icon button's description.
//
// Two controls, one per width — the phone's icon button «تحميل الملف الأصلي» and the desktop's «تحميل» — each
// `display: none` at the other width, so a screen reader meets one.
export function DownloadControl({ locale, materialId, audited }: { locale: string; materialId: string; audited: boolean }) {
  const t = useTranslations("materials.viewer");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const noteId = useId();

  const download = () =>
    startTransition(async () => {
      const { url } = await requestMaterialDownload(locale, materialId);
      if (url) window.location.href = url;
      // A refusal or a failure has nowhere adjacent to sit once the member has reached for their downloads folder.
      else toast.show({ tone: "error", title: t("downloadUnavailable") });
    });

  return (
    <>
      <IconButton
        label={t("download")}
        variant="secondary"
        pending={pending}
        aria-describedby={audited ? noteId : undefined}
        onClick={download}
        className="shrink-0 lg:hidden"
      >
        <DownloadIcon />
      </IconButton>
      <div className="hidden shrink-0 items-center gap-3 lg:flex">
        {audited ? (
          <p id={noteId} className="max-w-56 text-caption text-fg-muted">
            {t("downloadAudited")}
          </p>
        ) : null}
        <Button type="button" variant="secondary" size="sm" pending={pending} pendingLabel={t("downloading")} iconStart={<DownloadIcon />} onClick={download}>
          {t("downloadShort")}
        </Button>
      </div>
    </>
  );
}
