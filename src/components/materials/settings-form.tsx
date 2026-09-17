"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveMaterialSettings } from "@/components/materials/actions";
import { useToast } from "@/components/ui/toast";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { phaseLabelKey } from "@/components/materials/phase-label";

interface SettingsFormProps {
  locale: string;
  materialId: string;
  phase: "before" | "after";
  allowDownload: boolean;
  /** REQ-MAT-006 as amended (DEC-121) — the phase select's own option labels read relative to
   *  this item's scope, the same as the badge next to it (`list.tsx`'s own `phaseLabelKey`). */
  sessionDayId?: string | null;
}

/** REQ-MAT-005/006 — shown only to a presenter/admin who may manage this
 *  material (Materials slot decides that; this component trusts it for
 *  display only — the write is still RLS-gated regardless). */
export function SettingsForm({ locale, materialId, phase, allowDownload, sessionDayId }: SettingsFormProps) {
  const t = useTranslations("materials.list");
  // The field's own label lives under "materials.upload" (shared with the
  // upload form's identical field) — a translator scoped to "materials.list"
  // cannot reach across namespaces, so a second translator is needed rather
  // than the dotted "upload.phaseLabel" path this used to call, which
  // silently rendered as the literal key (MISSING_MESSAGE, next-intl's
  // default fallback) instead of "التوقيت".
  const tUpload = useTranslations("materials.upload");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [localPhase, setLocalPhase] = useState(phase);
  const [localAllow, setLocalAllow] = useState(allowDownload);

  return (
    // ★ The lead's real-build finding, materials capture 296aec4 row 8: this
    // row used to be a raw native `<select>` and a raw native checkbox — a
    // blue browser-default box next to the system's own controls at 390 px.
    // `ui/select`/`ui/checkbox` are `sessions`' files, imported here, not
    // edited (per-file ownership, `16` §17 / DEC-085).
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
      <label className="flex items-center gap-2 text-body-sm text-fg-body">
        {tUpload("phaseLabel")}
        <Select
          value={localPhase}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as "before" | "after";
            const previous = localPhase;
            setLocalPhase(next);
            startTransition(async () => {
              try {
                await saveMaterialSettings(locale, materialId, { phase: next });
              } catch {
                // ★ A request that fails at the NETWORK level makes the
                // action REJECT rather than resolve — left uncaught, React
                // would replace the whole event page with the route's error
                // boundary (the lead's real-build finding on the
                // discussion, same shape here). The optimistic select was
                // never confirmed by the server, so it reverts explicitly —
                // unlike `comment-item.tsx`'s `toggleLike`, there is no
                // `useOptimistic` here whose own settle would do this for
                // free.
                setLocalPhase(previous);
                toast.show({ tone: "error", title: t("settingsFailed") });
              }
            });
          }}
        >
          <option value="before">{t(phaseLabelKey("before", sessionDayId))}</option>
          <option value="after">{t(phaseLabelKey("after", sessionDayId))}</option>
        </Select>
      </label>

      <Checkbox
        label={t("allowDownloadLabel")}
        checked={localAllow}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          const previous = localAllow;
          setLocalAllow(next);
          startTransition(async () => {
            try {
              await saveMaterialSettings(locale, materialId, { allowDownload: next });
            } catch {
              setLocalAllow(previous);
              toast.show({ tone: "error", title: t("settingsFailed") });
            }
          });
        }}
      />
    </div>
  );
}
