import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/wordmark";

// The three unauthenticated platform screens share a centred card on the
// brand's dark canvas (09 SCR-002 … SCR-004), under the wordmark alone —
// no marketing chrome (DEC-038).
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app.shell");
  return (
    <main id="main" className="theme-dark min-h-dvh bg-navy-950 px-4 pb-16 pt-10 text-fg-body md:pt-16">
      <div className="mx-auto mb-10 flex w-full max-w-md justify-center">
        <Wordmark />
      </div>
      <div className="mx-auto w-full max-w-md rounded-field border border-edge bg-navy-900/60 p-6 shadow-xl md:p-8">{children}</div>
      <p className="mx-auto mt-8 w-full max-w-md text-center text-body-sm text-fg-muted">
        <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-fg-heading">
          {t("privacy")}
        </Link>
        {" · "}
        <Link href="/legal/terms" className="underline underline-offset-4 hover:text-fg-heading">
          {t("terms")}
        </Link>
      </p>
    </main>
  );
}
