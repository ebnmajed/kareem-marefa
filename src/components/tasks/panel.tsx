import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getTasksPageData } from "@/lib/dal/tasks";
import { formatNumber } from "@/components/sessions/numerals";
import { TaskItem } from "@/components/tasks/task-item";
import { CreateTaskForm } from "@/components/tasks/create-form";

// The `Tasks` slot (TEAM.md §2 / DEC-046) — REQ-TSK-001 … REQ-TSK-005. No
// <section>/<h2> of its own (the event page owns the landmark and the
// heading, same convention as `Materials`/`Photos`). REQ-TSK-002 is the
// invariant this whole track rests on: nothing here is ever read by a
// check-in path or the scoring catalogue — a task's completion state is
// purely a reminder for the member who set it.
export async function Tasks({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("tasks.list");
  const { tasks, canManage, materials } = await getTasksPageData(locale, sessionId);
  const completedCount = tasks.filter((task) => task.completed).length;

  return (
    <div>
      {tasks.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <>
          <p className="text-body-sm text-fg-muted">{t("count", { count: tasks.length, value: formatNumber(tasks.length) })}</p>
          {completedCount > 0 ? (
            <p className="text-body-sm text-fg-muted">{t.rich("completedOf", { value: formatNumber(completedCount), bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
          ) : null}
          <ul className="mt-4 flex flex-col gap-3">
            {tasks.map((task) => (
              <TaskItem key={task.id} locale={locale} sessionId={sessionId} task={task} />
            ))}
          </ul>
        </>
      )}

      {canManage ? <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} /> : null}
    </div>
  );
}
