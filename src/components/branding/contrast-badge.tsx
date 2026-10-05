"use client";

import { useTranslations } from "next-intl";
import { checkContrast, type ContrastUse } from "@/lib/brand/contrast";
import { formatNumber } from "@/components/sessions/numerals";

// The WCAG 2.2 AA ratio beside a colour pair — SCR-059's edit mode (B18). `checkContrast` is pure and shared with the
// unit suite. A failing pair is announced (`role="alert"`) and said in words, never by colour alone. The database's own
// refusal is a different, stricter thing (the status badges, `0144`) and is shown by the edit form.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ContrastBadge({ foreground, background, use, label }: { foreground: string; background: string; use: ContrastUse; label: string }) {
  const t = useTranslations("branding.contrast");
  if (!HEX_RE.test(foreground) || !HEX_RE.test(background)) return null;
  const { ratio, threshold, passes } = checkContrast(foreground, background, use);

  return (
    <div className="flex items-center justify-between gap-2 py-2 text-body-sm">
      <span className="text-fg-body">{label}</span>
      <span role={passes ? undefined : "alert"} className={passes ? "text-fg-muted" : "font-semibold text-error"}>
        {passes
          ? `${t("ratioLabel", { ratio: formatNumber(ratio) })} · ${t("pass")}`
          : t("fail", { ratio: formatNumber(ratio), threshold: formatNumber(threshold) })}
      </span>
    </div>
  );
}
