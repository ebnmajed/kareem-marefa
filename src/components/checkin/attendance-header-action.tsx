import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { offersHostScreen } from "@/lib/dal/checkin";

// SCR-044's one action in the hub's header — «شاشة التقديم» (REQ-UIX-090, `sessions`' contract 4, DEC-228 §4.6).
//
// A server component the hub layout places under the key `attendance`. It returns ONE link or null, and it never calls
// `notFound()`, `redirect()` or throws: it renders inside a layout, where any of those would take the whole hub down
// (or stream a 200 not-found). It renders no heading and no landmark — the header owns both.
//
// Null once the session is completed, archived or cancelled, and before it is published: there is no room to project
// then. The host view itself still decides who may see the code (REQ-CHK-014, `ensure_check_in_code()`).

export async function AttendanceHeaderAction({ locale, sessionId }: { locale: string; sessionId: string }) {
  if (!(await offersHostScreen(locale, sessionId))) return null;
  const t = await getTranslations({ locale, namespace: "checkin.attendance" });
  return (
    <ButtonLink href={`/app/sessions/${sessionId}/host`} variant="primary" size="md">
      {t("hostScreen")}
    </ButtonLink>
  );
}
