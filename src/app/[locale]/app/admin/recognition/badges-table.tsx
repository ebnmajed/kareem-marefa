"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DeactivateToggle } from "@/components/admin/deactivate-toggle";
import { KeptSelect } from "@/components/admin/kept-select";
import { RowEditDialog } from "@/components/admin/row-edit-dialog";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { BadgeMetric, BadgeRow } from "@/lib/dal/scoring-admin";
import type { Locale } from "@/i18n/routing";
import { retireBadge } from "./actions";

// SCR-054's badges — REQ-REC-001: an admin creates, edits, retires and awards
// badges, each with a name, a description, an award rule and a certificate
// flag. The screen used to edit a description, the flag and the retirement
// only; a new badge could not exist, a name could not change, and a rule was
// whatever the seed wrote.
//
// Retiring is `DeactivateToggle` — confirmed, naming the badge, saying the
// holders keep it; restoring is one press. It was a checkbox whose label
// flipped to «إعادة تفعيل الشارة» while CHECKED meant still retired.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const METRICS: BadgeMetric[] = ["check_ins_count", "sessions_delivered_count", "ratings_submitted_count", "streak_awards_count", "presenter_rating_avg", "manual"];
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const plain = (chunks: string) => chunks;

export function BadgeRuleText({ badge }: { badge: BadgeRow }) {
  const t = useTranslations("recognition.admin.badges");
  const { metric, gte, minSessions } = badge.rule;
  if (metric === "manual" || gte === null) return <span>{t("rules.manual")}</span>;
  if (metric === "presenter_rating_avg") {
    const sessions = minSessions ?? 0;
    return <span>{t.rich("rules.presenter_rating_avg", { count: sessions, value: formatNumber(sessions), avg: formatNumber(gte), bdi })}</span>;
  }
  return <span>{t.rich(`rules.${metric}`, { count: gte, value: formatNumber(gte), bdi })}</span>;
}

export function BadgesTable({ badges, action, locale }: { badges: BadgeRow[]; action: Action; locale: Locale }) {
  const t = useTranslations("recognition.admin");

  const columns: DataTableColumn<BadgeRow>[] = [
    {
      key: "badge",
      header: t("badges.colBadge"),
      onCard: true,
      cell: (b) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">
            <bdi>{b.name}</bdi>
          </p>
          {b.description ? (
            <p className="mt-0.5 text-caption text-fg-muted">
              <bdi>{b.description}</bdi>
            </p>
          ) : null}
        </div>
      ),
    },
    { key: "rule", header: t("badges.colRule"), onCard: true, cell: (b) => <BadgeRuleText badge={b} /> },
    {
      key: "certificate",
      header: t("badges.colCertificate"),
      onCard: true,
      cell: (b) => (b.issuesCertificate ? <Badge size="sm" tone="info">{t("badges.certificate")}</Badge> : <span className="text-fg-muted">{t("badges.noCertificate")}</span>),
    },
    {
      key: "status",
      header: t("badges.colStatus"),
      onCard: true,
      cell: (b) =>
        b.retiredAt ? (
          <Badge size="sm" tone="neutral" outline>
            {t("badges.retired")}
          </Badge>
        ) : (
          <Badge size="sm" tone="success">
            {t("badges.active")}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: t("badges.colActions"),
      onCard: true,
      cell: (b) => (
        <div className="flex flex-wrap items-center gap-2">
          <BadgeDialog badge={b} action={action} />
          <DeactivateToggle
            active={b.retiredAt === null}
            activateLabel={t("badges.restore")}
            deactivateLabel={t("badges.retire")}
            confirmTitle={t.rich("badges.retireTitle", { name: b.name, bdi })}
            confirmBody={t("badges.retireBody")}
            confirmAction={t("badges.retireConfirm")}
            cancelLabel={t("common.cancel")}
            closeLabel={t("common.close")}
            deactivateDoneLabel={t("badges.retiredDone")}
            reactivateDoneLabel={t("badges.restoredDone")}
            onActivate={() => retireBadge(locale, b.id, false)}
            onDeactivate={() => retireBadge(locale, b.id, true)}
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      label={t("badges.listLabel")}
      columns={columns}
      rows={badges}
      rowKey={(b) => b.id}
      empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }}
    />
  );
}

const FIELDS = ["name", "description", "metric", "gte", "avg", "minSessions"];

/** Create when `badge` is absent; edit otherwise. */
export function BadgeDialog({ badge, action }: { badge?: BadgeRow; action: Action }) {
  const t = useTranslations("recognition.admin");
  const prefix = badge ? `badge-${badge.id}` : "badge-new";
  const labels: Record<string, string> = {
    name: t("badges.nameLabel"),
    description: t("badges.descriptionLabel"),
    metric: t("badges.metricLabel"),
    gte: t("badges.gteLabel"),
    avg: t("badges.avgLabel"),
    minSessions: t("badges.minSessionsLabel"),
  };
  return (
    <RowEditDialog
      triggerLabel={badge ? t("common.edit") : t("badges.add")}
      triggerName={badge ? t.markup("common.editName", { name: badge.name, bdi: plain }) : t("badges.add")}
      title={badge ? t.rich("badges.editTitle", { name: badge.name, bdi }) : t("badges.newTitle")}
      closeLabel={t("common.close")}
      action={action}
      emptyState={emptySavedState()}
      savedToast={badge ? t("common.saved") : t("badges.created")}
      failedMessage={(key) => t(`badges.errors.${key}`)}
      summaryTitle={t("common.summaryTitle")}
      summary={(state) => summaryErrors(state, { fields: FIELDS, label: (f) => labels[f] ?? f, message: (key) => t(`badges.errors.${key}`), fieldId: (f) => `${prefix}-${f}` })}
      submitLabel={t("common.save")}
      pendingLabel={t("common.saving")}
      cancelLabel={t("common.cancel")}
    >
      {(state) => <BadgeFields state={state} badge={badge} prefix={prefix} labels={labels} />}
    </RowEditDialog>
  );
}

function BadgeFields({ state, badge, prefix, labels }: { state: SavedFormState; badge?: BadgeRow; prefix: string; labels: Record<string, string> }) {
  const t = useTranslations("recognition.admin.badges");
  const attempted = hasAttempted(state);
  const value = (field: string, stored: string) => (attempted ? was(state, field) : stored);
  const err = (field: string) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const [metric, setMetric] = useState<BadgeMetric>((value("metric", badge?.rule.metric ?? "check_ins_count") || "check_ins_count") as BadgeMetric);
  const stored = badge?.rule;

  return (
    <>
      <input type="hidden" name="badgeId" value={badge?.id ?? ""} />
      <Field id={`${prefix}-name`} label={labels.name} required error={err("name")}>
        <Input name="name" maxLength={100} defaultValue={value("name", badge?.name ?? "")} />
      </Field>
      <Field id={`${prefix}-description`} label={labels.description} hint={t("descriptionHint")} error={err("description")}>
        <Textarea name="description" rows={2} maxLength={300} defaultValue={value("description", badge?.description ?? "")} />
      </Field>
      <Field id={`${prefix}-metric`} label={labels.metric} required error={err("metric")}>
        <KeptSelect name="metric" value={metric} onChange={(e) => setMetric(e.target.value as BadgeMetric)}>
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {t(`metrics.${m}`)}
            </option>
          ))}
        </KeptSelect>
      </Field>
      {metric === "presenter_rating_avg" ? (
        <>
          <Field id={`${prefix}-avg`} label={labels.avg} hint={t("avgHint")} required error={err("avg")}>
            <Input
              name="avg"
              type="number"
              inputMode="decimal"
              min={1}
              max={5}
              step={0.1}
              dir="ltr"
              className="w-28 text-center"
              defaultValue={value("avg", stored?.metric === "presenter_rating_avg" && stored.gte !== null ? String(stored.gte) : "4.5")}
            />
          </Field>
          <Field id={`${prefix}-minSessions`} label={labels.minSessions} required error={err("minSessions")}>
            <Input
              name="minSessions"
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              step={1}
              dir="ltr"
              className="w-28 text-center"
              defaultValue={value("minSessions", stored?.minSessions !== null && stored?.minSessions !== undefined ? String(stored.minSessions) : "3")}
            />
          </Field>
        </>
      ) : metric !== "manual" ? (
        <Field id={`${prefix}-gte`} label={labels.gte} required error={err("gte")}>
          <Input
            name="gte"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            step={1}
            dir="ltr"
            className="w-28 text-center"
            defaultValue={value("gte", stored && stored.metric !== "manual" && stored.metric !== "presenter_rating_avg" && stored.gte !== null ? String(stored.gte) : "")}
          />
        </Field>
      ) : null}
      <Switch name="issuesCertificate" label={t("certificateLabel")} description={t("certificateHint")} defaultChecked={attempted ? was(state, "issuesCertificate") === "on" : (badge?.issuesCertificate ?? false)} />
    </>
  );
}
