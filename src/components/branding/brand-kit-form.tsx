"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { BRAND_COLOUR_TOKENS, type BrandColourToken } from "@kareem/designer-runtime";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import type { NumeralSystem } from "@/components/sessions/numerals";
import type { BrandFontRef, BrandKit } from "@/lib/brand/schema";
import type { ResetBrandKitState, SaveBrandKitState } from "@/app/[locale]/app/admin/branding/actions";
import { emptyResetState, emptySaveState } from "@/app/[locale]/app/admin/branding/state";
import { ColourField } from "./colour-field";
import { ContrastBadge } from "./contrast-badge";
import { BrandPreview } from "./brand-preview";
import { LogoUploader } from "./logo-uploader";

const TOKEN_ORDER = BRAND_COLOUR_TOKENS as readonly BrandColourToken[];

export function BrandKitForm({
  locale,
  kit,
  fonts,
  numerals,
  logoPreviewUrl,
  saveAction,
  resetAction,
  signPreview,
}: {
  locale: Locale;
  kit: BrandKit;
  fonts: BrandFontRef[];
  numerals: NumeralSystem;
  logoPreviewUrl: string | null;
  saveAction: (prev: SaveBrandKitState, formData: FormData) => Promise<SaveBrandKitState>;
  resetAction: (prev: ResetBrandKitState, formData: FormData) => Promise<ResetBrandKitState>;
  signPreview: (locale: Locale, assetId: string) => Promise<string | null>;
}) {
  const t = useTranslations("branding");

  // Fully controlled state, not `defaultValue` — the live preview needs it,
  // and it is what keeps a failed save from losing anything typed (see the
  // comment in `actions.ts`).
  const [light, setLight] = useState(kit.light);
  const [dark, setDark] = useState(kit.dark);
  const [logo, setLogo] = useState<{ assetId: string | null; previewUrl: string | null }>({
    assetId: kit.logo?.assetId ?? null,
    previewUrl: logoPreviewUrl,
  });
  const [headingFontId, setHeadingFontId] = useState<string>(kit.headingFont?.id ?? "");
  const [bodyFontId, setBodyFontId] = useState<string>(kit.bodyFont?.id ?? "");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [resetConfirming, setResetConfirming] = useState(false);

  const [saveState, saveFormAction, saving] = useActionState(saveAction, emptySaveState);
  const [resetState, resetFormAction, resetting] = useActionState(resetAction, emptyResetState);

  const active = scheme === "light" ? light : dark;
  const setActive = scheme === "light" ? setLight : setDark;
  const setToken = (token: BrandColourToken, value: string) => setActive((prev) => ({ ...prev, [token]: value }));

  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form action={saveFormAction} className="space-y-10">
        {saveState.error ? (
          <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
            {t(`errors.${saveState.error}`)}
          </p>
        ) : saveState.saved ? (
          <p role="status" className="rounded-field border border-edge bg-silver-100 p-3 text-body-sm text-fg-body">
            {t("actions.saved")}
          </p>
        ) : null}

        <LogoUploader
          locale={locale}
          assetId={logo.assetId}
          previewUrl={logo.previewUrl}
          numerals={numerals}
          signPreview={signPreview}
          onChange={setLogo}
        />
        <input type="hidden" name="logoAssetId" value={logo.assetId ?? ""} />

        <fieldset className="space-y-4 border-t border-edge pt-6">
          <legend className="text-h3 text-fg-heading">{t("colours.title")}</legend>
          <div role="tablist" className="flex gap-2">
            {(["light", "dark"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scheme === s}
                onClick={() => setScheme(s)}
                className={`h-10 rounded-field px-4 text-label ${scheme === s ? "bg-fg-heading text-canvas" : "border border-edge-strong text-fg-heading"}`}
              >
                {t(s === "light" ? "colours.schemeLight" : "colours.schemeDark")}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TOKEN_ORDER.map((token) => (
              <ColourField
                key={`${scheme}-${token}`}
                id={`${scheme}-${token}`}
                name={`${scheme}[${token}]`}
                label={t(`colours.tokens.${token}`)}
                value={active[token]}
                onChange={(v) => setToken(token, v)}
              />
            ))}
          </div>

          {/* The scheme not currently shown still needs to reach the
              submission — hidden mirrors, same values, so switching tabs
              never drops the other scheme's edits. */}
          {scheme === "light"
            ? TOKEN_ORDER.map((token) => <input key={token} type="hidden" name={`dark[${token}]`} value={dark[token]} />)
            : TOKEN_ORDER.map((token) => <input key={token} type="hidden" name={`light[${token}]`} value={light[token]} />)}

          <div className="space-y-2 border-t border-edge pt-4">
            <p className="text-label text-fg-heading">{t("contrast.title")}</p>
            <ContrastBadge foreground={active.fgHeading} background={active.canvas} use="large" label={t("contrast.large")} numerals={numerals} />
            <ContrastBadge foreground={active.fgBody} background={active.canvas} use="body" label={t("contrast.body")} numerals={numerals} />
            <ContrastBadge foreground={active.fgMuted} background={active.canvas} use="body" label={t("contrast.muted")} numerals={numerals} />
            <ContrastBadge foreground={active.edgeStrong} background={active.canvas} use="ui" label={t("contrast.ui")} numerals={numerals} />
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-edge pt-6">
          <legend className="text-h3 text-fg-heading">{t("fonts.title")}</legend>
          <FontPicker id="heading-font" label={t("fonts.headingLabel")} name="headingFontId" fonts={fonts} value={headingFontId} onChange={setHeadingFontId} placeholder={t("fonts.platformDefault")} empty={t("fonts.noneSelectable")} />
          <FontPicker id="body-font" label={t("fonts.bodyLabel")} name="bodyFontId" fonts={fonts} value={bodyFontId} onChange={setBodyFontId} placeholder={t("fonts.platformDefault")} empty={t("fonts.noneSelectable")} />
        </fieldset>

        <Button type="submit" disabled={saving}>
          {saving ? t("actions.saving") : t("actions.save")}
        </Button>
      </form>

      <div className="space-y-4">
        <BrandPreview colours={active} logoUrl={logo.previewUrl} />

        <form action={resetFormAction} className="space-y-2 border-t border-edge pt-4">
          {resetState.error ? (
            <p role="alert" className="text-body-sm text-fg-heading">
              {t(`errors.${resetState.error}`)}
            </p>
          ) : resetState.reset ? (
            <p role="status" className="text-body-sm text-fg-body">
              {t("actions.resetDone")}
            </p>
          ) : null}

          {resetConfirming ? (
            <div className="space-y-2">
              <p className="text-body-sm text-fg-body">{t("actions.resetConfirm")}</p>
              <div className="flex gap-2">
                <Button type="submit" variant="secondary" disabled={resetting}>
                  {resetting ? t("actions.resetting") : t("actions.reset")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setResetConfirming(false)}>
                  {t("actions.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setResetConfirming(true)}>
              {t("actions.reset")}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function FontPicker({
  id,
  label,
  name,
  fonts,
  value,
  onChange,
  placeholder,
  empty,
}: {
  id: string;
  label: string;
  name: string;
  fonts: BrandFontRef[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  empty: string;
}) {
  return (
    <label className="block text-label text-fg-heading" htmlFor={id}>
      {label}
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={fonts.length === 0}
        className="mt-1 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading"
      >
        <option value="">{placeholder}</option>
        {fonts.map((f) => (
          <option key={f.id} value={f.id}>
            {f.family} — {f.weight}
          </option>
        ))}
      </select>
      {fonts.length === 0 ? <span className="mt-1 block text-body-sm text-fg-muted">{empty}</span> : null}
    </label>
  );
}
