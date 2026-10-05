"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { AlertCircleIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import { MIN_LOGO_PX_FOR_A3, type PpiAtA3 } from "@/lib/brand/ppi";
import { uploadLogo } from "@/lib/brand/upload-logo";
import type { Locale } from "@/i18n/routing";

// The logo in SCR-059's edit mode — REQ-DSG-018, REQ-DSG-019, REQ-DSG-021, DEC-009 (B4, B21 – B26).
//
// ★ `ui/file-drop` is the PICKER; the round trip is `uploadLogo()` (moved verbatim from this file's predecessor):
// initiate → the browser PUTs the bytes to Storage → complete SNIFFS THE CONTENT after the bytes land (raster only,
// SVG refused) and measures the A3 PPI once, server-side. The formats and the A3 minimum are stated BEFORE the picker
// opens. An upload binds nothing: the new asset is the form's `logoAssetId` only once the admin presses Save.
// ★ Errors are `branding.logo.errors.*`, INLINE (`M13.md` §059) — no toast.

const bdi = (chunks: ReactNode) => <bdi dir="ltr">{chunks}</bdi>;

export function LogoUploader({
  locale,
  assetId,
  previewUrl,
  imageLimitMb,
  changed,
  signPreview,
  onChange,
}: {
  locale: Locale;
  assetId: string | null;
  previewUrl: string | null;
  imageLimitMb: number;
  changed: boolean;
  signPreview: (locale: Locale, assetId: string) => Promise<string | null>;
  onChange: (next: { assetId: string | null; previewUrl: string | null }) => void;
}) {
  const t = useTranslations("branding");
  const [files, setFiles] = useState<File[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [a3, setA3] = useState<PpiAtA3 | null>(null);

  function handleUpload() {
    const file = files[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const result = await uploadLogo(locale, file);
      if (result.status !== "ok") {
        // The refused file is dropped from the picker too: left there, `file-drop` drew it with a full bar, as if it
        // had landed. The reason stays, inline.
        setError(result.status);
        setFiles([]);
        setResetKey((k) => k + 1);
        return;
      }
      setA3(result.a3);
      const signed = await signPreview(locale, result.assetId);
      onChange({ assetId: result.assetId, previewUrl: signed });
      setFiles([]);
      setResetKey((k) => k + 1);
    });
  }

  return (
    <section aria-labelledby="logo-edit" className={`flex flex-col gap-3 rounded-panel border border-edge bg-surface p-4 ${changed ? "outline-2 outline-accent" : ""}`}>
      <h2 id="logo-edit" className="text-label font-bold text-fg-heading">
        {t("logo.title")}
        {changed ? <span className="sr-only"> {t("editMode.changed")}</span> : null}
      </h2>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-clip rounded-card bg-raised">
          {assetId && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- an org-uploaded image at a short-lived signed URL.
            <img src={previewUrl} alt={t("logo.current")} className="max-h-full max-w-full object-contain" />
          ) : null}
        </div>
        {assetId ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ assetId: null, previewUrl: null })}>
            {t("logo.remove")}
          </Button>
        ) : (
          <p className="text-body-sm text-fg-muted">{t("logo.none")}</p>
        )}
      </div>

      <FileDrop
        key={resetKey}
        name="logo"
        accept={["image/png", "image/jpeg", "image/webp"]}
        maxBytes={imageLimitMb * 1024 * 1024}
        requirements={[
          t.rich("logo.minResolutionHint", { width: formatNumber(MIN_LOGO_PX_FOR_A3.width), height: formatNumber(MIN_LOGO_PX_FOR_A3.height), bdi }),
          t.rich("logo.formatHint", { bdi }),
        ]}
        onFiles={setFiles}
        invalid={Boolean(error)}
      />

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t.has(`logo.errors.${error}`) ? t(`logo.errors.${error}`) : t("logo.errors.unknown")}</span>
        </p>
      ) : null}

      {a3 ? (
        <p role="status" className="text-body-sm text-fg-muted">
          {t.rich("logo.ppiResult", { ppi: formatNumber(a3.ppi), bdi })} · {t(`logo.rating.${a3.rating}`)}
        </p>
      ) : null}

      <Button type="button" variant="secondary" size="sm" onClick={handleUpload} disabled={files.length === 0} pending={pending} pendingLabel={t("logo.uploading")} className="self-start">
        {assetId ? t("logo.replace") : t("logo.upload")}
      </Button>
    </section>
  );
}
