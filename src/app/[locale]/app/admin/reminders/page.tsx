import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { splitDuration } from "@/components/admin/duration";
import { formatNumber } from "@/components/sessions/numerals";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { Locale } from "@/i18n/routing";
import { getReminderSchedule } from "@/lib/dal/notifications";
import { saveReminderSchedule } from "./actions";
import { RemindersForm } from "./reminders-form";

// SCR-060 · /app/admin/reminders — REQ-ADM-016, REQ-NTF-004, A19. Admin only:
// `getReminderSchedule()` answers null for anyone else and the page answers
// with the streamed not-found (`DEC-134`); a moderator never reaches it
// (`REQ-ADM-020`), and `p2_admin_update` refuses the write regardless.
//
// The screen says the thing that is easy to disbelieve: changing this MOVES
// pending reminders rather than duplicating them. It is true because the key
// is the mechanism (08 §4.1) and because `org_settings_reschedule` cancels the
// offsets the org abandoned, which no key-based replace could reach.
//
// ★ Wave 8 (`DEC-147`): on the M9 system and the form model. The offsets are
// rows of a number and a unit, each refused at its own row; «الجدول الحالي»
// says the stored schedule in words, which is what a list of minutes never did.

const UNITS = ["minutes", "hours", "days"] as const;
const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

export default async function RemindersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, schedule] = await Promise.all([getTranslations("notifications.admin.reminders"), getReminderSchedule(locale)]);
  if (!schedule) notFound();

  const offsets = [...schedule.offsetsMinutes].sort((a, b) => b - a);
  const prompt = splitDuration(schedule.ratingPromptDelayMinutes, "minutes", UNITS);

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      <Panel className="mt-6 max-w-2xl">
        <h2 className="text-label text-fg-heading">{t("currentTitle")}</h2>
        <ul className="mt-2 space-y-1 text-body text-fg-body">
          {offsets.map((minutes) => {
            const { amount, unit } = splitDuration(minutes, "minutes", UNITS);
            return <li key={minutes}>{t.rich(`before.${unit}`, { count: amount, value: formatNumber(amount), bdi })}</li>;
          })}
          <li>
            {schedule.ratingPromptDelayMinutes === 0
              ? t("promptImmediate")
              : t.rich(`promptAfter.${prompt.unit}`, { count: prompt.amount, value: formatNumber(prompt.amount), bdi })}
          </li>
        </ul>
      </Panel>

      <RemindersForm action={saveReminderSchedule.bind(null, locale as Locale)} offsetsMinutes={offsets} promptMinutes={schedule.ratingPromptDelayMinutes} />
    </>
  );
}
