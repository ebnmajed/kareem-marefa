import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listOrgs } from "@/lib/dal/platform";
import { deleteOrgAction, reinstateOrgAction, suspendOrgAction } from "./actions";
import { DeleteControl, SuspendControl } from "./org-controls";

// SCR-080 · /app/platform/orgs — REQ-ADM-001, REQ-TEN-001, REQ-TEN-002,
// REQ-TEN-006, REQ-NFR-014.
//
// ★ Every figure on this screen is a COUNT. There is no org name a super admin
// could click through to a member, a session or a comment, because there is no
// query here that could return one: `platform_metrics_by_org()` reads a view
// whose select list is counts plus the org's own metadata, and a test pins
// that column list (REQ-ADM-003). Seeing an org's data is SCR-085's act, and
// it lands in the org's own audit log.
//
// Times use the PLATFORM's zone and Western digits: a super admin has no org,
// so there is no `org_settings` to follow. Asia/Riyadh is the platform's own
// default (0004's `org_settings.time_zone`), which is the honest choice for a
// console whose operator is in the Kingdom — and it is stated rather than
// inherited by accident.
const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export default async function PlatformOrgsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orgs, t] = await Promise.all([listOrgs(locale), getTranslations("platform.orgs")]);
  const num = (n: number) => formatNumber(n);
  const when = (iso: string) => formatDateTime(iso, PLATFORM_TIME_ZONE, locale);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-3xl text-body text-fg-muted">{t("intro")}</p>

      <p className="mt-6">
        <ButtonLink href="/app/platform/orgs/new">{t("newLink")}</ButtonLink>
      </p>

      <p className="mt-8 text-body-sm text-fg-muted">{t("count", { count: orgs.length, value: num(orgs.length) })}</p>

      {orgs.length === 0 ? (
        <p className="mt-4 text-body text-fg-body">{t("empty")}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {orgs.map((org) => (
            <li key={org.id} className="rounded-field border border-edge p-4 md:p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-h3 text-fg-heading">
                  <bdi>{org.name}</bdi>
                </h2>
                {/* A slug is Latin in an Arabic line: isolated, and left to
                    right inside its own box. */}
                <p className="text-body-sm text-fg-muted">
                  <bdi dir="ltr">{org.slug}</bdi>
                </p>
                <p className="text-body-sm text-fg-body">
                  {org.status === "active" ? t("statusActive") : t("statusSuspended")}
                </p>
              </div>

              {/* Counts wrap rather than sit in a table: five numbers do not
                  need column headers, and a table at 390 px needs a scroller
                  for no gain. */}
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {(
                  [
                    ["members", org.members],
                    ["activeMembers", org.activeMembers],
                    ["sessions", org.sessions],
                    ["certificates", org.certificates],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-body-sm text-fg-muted">{t(key)}</dt>
                    <dd className="mt-1 text-h3 text-fg-heading">{num(value)}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-body-sm text-fg-muted">{t("created")}</dt>
                  <dd className="mt-1 text-body text-fg-body">{when(org.createdAt)}</dd>
                </div>
              </dl>

              <p className="mt-4">
                <Link
                  href={`/app/platform/orgs/${org.id}/domains`}
                  className="text-label text-fg-body underline underline-offset-4 hover:text-fg-heading"
                >
                  {t("manage")}
                </Link>
              </p>

              {org.status === "active" ? (
                <SuspendControl slug={org.slug} action={suspendOrgAction.bind(null, locale as Locale, org.id)} />
              ) : (
                <form action={reinstateOrgAction.bind(null, locale as Locale, org.id)} className="mt-3">
                  <button
                    type="submit"
                    className="text-label text-fg-body underline underline-offset-4 hover:text-fg-heading"
                  >
                    {t("reinstate")}
                  </button>
                </form>
              )}

              <DeleteControl slug={org.slug} action={deleteOrgAction.bind(null, locale as Locale, org.id)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
