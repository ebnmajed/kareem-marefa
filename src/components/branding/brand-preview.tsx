"use client";

import { useTranslations } from "next-intl";
import type { BrandColourSet } from "@/lib/brand/schema";

// What the unsaved values look like on an artefact — SCR-059's edit mode (B20), `06` §8.3. Inline colours, not the
// app's tokens: the values are not saved, and the kit never reaches the app (DEC-201) — this box is a picture of an
// output, not of the screen.
//
// ★ The poster's gradient is the DARK set's `surface` → `canvasRaise`, always (DEC-125: a generated poster renders
// dark whatever tab is open; DEC-127: 140deg is the RTL source angle — the LTR mirror lives in `render.ts` alone).

export function BrandPreview({ colours, dark, logoUrl }: { colours: BrandColourSet; dark: BrandColourSet; logoUrl: string | null }) {
  const t = useTranslations("branding.preview");
  return (
    <section aria-labelledby="brand-preview" className="flex flex-col gap-4 rounded-panel border p-5" style={{ backgroundColor: colours.canvas, borderColor: colours.edge }}>
      <h2 id="brand-preview" className="sr-only">
        {t("title")}
      </h2>
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an org-uploaded image at a short-lived signed URL.
          <img src={logoUrl} alt="" className="h-10 w-auto max-w-[120px] object-contain" />
        ) : null}
        <p className="text-h3" style={{ color: colours.fgHeading }}>
          {t("headingSample")}
        </p>
      </div>
      <p className="text-body" style={{ color: colours.fgBody }}>
        {t("bodySample")}
      </p>
      <span className="inline-flex h-11 w-fit items-center rounded-pill px-6 text-label" style={{ backgroundColor: colours.node, color: colours.canvas }}>
        {t("buttonSample")}
      </span>
      <div className="rounded-card border p-4" style={{ backgroundColor: colours.surface, borderColor: colours.edgeStrong }}>
        <p className="text-label" style={{ color: colours.fgHeading }}>
          {t("cardTitle")}
        </p>
        <p className="mt-1 text-body-sm" style={{ color: colours.fgMuted }}>
          {t("cardBody")}
        </p>
      </div>
      <div className="flex h-24 items-end rounded-card p-3" style={{ background: `linear-gradient(140deg, ${dark.surface}, ${dark.canvasRaise})` }}>
        <p className="text-label" style={{ color: dark.fgHeading }}>
          {t("posterGradientLabel")}
        </p>
      </div>
    </section>
  );
}
