import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// SCR-004 · /no-access — a dead end with an explanation. Names no org, lists
// no domain (REQ-AUT-006). Also the suspended-org (REQ-TEN-006) and the
// deactivated-member (REQ-AUT-008) messages, chosen by `reason`.
export default async function NoAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { reason } = await searchParams;
  const t = await getTranslations("auth.noAccess");

  const [title, body] =
    reason === "suspended"
      ? [t("suspended"), t("suspendedBody")]
      : reason === "deactivated"
        ? [t("deactivated"), t("deactivatedBody")]
        : [t("title"), t("noMatch")];

  return (
    <>
      <h1 className="text-h2 text-fg-heading">{title}</h1>
      <p className="mt-3 text-body text-fg-muted">{body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <form method="post" action="/api/auth/sign-out">
          <button type="submit" className="inline-flex h-11 items-center rounded-field border border-edge-strong px-5 text-label text-fg-body hover:bg-silver-300/10">
            {t("signOut")}
          </button>
        </form>
        <Link href="/" className="inline-flex h-11 items-center rounded-field px-5 text-label text-fg-muted hover:text-fg-heading">
          {t("backHome")}
        </Link>
      </div>
    </>
  );
}
