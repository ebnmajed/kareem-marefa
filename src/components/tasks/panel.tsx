import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getTasksPageData, type TaskSummary } from "@/lib/dal/tasks";
import type { SessionDay } from "@/lib/dal/sessions";
import { dayLabel, dayShortLabel, type DayLabelT } from "@/components/sessions/day-label";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskItem } from "@/components/tasks/task-item";
import { CreateTaskForm } from "@/components/tasks/create-form";
import type { RescopeOption } from "@/components/materials/rescope-chip";
import { GroupDisclosure } from "@/components/tasks/group-disclosure";

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
//
// ★ REQ-SES-018/DEC-121, contract 7 — the branch below is `days.length <= 1`,
// never bucket emptiness; see `materials/list.tsx`'s own header comment for
// why (the sync-1 finding this file applies too).
export async function Tasks({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("tasks.list");
  const tCreate = await getTranslations("tasks.create");
  const tDays = await getTranslations("sessions.days");
  const { tasks, canManage, materials, days: rawDays, timeZone } = await getTasksPageData(locale, sessionId);
  const days = rawDays ?? [];
  const completedCount = tasks.filter((task) => task.completed).length;

  // ★ visible === false exactly when this returns null (sessions.md §22.4):
  // nothing to show and no manage right, so there is no next action
  // `EmptyState` could honestly offer this viewer.
  if (tasks.length === 0 && !canManage) return null;

  // ★ REQ-SES-018/DEC-121 — the lead's real-build finding on the wave's demonstrable, met by
  // starting from an empty session the way a person actually does: this used to return the FLAT
  // empty state whenever there was nothing yet, even at `days.length > 1` — a brand-new workshop's
  // manager had no group header to press, so the very first task could only ever land
  // session-scoped (ruling 3's "pressing the control is the choice" has nothing to press when the
  // only control is the flat one) — `materials/list.tsx`'s own twin defect, same fix. Gated on
  // `days.length <= 1` too, matching the flat/grouped split below. A manager with nothing yet at
  // `days.length > 1` falls through to the grouped branch, whose own group filter already keeps
  // every (empty) group for a manager.
  if (tasks.length === 0 && days.length <= 1) {
    const creator = canManage ? (
      <div id="tasks-create-form" className="scroll-mt-4">
        <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} />
      </div>
    ) : null;
    return (
      <div>
        <EmptyState title={t("empty")} action={{ label: tCreate("submit"), href: "#tasks-create-form" }} size="sm" />
        {creator}
      </div>
    );
  }

  if (days.length <= 1) {
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
        {canManage ? (
          <div id="tasks-create-form" className="mt-4 scroll-mt-4">
            <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} />
          </div>
        ) : null}
      </div>
    );
  }

  const sessionScopeLabel = tDays("sessionScope");
  const groups = groupByDay(tasks, days, sessionScopeLabel, timeZone ?? "Asia/Riyadh", tDays);
  const options: RescopeOption[] = [
    { id: null, label: sessionScopeLabel },
    ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) })),
  ];

  return (
    <div>
      {/* ★ A brand-new workshop reaches here too now (the fix above) — one line saying so, the
          same sentence the flat empty state uses, above every (closed, empty) group's own header
          and control. Never `ui/empty-state`: its `action` is required by design (REQ-UIX-012 —
          no "empty, full stop"), and there is no single action here any more, only each group's
          own. */}
      {tasks.length === 0 ? <p className="text-body-sm text-fg-muted">{t("empty")}</p> : null}
      {groups
        .filter((g) => g.items.length > 0 || canManage)
        .map((g) => (
          <div key={g.dayId ?? "session"} className="mt-6 first:mt-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-body font-medium text-fg-heading">{g.heading}</h3>
              {/* ★ The lead's finding against the real build: every group's form mounting OPEN
                  made a three-day presenter page 9,000 CSS px tall. Behind a native disclosure,
                  closed by default — `GroupDisclosure`'s own header explains the mechanics. */}
              {canManage ? (
                <GroupDisclosure summary={tCreate("submit")} summaryAriaLabel={t.markup("group.addAria", { scope: g.shortLabel, bdi: (chunks) => chunks })}>
                  <CreateTaskForm locale={locale} sessionId={sessionId} materials={materials} sessionDayId={g.dayId} />
                </GroupDisclosure>
              ) : null}
            </div>
            {g.items.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-3">
                {g.items.map((task) => (
                  <TaskItem key={task.id} locale={locale} sessionId={sessionId} task={task} scope={canManage ? { currentLabel: g.shortLabel, options } : null} />
                ))}
              </ul>
            ) : null}
          </div>
        ))}
    </div>
  );
}

interface TaskGroup {
  dayId: string | null;
  heading: string;
  shortLabel: string;
  items: TaskSummary[];
}

function groupByDay(tasks: TaskSummary[], days: SessionDay[], sessionScopeLabel: string, timeZone: string, tDays: DayLabelT): TaskGroup[] {
  return [
    { dayId: null, heading: sessionScopeLabel, shortLabel: sessionScopeLabel, items: tasks.filter((t) => (t.sessionDayId ?? null) === null) },
    ...days.map((d) => ({
      dayId: d.id,
      heading: dayLabel(d, timeZone, tDays),
      shortLabel: dayShortLabel(d, tDays),
      items: tasks.filter((t) => t.sessionDayId === d.id),
    })),
  ];
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
