import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getReminderSchedule } from "@/lib/dal/notifications";
import { saveReminderSchedule } from "./actions";

// /app/admin/reminders — REQ-ADM-016, REQ-NTF-004, A19.
//
// Owned by `notify` for wave 2, handed to `console` at wave 3 — the same
// carve-out DEC-042 made for `sessions` and the M2 admin screens.
//
// The screen says the thing that is easy to disbelieve: changing this MOVES
// pending reminders rather than duplicating them. It is true because the key
// is the mechanism (08 §4.1) and because `org_settings_reschedule` cancels
// the offsets the org abandoned, which no key-based replace could reach.

const field = "mt-1 block h-12 w-full rounded-field border border-edge-strong bg-canvas px-4 text-body text-fg-heading";

export default async function RemindersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { saved, error } = await searchParams;

  const [t, schedule] = await Promise.all([getTranslations("notifications.admin.reminders"), getReminderSchedule(locale)]);
  if (!schedule) notFound();

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{t("intro")}</p>

      {saved ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("saved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t("error")}
        </p>
      ) : null}

      <form action={saveReminderSchedule} className="mt-8 max-w-xl space-y-5">
        <div>
          <label htmlFor="offsets" className="text-label text-fg-heading">
            {t("offsets")}
          </label>
          {/* `dir="ltr"` on the input alone: a comma-separated list of digits
              reads left to right inside a right-to-left page, and letting it
              inherit puts the commas in the wrong places visually. */}
          <input
            id="offsets"
            name="offsets"
            required
            dir="ltr"
            inputMode="numeric"
            defaultValue={schedule.offsetsMinutes.join(", ")}
            className={`${field} text-start`}
            aria-describedby="offsets-hint"
          />
          <p id="offsets-hint" className="mt-1 text-body-sm text-fg-muted">
            {t("offsetsHint")}
          </p>
        </div>
        <div>
          <label htmlFor="promptDelay" className="text-label text-fg-heading">
            {t("promptDelay")}
          </label>
          <input
            id="promptDelay"
            name="promptDelay"
            required
            dir="ltr"
            inputMode="numeric"
            defaultValue={String(schedule.ratingPromptDelayMinutes)}
            className={`${field} text-start`}
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-12 items-center rounded-field bg-[var(--btn-bg)] px-7 text-label text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
        >
          {t("save")}
        </button>
      </form>
    </>
  );
}
