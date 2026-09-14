import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAdminSession } from "@/lib/dal/admin-dashboard";

// SCR-061 · /app/admin/exports (REQ-ADM-017). Admin only — exports sit
// outside a moderator's scope (09 §5's coverage table).
// `requireAdminSession()` itself calls `notFound()` for anyone else — the
// same 404-not-message pattern every other admin screen uses. Every
// download link is a plain GET to a Route Handler
// (`src/app/api/admin/exports/[type]/route.ts`); the audit write happens
// there, not on this page render, so opening this screen itself is not
// what gets logged — only an actual download is.

const TYPES = ["sessions", "rsvps", "attendance", "ratings", "points", "certificates", "members"] as const;

export default async function ExportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireAdminSession(locale);
  const t = await getTranslations("admin.exports");

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      <ul className="mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {TYPES.map((type) => (
          <li key={type} className="rounded-field border border-edge p-5">
            <h2 className="text-label text-fg-heading">{t(`${type}.title`)}</h2>
            <p className="mt-2 text-body-sm text-fg-muted">{t(`${type}.note`)}</p>
            <a
              href={`/api/admin/exports/${type}`}
              className="mt-4 inline-flex h-11 items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading hover:bg-silver-100"
            >
              {t("download")}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
