import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/dal/session";
import { getHostView } from "@/lib/dal/checkin";
import { revokeCodeAction } from "./actions";

// SCR-016 — the host view (REQ-CHK-001, REQ-CHK-014, OQ-013). Presenters,
// admins and moderators only — getHostView() returns null for anyone else,
// by policy (ensure_check_in_code's authorization check), not merely by
// hiding this page's UI.
export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ revoked?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSession(locale, `/${locale}/app/sessions/${id}/host`);
  const { revoked } = await searchParams;
  const [view, t] = await Promise.all([getHostView(locale, id), getTranslations("checkin")]);

  if (!view) {
    return <h1 className="text-h1 text-fg-heading">{t("host.notAuthorized")}</h1>;
  }

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("host.title")}</h1>
      {revoked ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("host.revoked")}
        </p>
      ) : null}

      <p aria-live="polite" dir="ltr" className="mt-8 text-center font-bold leading-none text-fg-heading text-[length:var(--fs-display)] tracking-[0.35em]">
        {view.code}
      </p>

      <p className="mt-6 text-center text-body text-fg-muted">{t("host.checkInCount", { count: view.checkInCount })}</p>

      <form action={revokeCodeAction.bind(null, locale, id)} className="mt-8 flex justify-center">
        <button type="submit" className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100">
          {t("host.revoke")}
        </button>
      </form>
    </>
  );
}
