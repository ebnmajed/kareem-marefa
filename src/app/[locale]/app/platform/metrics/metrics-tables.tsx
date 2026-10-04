"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import { describeAlert, durationLabel } from "@/components/platform/alert-copy";
import { formatNumber } from "@/components/sessions/numerals";
import type { JobHealthRow, OrgSummary, PlatformAlert } from "@/lib/dal/platform";

// SCR-084's three lists on `ui/data-table` — REQ-ADM-003, REQ-NFR-016, REQ-UIX-118. Rebuilt for wave 26 from
// `PlatformMetrics.dc.html` (`DEC-208`): the per-org table is the board's, with the columns the console holds — org,
// members, active, sessions, certificates — and not the board's attendance or exports, which no function counts
// (DEC-251, Q5). The alerts and job health are not on the board and stay (`REQ-ADM-003`: «job health, error rates»).
//
// ★ Below `md` every one is a card list — never a sideways scroller (wave 4's «أقدم منتظرة» off the edge at 390 px).
// ★ AGGREGATE ONLY. An alert's reading is `0075`'s counts, ages, rates and thresholds; a job row is a task
// identifier and three numbers; an org row is the org's own name and four counts.

export function AlertsTable({ alerts }: { alerts: PlatformAlert[] }) {
  const t = useTranslations("platform");
  const router = useRouter();

  const columns: DataTableColumn<PlatformAlert>[] = [
    { key: "alert", header: t("metrics.alertColumn"), cell: (a) => describeAlert(t, a).title },
    {
      key: "state",
      header: t("metrics.stateColumn"),
      onCard: true,
      cell: (a) => (a.fired ? <Badge tone="error">{t("metrics.fired")}</Badge> : <Badge tone="success">{t("metrics.clear")}</Badge>),
    },
    { key: "reading", header: t("metrics.readingColumn"), onCard: true, cell: (a) => describeAlert(t, a).detail },
  ];

  return (
    <DataTable
      label={t("metrics.alertsTitle")}
      columns={columns}
      rows={alerts}
      rowKey={(a) => a.alert}
      empty={{ title: t("home.alertsUnavailable"), action: { label: t("metrics.jobsEmptyAction"), onClick: () => router.refresh() }, size: "sm" }}
    />
  );
}

export function JobsTable({ jobs }: { jobs: JobHealthRow[] }) {
  const t = useTranslations("platform");
  const router = useRouter();
  const num = (n: number) => formatNumber(n);

  const columns: DataTableColumn<JobHealthRow>[] = [
    {
      key: "task",
      header: t("metrics.jobTask"),
      // A task identifier is snake_case Latin in an Arabic table: isolated, so
      // the underscores do not reorder.
      cell: (job) => (
        <span dir="ltr" className="font-mono">
          <bdi>{job.task}</bdi>
        </span>
      ),
    },
    // ★ `oldest pending` sits second: the only number that catches the
    // LISTEN/NOTIFY degradation, where every other figure looks healthy.
    { key: "oldest", header: t("metrics.jobOldest"), onCard: true, cell: (job) => <bdi>{durationLabel(t, job.oldestPendingSeconds)}</bdi> },
    { key: "pending", header: t("metrics.jobPending"), onCard: true, align: "end", cell: (job) => <bdi>{num(job.pending)}</bdi> },
    { key: "failed", header: t("metrics.jobFailed"), onCard: true, align: "end", cell: (job) => <bdi>{num(job.failed)}</bdi> },
  ];

  return (
    <DataTable
      label={t("metrics.jobsTitle")}
      columns={columns}
      rows={jobs}
      rowKey={(job) => job.task}
      empty={{ title: t("metrics.jobsEmpty"), action: { label: t("metrics.jobsEmptyAction"), onClick: () => router.refresh() }, size: "sm" }}
    />
  );
}

export function OrgMetricsTable({ orgs }: { orgs: OrgSummary[] }) {
  const t = useTranslations("platform");
  const num = (n: number) => formatNumber(n);

  const columns: DataTableColumn<OrgSummary>[] = [
    { key: "org", header: t("metrics.orgColumn"), cell: (org) => <bdi>{org.name}</bdi> },
    { key: "members", header: t("orgs.members"), onCard: true, align: "end", cell: (org) => <bdi>{num(org.members)}</bdi> },
    { key: "activeMembers", header: t("orgs.activeMembers"), onCard: true, align: "end", cell: (org) => <bdi>{num(org.activeMembers)}</bdi> },
    { key: "sessions", header: t("orgs.sessions"), onCard: true, align: "end", cell: (org) => <bdi>{num(org.sessions)}</bdi> },
    { key: "certificates", header: t("orgs.certificates"), onCard: true, align: "end", cell: (org) => <bdi>{num(org.certificates)}</bdi> },
  ];

  return (
    <DataTable
      label={t("metrics.perOrgTitle")}
      columns={columns}
      rows={orgs}
      rowKey={(org) => org.id}
      rowHref={(org) => `/app/platform/orgs/${org.id}/domains`}
      empty={{ title: t("orgs.empty"), action: { label: t("orgs.newLink"), href: "/app/platform/orgs/new" }, size: "sm" }}
    />
  );
}
