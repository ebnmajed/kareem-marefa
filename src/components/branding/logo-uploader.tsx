"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/toast";
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
//
// ★ `ui/file-drop` is the PICKER, not the upload — the same shape
// `photos/upload-widget.tsx` and `materials/upload-form.tsx` already use:
// `onFiles` only reports what was chosen, and a separate `Button` (with its
// own `pending`/`pendingLabel`) starts the real round trip. `requirements`
// states the minimum resolution and the accepted formats BEFORE the picker
// opens (REQ-DSG-019, SCR-059); `key={resetKey}` clears the picked-file
// chip once the upload actually succeeds, the same trick those two files
// use to reset an uncontrolled Radix-free widget without a form reset.
export function LogoUploader({
  locale,
  assetId,
  previewUrl,
  imageLimitMb,
  signPreview,
  onChange,
}: {
  locale: Locale;
  assetId: string | null;
  previewUrl: string | null;
  imageLimitMb: number;
  signPreview: (locale: Locale, assetId: string) => Promise<string | null>;
  onChange: (next: { assetId: string | null; previewUrl: string | null }) => void;
}) {
  const t = useTranslations("branding.logo");
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [a3, setA3] = useState<{ ppi: number; rating: PpiRating } | null>(null);

  function handleUpload() {
    const file = files[0];
    if (!file) return;
    setError(null);

    startTransition(async () => {
      try {
        const initiated = await fetch("/api/admin/branding/logo", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({ byteSize: file.size, declaredType: file.type }),
        }).then((r) => r.json());
        if ("status" in initiated) {
          const code = initiated.status === "file_too_large" ? "file_too_large" : "not_authorized";
          setError(code);
          toast.show({ tone: "error", title: t(`errors.${code}`) });
          return;
        }

        const put = await fetch(initiated.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
        if (!put.ok) {
          setError("unknown");
          toast.show({ tone: "error", title: t("errors.unknown") });
          return;
        }

        const completed = await fetch("/api/admin/branding/logo/complete", {
          method: "POST",
          headers: { "content-type": "application/json", "x-locale": locale },
          body: JSON.stringify({ assetId: initiated.assetId }),
        }).then((r) => r.json());
        if (completed.status !== "ok") {
          const code = completed.status ?? "unknown";
          setError(code);
          toast.show({ tone: "error", title: t(`errors.${code}`) });
          return;
        }

        setA3(completed.a3);
        const signed = await signPreview(locale, completed.assetId);
        onChange({ assetId: completed.assetId, previewUrl: signed });
        setFiles([]);
        setResetKey((k) => k + 1);
      } catch {
        setError("unknown");
        toast.show({ tone: "error", title: t("errors.unknown") });
      }
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-h3 text-fg-heading">{t("title")}</h2>

      <div className="flex flex-wrap items-center gap-4">
        {assetId && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an org-uploaded image at a short-lived signed URL.
          <img src={previewUrl} alt={t("current")} className="h-16 w-auto max-w-[160px] rounded-field border border-edge object-contain p-1" />
        ) : (
          <p className="text-body-sm text-fg-muted">{t("none")}</p>
        )}
        {assetId ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ assetId: null, previewUrl: null })}>
            {t("remove")}
          </Button>
        ) : null}
      </div>

      <FileDrop
        key={resetKey}
        name="logo"
        accept={["image/png", "image/jpeg", "image/webp"]}
        maxBytes={imageLimitMb * 1024 * 1024}
        // `t.rich`, not `t`: both hints carry LTR tokens ("A3"; "PNG"/"JPG"/
        // "WebP"/"SVG") inside an RTL sentence, isolated through the
        // messages' own `<bdi>` tags now that `FileDropProps.requirements`
        // is `ReactNode[]` (`886260a`).
        requirements={[
          t.rich("minResolutionHint", {
            width: formatNumber(MIN_LOGO_PX_FOR_A3.width),
            height: formatNumber(MIN_LOGO_PX_FOR_A3.height),
            bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
          }),
          t.rich("formatHint", { bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi> }),
        ]}
        onFiles={setFiles}
        invalid={Boolean(error)}
      />

      {a3 ? (
        <p role="status" className={a3.rating === "sufficient" ? "text-body-sm text-fg-muted" : "text-body-sm font-semibold text-fg-heading"}>
          {/* "A3" is an LTR token inside an RTL sentence — isolated through
              the message's own `<bdi>` tag, not a raw string, so the "#"-style
              bidi bug (the lead's field-error finding) cannot recur here. */}
          {t.rich("ppiResult", { ppi: formatNumber(a3.ppi), bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi> })}{" "}
          {a3.rating === "sufficient" ? t("ppiSufficient") : a3.rating === "warning" ? t("ppiWarning") : t("ppiInsufficient")}
        </p>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleUpload}
        disabled={files.length === 0}
        pending={pending}
        pendingLabel={t("uploading")}
        className="self-start"
      >
        {assetId ? t("replace") : t("upload")}
      </Button>
    </div>
  );
}
