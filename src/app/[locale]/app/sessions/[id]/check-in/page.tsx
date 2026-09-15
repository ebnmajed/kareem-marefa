import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { CodeInput } from "@/components/checkin/code-input";
import { submitCheckInForm } from "./actions";

// SCR-014 — check-in (REQ-CHK-003, REQ-CHK-006, REQ-CHK-010, REQ-CHK-011).
// "The most operationally important input in the product" (09): used
// standing, one-handed, under time pressure, reading six characters off a
// screen across a room.
const KNOWN_ERRORS = new Set(["not_found", "presenter_cannot_check_in", "rate_limited", "not_started", "session_ended", "not_open", "reservation_required", "invalid_code", "overlap", "unknown"]);

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ success?: string; already?: string; error?: string; code?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSession(locale, `/${locale}/app/sessions/${id}/check-in`);
  const { success, already, error, code } = await searchParams;
  const t = await getTranslations("checkin");

  const errorKey = error && KNOWN_ERRORS.has(error) ? error : error ? "unknown" : null;

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 max-w-prose text-body text-fg-muted">{t("ready")}</p>

      {success ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("success")}
        </p>
      ) : null}
      {already ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("alreadyCheckedIn")}
        </p>
      ) : null}
      {errorKey ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t(`error.${errorKey}`)}
        </p>
      ) : null}

      <form action={submitCheckInForm.bind(null, locale, id)} className="mt-8 max-w-sm space-y-4">
        <div>
          <label id="code-label" htmlFor="code-0" className="text-label text-fg-heading">
            {t("codeLabel")}
          </label>
          <div className="mt-1">
            <CodeInput id="code-0" name="code" defaultValue={code} />
          </div>
        </div>
        <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-field bg-navy-950 px-7 text-label text-white hover:bg-navy-900">
          {t("submit")}
        </button>
      </form>
    </>
  );
}
