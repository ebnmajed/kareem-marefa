"use client";

import { useTranslations } from "next-intl";
import { AlertCircleIcon, CheckIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { formatNumber } from "@/components/sessions/numerals";
import { SUBJECT_LIMIT, type EmailCheck } from "@/components/email/checks";

// SCR-058's checks panel — `16` §11.4, REQ-NTF-009, REQ-NTF-012.
//
// ★ WHAT IT IS FOR, IN ONE SENTENCE: an admin must never approve a mail they
// have not seen. Everything else about this panel follows from that.
//
// A `blocking` check means the frame is showing something other than the
// document being edited — it parsed as nothing, it lost a row, or the database
// will refuse it. Those are not styling opinions and they are not ordered
// after the advisory ones: they come first, they are counted in the heading,
// and «أرسل اختبارًا» is disabled while any stands, because a test send of a
// mail that is not the one being edited teaches an admin the wrong thing.
//
// A `satisfied` check is shown rather than hidden. The composed footer cannot
// be missing (`REQ-NTF-005`), and an admin should be able to SEE that instead
// of inferring it from the absence of a warning.

export function ChecksPanel({
  checks,
  onSelectBlock,
}: {
  checks: readonly EmailCheck[];
  /** Selecting the block a check names is the whole point of naming it. */
  onSelectBlock: (blockId: string) => void;
}) {
  const t = useTranslations("notifications.admin.emails.checks");
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

  const blocking = checks.filter((check) => check.severity === "blocking");
  const advisory = checks.filter((check) => check.severity === "advisory");
  const satisfied = checks.filter((check) => check.severity === "satisfied");

  return (
    <section aria-labelledby="checks-heading" className="mt-6">
      <h3 id="checks-heading" className="text-label text-fg-heading">
        {blocking.length > 0 ? t("headingBlocking", { count: blocking.length }) : t("heading")}
      </h3>

      {blocking.length > 0 ? (
        <Panel tone="error" className="mt-3">
          <ul className="space-y-3">
            {blocking.map((check, index) => (
              <Row key={`${check.id}-${check.blockId ?? index}`} check={check} t={t} bdi={bdi} onSelectBlock={onSelectBlock} tone="error" />
            ))}
          </ul>
        </Panel>
      ) : null}

      {advisory.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {advisory.map((check, index) => (
            <Row key={`${check.id}-${index}`} check={check} t={t} bdi={bdi} onSelectBlock={onSelectBlock} tone="muted" />
          ))}
        </ul>
      ) : null}

      {satisfied.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {satisfied.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-body-sm text-fg-muted">
              <CheckIcon className="mt-[0.2em] text-success" />
              <span>{t(`${check.id}.title`)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Row({
  check,
  t,
  bdi,
  onSelectBlock,
  tone,
}: {
  check: EmailCheck;
  t: ReturnType<typeof useTranslations<"notifications.admin.emails.checks">>;
  bdi: (chunks: React.ReactNode) => React.ReactNode;
  onSelectBlock: (blockId: string) => void;
  tone: "error" | "muted";
}) {
  // The reason is a separate string from the title: the title says WHAT, the
  // reason says what it means for the mail — «this is the string message, not
  // your design» rather than «could not parse».
  const title = check.value ? t.rich(`${check.id}.titleWithValue`, { value: check.value, bdi }) : t(`${check.id}.title`);

  return (
    <li className={`flex items-start gap-2 text-body-sm ${tone === "error" ? "text-fg-heading" : "text-fg-muted"}`}>
      <AlertCircleIcon className={`mt-[0.2em] ${tone === "error" ? "text-error" : "text-fg-muted"}`} />
      <span className="flex-1">
        <span className="block">{title}</span>
        {/* `limit` is passed to every reason and read by the one that names
            it: a numeral in copy is interpolated so it is formatted and
            isolated, never typed into the string (`DEC-124`, `10` §2). */}
        <span className="block text-fg-muted">{t.rich(`${check.id}.reason`, { limit: formatNumber(SUBJECT_LIMIT), bdi })}</span>
        {check.blockId ? (
          // Naming a block and not letting an admin get to it is half a check.
          <button
            type="button"
            onClick={() => onSelectBlock(check.blockId as string)}
            className="mt-1 text-label text-fg-heading underline underline-offset-4"
          >
            {t("selectBlock")}
          </button>
        ) : null}
      </span>
    </li>
  );
}
