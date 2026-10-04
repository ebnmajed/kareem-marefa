import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { BRAND_COLOUR_TOKENS, type BrandColourToken } from "@kareem/designer-runtime";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { KvCard } from "@/components/ui/kv-card";
import { formatNumber } from "@/components/sessions/numerals";
import type { BrandColourSet, BrandFontRef, BrandKit } from "@/lib/brand/schema";
import { ppiAtA3 } from "@/lib/brand/ppi";
import { Swatch } from "./swatch";

// SCR-059 in read mode — `AdminBranding.dc.html`, `M13.md` §059, REQ-UIX-116, DEC-251 §3. The logo card, the two
// fonts `brand_kits` holds, the ten tokens of each scheme, the one accent (`node`), the seven team colours, and the
// line that the kit feeds posters, certificates and email — not the app (DEC-201). Every value is read; every colour
// is a swatch AND its value (`Swatch`). Nothing here writes: «استبدال» and «عدّل» both open edit mode, because
// nothing is written until Save (DEC-231 §3). Declares no animation (REQ-UIX-053).

const TOKENS = BRAND_COLOUR_TOKENS as readonly BrandColourToken[];
const FORMAT: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP" };
const RATING_TONE = { sufficient: "success", warning: "neutral", insufficient: "error" } as const;
const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

export async function BrandKitRead({
  kit,
  logoUrl,
  teamColours,
}: {
  kit: BrandKit;
  logoUrl: string | null;
  /** The platform's seven named team colours — `REQ-UIX-043`'s palette, read, never edited here. */
  teamColours: { hex: string; name: string }[];
}) {
  const t = await getTranslations("branding");
  const a3 = kit.logo ? ppiAtA3(kit.logo.width, kit.logo.height) : null;
  const font = (f: BrandFontRef | null) => (f ? <bdi>{`${f.family} · ${formatNumber(f.weight)}`}</bdi> : t("fonts.platformDefault"));
  const scheme = (set: BrandColourSet) => (
    <span className="flex flex-wrap gap-x-4 gap-y-2">
      {TOKENS.map((token) => (
        <Swatch key={token} color={set[token]} name={t(`colours.tokens.${token}`)} />
      ))}
    </span>
  );

  return (
    <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-labelledby="brand-logo" className="flex flex-wrap items-center gap-4 rounded-panel border border-edge bg-surface p-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-clip rounded-card bg-raised">
            {kit.logo && logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- an org-uploaded image at a short-lived signed URL.
              <img src={logoUrl} alt={t("logo.current")} className="max-h-full max-w-full object-contain" />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="brand-logo" className="text-label font-bold text-fg-heading">
              {t("logo.title")}
            </h2>
            {kit.logo && a3 ? (
              <>
                <p className="text-body-sm text-fg-muted">
                  {t.rich("logo.meta", {
                    format: FORMAT[kit.logo.mime ?? ""] ?? "—",
                    width: formatNumber(kit.logo.width),
                    height: formatNumber(kit.logo.height),
                    ppi: formatNumber(a3.ppi),
                    bdi,
                  })}
                </p>
                <Badge size="sm" tone={RATING_TONE[a3.rating]} className="self-start">
                  {t(`logo.rating.${a3.rating}`)}
                </Badge>
              </>
            ) : (
              <p className="text-body-sm text-fg-muted">{t("logo.none")}</p>
            )}
          </div>
          <ButtonLink href="/app/admin/branding?edit" variant="secondary" size="md">
            {kit.logo ? t("logo.replace") : t("logo.upload")}
          </ButtonLink>
        </section>

        <KvCard
          label={t("fonts.title")}
          emptyValue={t("empty")}
          rows={[
            { id: "heading", label: t("fonts.headingLabel"), value: font(kit.headingFont) },
            { id: "body", label: t("fonts.bodyLabel"), value: font(kit.bodyFont) },
          ]}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <KvCard
          label={t("colours.title")}
          emptyValue={t("empty")}
          rows={[
            { id: "light", label: t("colours.schemeLight"), value: scheme(kit.light) },
            { id: "dark", label: t("colours.schemeDark"), value: scheme(kit.dark) },
            {
              id: "accent",
              label: t("colours.accent"),
              value: (
                <span className="flex flex-wrap gap-x-4 gap-y-2">
                  <Swatch color={kit.light.node} name={t("colours.schemeLight")} />
                  <Swatch color={kit.dark.node} name={t("colours.schemeDark")} />
                </span>
              ),
            },
            {
              id: "teams",
              label: t("colours.teams"),
              value: (
                <span className="flex flex-wrap gap-x-4 gap-y-2">
                  {teamColours.map((c) => (
                    <Swatch key={c.hex} color={c.hex} name={c.name} />
                  ))}
                </span>
              ),
            },
          ]}
        />
        <p className="text-caption text-fg-muted">{t("feeds")}</p>
      </div>
    </div>
  );
}
