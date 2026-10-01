import { getTranslations } from "next-intl/server";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { SessionStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { formatAverage } from "@/components/members/profile-format";
import { sessionPhase } from "@/lib/session-status";
import type { MemberProfileView } from "@/lib/dal/members";

type Row = MemberProfileView["presentedRows"][number];

// «الجلسات المقدَّمة» — `Profile.dc.html:63-68`, `ProfileDesktop.dc.html:52-60`, A33 rule 3, contract 4.
//
// ★ The heading's figure is the sessions DELIVERED, a count and never a page's length (DEC-213 §5.120, DEC-214 §2);
// sessions on the schedule are listed with their phase and never counted. ★ A row not yet held wears the STATUS
// BADGE every surface shows, from its days (REQ-UIX-003, DEC-151 r3, DEC-214 §3 N6); a held one says its date and
// how many attended — a number, never who — and, on the self and admin tiers only, its average (A33, §5.115): the DAL
// leaves `average` null for anyone else. ★ A noun phrase for the heading — no verb about the member (§5.109).
//
// Two rows on the phone and four from `lg`, as drawn; the rest open in place (`<details>`, DEC-214 §3 N3), so nothing
// links to a page that does not exist.
const PHONE = 2;
const DESKTOP = 4;

export async function PresentedSessions({ view, locale }: { view: MemberProfileView; locale: string }) {
  const t = await getTranslations("members.profile");
  const rows = view.presentedRows;
  const now = new Date();
  const item = (s: Row) => <PresentedRow key={s.id} s={s} locale={locale} now={now} />;
  const more = (from: number, className: string) =>
    rows.length > from ? (
      <details className={className}>
        <summary className="cursor-pointer px-1 py-1 text-caption text-fg-muted underline-offset-4 hover:underline">
          {t("morePresented", { count: rows.length - from, value: formatNumber(rows.length - from) })}
        </summary>
        <ul className="mt-2 grid gap-2 lg:grid-cols-2">{rows.slice(from).map((s) => <li key={s.id}>{item(s)}</li>)}</ul>
      </details>
    ) : null;

  return (
    <section aria-labelledby="presented" className="flex flex-col gap-2 lg:[grid-area:presented]">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="presented" className="font-display text-play-sm font-extrabold text-fg-heading">
          {t("presented")}
        </h2>
        {view.presentedCount > 0 ? <span className="text-caption text-fg-muted">{formatNumber(view.presentedCount)}</span> : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-1 text-body text-fg-muted">{t("noPresented")}</p>
      ) : (
        <>
          <ul className="grid gap-2 lg:grid-cols-2">
            {rows.slice(0, DESKTOP).map((s, i) => (
              <li key={s.id} className={i >= PHONE ? "hidden lg:block" : undefined}>
                {item(s)}
              </li>
            ))}
          </ul>
          {more(PHONE, "lg:hidden")}
          {more(DESKTOP, "hidden lg:block")}
        </>
      )}
    </section>
  );
}

async function PresentedRow({ s, locale, now }: { s: Row; locale: string; now: Date }) {
  const t = await getTranslations("members.profile");
  const held = s.state === "completed" || s.state === "archived";
  return (
    <Card density="row" href={`/app/sessions/${s.id}`}>
      <CardMedia placeholderFrom={s.title} aspect="4/5" className="m-2.5 w-14! rounded-tile" />
      <CardBody>
        <h3 className="text-body font-bold text-fg-heading">
          <bdi>{s.title}</bdi>
        </h3>
        {held ? (
          <p className="text-caption text-fg-muted">
            {s.startsAt ? formatDate(s.startsAt, s.timeZone, locale) : null}
            {s.attendedCount !== null ? ` · ${t("attendedCount", { count: s.attendedCount, value: formatNumber(s.attendedCount) })}` : null}
            {s.average !== null ? (
              <>
                {" · "}
                <span aria-hidden="true">{t("average", { value: formatAverage(s.average, locale) })}</span>
                <span className="sr-only">{t("averageSr", { value: formatAverage(s.average, locale) })}</span>
              </>
            ) : null}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* phase-days: on the DTO — `PresentedSession.days`, embedded by `listSessionsPresentedBy()` because this
                is a list (DEC-151 r3); contract 4's rows carry it through. */}
            <SessionStatusBadge phase={sessionPhase(s, now)} size="sm" />
            {s.startsAt ? <span className="text-caption text-fg-muted">{formatDate(s.startsAt, s.timeZone, locale)}</span> : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
