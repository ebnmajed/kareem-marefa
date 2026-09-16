import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getTasksPageData } from "@/lib/dal/tasks";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskItem } from "@/components/tasks/task-item";
import { CreateTaskForm } from "@/components/tasks/create-form";

// The `Tasks` slot — `id="tasks"`, «مهام ما قبل الجلسة» (`sessions.md`
// §22.2) — REQ-TSK-001 … REQ-TSK-005. No <section>/<h2> of its own (the
// event page owns the landmark and the heading, same convention as
// `Materials`/`Photos`/`Comments`). REQ-TSK-002 is the invariant this whole
// track rests on: nothing here is ever read by a check-in path or the
// scoring catalogue — a task's completion state is purely a reminder for
// the member who set it.
//
// ★ Wave 6 (`content.md`): brought onto the system only as far as the
// rebuilt event page needs it not to look broken next to its now-rebuilt
// siblings — the summary reader `tasksSummary()` the page contract
// requires, and `EmptyState` in place of a bare paragraph, matching
// `Materials`/`Photos`. `TaskItem` and `CreateTaskForm` are untouched — no
// new behaviour.
export async function Tasks({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("tasks.list");
  const tCreate = await getTranslations("tasks.create");
  const { tasks, canManage, materials } = await getTasksPageData(locale, sessionId);
  const completedCount = tasks.filter((task) => task.completed).length;

  // ★ visible === false exactly when this returns null (sessions.md §22.4):
  // nothing to show and no manage right, so there is no next action
  // `EmptyState` could honestly offer this viewer.
  if (tasks.length === 0 && !canManage) return null;

  const creator = canManage ? (
    <div id="tasks-create-form" className="scroll-mt-4">
      <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} />
    </div>
  ) : null;

  if (tasks.length === 0) {
    return (
      <div>
        <EmptyState title={t("empty")} action={{ label: tCreate("submit"), href: "#tasks-create-form" }} size="sm" />
        {creator}
      </div>
    );
  }

  return (
    <div>
      <p className="text-body-sm text-fg-muted">{t("count", { count: tasks.length, value: formatNumber(tasks.length) })}</p>
      {completedCount > 0 ? (
        <p className="text-body-sm text-fg-muted">{t.rich("completedOf", { value: formatNumber(completedCount), bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
      ) : null}
      <ul className="mt-4 flex flex-col gap-3">
        {tasks.map((task) => (
          <TaskItem key={task.id} locale={locale} sessionId={sessionId} task={task} />
        ))}
      </ul>
      {creator}
    </div>
  );
}

/**
 * `sessions.md` §22.3's `SlotSummaryReader` — shares `getTasksPageData`'s
 * `cache()`d read. `outstanding`: this viewer's own not-yet-completed count
 * — the action card's «المهام التحضيرية (N)» (§23.2) reads it, `null`
 * everywhere except this one slot.
 */
export async function tasksSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { tasks, canManage } = await getTasksPageData(locale, sessionId);
  const outstanding = tasks.filter((task) => !task.completed).length;
  return { visible: tasks.length > 0 || canManage, count: tasks.length, outstanding };
}
