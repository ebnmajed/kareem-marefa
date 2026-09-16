import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { PointsHistoryList } from "@/components/scoring/points-history-list";
import { PointsCatalogue } from "@/components/scoring/points-catalogue";
import { getPointsHistory } from "@/lib/dal/points";

// SCR-022 · /app/me/points — the member's full points history (REQ-PTS-003,
// `05` §8). The whole point of this screen: a member can explain every
// point they hold without asking anyone. Filterable by session and by
// month (`05` §8); both filters are plain GET params, so the filtered view
// is a real, shareable URL rather than client-only state.
//
// ★ `checkin`'s REQ-CHK-017 reversal needs no new read here: `getPointsHistory()`
// already flags `source = 'reversal'` generically (it was built for
// REQ-PTS-013's content-removal reversal), and `PointsHistoryList` already
// renders that row's own `reason` with a tag beside it. Once the removal RPC
// writes that source literal, this screen already renders it correctly.
export default async function PointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session?: string; month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { session: sessionId, month } = await searchParams;

  const [t, history] = await Promise.all([getTranslations("scoring.points"), getPointsHistory(locale, { sessionId, month })]);
  const value = formatNumber(history.totalPoints);
  const filtered = Boolean(sessionId || month);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("ar", { month: "long", year: "numeric", timeZone: history.timeZone }).format(d);
    return { key, label };
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      {/* ★ Reconsidered per the lead's sync-2 ruling: a `Stat` tile, not the
          old "رصيدك N نقطة" sentence — REQ-PTS-003's own test is that the
          balance stays LEGIBLE, which a labelled, prominent number
          satisfies as well as a sentence does. `tests/e2e/points.spec.ts`
          reads the Stat now, not the retired sentence. */}
      <div className="mt-6 max-w-xs">
        <Stat label={t("title")} value={value} />
      </div>

      <form method="get" aria-labelledby="filters-heading" className="mt-8 flex flex-wrap items-end gap-4">
        <h2 id="filters-heading" className="sr-only">
          {t("filters.heading")}
        </h2>
        <Field id="session" label={t("filters.session")} className="w-48">
          <Select name="session" defaultValue={sessionId ?? ""}>
            <option value="">{t("filters.allSessions")}</option>
            {history.sessionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="month" label={t("filters.month")} className="w-48">
          <Select name="month" defaultValue={month ?? ""}>
            <option value="">{t("filters.allMonths")}</option>
            {monthOptions.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        {/* A plain GET form, not a Server Action — `SubmitButton`'s
            `useFormStatus` has nothing to report here, so this is `Button`
            with no pending state, matching what the control actually does. */}
        <Button type="submit">{t("filters.heading")}</Button>
        {filtered ? (
          <Link href="/app/me/points" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg-heading">
            {t("filters.clear")}
          </Link>
        ) : null}
      </form>

      {/* A plain, unlabelled wrapper — not a landmark, just something to
          scope a test locator to (the catalogue below repeats a rule's own
          reasonAr, which can equal a specific award's reason here). */}
      <div id="history">
        <PointsHistoryList rows={history.rows} timeZone={history.timeZone} />
      </div>

      <PointsCatalogue entries={history.catalogue} />
    </>
  );
}
