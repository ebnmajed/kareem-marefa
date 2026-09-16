"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { BRAND_COLOUR_TOKENS, type BrandColourToken } from "@kareem/designer-runtime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/routing";
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
  logoPreviewUrl,
  imageLimitMb,
  saveAction,
  resetAction,
  signPreview,
}: {
  locale: Locale;
  kit: BrandKit;
  fonts: BrandFontRef[];
  logoPreviewUrl: string | null;
  imageLimitMb: number;
  saveAction: (prev: SaveBrandKitState, formData: FormData) => Promise<SaveBrandKitState>;
  resetAction: (prev: ResetBrandKitState, formData: FormData) => Promise<ResetBrandKitState>;
  signPreview: (locale: Locale, assetId: string) => Promise<string | null>;
}) {
  const t = useTranslations("branding");
  const toast = useToast();

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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // ★ The toast fires FROM INSIDE the action, not a `useEffect` reacting to
  // the returned state — the fix `session-controls.tsx` needed
  // (`63fef6d`): a `useEffect` keyed on state can lose the race against an
  // unmount in the same commit. This screen never unmounts on success, but
  // every action in the product follows the one pattern rather than two.
  const [, saveFormAction, saving] = useActionState(async (prev: SaveBrandKitState, formData: FormData) => {
    const result = await saveAction(prev, formData);
    if (result.saved) toast.show({ title: t("actions.saved"), tone: "success" });
    else if (result.error) toast.show({ title: t(`errors.${result.error}`), tone: "error" });
    return result;
  }, emptySaveState);

  const [resetState, resetFormAction, resetting] = useActionState(async (prev: ResetBrandKitState, formData: FormData) => {
    const result = await resetAction(prev, formData);
    if (result.reset) toast.show({ title: t("actions.resetDone"), tone: "success" });
    else if (result.error) toast.show({ title: t(`errors.${result.error}`), tone: "error" });
    return result;
  }, emptyResetState);

  // ★ Closing the reset dialog is DERIVED from `resetState`, adjusted
  // DURING RENDER — the same fix `session-controls.tsx` needed: closing it
  // synchronously in the confirm button's own `onClick` would close it
  // before the round trip that button's `<form>` submission starts even
  // resolves. Closing on ANY new result (success or error) is fine here —
  // the outcome is a toast, so there is nothing left inside the dialog to
  // show.
  const [lastResetState, setLastResetState] = useState(resetState);
  if (resetState !== lastResetState) {
    setLastResetState(resetState);
    setResetConfirmOpen(false);
  }

  const active = scheme === "light" ? light : dark;
  const setActive = scheme === "light" ? setLight : setDark;
  const setToken = (token: BrandColourToken, value: string) => setActive((prev) => ({ ...prev, [token]: value }));

  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* `noValidate` — `16` §8.2's rule for a form whose own errors this
          screen renders (as a toast, here — `CLAUDE.md`'s wave-8 sweep).
          No `required` control exists on this form today; set anyway so it
          stays true if that ever changes. */}
      <form action={saveFormAction} noValidate className="space-y-8">
        <Panel>
          <LogoUploader
            locale={locale}
            assetId={logo.assetId}
            previewUrl={logo.previewUrl}
            imageLimitMb={imageLimitMb}
            signPreview={signPreview}
            onChange={setLogo}
          />
        </Panel>
        <input type="hidden" name="logoAssetId" value={logo.assetId ?? ""} />

        <Panel>
          <h2 className="text-h3 text-fg-heading">{t("colours.title")}</h2>
          <Tabs
            items={[
              { value: "light", label: t("colours.schemeLight") },
              { value: "dark", label: t("colours.schemeDark") },
            ]}
            value={scheme}
            onValueChange={(value) => setScheme(value as "light" | "dark")}
            label={t("colours.title")}
            className="mt-4"
          >
            <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
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
          </Tabs>

          {/* The scheme not currently shown still needs to reach the
              submission — hidden mirrors, same values, so switching tabs
              never drops the other scheme's edits. */}
          {scheme === "light"
            ? TOKEN_ORDER.map((token) => <input key={token} type="hidden" name={`dark[${token}]`} value={dark[token]} />)
            : TOKEN_ORDER.map((token) => <input key={token} type="hidden" name={`light[${token}]`} value={light[token]} />)}

          <div className="mt-6 space-y-2 border-t border-edge pt-4">
            <p className="text-label text-fg-heading">{t("contrast.title")}</p>
            <ContrastBadge foreground={active.fgHeading} background={active.canvas} use="large" label={t("contrast.large")} />
            <ContrastBadge foreground={active.fgBody} background={active.canvas} use="body" label={t("contrast.body")} />
            <ContrastBadge foreground={active.fgMuted} background={active.canvas} use="body" label={t("contrast.muted")} />
            <ContrastBadge foreground={active.edgeStrong} background={active.canvas} use="ui" label={t("contrast.ui")} />
          </div>
        </Panel>

        <Panel>
          <h2 className="text-h3 text-fg-heading">{t("fonts.title")}</h2>
          <div className="mt-4 space-y-4">
            <FontPicker
              id="heading-font"
              label={t("fonts.headingLabel")}
              name="headingFontId"
              fonts={fonts}
              value={headingFontId}
              onChange={setHeadingFontId}
              placeholder={t("fonts.platformDefault")}
              empty={t("fonts.noneSelectable")}
            />
            <FontPicker
              id="body-font"
              label={t("fonts.bodyLabel")}
              name="bodyFontId"
              fonts={fonts}
              value={bodyFontId}
              onChange={setBodyFontId}
              placeholder={t("fonts.platformDefault")}
              empty={t("fonts.noneSelectable")}
            />
          </div>
        </Panel>

        <Button type="submit" pending={saving} pendingLabel={t("actions.saving")}>
          {t("actions.save")}
        </Button>
      </form>

      <div className="space-y-4">
        <BrandPreview colours={active} logoUrl={logo.previewUrl} />

        <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <Button type="button" variant="secondary" onClick={() => setResetConfirmOpen(true)}>
            {t("actions.reset")}
          </Button>
          <DialogContent title={t("actions.resetTitle")} description={t("actions.resetConfirm")} closeLabel={t("actions.closeDialog")}>
            <form action={resetFormAction} className="flex flex-wrap gap-3">
              <Button type="submit" variant="danger" pending={resetting} pendingLabel={t("actions.resetting")}>
                {t("actions.reset")}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
            </form>
          </DialogContent>
        </Dialog>
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
    <Field id={id} label={label} hint={fonts.length === 0 ? empty : undefined}>
      <Select name={name} value={value} onChange={(e) => onChange(e.target.value)} disabled={fonts.length === 0}>
        <option value="">{placeholder}</option>
        {fonts.map((f) => (
          <option key={f.id} value={f.id}>
            {f.family} — {f.weight}
          </option>
        ))}
      </Select>
    </Field>
  );
}
