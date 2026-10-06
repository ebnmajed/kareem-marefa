"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter as useRawRouter } from "next/navigation";
import { BRAND_COLOUR_TOKENS, type BrandColourToken } from "@kareem/designer-runtime";
import { ActionBar } from "@/components/ui/action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/components/sessions/numerals";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { BrandColourSet, BrandFontRef, BrandKit } from "@/lib/brand/schema";
import type { ResetBrandKitState, SaveBrandKitState } from "@/app/[locale]/app/admin/branding/actions";
import { emptyResetState, emptySaveState } from "@/app/[locale]/app/admin/branding/state";
import { BrandPreview } from "./brand-preview";
import { ColourField } from "./colour-field";
import { LogoUploader } from "./logo-uploader";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-059 in edit mode — REQ-UIX-116, REQ-DSG-021, DEC-231 §3, DEC-251 §3. The artboard draws read mode only; this is
// the pattern every console read-mode page shares (`profile-edit.tsx` is the reference, read and never imported).
//
// ★ EDIT MODE NAMES ITS STATE — «تعديل الهوية» and the count of unsaved changes; each changed field outlined in the
// accent AND «(معدّل)» in its accessible name. ★ NOTHING IS WRITTEN BEFORE «حفظ» — an uploaded logo is bound only
// then. ★ «إلغاء» goes back to read mode with nothing written. ★ LEAVING WITH CHANGES ASKS.
// ★★ NO CONTRAST LOCK (DEC-272, the owner, 2026-10-06): the palette is the org's — no ratio is shown, nothing is
// refused for contrast. A refusal the database does raise (not an admin, a bad reference) is shown HERE, inline, every
// typed value kept, because every control is controlled (B14). On success the saved mark is the server's: the toast, then read mode,
// whose mark is the row's `updated_at`.
// ★ Both schemes are submitted whichever tab is open (B15). Declares no animation (REQ-UIX-053).

const TOKENS = BRAND_COLOUR_TOKENS as readonly BrandColourToken[];
const READ_HREF = "/app/admin/branding";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function BrandKitEdit({
  locale,
  kit,
  fonts,
  logoPreviewUrl,
  imageLimitMb,
  orgName,
  saveAction,
  resetAction,
  signPreview,
}: {
  locale: Locale;
  kit: BrandKit;
  fonts: BrandFontRef[];
  logoPreviewUrl: string | null;
  imageLimitMb: number;
  /** REQ-UIX-013: the reset dialog names the org. */
  orgName: string;
  saveAction: (prev: SaveBrandKitState, formData: FormData) => Promise<SaveBrandKitState>;
  resetAction: (prev: ResetBrandKitState, formData: FormData) => Promise<ResetBrandKitState>;
  signPreview: (locale: Locale, assetId: string) => Promise<string | null>;
}) {
  const t = useTranslations("branding");
  const toast = useToast();
  const router = useRouter();
  const rawRouter = useRawRouter();
  const hydrated = useHydrated();

  const [light, setLight] = useState<BrandColourSet>(kit.light);
  const [dark, setDark] = useState<BrandColourSet>(kit.dark);
  const [logo, setLogo] = useState<{ assetId: string | null; previewUrl: string | null }>({ assetId: kit.logo?.assetId ?? null, previewUrl: logoPreviewUrl });
  const [headingFontId, setHeadingFontId] = useState(kit.headingFont?.id ?? "");
  const [bodyFontId, setBodyFontId] = useState(kit.bodyFont?.id ?? "");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [resetOpen, setResetOpen] = useState(false);
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  // The toast and the way back are called FROM the action's own result, never from an effect on the state.
  const [state, saveFormAction] = useActionState(async (prev: SaveBrandKitState, formData: FormData) => {
    const result = await saveAction(prev, formData);
    if (result.saved) {
      toast.show({ title: t("actions.saved"), tone: "success" });
      router.replace(READ_HREF);
    }
    return result;
  }, emptySaveState);

  const [resetState, resetFormAction, resetting] = useActionState(async (prev: ResetBrandKitState, formData: FormData) => {
    const result = await resetAction(prev, formData);
    if (result.reset) {
      toast.show({ title: t("actions.resetDone"), tone: "success" });
      router.replace(READ_HREF);
    }
    return result;
  }, emptyResetState);

  // B13: the dialog closes on the reset's result, adjusted during render — never in the confirm's own onClick, which
  // would close it before its form's round trip starts.
  const [lastResetState, setLastResetState] = useState(resetState);
  if (resetState !== lastResetState) {
    setLastResetState(resetState);
    setResetOpen(false);
  }

  const lightChanged = TOKENS.filter((token) => !same(light[token], kit.light[token]));
  const darkChanged = TOKENS.filter((token) => !same(dark[token], kit.dark[token]));
  const logoChanged = logo.assetId !== (kit.logo?.assetId ?? null);
  const headingChanged = headingFontId !== (kit.headingFont?.id ?? "");
  const bodyChanged = bodyFontId !== (kit.bodyFont?.id ?? "");
  const unsaved = lightChanged.length + darkChanged.length + (logoChanged ? 1 : 0) + (headingChanged ? 1 : 0) + (bodyChanged ? 1 : 0);
  const dirty = unsaved > 0 && !state.saved && !resetState.reset;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const active = scheme === "light" ? light : dark;
  const activeChanged = scheme === "light" ? lightChanged : darkChanged;
  const setToken = (token: BrandColourToken, value: string) => (scheme === "light" ? setLight : setDark)((prev) => ({ ...prev, [token]: value }));
  const other = scheme === "light" ? { name: "dark", set: dark } : { name: "light", set: light };

  const refusal = state.error ? t(`errors.${state.error}`) : null;

  const changedWord = (on: boolean) => (on ? <span className="sr-only"> {t("editMode.changed")}</span> : null);

  return (
    <section aria-labelledby="brand-edit-heading" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="brand-edit-heading" className="text-h3 text-fg-heading">
          {t("editMode.heading")}
        </h2>
        <span aria-live="polite" className="text-caption font-bold text-accent">
          {unsaved > 0 ? t.rich("editMode.unsaved", { count: unsaved, value: formatNumber(unsaved), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null}
        </span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form action={saveFormAction} noValidate className="flex min-w-0 flex-col gap-4">
          {refusal ? (
            <p role="alert" className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
              <AlertCircleIcon className="mt-[0.2em]" />
              <span>{refusal}</span>
            </p>
          ) : null}

          <LogoUploader
            locale={locale}
            assetId={logo.assetId}
            previewUrl={logo.previewUrl}
            imageLimitMb={imageLimitMb}
            changed={logoChanged}
            signPreview={signPreview}
            onChange={setLogo}
          />
          <input type="hidden" name="logoAssetId" value={logo.assetId ?? ""} />

          <section aria-labelledby="brand-colours" className="rounded-panel border border-edge bg-surface p-4">
            <h2 id="brand-colours" className="text-label font-bold text-fg-heading">
              {t("colours.title")}
            </h2>
            <Tabs
              items={[
                { value: "light", label: t("colours.schemeLight") },
                { value: "dark", label: t("colours.schemeDark") },
              ]}
              value={scheme}
              onValueChange={(value) => setScheme(value as "light" | "dark")}
              label={t("colours.title")}
              className="mt-3"
            >
              <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                {TOKENS.map((token) => (
                  <ColourField
                    key={`${scheme}-${token}`}
                    id={`${scheme}-${token}`}
                    name={`${scheme}[${token}]`}
                    label={t(`colours.tokens.${token}`)}
                    value={active[token]}
                    changed={activeChanged.includes(token)}
                    onChange={(v) => setToken(token, v)}
                  />
                ))}
              </div>
            </Tabs>
            {TOKENS.map((token) => (
              <input key={token} type="hidden" name={`${other.name}[${token}]`} value={other.set[token]} />
            ))}
          </section>

          <section aria-labelledby="brand-fonts" className="flex flex-col gap-4 rounded-panel border border-edge bg-surface p-4">
            <h2 id="brand-fonts" className="text-label font-bold text-fg-heading">
              {t("fonts.title")}
            </h2>
            {(
              [
                { id: "heading-font", name: "headingFontId", label: t("fonts.headingLabel"), value: headingFontId, set: setHeadingFontId, changed: headingChanged },
                { id: "body-font", name: "bodyFontId", label: t("fonts.bodyLabel"), value: bodyFontId, set: setBodyFontId, changed: bodyChanged },
              ] as const
            ).map((f) => (
              <Field
                key={f.id}
                id={f.id}
                label={
                  <>
                    {f.label}
                    {changedWord(f.changed)}
                  </>
                }
                hint={fonts.length === 0 ? t("fonts.noneSelectable") : undefined}
              >
                <div className={f.changed ? "rounded-field outline-2 outline-accent" : ""}>
                  <Select name={f.name} value={f.value} onChange={(e) => f.set(e.target.value)} disabled={fonts.length === 0}>
                    <option value="">{t("fonts.platformDefault")}</option>
                    {fonts.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.family} — {formatNumber(font.weight)}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
            ))}
          </section>

          <ActionBar
            position="static"
            label={t("editMode.actions")}
            primary={
              <SubmitButton pendingLabel={t("actions.saving")} disabled={hydrated && unsaved === 0}>
                {unsaved > 0 ? `${t("actions.save")} (${formatNumber(unsaved)})` : t("actions.save")}
              </SubmitButton>
            }
            secondary={[
              <ButtonLink key="cancel" href={READ_HREF} variant="secondary" size="lg">
                {t("actions.cancel")}
              </ButtonLink>,
            ]}
          />
        </form>

        <div className="flex flex-col gap-4">
          <BrandPreview colours={active} dark={dark} logoUrl={logo.previewUrl} />

          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
              <Button type="button" variant="secondary" size="md" onClick={() => setResetOpen(true)}>
                {t("actions.reset")}
              </Button>
              <DialogContent
                title={t.rich("actions.resetTitle", { orgName, bdi: (chunks) => <bdi>{chunks}</bdi> })}
                description={t("actions.resetConfirm")}
                closeLabel={t("actions.closeDialog")}
              >
                <form action={resetFormAction} className="flex flex-wrap gap-3">
                  {resetState.error ? (
                    <p role="alert" className="w-full text-caption text-error">
                      {t(`errors.${resetState.error}`)}
                    </p>
                  ) : null}
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

      <Dialog open={leavingTo !== null} onOpenChange={(open) => (open ? null : setLeavingTo(null))}>
        <DialogContent title={t("editMode.leave.title")} closeLabel={t("actions.closeDialog")}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              onClick={() => {
                const to = leavingTo;
                setLeavingTo(null);
                if (to) rawRouter.push(to);
              }}
            >
              {t("editMode.leave.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("editMode.leave.stay")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
