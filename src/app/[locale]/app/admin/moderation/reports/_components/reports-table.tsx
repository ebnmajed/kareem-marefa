"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableActionPair } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { DataTableColumn } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { CommentReportRow, ModerationPerson, ReportState } from "@/lib/dal/admin-moderation";
import { emptyModerationState, type ModerationState } from "../../state";

// SCR-050/052's table — REQ-UIX-103. `data-table` as built: the columns in the artboard's order, the phone stack below
// `md` with every column on the card (wave 6's phone defect: the decision must be on the card). The decision cell is
// `console`'s `DataTableActionPair` — «أزل» opens the dialog, «تجاهل» decides in one press.
//
// ★ «أزل» confirms in `ui/dialog`, naming the session and quoting the comment WHOLE with every report on it, so nobody
// removes on an excerpt (REQ-UIX-013, REQ-ADM-010 «the content in context»). A visible comment needs a reason
// (REQ-EVT-014), said at the field; one its author already deleted needs none — nothing more is written to it.
// ★ The toast fires inside the action, never from an effect: the row leaves the list in the same commit (wave 6 §12).

/** A comment's opening, cut on a grapheme — never by CSS, which would clip tashkeel. */
function excerpt(text: string, max = 60): string {
  const graphemes = [...new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(text.replace(/\s+/g, " ").trim())].map((s) => s.segment);
  return graphemes.length <= max ? graphemes.join("") : `${graphemes.slice(0, max).join("").trimEnd()}…`;
}

function Person({ who, fallback, more = 0 }: { who: ModerationPerson | null; fallback: string; more?: number }) {
  if (!who) return <span>{fallback}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar memberId={who.memberId} displayName={who.name} src={who.avatarUrl} teamColor={who.teamColor} size={24} decorative />
      <bdi>{who.name ?? fallback}</bdi>
      {more > 0 ? <span className="text-caption text-fg-muted">+{formatNumber(more)}</span> : null}
    </span>
  );
}

export function ReportsTable({
  rows,
  state,
  remove,
  dismiss,
}: {
  rows: CommentReportRow[];
  state: ReportState;
  remove: (reportId: string, prev: ModerationState, formData: FormData) => Promise<ModerationState>;
  dismiss: (reportId: string) => Promise<ModerationState>;
}) {
  const t = useTranslations("event.moderation");
  const toast = useToast();
  const [removing, setRemoving] = useState<CommentReportRow | null>(null);

  const age = (days: number) => t("age", { count: days, value: formatNumber(days) });
  const report = (result: ModerationState) => {
    if (result.done) toast.show({ title: t("done"), tone: "success" });
    else if (result.error) toast.show({ title: t(`error.${result.error}`), tone: "error" });
  };

  const columns: DataTableColumn<CommentReportRow>[] = [
    {
      key: "content",
      header: t("col.content"),
      onCard: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/app/sessions/${r.sessionId}#discussion`} className="text-fg-heading underline-offset-4 hover:underline">
            «<bdi>{excerpt(r.body)}</bdi>»
          </Link>
          <span className="text-fg-muted">
            — <bdi>{r.author?.name ?? t("member")}</bdi>
          </span>
          {r.deleted ? (
            <Badge tone="neutral" size="sm">
              {t("deleted")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "session",
      header: t("col.session"),
      onCard: true,
      cell: (r) => <bdi>{r.sessionTitle}</bdi>,
    },
    {
      key: "reporter",
      header: t("col.reporter"),
      onCard: true,
      cell: (r) => <Person who={r.reports[0]?.reporter ?? null} fallback={t("member")} more={r.reports.length - 1} />,
    },
    {
      key: "reason",
      header: t("col.reason"),
      onCard: true,
      cell: (r) => <bdi>{excerpt(r.reports[0]?.reason ?? "", 40)}</bdi>,
    },
  ];

  if (state === "open") {
    columns.push(
      { key: "age", header: t("col.age"), onCard: true, cell: (r) => age(r.ageDays) },
      {
        key: "actions",
        header: t("col.decision"),
        onCard: true,
        cell: (r) => (
          <DataTableActionPair
            rowName={excerpt(r.body, 30)}
            primary={{ label: t("remove"), tone: "danger", onAction: () => setRemoving(r) }}
            secondary={{ label: t("dismiss"), onAction: async () => report(await dismiss(r.reportId)) }}
          />
        ),
      },
    );
  } else {
    columns.push({
      key: "decision",
      header: t("col.decision"),
      onCard: true,
      cell: (r) =>
        r.decision ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-fg-heading">{t(`outcome.${r.decision.outcome === "removed" ? "removed" : "dismissed"}`)}</span>
            <Person who={r.decision.by} fallback={t("member")} />
            <span className="text-caption text-fg-muted">{age(r.decision.ageDays)}</span>
          </span>
        ) : null,
    });
  }

  return (
    <>
      <DataTable
        label={t("tableLabel")}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.commentId}
        hiddenHeaders={state === "open" ? ["actions"] : []}
        empty={
          state === "open"
            ? { title: t("emptyOpen"), action: { label: t("filter.closed"), href: "/app/admin/moderation/reports?state=closed" } }
            : { title: t("emptyClosed"), action: { label: t("filter.open"), href: "/app/admin/moderation/reports" } }
        }
      />
      {removing ? (
        <RemoveDialog
          key={removing.reportId}
          row={removing}
          action={remove.bind(null, removing.reportId)}
          onClose={() => setRemoving(null)}
          report={report}
        />
      ) : null}
    </>
  );
}

function RemoveDialog({
  row,
  action,
  onClose,
  report,
}: {
  row: CommentReportRow;
  action: (prev: ModerationState, formData: FormData) => Promise<ModerationState>;
  onClose: () => void;
  report: (result: ModerationState) => void;
}) {
  const t = useTranslations("event.moderation");
  const reasonId = useId();
  const [state, formAction, pending] = useActionState(async (prev: ModerationState, formData: FormData) => {
    const result = await action(prev, formData);
    // A refusal at the field stays in the dialog; anything else is said once, as a toast.
    if (result.error !== "reason_required") report(result);
    if (result.done || (result.error && result.error !== "reason_required")) onClose();
    return result;
  }, emptyModerationState);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent title={t.rich("removeTitle", { session: row.sessionTitle, t: (chunks) => <bdi>{chunks}</bdi> })} closeLabel={t("close")}>
        <blockquote className="border-s-2 border-edge-strong ps-4 text-body text-fg-heading">
          <bdi>{row.body}</bdi>
          <footer className="mt-1 text-caption text-fg-muted">
            — <bdi>{row.author?.name ?? t("member")}</bdi>
            {row.deleted ? ` · ${t("deleted")}` : null}
          </footer>
        </blockquote>
        <h3 className="mt-4 text-label text-fg-muted">{t("reportedBy")}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {row.reports.map((r, i) => (
            <li key={i} className="flex flex-col gap-0.5 text-body-sm">
              <Person who={r.reporter} fallback={t("member")} />
              <span className="text-fg-body">
                <bdi>{r.reason}</bdi>
              </span>
            </li>
          ))}
        </ul>
        {/* `noValidate` — the app says what is wrong at the field (16 §8.2); the reason is checked again in the
            action and in `resolve_report()`. */}
        <form action={formAction} noValidate className="mt-4">
          {row.deleted ? null : (
            <Field id={reasonId} label={t("reasonLabel")} required error={state.error === "reason_required" ? t("error.reason_required") : undefined}>
              <Textarea name="reason" rows={3} maxLength={300} />
            </Field>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" variant="danger" pending={pending} disabled={pending}>
              {t("confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("cancel")}
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
