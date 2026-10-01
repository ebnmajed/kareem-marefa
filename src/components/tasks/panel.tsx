import { getTranslations } from "next-intl/server";
import type { RescopeOption } from "@/components/materials/rescope-chip";
import { dayLabel, dayShortLabel } from "@/components/sessions/day-label";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { CreateTaskForm } from "@/components/tasks/create-form";
import { GroupDisclosure } from "@/components/tasks/group-disclosure";
import { TaskRow } from "@/components/tasks/task-row";
import { getTasksPageData } from "@/lib/dal/tasks";

// The `Tasks` slot — SCR-012's «المهام التحضيرية», written from `Event.dc.html:87-91` and
// `EventDesktop.dc.html:76-79` (DEC-208: deleted and written anew; DEC-209 made it `content`'s with the others).
// REQ-TSK-001 … REQ-TSK-004. Its kept-behaviour table is `docs/plan/notes/content.md` § PR B, tasks.
//
// ★ No `<section>`, no `<h2>` — and not the heading row's «0 من 2، تذكير فقط» either: that is the page's, from
// `tasksSummary()` (`count`, `outstanding`). ★ `null` exactly when `tasksSummary()` says not visible.
// ★ REQ-TSK-002: nothing here is read by a check-in or the scoring catalogue.
// ★ At one day (or none) every task is flat; groups exist only above one day, each with its own add control.

export async function Tasks({ sessionId, locale }: SlotProps) {
  const [t, tCreate, tDays] = await Promise.all([getTranslations("tasks.list"), getTranslations("tasks.create"), getTranslations("sessions.days")]);
  const { tasks, canManage, materials, days: rawDays, timeZone } = await getTasksPageData(locale, sessionId);
  const days = rawDays ?? [];
  if (tasks.length === 0 && !canManage) return null;

  if (days.length <= 1) {
    return (
      <div className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <p className="text-body text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskRow key={task.id} locale={locale} sessionId={sessionId} task={task} />
            ))}
          </ul>
        )}
        {canManage ? (
          <div id="tasks-create-form" className="scroll-mt-4">
            <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} />
          </div>
        ) : null}
      </div>
    );
  }

  const sessionScope = tDays("sessionScope");
  const options: RescopeOption[] = [{ id: null, label: sessionScope }, ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) }))];
  const groups = [
    { dayId: null as string | null, heading: sessionScope, short: sessionScope, items: tasks.filter((x) => (x.sessionDayId ?? null) === null) },
    ...days.map((d) => ({ dayId: d.id as string | null, heading: dayLabel(d, timeZone ?? "Asia/Riyadh", tDays, locale), short: dayShortLabel(d, tDays), items: tasks.filter((x) => x.sessionDayId === d.id) })),
  ].filter((g) => g.items.length > 0 || canManage);

  return (
    <div className="flex flex-col gap-6">
      {tasks.length === 0 ? <p className="text-body text-fg-muted">{t("empty")}</p> : null}
      {groups.map((g) => (
        <div key={g.dayId ?? "session"} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-label font-bold text-fg-heading">{g.heading}</h3>
            {canManage ? (
              <GroupDisclosure summary={tCreate("submit")} summaryAriaLabel={t.markup("group.addAria", { scope: g.short, bdi: (chunks) => chunks })}>
                <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} sessionDayId={g.dayId} />
              </GroupDisclosure>
            ) : null}
          </div>
          {g.items.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {g.items.map((task) => (
                <TaskRow key={task.id} locale={locale} sessionId={sessionId} task={task} scope={canManage ? { currentLabel: g.short, options } : null} />
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** The page's gate, the heading row's «N من M» and the action card's «المهام التحضيرية (N)» — one `cache()`d read. */
export async function tasksSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { tasks, canManage } = await getTasksPageData(locale, sessionId);
  return { visible: tasks.length > 0 || canManage, count: tasks.length, outstanding: tasks.filter((x) => !x.completed).length };
}
