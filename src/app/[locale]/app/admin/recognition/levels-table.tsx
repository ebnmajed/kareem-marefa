"use client";

import { useTranslations } from "next-intl";
import { RowEditDialog } from "@/components/admin/row-edit-dialog";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { formatNumber } from "@/components/sessions/numerals";
import type { DataTableColumn } from "@/components/ui";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { LevelRow } from "@/lib/dal/scoring-admin";

// SCR-054's levels — REQ-REC-003: Arabic titles and point thresholds,
// org-editable. The title was not editable, and a threshold equal to another
// level's failed as «تعذّر الحفظ». Both are said at the field now, and so is a
// threshold that would put a level below the one before it.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const plain = (chunks: string) => chunks;

export function LevelsTable({ levels, action }: { levels: LevelRow[]; action: Action }) {
  const t = useTranslations("recognition.admin");
  const columns: DataTableColumn<LevelRow>[] = [
    {
      key: "level",
      header: t("levels.colLevel"),
      onCard: true,
      cell: (l) => (
        <p className="text-label text-fg-heading">
          <bdi>{l.name}</bdi>
        </p>
      ),
    },
    {
      key: "threshold",
      header: t("levels.colThreshold"),
      onCard: true,
      cell: (l) => (l.thresholdPoints === 0 ? <span>{t("levels.fromStart")}</span> : <span>{t.rich("levels.threshold", { count: l.thresholdPoints, value: formatNumber(l.thresholdPoints), bdi })}</span>),
    },
    { key: "edit", header: t("badges.colActions"), onCard: true, cell: (l) => <LevelDialog level={l} action={action} /> },
  ];
  return (
    <DataTable
      label={t("levels.listLabel")}
      columns={columns}
      rows={levels}
      rowKey={(l) => l.id}
      empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }}
    />
  );
}

function LevelDialog({ level, action }: { level: LevelRow; action: Action }) {
  const t = useTranslations("recognition.admin");
  const prefix = `level-${level.id}`;
  const labels: Record<string, string> = { name: t("levels.nameLabel"), thresholdPoints: t("levels.thresholdLabel") };
  return (
    <RowEditDialog
      triggerLabel={t("common.edit")}
      triggerName={t.markup("common.editName", { name: level.name, bdi: plain })}
      title={t.rich("levels.editTitle", { name: level.name, bdi })}
      description={t("levels.note")}
      closeLabel={t("common.close")}
      action={action}
      emptyState={emptySavedState()}
      savedToast={t("common.saved")}
      failedMessage={(key) => t(`levels.errors.${key}`)}
      summaryTitle={t("common.summaryTitle")}
      summary={(state) => summaryErrors(state, { fields: ["name", "thresholdPoints"], label: (f) => labels[f], message: (key) => t(`levels.errors.${key}`), fieldId: (f) => `${prefix}-${f}` })}
      submitLabel={t("common.save")}
      pendingLabel={t("common.saving")}
      cancelLabel={t("common.cancel")}
    >
      {(state) => {
        const attempted = hasAttempted(state);
        const err = (field: string) => (state.errors[field] ? t(`levels.errors.${state.errors[field]}`) : undefined);
        return (
          <>
            <input type="hidden" name="levelId" value={level.id} />
            <Field id={`${prefix}-name`} label={labels.name} required error={err("name")}>
              <Input name="name" maxLength={60} defaultValue={attempted ? was(state, "name") : level.name} />
            </Field>
            <Field id={`${prefix}-thresholdPoints`} label={labels.thresholdPoints} hint={t("levels.thresholdHint")} required error={err("thresholdPoints")}>
              <Input
                name="thresholdPoints"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                dir="ltr"
                className="w-36 text-center"
                defaultValue={attempted ? was(state, "thresholdPoints") : String(level.thresholdPoints)}
              />
            </Field>
          </>
        );
      }}
    </RowEditDialog>
  );
}
