import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { getMyExportRequest } from "@/lib/dal/privacy";
import { requestDeactivationAction, requestExportAction } from "./actions";
import { DeactivationForm, RequestExportForm } from "./forms";

// `/app/me/privacy` — REQ-PRF-006, REQ-PRF-007, REQ-NFR-013, 12 §5.4.
//
// ★ SELF-SERVICE EXPORT: YES. SELF-SERVICE DELETION: NO — and this screen says
// which, and why, in the member's own language. The alternative is a "delete
// my account" button that quietly means "ask someone else to deactivate you in
// twelve months", which is worse than a plain no: a person who acts on it
// believes something that is not true.
//
// The reason is not a policy preference. A member's sessions, materials and
// comments are content OTHER MEMBERS DEPEND ON — a pre-read someone is
// preparing with, a comment that opened a thread — and a hard delete tears
// holes in pages that are not only theirs. Anonymisation honours the erasure
// interest without that, and the member is told which one they are getting.
//
// Unlike the rest of the console, this screen follows the ORG's numerals and
// time zone: the reader here is a member of an org, not the platform's
// operator (REQ-INT-006, REQ-TEN-008).

export default async function MyPrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [request, prefs, t] = await Promise.all([
    getMyExportRequest(locale),
    getOrgPrefs(locale),
    getTranslations("privacy.page"),
  ]);
  const when = (iso: string) => formatDateTime(iso, prefs.numerals, prefs.timeZone, locale);

  const statusKey = request
    ? ({ queued: "statusQueued", building: "statusBuilding", ready: "statusReady", failed: "statusFailed", expired: "statusExpired" } as const)[
        request.status
      ]
    : null;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-2">
        <Link href="/legal/privacy" className="text-label text-fg-body underline underline-offset-4 hover:text-fg-heading">
          {t("policyLink")}
        </Link>
      </p>

      <section aria-labelledby="export" className="mt-10 max-w-2xl">
        <h2 id="export" className="text-h2 text-fg-heading">
          {t("exportTitle")}
        </h2>
        <p className="mt-3 text-body text-fg-body">{t("exportIntro")}</p>
        {/* REQ-PRF-006's second acceptance criterion, said to the person it
            protects rather than only tested. */}
        <p className="mt-2 text-body-sm text-fg-muted">{t("exportNote")}</p>

        {request && statusKey ? (
          <div className="mt-6 rounded-field border border-edge p-4">
            <p className="text-body text-fg-heading">{t(statusKey)}</p>
            <p className="mt-2 text-body-sm text-fg-muted">
              {t("requestedAt")} {when(request.requestedAt)}
            </p>
            {request.completedAt ? (
              <p className="mt-1 text-body-sm text-fg-muted">
                {t("readyAt")} {when(request.completedAt)}
              </p>
            ) : null}
            {request.status === "ready" ? (
              <>
                {/* A plain link, not a fetch: the Route Handler answers with
                    `content-disposition: attachment`, so the browser saves it
                    without any JavaScript having to hold the bytes. */}
                <p className="mt-4">
                  <a
                    href="/api/me/export"
                    className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100"
                    download
                  >
                    {t("exportDownload")}
                  </a>
                </p>
                <p className="mt-3 text-body-sm text-fg-muted">{t("expiryNote")}</p>
              </>
            ) : null}
          </div>
        ) : null}

        <RequestExportForm
          label={request ? t("exportAgain") : t("exportRequest")}
          action={requestExportAction.bind(null, locale as Locale)}
        />
      </section>

      <section aria-labelledby="deactivate" className="mt-12 max-w-2xl border-t border-edge pt-8">
        <h2 id="deactivate" className="text-h2 text-fg-heading">
          {t("deactivateTitle")}
        </h2>
        <p className="mt-3 text-body text-fg-body">{t("deactivateIntro")}</p>
        {/* ★ The honest paragraph. It says no, and it says why, in the place
            where someone is deciding — not in a policy page they may not open. */}
        <p className="mt-3 text-body text-fg-body">{t("deactivateHonest")}</p>
        <DeactivationForm action={requestDeactivationAction.bind(null, locale as Locale)} />
      </section>
    </>
  );
}
