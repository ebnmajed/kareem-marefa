import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/wordmark";

const linkClass =
  "inline-flex min-h-11 items-center text-caption text-fg-body underline-offset-4 hover:text-fg-heading hover:underline";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="theme-dark border-t border-edge !bg-navy-1000">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-16 md:px-8">
        <Wordmark variant="footer" />
        <p className="max-w-xl text-caption text-fg-muted">{t("privacy")}</p>
        <nav aria-label={t("linksLabel")}>
          <ul className="flex flex-wrap gap-x-6">
            <li>
              <Link href="/sign-in" locale="ar" hrefLang="ar" className={linkClass}>
                {t("signIn")}
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className={linkClass}>
                {t("privacyLink")}
              </Link>
            </li>
            <li>
              <Link href="/legal/terms" className={linkClass}>
                {t("terms")}
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-caption text-fg-muted">{t("internal")}</p>
      </div>
    </footer>
  );
}
