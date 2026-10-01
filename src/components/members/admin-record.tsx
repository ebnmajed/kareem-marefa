import { getTranslations } from "next-intl/server";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { Stat } from "@/components/ui/stat";
import type { AdminProfileRecord } from "@/lib/dal/members";

// «للمشرفين» — the admin tier's record (A33 rules 2–3, REQ-PRF-004, `03` §5.1b), after every public section, ruled
// and labelled `admin.note`. ★ Its rows come from `admin_member_profile()` alone — the DAL calls it only for an
// org admin, never a moderator — so this component is handed `null` for everyone else and is not rendered. The
// email is `<bdi dir="ltr">`. A noun-phrase heading for the attended list (DEC-213 §5.109).
export async function AdminRecord({ record, timeZone, locale }: { record: AdminProfileRecord; timeZone: string; locale: string }) {
  const t = await getTranslations("members.profile.admin");
  return (
    <section aria-labelledby="admin-record" className="flex flex-col gap-4 border-t border-edge pt-6 lg:[grid-area:admin]">
      <div className="flex flex-col gap-1">
        <h2 id="admin-record" className="font-display text-play-sm font-extrabold text-fg-heading">
          {t("heading")}
        </h2>
        <p className="text-caption text-fg-muted">{t("note")}</p>
      </div>
      <dl>
        <dt className="text-label text-fg-heading">{t("email")}</dt>
        <dd className="mt-1 text-body text-fg-body">
          <bdi dir="ltr">{record.email}</bdi>
        </dd>
      </dl>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("attendedCount")} value={formatNumber(record.attendedCount)} />
        <Stat label={t("noShows")} value={formatNumber(record.noShowCount)} />
        <Stat label={t("lateCancels")} value={formatNumber(record.lateCancelCount)} />
      </div>
      <h3 className="text-label text-fg-heading">{t("attended")}</h3>
      {record.attended.length === 0 ? (
        <p className="text-body text-fg-muted">{t("noAttended")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {record.attended.map((a) => (
            <li key={a.sessionId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-edge py-2 text-body">
              <bdi className="text-fg-heading">{a.title}</bdi>
              {a.startsAt ? <span className="text-body-sm text-fg-muted">{formatDate(a.startsAt, timeZone, locale)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
