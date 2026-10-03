"use client";

import { useTranslations } from "next-intl";
import { AlertCircleIcon, CheckIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import { SUBJECT_LIMIT, type EmailCheck } from "@/components/email/checks";

// The builder's الفحوصات panel — wave 23, REQ-UIX-112, REQ-NTF-009, REQ-NTF-012, `DEC-NEXT-34` (checks are a rail item
// with a count, never a modal). Rebuilt from wave 10's panel; the rules are `checks.ts`'s and are not here.
//
// ★ AN ADMIN MUST NEVER APPROVE A MAIL THEY HAVE NOT SEEN. A blocking finding means the canvas is showing something
// other than the mail that would be sent — it lost a row, or the database will refuse it — so blocking findings come
// first, they are the rail's count, and «احفظ وفعّل» and the test send wait for them. An advisory one is worth a
// second look. A satisfied one is SHOWN: the composed footer cannot be missing (`REQ-NTF-005`), and an admin should see
// that rather than infer it.
//
// A finding that names a block selects it — which opens الكتلة on it. Naming a block and not letting an admin get to
// it is half a check.

export function ChecksPanel({ checks, onSelectBlock }: { checks: readonly EmailCheck[]; onSelectBlock: (blockId: string) => void }) {
  const t = useTranslations("notifications.admin.emails.checks");
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const blocking = checks.filter((check) => check.severity === "blocking");
  const advisory = checks.filter((check) => check.severity === "advisory");
  const satisfied = checks.filter((check) => check.severity === "satisfied");

  const row = (check: EmailCheck, index: number, tone: "error" | "muted") => (
    <li key={`${check.id}-${check.blockId ?? ""}-${index}`} className={`flex items-start gap-2 text-body-sm ${tone === "error" ? "text-fg-heading" : "text-fg-muted"}`}>
      <AlertCircleIcon className={`mt-[0.2em] ${tone === "error" ? "text-error" : "text-fg-muted"}`} />
      <span className="min-w-0 flex-1">
        <span className="block">{check.value && t.has(`${check.id}.titleWithValue`) ? t.rich(`${check.id}.titleWithValue`, { value: check.value, bdi }) : t(`${check.id}.title`)}</span>
        <span className="block text-fg-muted">{t.rich(`${check.id}.reason`, { limit: formatNumber(SUBJECT_LIMIT), bdi })}</span>
        {check.blockId ? (
          <button type="button" onClick={() => onSelectBlock(check.blockId as string)} className="mt-1 min-h-6 text-label text-fg-heading underline underline-offset-4">
            {t("selectBlock")}
          </button>
        ) : null}
      </span>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {blocking.length > 0 ? (
        <section aria-labelledby="checks-blocking">
          <h3 id="checks-blocking" className="text-label text-fg-heading">
            {t("headingBlocking", { count: blocking.length, value: formatNumber(blocking.length) })}
          </h3>
          <ul className="mt-2 space-y-3">{blocking.map((check, index) => row(check, index, "error"))}</ul>
        </section>
      ) : null}
      {advisory.length > 0 ? <ul className="space-y-3">{advisory.map((check, index) => row(check, index, "muted"))}</ul> : null}
      {satisfied.length > 0 ? (
        <ul className="space-y-2">
          {satisfied.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-body-sm text-fg-muted">
              <CheckIcon className="mt-[0.2em] text-success" />
              <span>{t(`${check.id}.title`)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
