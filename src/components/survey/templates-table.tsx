"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import type { SurveyQuestionKind } from "@/lib/dal/surveys";

// SCR-065's two tables (REQ-UIX-106, `AdminSurveys.dc.html`) — the templates, and the selected one's questions beside
// them. A client island only because `ui/data-table` takes render functions (DEC-159); the page reads the data and
// hands it over plain, and nothing here writes.
//
// ★ SELECTION IS A LINK, not state: the template's name goes to `?template=<id>`, so the questions beside the list are
// read on the server, survive a reload and work without JS. The selected row's link says so (`aria-current`).
//
// ★ The row's ⋯ holds the two moves the list does not show: «عدّل» opens the editor (kept untouched, DEC-232), and
// «احذف القالب» opens the page's own two-step confirmation (`?delete=<id>`), which a server form completes — so a
// deletion is asked twice and is still a form without JS. Every count is `<bdi>`, Western (DEC-124). Both tables stack
// below `md`, as `data-table` is built (DEC-232 §6.6).

export interface TemplateRow {
  id: string;
  title: string;
  questionCount: number;
  sessionCount: number;
}

export interface TemplateQuestionRow {
  id: string;
  prompt: string;
  kind: SurveyQuestionKind;
  required: boolean;
}

/** REQ-SUR-002's names for the four types — the editor's own keys, so the two screens never disagree. */
const KIND_KEYS: Record<SurveyQuestionKind, string> = {
  scale_1_5: "kindScale",
  single_choice: "kindSingle",
  multi_choice: "kindMulti",
  free_text: "kindText",
};

export function TemplatesTable({ rows, selectedId }: { rows: TemplateRow[]; selectedId: string | null }) {
  const t = useTranslations("survey.templates");

  const columns: DataTableColumn<TemplateRow>[] = [
    {
      key: "title",
      header: t("colTemplate"),
      cell: (row) => (
        <Link
          href={`/app/admin/surveys?template=${row.id}`}
          aria-current={row.id === selectedId ? "true" : undefined}
          className={row.id === selectedId ? "font-medium text-fg-heading underline underline-offset-4" : "text-fg-heading"}
        >
          <bdi>{row.title}</bdi>
        </Link>
      ),
    },
    { key: "questions", header: t("colQuestions"), cell: (row) => <bdi>{formatNumber(row.questionCount)}</bdi>, onCard: true },
    { key: "sessions", header: t("colSessions"), cell: (row) => <bdi>{formatNumber(row.sessionCount)}</bdi>, onCard: true },
    {
      key: "actions",
      header: t("colActions"),
      align: "end",
      onCard: true,
      cell: (row) => (
        <Menu
          align="end"
          trigger={
            <IconButton label={t("rowActions", { title: row.title })} size="sm">
              <MoreIcon />
            </IconButton>
          }
          items={[
            { label: t("edit"), href: `/app/admin/surveys/${row.id}` },
            { label: t("delete"), href: `/app/admin/surveys?template=${row.id}&delete=${row.id}`, tone: "error" },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      label={t("tableLabel")}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      hiddenHeaders={["actions"]}
      empty={{ title: t("emptyTitle"), action: { label: t("new"), href: "/app/admin/surveys/new" } }}
    />
  );
}

export function TemplateQuestionsTable({ templateId, title, rows }: { templateId: string; title: string; rows: TemplateQuestionRow[] }) {
  const t = useTranslations("survey.templates");
  const tKind = useTranslations("survey.editor");
  const tErrors = useTranslations("survey.errors");

  const columns: DataTableColumn<TemplateQuestionRow>[] = [
    { key: "prompt", header: t("colQuestion"), cell: (row) => <bdi>{row.prompt}</bdi> },
    { key: "kind", header: t("colKind"), cell: (row) => tKind(KIND_KEYS[row.kind]), onCard: true },
    { key: "required", header: t("colRequired"), cell: (row) => (row.required ? t("yes") : t("no")), onCard: true },
  ];

  return (
    <DataTable
      label={t("questionsTable", { title })}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      // A template is never saved without a question (`survey_template_save()` refuses `empty`); this is the type's.
      empty={{ title: tErrors("template_empty"), action: { label: t("edit"), href: `/app/admin/surveys/${templateId}` } }}
    />
  );
}
