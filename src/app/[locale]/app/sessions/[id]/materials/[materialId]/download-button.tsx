"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestMaterialDownload } from "./actions";

// REQ-MAT-005: with `allow_download = false`, no signed URL is ever minted —
// this button's own click handler asks for one and gets nothing back; there
// is no client-side fallback that could show a link anyway.
export function DownloadButton({ locale, materialId, allowDownload }: { locale: string; materialId: string; allowDownload: boolean }) {
  const t = useTranslations("materials.viewer");
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (!allowDownload) return null;

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        pending={pending}
        pendingLabel={t("downloading")}
        onClick={() =>
          startTransition(async () => {
            const { url } = await requestMaterialDownload(locale, materialId);
            if (url) window.location.href = url;
            // A failure has nowhere obvious "adjacent" to sit once the
            // member has already clicked toward their downloads folder —
            // a persistent toast is the honest place for it (REQ-UIX-010's
            // own limit is field errors; this is not one).
            else toast.show({ tone: "error", title: t("downloadUnavailable") });
          })
        }
      >
        {t("download")}
      </Button>
      <p className="mt-1 text-body-sm text-fg-muted">{t("downloadAudited")}</p>
    </div>
  );
}
