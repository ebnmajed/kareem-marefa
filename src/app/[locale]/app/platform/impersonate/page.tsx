import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listMyImpersonations, listOrgs, PLATFORM_NUMERALS } from "@/lib/dal/platform";
import { endImpersonationAction, startImpersonationAction } from "./actions";
import { ImpersonateForm } from "./impersonate-form";

// SCR-085 · /app/platform/impersonate ★ — REQ-ADM-002, REQ-ADM-019, DEC-014.
//
// ★ The screen states the consequence BEFORE the form, in the operator's own
// language, because `09` §6 asks it to and because it is true: you cannot look
// at an org's data without the org knowing. That is the intended property of
// DEC-014, not a limitation to route around, and a console that buried it
// would be inviting someone to discover it the hard way — from an org admin
// asking why a platform account read their audit log.
//
// The history below is the CALLER'S OWN sessions (`platform_impersonations()`
// filters on `auth.uid()`). A super admin auditing another super admin is
// `platform_audit()`, and both are asserted against `platform_admins`.
const PLATFORM_TIME_ZONE = "Asia/Riyadh";

export default async function ImpersonatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orgs, sessions, t] = await Promise.all([
    listOrgs(locale),
    listMyImpersonations(locale),
    getTranslations("platform.impersonate"),
  ]);
  const when = (iso: string) => formatDateTime(iso, PLATFORM_NUMERALS, PLATFORM_TIME_ZONE, locale);
  // `isActive` is decided in the DAL: reading the clock during render is an
  // impure call, and the answer belongs beside the row it describes.
  const active = sessions.find((s) => s.isActive) ?? null;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      {/* Stated first, and not as a footnote. */}
      <p className="mt-4 max-w-2xl rounded-field border border-edge-strong p-4 text-body text-fg-heading">{t("honest")}</p>
      <p className="mt-4 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      {active ? (
        <section aria-labelledby="active" className="mt-10 rounded-field border border-edge-strong p-4 md:p-5">
          <h2 id="active" className="text-h3 text-fg-heading">
            {t("activeTitle")}
          </h2>
          <p className="mt-2 text-body text-fg-body">{t("activeNote")}</p>
          <p className="mt-2 text-body text-fg-heading">
            <bdi>{active.orgName}</bdi>
          </p>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t("expiresAt")} {when(active.expiresAt)}
          </p>
          <form action={endImpersonationAction.bind(null, locale as Locale, active.id)} className="mt-4">
            <Button type="submit" variant="secondary">
              {t("stop")}
            </Button>
          </form>
        </section>
      ) : (
        <ImpersonateForm
          orgs={orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))}
          action={startImpersonationAction.bind(null, locale as Locale)}
        />
      )}

      <section aria-labelledby="history" className="mt-12 border-t border-edge pt-8">
        <h2 id="history" className="text-h2 text-fg-heading">
          {t("historyTitle")}
        </h2>
        <p className="mt-3 text-body-sm text-fg-muted">{t("sessionCount", { count: sessions.length, value: formatNumber(sessions.length, PLATFORM_NUMERALS) })}</p>

        {sessions.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("historyEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-field border border-edge px-4 py-3">
                <p className="text-label text-fg-heading">
                  <bdi>{s.orgName}</bdi>
                </p>
                {/* A written reason is the thing the org's admins will read in
                    their own log, so it is shown back here verbatim. */}
                <p className="mt-1 text-body text-fg-body">
                  <bdi>{s.reason}</bdi>
                </p>
                <p className="mt-2 text-body-sm text-fg-muted">
                  {t("startedAt")} {when(s.startedAt)}
                </p>
                <p className="mt-1 text-body-sm text-fg-muted">
                  {s.endedAt ? `${t("endedAt")} ${when(s.endedAt)}` : `${t("expiresAt")} ${when(s.expiresAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
