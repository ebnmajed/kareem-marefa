"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/components/sessions/numerals";
import { MIN_LOGO_PX_FOR_A3, type PpiRating } from "@/lib/brand/ppi";
import type { Locale } from "@/i18n/routing";

// The logo widget — SCR-059, REQ-DSG-018, REQ-DSG-019, REQ-DSG-021, DEC-009.
//
// Two round trips to `/api/admin/branding/logo{,/complete}` (initiate →
// browser PUTs the bytes straight to Storage → complete sniffs and
// measures), then a signed preview URL through the `signLogoPreview` server
// action — `design_assets` has no public read, so nothing else can build
// one. The PPI-at-A3 readout comes back from `complete` itself, computed
// once server-side by `ppiAtA3()` (`src/lib/brand/ppi.ts`).
export function LogoUploader({
  locale,
  assetId,
  previewUrl,
  signPreview,
  onChange,
}: {
  locale: Locale;
  assetId: string | null;
  previewUrl: string | null;
  signPreview: (locale: Locale, assetId: string) => Promise<string | null>;
  onChange: (next: { assetId: string | null; previewUrl: string | null }) => void;
}) {
  const t = useTranslations("branding.logo");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [a3, setA3] = useState<{ ppi: number; rating: PpiRating } | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setA3(null);
    try {
      const initiated = await fetch("/api/admin/branding/logo", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({ byteSize: file.size, declaredType: file.type }),
      }).then((r) => r.json());
      if ("status" in initiated) {
        setError(initiated.status === "file_too_large" ? "file_too_large" : "not_authorized");
        return;
      }

      const put = await fetch(initiated.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      if (!put.ok) {
        setError("unknown");
        return;
      }

      const completed = await fetch("/api/admin/branding/logo/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({ assetId: initiated.assetId }),
      }).then((r) => r.json());
      if (completed.status !== "ok") {
        setError(completed.status ?? "unknown");
        return;
      }

      setA3(completed.a3);
      const signed = await signPreview(locale, completed.assetId);
      onChange({ assetId: completed.assetId, previewUrl: signed });
    } catch {
      setError("unknown");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-h3 text-fg-heading">{t("title")}</legend>

      <p className="text-body-sm text-fg-muted">
        {t("minResolutionHint", { width: formatNumber(MIN_LOGO_PX_FOR_A3.width), height: formatNumber(MIN_LOGO_PX_FOR_A3.height) })}
      </p>
      <p className="text-body-sm text-fg-muted">{t("formatHint")}</p>

      <div className="flex flex-wrap items-center gap-4">
        {assetId && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an org-uploaded image at a short-lived signed URL.
          <img src={previewUrl} alt={t("current")} className="h-16 w-auto max-w-[160px] rounded-field border border-edge object-contain p-1" />
        ) : (
          <p className="text-body-sm text-fg-muted">{t("none")}</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          id="brand-logo-input"
          aria-label={assetId ? t("replace") : t("upload")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button type="button" variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? t("uploading") : assetId ? t("replace") : t("upload")}
        </Button>
        {assetId ? (
          <Button type="button" variant="secondary" onClick={() => onChange({ assetId: null, previewUrl: null })}>
            {t("remove")}
          </Button>
        ) : null}
      </div>

      {a3 ? (
        <p role="status" className={a3.rating === "sufficient" ? "text-body-sm text-fg-muted" : "text-body-sm font-semibold text-fg-heading"}>
          {t("ppiResult", { ppi: formatNumber(a3.ppi) })}{" "}
          {a3.rating === "sufficient" ? t("ppiSufficient") : a3.rating === "warning" ? t("ppiWarning") : t("ppiInsufficient")}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-body-sm text-fg-heading">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </fieldset>
  );
}
