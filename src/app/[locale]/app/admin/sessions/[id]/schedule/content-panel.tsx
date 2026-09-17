import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Panel } from "@/components/ui/panel";
import type { ScheduleContent } from "@/lib/dal/sessions";

// «المحتوى — كما كتبه المُقترِح» beside SCR-043's form (DEC-075, REQ-PRO-009).
//
// Read-only on purpose. DEC-075's audited content edit — an audit row per
// field and a notification to the proposer — is a migration and a message of
// its own, and nothing in «quick to fill» needs it; the panel is here so an
// admin never re-types, or re-checks, what the proposer already wrote.
// Owns no heading level above h2: the page owns the h1.

export async function ContentPanel({ title, content }: { title: string; content: ScheduleContent }) {
  const [t, ts] = await Promise.all([getTranslations("schedule.content"), getTranslations("sessions.event.level")]);
  const none = <span className="text-fg-muted">{t("none")}</span>;
  const rows: [string, React.ReactNode][] = [
    [t("category"), content.categoryName ? <bdi>{content.categoryName}</bdi> : none],
    [t("level"), ts(content.level)],
    [t("audience"), content.proposal?.targetAudience ? <bdi>{content.proposal.targetAudience}</bdi> : none],
    [t("expectedDuration"), content.proposal?.expectedDurationMinutes ? t("minutes", { count: content.proposal.expectedDurationMinutes, value: formatNumber(content.proposal.expectedDurationMinutes) }) : none],
  ];

  return (
    <Panel>
      <section aria-labelledby="schedule-content">
        <h2 id="schedule-content" className="text-h3 text-fg-heading">
          {t("title")}
        </h2>
        <p className="mt-3 text-label text-fg-heading">
          <bdi>{title}</bdi>
        </p>
        <p className="mt-2 line-clamp-4 text-body-sm text-fg-body">
          <bdi>{content.abstract}</bdi>
        </p>
        <dl className="mt-4 space-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-caption text-fg-muted">{label}</dt>
              <dd className="text-body-sm text-fg-heading">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-caption text-fg-muted">{t("note")}</p>
      </section>
    </Panel>
  );
}
