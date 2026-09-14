"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestMaterialDownload } from "./actions";

// REQ-MAT-005: with `allow_download = false`, no signed URL is ever minted —
// this button's own click handler asks for one and gets nothing back; there
// is no client-side fallback that could show a link anyway.
export function DownloadButton({ locale, materialId, allowDownload }: { locale: string; materialId: string; allowDownload: boolean }) {
  const t = useTranslations("materials.viewer");
  const [pending, startTransition] = useTransition();
  const [unavailable, setUnavailable] = useState(false);

  if (!allowDownload) return null;

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { url } = await requestMaterialDownload(locale, materialId);
            if (url) window.location.href = url;
            else setUnavailable(true);
          })
        }
        className="rounded-field border border-edge px-4 py-2 text-label text-fg-body hover:border-edge-strong hover:text-fg-heading disabled:opacity-40"
      >
        {t("download")}
      </button>
      <p className="mt-1 text-body-sm text-fg-muted">{t("downloadAudited")}</p>
      {unavailable ? <p className="mt-1 text-body-sm text-fg-heading">{t("downloadUnavailable")}</p> : null}
    </div>
  );
}
