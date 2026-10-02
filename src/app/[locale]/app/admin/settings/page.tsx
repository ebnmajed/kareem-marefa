import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { splitDuration } from "@/components/admin/duration";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { KvCard } from "@/components/ui/kv-card";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { oauthClient } from "@/app/api/calendar/oauth";
import { getLastSettingsSave, getOrgSettingsView } from "@/lib/dal/admin-settings";
import { saveSettings } from "./actions";
import { MARK_ACTIONS, MARK_COLUMNS, timeZones } from "./fields";
import { SettingsEdit, type DerivedValues } from "./settings-edit";

// SCR-063 · /app/admin/settings — written from `AdminSettings.dc.html` (`REQ-UIX-102`, `STORY-UIX-092`) after the old
// page was deleted (`DEC-208`); kept-behaviour table S1 – S23 in notes/notify.md, with `DEC-232` §5.1's rulings.
//
// ★ READ BY DEFAULT (`REQ-UIX-091`): the h1 row with «عدّل», the saved mark, four `kv-card`s in two columns — المؤسسة ·
// الجلسات · الخصوصية · الربط — with visible titles. «عدّل» is a link to `?edit`; edit mode is the same four cards, editable,
// and nothing is written until «احفظ».
// ★ EVERY VALUE IS READ. The board draws nine values nothing stores (a default capacity, a registration close, a late
// cancel, a waitlist switch, proposal approval, a language, a 30-day export, a sender address, «the record is kept») and
// two that are false (photos deleted after two years; deactivation keeps the record) — absent, never invented. Two rows
// are facts of the deployment, read-only: Google Calendar is available when its client is configured, and the verify
// link is this site's own.
// ★ THE SAVED MARK reads both stores: a setting's history row, or the `org.renamed` / `domain.*` audit row.
//
// Admin only: `getOrgSettingsView()` answers null for anyone else and the page answers with the streamed not-found
// (`DEC-134`); a moderator never reaches it (`REQ-ADM-020`), and every write is refused by policy regardless.

const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

function zoneName(timeZone: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeZone, timeZoneName: "longGeneric" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, view, sp, requestHeaders] = await Promise.all([getTranslations("settings.admin"), getOrgSettingsView(locale), searchParams, headers()]);
  if (!view) notFound();
  const mark = await getLastSettingsSave(locale, MARK_COLUMNS, MARK_ACTIONS);

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const derived: DerivedValues = {
    calendar: oauthClient() ? t("values.calendarOn") : t("values.calendarOff"),
    verify: `${host}/${locale}/verify`,
  };

  const duration = (seconds: number) => {
    const { amount, unit } = splitDuration(seconds, "seconds", ["seconds", "minutes"]);
    return t.rich(`values.${unit}`, { count: amount, value: formatNumber(amount), bdi });
  };
  const count = (key: string, n: number) => t.rich(key, { count: n, value: formatNumber(n), bdi });
  const ltr = (text: string) => (
    <bdi dir="ltr" className="font-mono text-body-sm">
      {text}
    </bdi>
  );

  if (sp.edit !== undefined) {
    return (
      <>
        <PageHeader inlineActions title={t("title")} />
        <SettingsEdit action={saveSettings.bind(null, locale as Locale)} view={view} derived={derived} timeZones={timeZones(view.timeZone)} />
      </>
    );
  }

  const email = view.emailFromName
    ? view.emailReplyTo
      ? t.rich("values.email", { from: view.emailFromName, replyTo: view.emailReplyTo, bdi })
      : t.rich("values.emailNoReply", { from: view.emailFromName, bdi })
    : view.emailReplyTo
      ? ltr(view.emailReplyTo)
      : null;

  const markLine = mark
    ? mark.actor?.displayName
      ? t.rich("savedMarkBy", { time: formatDateTime(mark.at, mark.timeZone, locale), actor: mark.actor.displayName, bdi })
      : t.rich("savedMark", { time: formatDateTime(mark.at, mark.timeZone, locale), bdi })
    : null;

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href="/app/admin/settings?edit" size="md">
            {t("edit")}
          </ButtonLink>
        }
      />
      {markLine ? <p className="mt-2 text-caption text-fg-muted">{markLine}</p> : null}

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <KvCard
          title={t("cards.org")}
          emptyValue={t("empty")}
          rows={[
            { id: "name", label: t("rows.name"), value: <bdi>{view.name}</bdi> },
            {
              id: "domains",
              label: t("rows.domains"),
              value: view.domains.length ? (
                <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
                  {view.domains.map((d, i) => (
                    <span key={d.id}>
                      {ltr(d.domain)}
                      {i < view.domains.length - 1 ? " ·" : null}
                    </span>
                  ))}
                </span>
              ) : null,
            },
            { id: "timeZone", label: t("rows.timeZone"), value: t.rich("values.timeZone", { name: zoneName(view.timeZone, locale), id: view.timeZone, bdi }) },
            { id: "companyMetric", label: t("rows.companyMetric"), value: t(`values.metric.${view.companyMetric}`) },
            { id: "companyMinActiveMembers", label: t("rows.companyMinActiveMembers"), value: count("values.minActive", view.companyMinActiveMembers) },
          ]}
        />
        <KvCard
          title={t("cards.sessions")}
          emptyValue={t("empty")}
          rows={[
            {
              id: "checkIn",
              label: t("rows.checkIn"),
              value: t.rich(view.checkInGraceSeconds === 0 ? "values.checkInNoGrace" : "values.checkIn", {
                rotation: () => duration(view.checkInRotationSeconds),
                grace: () => duration(view.checkInGraceSeconds),
              }),
            },
            { id: "maxCoPresenters", label: t("rows.maxCoPresenters"), value: count("values.coPresenters", view.maxCoPresenters) },
            { id: "priorityRsvpHours", label: t("rows.priorityRsvpHours"), value: count("values.priority", view.priorityRsvpHours) },
            {
              id: "limits",
              label: t("rows.limits"),
              value: t.rich("values.limits", {
                document: formatNumber(view.limitDocumentMb),
                audio: formatNumber(view.limitAudioMb),
                image: formatNumber(view.limitImageMb),
                poster: formatNumber(view.limitPosterMb),
                bdi,
              }),
            },
          ]}
        />
        <KvCard
          title={t("cards.privacy")}
          emptyValue={t("empty")}
          rows={[{ id: "ratings", label: t("rows.ratings"), value: count("values.ratings", view.ratingMinAggregate) }]}
        />
        <KvCard
          title={t("cards.integrations")}
          emptyValue={t("empty")}
          rows={[
            { id: "calendar", label: t("rows.calendar"), value: derived.calendar },
            { id: "email", label: t("rows.email"), value: email },
            { id: "jpeg", label: t("rows.jpeg"), value: view.allowJpegExport ? t("values.jpegOn") : t("values.jpegOff") },
            { id: "verify", label: t("rows.verify"), value: ltr(derived.verify) },
          ]}
        />
      </div>
    </>
  );
}
