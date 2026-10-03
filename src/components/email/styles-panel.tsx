"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PALETTE_TOKENS, type EmailStyles, type PaletteToken } from "@kareem/mail-runtime";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatNumber } from "@/components/sessions/numerals";

// الأنماط — the email's defaults (wave 23, REQ-UIX-112, REQ-NTF-015, `AdminEmails.dc.html`). Closed scales and the brand
// kit's tokens BY NAME, never a hex: the renderer resolves each through the kit, so a brand change restyles the message
// (`REQ-NTF-014`), and no size below the body's can be chosen. ★ No font control: a mail declares one stack and web
// fonts are stripped (`08` §3.1, the plan's D4). Desktop and phone are linked by default; unlinking shows the phone's
// heading size and padding.

type Size1 = 22 | 24 | 28;
type Size2 = 17 | 19 | 21;
type Pad = 16 | 24 | 32;

export function StylesPanel({ styles, onChange }: { styles: EmailStyles; onChange: (styles: EmailStyles) => void }) {
  const t = useTranslations("notifications.admin.emails.builder.styles");
  const tb = useTranslations("notifications.admin.emails.builder.block");
  const tt = useTranslations("notifications.admin.emails.builder.tokens");
  const [unlinked, setUnlinked] = useState(Boolean(styles.mobile));
  const px = (value: number) => t.markup("px", { value: formatNumber(value), bdi: (chunks) => chunks });
  const set = (next: EmailStyles) => onChange(clean(next as Record<string, unknown>) as EmailStyles);

  const pick = <T extends string | number>(label: string, value: T | undefined, options: readonly T[], show: (v: T) => string, write: (v: T | undefined) => void) => (
    <Field label={label}>
      <Select value={value === undefined ? "" : String(value)} onChange={(e) => write(e.target.value === "" ? undefined : ((typeof options[0] === "number" ? Number(e.target.value) : e.target.value) as T))}>
        <option value="">{t("default")}</option>
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {show(option)}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="flex flex-col gap-3">
      {pick<Size1>(t("headingH1"), styles.headingSize?.h1, [22, 24, 28], px, (h1) => set({ ...styles, headingSize: { ...styles.headingSize, h1 } }))}
      {pick<Size2>(t("headingH2"), styles.headingSize?.h2, [17, 19, 21], px, (h2) => set({ ...styles, headingSize: { ...styles.headingSize, h2 } }))}
      {pick<PaletteToken>(t("textColour"), styles.textColour, PALETTE_TOKENS, (v) => tt(v), (textColour) => set({ ...styles, textColour }))}
      {pick<PaletteToken>(t("linkColour"), styles.linkColour, PALETTE_TOKENS, (v) => tt(v), (linkColour) => set({ ...styles, linkColour }))}
      {pick<"rounded" | "pill">(t("buttonShape"), styles.button?.shape, ["rounded", "pill"], (v) => tb(v), (shape) => set({ ...styles, button: { ...styles.button, shape } }))}
      {pick<Pad>(t("padding"), styles.padding, [16, 24, 32], px, (padding) => set({ ...styles, padding }))}
      {pick<"neutral" | "canvas" | "surface">(t("ground"), styles.ground, ["neutral", "canvas", "surface"], (v) => t(v), (ground) => set({ ...styles, ground }))}

      <Switch
        label={t("linked")}
        checked={!unlinked}
        onCheckedChange={(linked) => {
          setUnlinked(!linked);
          if (linked) set({ ...styles, mobile: undefined });
        }}
      />
      {unlinked ? (
        <fieldset className="flex flex-col gap-3 rounded-panel border border-edge p-3">
          <legend className="px-1 text-caption font-bold text-fg-muted">{t("mobile")}</legend>
          {pick<Size1>(t("headingH1"), styles.mobile?.headingSize?.h1, [22, 24, 28], px, (h1) => set({ ...styles, mobile: { ...styles.mobile, headingSize: { ...styles.mobile?.headingSize, h1 } } }))}
          {pick<Pad>(t("padding"), styles.mobile?.padding, [16, 24, 32], px, (padding) => set({ ...styles, mobile: { ...styles.mobile, padding } }))}
        </fieldset>
      ) : null}
    </div>
  );
}

/** Drops every unset value and every object left empty, so «الافتراضي» stores nothing at all. */
function clean(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (typeof v === "object" && v !== null) {
      const inner = clean(v as Record<string, unknown>);
      if (Object.keys(inner).length > 0) out[key] = inner;
    } else out[key] = v;
  }
  return out;
}
