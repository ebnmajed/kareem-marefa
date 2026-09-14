import { getTranslations } from "next-intl/server";
import type { DesignerSlotProps } from "@/components/posters/slots";
import { getCertificateMode } from "@/lib/dal/certificates";

// The `CertificateModeBadge` slot — REQ-CRT-002.
//
// «The mode is visible on the event page so attendees know what to expect.»
// It reads `sessions.certificate_mode` through this track's DAL and says, in
// one line, whether a certificate is coming and whether a human decides.
//
// ★ `off` RENDERS NOTHING. D50 is that an org with certificates off has no
// certificate feature at all — not a disabled one, not a greyed badge, not
// «الشهادات: معطّلة». A badge announcing an absence is how a reader learns
// there is a thing they are missing out on, which is the opposite of what
// the decision says. `off` is also the column default and the common case.
//
// No heading of its own: the event page owns the landmark (TEAM.md §2).
export async function CertificateModeBadge({ sessionId, locale }: DesignerSlotProps) {
  const mode = await getCertificateMode(locale, sessionId);
  if (mode !== "automatic" && mode !== "review") return null;

  const t = await getTranslations("certificates.mode");
  return (
    <p className="text-body-sm text-fg-body">
      <span className="text-fg-muted">{t("label")}</span>
      {": "}
      {t(mode)}
    </p>
  );
}
