"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveMaterialSettings } from "@/components/materials/actions";

interface SettingsFormProps {
  locale: string;
  materialId: string;
  phase: "before" | "after";
  allowDownload: boolean;
}

/** REQ-MAT-005/006 — shown only to a presenter/admin who may manage this
 *  material (Materials slot decides that; this component trusts it for
 *  display only — the write is still RLS-gated regardless). */
export function SettingsForm({ locale, materialId, phase, allowDownload }: SettingsFormProps) {
  const t = useTranslations("materials.list");
  // The field's own label lives under "materials.upload" (shared with the
  // upload form's identical field) — a translator scoped to "materials.list"
  // cannot reach across namespaces, so a second translator is needed rather
  // than the dotted "upload.phaseLabel" path this used to call, which
  // silently rendered as the literal key (MISSING_MESSAGE, next-intl's
  // default fallback) instead of "التوقيت".
  const tUpload = useTranslations("materials.upload");
  const [pending, startTransition] = useTransition();
  const [localPhase, setLocalPhase] = useState(phase);
  const [localAllow, setLocalAllow] = useState(allowDownload);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
      <label className="flex items-center gap-2 text-body-sm text-fg-body">
        {tUpload("phaseLabel")}
        <select
          value={localPhase}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as "before" | "after";
            setLocalPhase(next);
            startTransition(async () => {
              await saveMaterialSettings(locale, materialId, { phase: next });
            });
          }}
          className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading"
        >
          <option value="before">{t("phase.before")}</option>
          <option value="after">{t("phase.after")}</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-body-sm text-fg-body">
        <input
          type="checkbox"
          checked={localAllow}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setLocalAllow(next);
            startTransition(async () => {
              await saveMaterialSettings(locale, materialId, { allowDownload: next });
            });
          }}
        />
        {t("allowDownloadLabel")}
      </label>
    </div>
  );
}
