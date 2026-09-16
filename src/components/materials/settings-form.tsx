"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveMaterialSettings } from "@/components/materials/actions";
import { usePendingNudge } from "@/components/ui/pending-nudge";
import { useToast } from "@/components/ui/toast";

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
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [localPhase, setLocalPhase] = useState(phase);
  const [localAllow, setLocalAllow] = useState(allowDownload);

  // `DEC-135`, added defensively per the lead's list: `saveMaterialSettings`
  // (`components/materials/actions.ts`) currently does a plain DB write with
  // no `revalidatePath`/`revalidateTag`, and this component never calls
  // `router.refresh()` either — both selects update from purely local
  // optimistic state (`localPhase`/`localAllow`), so nothing here actually
  // suspends on server-rendered content today. `usePendingNudge` is a no-op
  // in that case (it only ever ticks while a real suspension is pending) —
  // kept so a future change that adds revalidation to this action doesn't
  // silently reopen DEC-135's race here.
  usePendingNudge(pending);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
      <label className="flex items-center gap-2 text-body-sm text-fg-body">
        {tUpload("phaseLabel")}
        <select
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
        {t("allowDownloadLabel")}
      </label>
    </div>
  );
}
