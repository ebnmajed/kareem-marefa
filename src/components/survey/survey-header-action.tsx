import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { offersSurveyExport } from "@/lib/dal/surveys";

// SCR-064's one action in the hub's header — «CSV» (REQ-UIX-105, REQ-SUR-007, `sessions`' contract 4, DEC-232).
//
// A server component the hub layout places under the key `survey`. It returns ONE link or null and never calls
// `notFound()`, `redirect()` or throws: it renders inside a layout. It renders no heading and no landmark.
//
// ★ A PLAIN DOWNLOAD ANCHOR, not `ButtonLink`: the route answers `text/csv`, and `next/link` would prefetch it — an
// audited bulk read of personal data, taken because a pointer passed over the button (`REQ-ADM-017`). The download
// writes `export.created`; rendering this writes nothing. Admin only: the route asserts a fresh admin and answers a
// moderator as it answers a stranger (`DEC-163`), and a link that 404s is worse than none.

export async function SurveyHeaderAction({ locale, sessionId }: { locale: string; sessionId: string }) {
  if (!(await offersSurveyExport(locale, sessionId))) return null;
  const t = await getTranslations({ locale, namespace: "survey.session" });
  return (
    <a href={`/api/admin/exports/survey/${sessionId}`} download aria-label={t("exportLabel")} className={buttonClass("secondary", "md")}>
      {t("export")}
    </a>
  );
}
