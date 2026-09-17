"use client";

import { useTranslations } from "next-intl";
import type { BrandColourSet } from "@/lib/brand/schema";

// A heading, body text, a button, a card and a poster's gradient surface, in
// the colours currently chosen — SCR-059's "one edit, four consumers" made
// visible before the admin ever saves (06 §8.3). Direct inline colours, not
// the app's own `@theme` tokens: this preview must reflect values that are
// not saved yet, which the CSS layer cannot know about.
//
// DEC-127 — the gradient swatch is illustrative, not a document render: it
// always shows the baseline poster's own RTL-source angle (140deg, `06`
// §3.3). The LTR mirror (`360 − angle`) lives in `render.ts` alone, for a
// real document; this preview is not one.
//
// ★ The gradient swatch is `dark`'s `surface`/`canvasRaise`/`fgHeading`
// ALWAYS, never `colours`' (the active scheme tab) — the lead's finding: a
// generated poster renders `scheme: 'dark'` unconditionally (DEC-125,
// contract 2), so a poster's own colours never follow the light tab, and a
// swatch that did would show a background no poster will ever paint.
export function BrandPreview({
  colours,
  dark,
  logoUrl,
}: {
  colours: BrandColourSet;
  /** Always the DARK set — see the header comment. */
  dark: BrandColourSet;
  logoUrl: string | null;
}) {
  const t = useTranslations("branding.preview");
  return (
    <div
      className="space-y-4 rounded-field border p-6"
      style={{ backgroundColor: colours.canvas, borderColor: colours.edge }}
    >
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary org-uploaded image at a signed URL, never a static/optimisable asset.
          <img src={logoUrl} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
        ) : null}
        <h2 className="text-h3" style={{ color: colours.fgHeading }}>
          {t("headingSample")}
        </h2>
      </div>
      <p className="text-body" style={{ color: colours.fgBody }}>
        {t("bodySample")}
      </p>
      <button
        type="button"
        tabIndex={-1}
        className="inline-flex h-11 items-center rounded-field px-6 text-label"
        style={{ backgroundColor: colours.fgHeading, color: colours.canvas }}
      >
        {t("buttonSample")}
      </button>
      <div
        className="rounded-field border p-4"
        style={{ backgroundColor: colours.surface, borderColor: colours.edgeStrong }}
      >
        <p className="text-label" style={{ color: colours.fgHeading }}>
          {t("cardTitle")}
        </p>
        <p className="mt-1 text-body-sm" style={{ color: colours.fgMuted }}>
          {t("cardBody")}
        </p>
      </div>
      <div
        className="flex h-24 items-end rounded-field p-3"
        style={{ background: `linear-gradient(140deg, ${dark.surface}, ${dark.canvasRaise})` }}
      >
        <p className="text-label" style={{ color: dark.fgHeading }}>
          {t("posterGradientLabel")}
        </p>
      </div>
    </div>
  );
}
