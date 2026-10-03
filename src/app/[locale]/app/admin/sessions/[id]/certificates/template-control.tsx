"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { fontFaceCss, type BrandScheme, type DesignDocument } from "@kareem/designer-runtime";
import type { CertificateDesignData } from "@/lib/dal/certificates";
import { ChecksPanel, useCheckFindings } from "@/components/designer/checks-panel";
import { formatNumber } from "@/components/sessions/numerals";
import { TemplatePreview } from "@/components/templates/template-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Link } from "@/components/ui/link";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { applyDesignToHeld, saveCertificateDesign, type CertificateActionResult } from "./actions";

// SCR-045's template, per kind — written here and nowhere else (the owner's C6 ruling, DEC-178, REQ-CRT-015 as amended
// by DEC-238 §2): before completion; after it only while the kind has held certificates and none issued, when
// «طبّق على المحجوزة» re-pins them (`redesignHeldCertificates()`). `set_certificate_design()` refuses once one of the
// kind is issued or revoked (`55000`, 0099), which the DAL maps to «locked» — the data's re-check of this screen's gate.
//
// No board draws it, so it is the sober register: a select of the org's and the platform's published templates of the
// kind, defaulting to what issuance would pick (DEC-238 §2.3), the scheme (DEC-148), «احفظ». At `lg` the preview beside
// it binds the kind's LONGEST eligible name and runs the studio's own checks (REQ-DSG-031): the name that breaks is never
// the sample's.

type Kind = CertificateDesignData["kinds"][number];
type Face = { family: string; weight: number; style: string; sha256: string };

export interface TemplateControlProps {
  locale: string;
  sessionId: string;
  kind: Kind;
  brand: CertificateDesignData["brand"];
  sample: Record<string, string>;
  longestName: string | null;
  faces: Face[];
  origin: string;
  /** After completion: re-pin the held certificates once the choice is saved. */
  offerApplyHeld: boolean;
  /** In the «غيّر» sheet: where to return once the held certificates are re-pinned — the act is done, so the sheet
   *  closes on success rather than standing modal over the list. */
  closeHref?: string;
}

function useFacesReady(faces: Face[]): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const families = [...new Set(faces.map((f) => f.family))];
    // `document.fonts.ready` alone resolves while a declared-but-unexercised face is still unloaded (DEC-024).
    void Promise.all(families.map((family) => window.document.fonts.load(`400 40px "${family}"`)))
      .then(() => window.document.fonts.ready)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [faces]);
  return ready;
}

export function TemplateControl({ locale, sessionId, kind, brand, sample, longestName, faces, origin, offerApplyHeld, closeHref }: TemplateControlProps) {
  const router = useRouter();
  const t = useTranslations("certificates.session");
  const ui = useTranslations("ui");
  const toast = useToast();
  const fontsReady = useFacesReady(faces);
  const faceCss = useMemo(() => fontFaceCss(faces.map((f) => ({ ...f, url: `${origin}/api/fonts/${f.sha256}` }))), [faces, origin]);
  const [pending, start] = useTransition();
  const [templateId, setTemplateId] = useState(kind.effectiveTemplateId ?? kind.options[0]?.id ?? "");
  const [scheme, setScheme] = useState<BrandScheme>(kind.chosen?.scheme ?? "light");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selected = kind.options.find((o) => o.id === templateId) ?? null;
  // Unsaved while nothing is stored: issuance would otherwise fall back to the default in light — a choice nobody made.
  const dirty = kind.chosen === null || templateId !== kind.chosen.templateId || scheme !== kind.chosen.scheme;
  const bindings = useMemo(() => ({ ...brand[scheme], ...sample, ...(longestName ? { "recipient.name": longestName } : {}) }), [brand, scheme, sample, longestName]);
  const id = `cert-template-${kind.kind}`;

  const say = (result: CertificateActionResult, success: string) => {
    if (result.status === "ok") return toast.show({ tone: "success", title: success });
    toast.show({ tone: "error", title: t(result.status === "locked" ? "locked" : result.status === "invalid" ? "invalid" : "notAuthorized") });
  };

  const save = () =>
    start(async () => {
      const form = new FormData();
      form.set("templateId", templateId);
      form.set("scheme", scheme);
      say(await saveCertificateDesign(locale, sessionId, kind.kind, form), t("saved"));
    });

  const applyHeld = () =>
    start(async () => {
      const result = await applyDesignToHeld(locale, sessionId, kind.kind);
      const count = result.status === "ok" ? (result.count ?? 0) : 0;
      say(result, t("applyHeldDone", { count, value: formatNumber(count) }));
      if (result.status === "ok") {
        setConfirmOpen(false);
        if (closeHref) router.replace(closeHref, { scroll: false });
      }
    });

  if (kind.options.length === 0)
    return (
      <p className="flex flex-wrap gap-2 text-body-sm text-fg-muted">
        {t("noTemplates")}
        <Link href="/app/admin/templates/certificates" className="text-fg-heading underline underline-offset-4">
          {t("toLibrary")}
        </Link>
      </p>
    );

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <style dangerouslySetInnerHTML={{ __html: faceCss }} />
      <div className="flex min-w-0 flex-col gap-4">
        <h3 id={`${id}-heading`} className="text-label text-fg-heading">
          {t(`kindTitle.${kind.kind}`)}
        </h3>
        <Field id={`${id}-select`} label={t("templateLabel")}>
          <Select value={templateId} onChange={(event) => setTemplateId(event.currentTarget.value)}>
            {kind.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.scope === "platform" ? ` · ${t("platformTemplate")}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <RadioGroup
          name={`scheme-${kind.kind}`}
          legend={t("schemeLabel")}
          appearance="chips"
          value={scheme}
          onChange={(v) => setScheme(v === "dark" ? "dark" : "light")}
          options={(["light", "dark"] as const).map((value) => ({ value, label: t(`scheme.${value}`) }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="md" pending={pending} pendingLabel={t("saving")} disabled={!dirty || selected === null} onClick={save}>
            {t("save")}
          </Button>
          {offerApplyHeld && kind.heldCount > 0 && kind.chosen !== null && !dirty ? (
            <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => setConfirmOpen(true)}>
              {t("applyHeld")}
            </Button>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="hidden min-w-0 flex-col gap-3 lg:flex">
          <div className={`relative w-full rounded-card border border-edge ${selected.orientation === "portrait" ? "mx-auto aspect-[210/297] max-w-64" : "aspect-[297/210]"}`}>
            <TemplatePreview document={selected.document} values={bindings} faces={faces} origin={origin} title={t("previewTitle")} />
          </div>
          <Preflight document={selected.document} bindings={bindings} longestName={longestName} fontsReady={fontsReady} />
        </div>
      ) : null}

      {/* REQ-UIX-013: the confirm says what changes; a plain button, never a `DialogClose` around a pending transition. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title={t("applyHeldTitle", { count: kind.heldCount, value: formatNumber(kind.heldCount) })} description={t("applyHeldBody")} closeLabel={ui("dialog.close")}>
          <div className="flex flex-wrap gap-3">
            <Button type="button" size="md" pending={pending} onClick={applyHeld}>
              {t("applyHeldConfirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Preflight({ document: doc, bindings, longestName, fontsReady }: { document: DesignDocument; bindings: Record<string, string>; longestName: string | null; fontsReady: boolean }) {
  const t = useTranslations("certificates.session");
  const { findings, measuring } = useCheckFindings({ document: doc, bindings, fontsReady, assetSizes: {} });
  const layerNames = useMemo(() => Object.fromEntries(doc.layers.map((l) => [l.id, l.name ?? l.id])), [doc.layers]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-fg-muted">
        {longestName ? t.rich("preflightLongest", { name: longestName, bdi: (c) => <bdi>{c}</bdi> }) : t("preflightSample")}
      </p>
      <ChecksPanel findings={findings} measuring={measuring} layerNames={layerNames} showIntro={false} />
    </div>
  );
}
