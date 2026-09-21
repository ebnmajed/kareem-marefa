"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestProposalMaterialDownload } from "@/components/materials/actions";

// REQ-PRO-004/wave 10 T1 — modelled on `app/sessions/[id]/materials/[materialId]/download-button.tsx`,
// the session-side equivalent this file cannot import (it lives under a route that names a
// `materialId` segment a proposal has no page for). Unlike that one, this renders unconditionally
// whenever the caller has a `currentVersionId` at all — never gated on `allowDownload`: every viewer
// of `ProposalMaterials` already passed `materials_read`'s proposal branch to see the row (the
// proposal's owner or staff), and `materials_storage_read`'s download predicate already lets both
// bypass `allow_download` unconditionally, exactly as a session's own presenter does. REQ-MAT-005's
// per-member download control has no member audience yet on a draft proposal.
export function ProposalDownloadButton({ locale, materialId }: { locale: string; materialId: string }) {
  const t = useTranslations("materials.list");
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      pending={pending}
      pendingLabel={t("downloading")}
      className="mt-2"
      onClick={() =>
        startTransition(async () => {
          const { url } = await requestProposalMaterialDownload(locale, materialId);
          if (url) window.location.href = url;
          else toast.show({ tone: "error", title: t("downloadUnavailable") });
        })
      }
    >
      {t("download")}
    </Button>
  );
}
