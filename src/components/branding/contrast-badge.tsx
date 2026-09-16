"use client";

import { useTranslations } from "next-intl";
import { checkContrast, type ContrastUse } from "@/lib/brand/contrast";
import { formatNumber } from "@/components/sessions/numerals";

// The WCAG 2.2 AA ratio beside a colour pair — SCR-059 states it, and
// REFUSES a save below threshold rather than only warning (branding agent
// definition). `checkContrast` is pure and shared with
// `tests/unit/brand-schema.test.ts`.
export function ContrastBadge({
  foreground,
  background,
  use,
  label,
}: {
  foreground: string;
  background: string;
  use: ContrastUse;
  label: string;
}) {
  const t = useTranslations("branding.contrast");
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  if (!HEX_RE.test(foreground) || !HEX_RE.test(background)) return null;
  const { ratio, threshold, passes } = checkContrast(foreground, background, use);
  const ratioText = t("ratioLabel", { ratio: formatNumber(ratio) });

  return (
    <div className="flex items-center justify-between gap-2 rounded-field border border-edge px-3 py-2 text-body-sm">
      <span className="text-fg-body">{label}</span>
      <span
        role={passes ? undefined : "alert"}
        className={passes ? "text-fg-muted" : "font-semibold text-fg-heading"}
      >
        {passes ? `${ratioText} · ${t("pass")}` : t("fail", { ratio: formatNumber(ratio), threshold: formatNumber(threshold) })}
      </span>
    </div>
  );
}
