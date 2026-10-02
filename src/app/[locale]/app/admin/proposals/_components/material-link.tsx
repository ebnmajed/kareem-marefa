"use client";

import { useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { requestProposalMaterialDownload } from "@/components/materials/actions";
import { useToast } from "@/components/ui/toast";

// «مواد مبدئية» on SCR-041 — REQ-PRO-004 («visible to admins»), found missing from the review screen at wave 21.
// ★ `content`'s audited path, as it is: `requestProposalMaterialDownload()` → `getMaterialDownloadUrl()`, which writes
// `record_material_download` for an admin before it signs (`materials.ts:555`). Nothing of `content`'s is edited; this
// is the artboard's link where `ProposalDownloadButton` draws a button.
export function MaterialLink({ locale, materialId, children }: { locale: string; materialId: string; children: ReactNode }) {
  const t = useTranslations("proposals.review");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-busy={pending || undefined}
      className="inline-flex min-h-11 items-center text-start text-fg-heading underline underline-offset-4 aria-busy:cursor-progress"
      onClick={() =>
        startTransition(async () => {
          const { url } = await requestProposalMaterialDownload(locale, materialId);
          if (url) window.location.href = url;
          else toast.show({ tone: "error", title: t("downloadUnavailable") });
        })
      }
    >
      {children}
    </button>
  );
}
