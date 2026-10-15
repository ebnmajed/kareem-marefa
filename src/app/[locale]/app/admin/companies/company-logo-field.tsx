"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { AlertCircleIcon } from "@/components/ui/icons";
import { CompanyMark } from "@/components/ui/rank-row";
import { uploadLogo } from "@/lib/brand/upload-logo";

// SCR-048's logo field — DEC-298 (`0230`), REQ-ADM-008. The bytes take the brand logo's round trip (`uploadLogo()`:
// initiate → the browser PUTs to Storage → complete SNIFFS THE CONTENT, raster only, DEC-009) — never through the
// Server Action, which caps at 1 MB. The upload starts as soon as a file is picked; what it leaves is an asset id in
// a hidden field, bound to the company only when the admin presses Save.
//
// ★ The picker's input has NO name, so the file itself is never posted with the form.

export function CompanyLogoField({
  locale,
  name,
  teamColor,
  initialAssetId,
  initialSrc,
  imageLimitMb,
}: {
  locale: string;
  name: string;
  teamColor: string | null;
  initialAssetId: string | null;
  initialSrc: string | null;
  imageLimitMb: number;
}) {
  const t = useTranslations("admin.companies");
  const [assetId, setAssetId] = useState<string | null>(initialAssetId);
  const [preview, setPreview] = useState<string | null>(initialSrc);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const result = await uploadLogo(locale, file);
      setResetKey((k) => k + 1);
      if (result.status !== "ok") {
        setError(result.status);
        return;
      }
      setAssetId(result.assetId);
      // The new asset is not yet any company's, so the members' route would refuse it; the file the admin picked is
      // the preview until Save.
      setPreview(URL.createObjectURL(file));
    });
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-label font-bold text-fg-heading">{t("logo.label")}</legend>
      <input type="hidden" name="logo" value={assetId ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        <CompanyMark name={name || "؟"} teamColor={teamColor} logoSrc={assetId ? preview : null} size={64} />
        {assetId ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setAssetId(null);
              setPreview(null);
            }}
          >
            {t("logo.remove")}
          </Button>
        ) : (
          <span className="text-body-sm text-fg-muted">{t("logo.none")}</span>
        )}
      </div>
      <FileDrop
        key={resetKey}
        name=""
        accept={["image/png", "image/jpeg", "image/webp"]}
        maxBytes={imageLimitMb * 1024 * 1024}
        requirements={[t("logo.formats")]}
        onFiles={upload}
        disabled={pending}
        invalid={Boolean(error)}
      />
      {pending ? (
        <p role="status" className="text-caption text-fg-muted">
          {t("logo.uploading")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t.has(`logo.errors.${error}`) ? t(`logo.errors.${error}`) : t("logo.errors.unknown")}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
