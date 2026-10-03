import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { splitDuration } from "@/components/admin/duration";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { getLastSave } from "@/lib/dal/admin-settings";
import { getNotificationMatrix, getReminderSchedule } from "@/lib/dal/notifications";
import { saveReminderSchedule } from "./actions";
import { RemindersEdit, type EditRow } from "./reminders-edit";
import { RemindersTable, type ReadRow } from "./reminders-table";
import { REMINDER_FIELDS, REMINDER_ROWS, UNITS, viewOf } from "./rows";

// SCR-060 · /app/admin/reminders — written from `AdminReminders.dc.html` (`REQ-UIX-097`, `STORY-UIX-087`) after the
// old page was deleted (`DEC-208`); kept-behaviour table R1 – R20 with N11's deltas in notes/notify.md.
//
// ★ READ BY DEFAULT (`REQ-UIX-091`): the h1 row with «عدّل», the saved mark, one table — reminder · timing · channel ·
// on. «عدّل» is a link to `?edit`, so it works before and without hydration; edit mode is the same table, editable,
// and nothing is written until «احفظ».
// ★ The set is the artboard's, as the owner ruled (`DEC-232` §1.3): three fixed rows and the rating prompt; any other
// stored offset is shown read-only below them, so nothing stored is hidden (`rows.ts`).
// ★ The channel column is READ from `notification_matrix()` — `08` §1's, not the org's (R-D3: the matrix wins).
// ★ The saved mark is the history row the last save wrote, with its time and actor — never the client's clock.
//
// Admin only: `getReminderSchedule()` answers null for anyone else and the page answers with the streamed not-found
// (`DEC-134`); a moderator never reaches it (`REQ-ADM-020`), and `p2_admin_update` refuses the write regardless.

const REMINDER_KEY: Record<(typeof REMINDER_ROWS)[number]["key"], string> = {
  week: "MSG-reminder_7d",
  day: "MSG-reminder_1d",
  hours: "MSG-reminder_2h",
};

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export default async function RemindersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, schedule, sp] = await Promise.all([getTranslations("notifications.admin.reminders"), getReminderSchedule(locale), searchParams]);
  if (!schedule) notFound();
  const [matrix, mark] = await Promise.all([getNotificationMatrix(locale), getLastSave(locale, REMINDER_FIELDS)]);

  const channelsOf = (key: string) => {
    const row = matrix.find((m) => m.key === key);
    if (!row) return "";
    return [row.inApp ? t("channel.inApp") : null, row.email ? t("channel.email") : null].filter(Boolean).join(" · ");
  };
  const before = (minutes: number) => {
    const { amount, unit } = splitDuration(minutes, "minutes", UNITS);
    return t.rich(`timing.${unit}`, { count: amount, value: formatNumber(amount), bdi });
  };
  const after = (minutes: number) => {
    if (minutes === 0) return t("after.now");
    const { amount, unit } = splitDuration(minutes, "minutes", UNITS);
    return t.rich(`after.${unit}`, { count: amount, value: formatNumber(amount), bdi });
  };
  const state = (on: boolean) => (on ? t("state.on") : t("state.off"));

  const view = viewOf(schedule.offsetsMinutes);
  const fixed: ReadRow[] = REMINDER_ROWS.map((row) => {
    const minutes = view.rows[row.key];
    return {
      id: row.key,
      reminder: t("rows.before"),
      timing: minutes === null ? before(row.exact) : before(minutes),
      channels: channelsOf(REMINDER_KEY[row.key]),
      on: minutes !== null,
      enabled: state(minutes !== null),
    };
  });
  const prompt: ReadRow = {
    id: "prompt",
    reminder: t("rows.prompt"),
    timing: after(schedule.ratingPromptDelayMinutes),
    channels: channelsOf("MSG-rating_prompt"),
    on: true,
    enabled: state(true),
  };
  const others: ReadRow[] = view.others.map((minutes) => ({
    id: `other-${minutes}`,
    reminder: t("rows.other"),
    timing: (
      <>
        {before(minutes)} · {t("generic")}
      </>
    ),
    channels: channelsOf("MSG-reminder_generic"),
    on: true,
    enabled: state(true),
  }));

  const editing = sp.edit !== undefined;
  const markLine = mark
    ? mark.actor?.displayName
      ? t.rich("savedMarkBy", { time: formatDateTime(mark.at, mark.timeZone, locale), actor: mark.actor.displayName, bdi })
      : t.rich("savedMark", { time: formatDateTime(mark.at, mark.timeZone, locale), bdi })
    : null;

  if (editing) {
    const rows: EditRow[] = REMINDER_ROWS.map((row, i) => ({
      key: row.key,
      name: t(`names.${row.key}`),
      reminder: t("rows.before"),
      minutes: view.rows[row.key] ?? row.exact,
      on: view.rows[row.key] !== null,
      channels: fixed[i].channels,
    }));
    return (
      <>
        <PageHeader inlineActions title={t("title")} />
        <RemindersEdit
          action={saveReminderSchedule.bind(null, locale as Locale)}
          rows={rows}
          promptMinutes={schedule.ratingPromptDelayMinutes}
          promptChannels={prompt.channels}
          others={others}
          opened={{ offsets: schedule.offsetsMinutes, prompt: schedule.ratingPromptDelayMinutes }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href="/app/admin/reminders?edit" size="md">
            {t("edit")}
          </ButtonLink>
        }
      />
      {markLine ? <p className="mt-2 text-caption text-fg-muted">{markLine}</p> : null}
      <RemindersTable rows={[...fixed, prompt, ...others]} />
    </>
  );
}
