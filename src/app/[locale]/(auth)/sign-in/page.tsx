import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessionState } from "@/lib/dal/session";
import { safeNextPath } from "@/lib/auth/next-path";
import { PLATFORM_LOCALE } from "@/lib/auth/flow";

// SCR-002 · /sign-in — the only way into the platform. REQ-AUT-001, REQ-AUT-005.
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const destination = safeNextPath(next, PLATFORM_LOCALE);

  // Already in: go where they were going. The DAL classifies the token.
  const state = await getSessionState();
  if (state.kind === "member") redirect(destination);

  const t = await getTranslations("auth.signIn");
  return (
    <>
      <h1 className="text-h2 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 text-body text-fg-muted">{t("subtitle")}</p>
      {error ? (
        <p id="sign-in-error" role="alert" className="mt-4 rounded-field border border-edge-strong bg-navy-950/60 p-3 text-body">
          {error === "domain" ? t("domainNotAllowed") : t("error")}
        </p>
      ) : null}
      <form method="post" action="/api/auth/sign-in" className="mt-8">
        <input type="hidden" name="next" value={destination} />
        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-field bg-white px-6 text-label text-navy-950 transition-colors duration-150 hover:bg-silver-200 active:bg-silver-300"
        >
          {/* The Google mark is a logo: it never mirrors (10 §2.4). */}
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" className="shrink-0">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
          </svg>
          <span>{t("google")}</span>
        </button>
      </form>
    </>
  );
}
