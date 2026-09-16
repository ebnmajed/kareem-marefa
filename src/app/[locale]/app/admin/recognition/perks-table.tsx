"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RowEditDialog } from "@/components/admin/row-edit-dialog";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { DataTableColumn } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertCircleIcon } from "@/components/ui/icons";
import { hasAttempted, was } from "@/lib/form-state";
import type { BadgeRow, LevelRow, PerkRow } from "@/lib/dal/scoring-admin";

// SCR-054's perks — REQ-REC-006: «a ميزة is granted by reaching a مستوى or
// holding a شارة. Configurable.» — and REQ-REC-008's gate on hosting. The
// qualifying level or badge was read-only; it is chosen here now, and the
// hosting gate keeps its warning, because turning it on stops members from
// proposing.

type Action = (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
const plain = (chunks: string) => chunks;

export function PerksTable({ perks, levels, badges, action }: { perks: PerkRow[]; levels: LevelRow[]; badges: BadgeRow[]; action: Action }) {
  const t = useTranslations("recognition.admin");
  const columns: DataTableColumn<PerkRow>[] = [
    {
      key: "perk",
      header: t("perks.colPerk"),
      onCard: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="text-label text-fg-heading">{t(`perks.${p.key}`)}</p>
          {p.key === "can_host" ? <p className="mt-0.5 text-caption text-fg-muted">{t("perks.canHostWarning")}</p> : null}
        </div>
      ),
    },
    {
      key: "qualifier",
      header: t("perks.colQualifier"),
      onCard: true,
      cell: (p) =>
        p.requiredLevelName ? (
          <span>{t.rich("perks.atLevel", { name: p.requiredLevelName, bdi })}</span>
        ) : p.requiredBadgeName ? (
          <span>{t.rich("perks.withBadge", { name: p.requiredBadgeName, bdi })}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: "status",
      header: t("perks.colStatus"),
      onCard: true,
      cell: (p) => (p.enabled ? <Badge size="sm" tone="success">{t("common.enabled")}</Badge> : <Badge size="sm" tone="neutral" outline>{t("common.disabled")}</Badge>),
    },
    { key: "edit", header: t("badges.colActions"), onCard: true, cell: (p) => <PerkDialog perk={p} levels={levels} badges={badges} action={action} /> },
  ];
  return (
    <DataTable
      label={t("perks.listLabel")}
      columns={columns}
      rows={perks}
      rowKey={(p) => p.id}
      empty={{ title: t("common.empty"), action: { label: t("common.reload"), href: "/app/admin/recognition" } }}
    />
  );
}

function PerkDialog({ perk, levels, badges, action }: { perk: PerkRow; levels: LevelRow[]; badges: BadgeRow[]; action: Action }) {
  const t = useTranslations("recognition.admin");
  const name = t(`perks.${perk.key}`);
  return (
    <RowEditDialog
      triggerLabel={t("common.edit")}
      triggerName={t.markup("common.editName", { name, bdi: plain })}
      title={t.rich("perks.editTitle", { name, bdi })}
      description={perk.key === "can_host" ? t("perks.canHostWarning") : undefined}
      closeLabel={t("common.close")}
      action={action}
      emptyState={emptySavedState()}
      savedToast={t("common.saved")}
      failedMessage={(key) => t(`perks.errors.${key}`)}
      summaryTitle={t("common.summaryTitle")}
      summary={(state) => (state.errors.qualifier ? [{ fieldId: "qualifier", label: t("perks.qualifierLegend"), message: t(`perks.errors.${state.errors.qualifier}`) }] : [])}
      submitLabel={t("common.save")}
      pendingLabel={t("common.saving")}
      cancelLabel={t("common.cancel")}
    >
      {(state) => <PerkFields state={state} perk={perk} levels={levels} badges={badges} />}
    </RowEditDialog>
  );
}

function PerkFields({ state, perk, levels, badges }: { state: SavedFormState; perk: PerkRow; levels: LevelRow[]; badges: BadgeRow[] }) {
  const t = useTranslations("recognition.admin.perks");
  const attempted = hasAttempted(state);
  const [qualifier, setQualifier] = useState<"level" | "badge">((attempted ? was(state, "qualifier") : perk.requiredBadgeId ? "badge" : "level") === "badge" ? "badge" : "level");
  const prefix = `perk-${perk.id}`;
  return (
    <>
      <input type="hidden" name="perkId" value={perk.id} />
      <Switch name="enabled" label={t("enabledLabel")} defaultChecked={attempted ? was(state, "enabled") === "on" : perk.enabled} />
      <RadioGroup
        name="qualifier"
        legend={t("qualifierLegend")}
        // Uncontrolled on purpose: React keeps a radio's default in step with
        // `defaultValue`, so the reset after a refused save restores the
        // choice; a controlled `value` would reset to the one it mounted with.
        defaultValue={qualifier}
        onChange={(value) => setQualifier(value === "badge" ? "badge" : "level")}
        invalid={Boolean(state.errors.qualifier)}
        options={[
          { value: "level", label: t("byLevel") },
          { value: "badge", label: t("byBadge") },
        ]}
      />
      {qualifier === "level" ? (
        <Field id={`${prefix}-level`} label={t("levelLabel")} required>
          <Select name="levelId" defaultValue={attempted ? was(state, "levelId") : (perk.requiredLevelId ?? "")}>
            <option value="">{t("choose")}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field id={`${prefix}-badge`} label={t("badgeLabel")} required>
          <Select name="badgeId" defaultValue={attempted ? was(state, "badgeId") : (perk.requiredBadgeId ?? "")}>
            <option value="">{t("choose")}</option>
            {badges
              .filter((b) => b.retiredAt === null || b.id === perk.requiredBadgeId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      {state.errors.qualifier ? (
        <p className="flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{t(`errors.${state.errors.qualifier}`)}</span>
        </p>
      ) : null}
    </>
  );
}
