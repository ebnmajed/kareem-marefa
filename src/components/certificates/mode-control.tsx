"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";
import { RadioGroup } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toast";
import { saveCertificateMode } from "@/app/[locale]/app/admin/sessions/[id]/certificates/actions";

// SCR-045's «من يستحق» — the certificate MODE, written here and only here
// (DEC-178 contract 2; REQ-DSG-031 step 2, REQ-CRT-001, REQ-SES-020).
//
// ★ THE ACT HAS ITS PREFLIGHT HERE. Issuance is never pressed: it is the
// completion fan-out (automatic) or a confirmed release (review). So the one
// moment an admin authorises it is choosing «تلقائي» or «مراجعة», and that is
// where REQ-DSG-031's stated preflight goes, in a confirmation: the fonts, each
// kind's design, who qualifies now, and the next serial as an ESTIMATE, never a
// reservation (DEC-148, DEC-010). «لا شهادات» issues nothing and needs none.
//
// A closed session (completed, archived, cancelled) never reaches this
// component: the page says why in a sentence, because the function refuses a
// change that would do nothing.

export type CertificateModeValue = "off" | "automatic" | "review";

export interface ModePreflight {
  fontsLoaded: boolean;
  designs: Array<{ kind: "attendance" | "presenter"; saved: boolean }>;
  eligible: number;
  /** The expected next serial, when one can be estimated. */
  serial: string | null;
}

const MODES: CertificateModeValue[] = ["off", "automatic", "review"];

export function CertificateModeControl({
  locale,
  sessionId,
  mode,
  preflight,
}: {
  locale: string;
  sessionId: string;
  mode: CertificateModeValue;
  preflight: ModePreflight;
}) {
  const t = useTranslations("certificates.session.modeControl");
  const tk = useTranslations("certificates.kind");
  const ui = useTranslations("ui");
  const toast = useToast();
  const [value, setValue] = useState<CertificateModeValue>(mode);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await saveCertificateMode(locale, sessionId, value);
      setConfirming(false);
      if (result.status === "ok") toast.show({ tone: "success", title: t("saved") });
      else if (result.status === "unchanged") toast.show({ tone: "info", title: t("unchanged") });
      else if (result.status === "refused") toast.show({ tone: "error", title: t(`refused.${result.error}`) });
      else toast.show({ tone: "error", title: t("failed") });
    });

  // Turning certificates ON is the act that needs its preflight; off is not.
  const submit = () => (value === "off" ? save() : setConfirming(true));
  const bdi = (c: React.ReactNode) => <bdi>{c}</bdi>;
  const check = (ok: boolean, text: React.ReactNode, key: string) => (
    <li key={key} className="flex items-start gap-2 text-body-sm text-fg-body">
      <span aria-hidden="true" className={`mt-1 ${ok ? "text-success" : "text-error"}`}>
        {ok ? <CheckIcon /> : <AlertTriangleIcon />}
      </span>
      <span>{text}</span>
    </li>
  );

  return (
    <div id="cert-mode" className="flex flex-col gap-4">
      <RadioGroup
        name="certificateMode"
        legend={t("legend")}
        value={value}
        onChange={(next) => setValue(next as CertificateModeValue)}
        options={MODES.map((m) => ({ value: m, label: t(`options.${m}.label`), hint: t(`options.${m}.hint`) }))}
      />
      <Button type="button" size="md" className="self-start" pending={pending && !confirming} disabled={value === mode} onClick={submit}>
        {t("save")}
      </Button>

      <Dialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <DialogContent title={t("confirmTitle")} description={t("confirmBody")} closeLabel={ui("dialog.close")}>
          <ul className="flex flex-col gap-2">
            {check(preflight.fontsLoaded, t(preflight.fontsLoaded ? "checkFonts" : "checkFontsMissing"), "fonts")}
            {preflight.designs.map((d) =>
              check(d.saved, t.rich(d.saved ? "checkDesign" : "checkDesignMissing", { kind: tk(d.kind), bdi }), `design-${d.kind}`),
            )}
            {check(preflight.eligible > 0, t.rich("checkEligible", { count: preflight.eligible, value: formatNumber(preflight.eligible), bdi }), "eligible")}
            {preflight.serial
              ? check(true, t.rich("checkSerial", { serial: preflight.serial, bdi: (c) => <bdi dir="ltr">{c}</bdi> }), "serial")
              : null}
            {check(true, t("checkTierA"), "tier-a")}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" size="md" pending={pending} onClick={save}>
              {t("confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md" disabled={pending}>
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
