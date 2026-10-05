import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// The public site's footer — SCR-000 (`Landing.dc.html`), REQ-UIX-114. One row: whose initiative this is, at the
// start; the two legal pages at the end. The other language is the header's link (`header.tsx` says why).
const linkClass = "inline-flex min-h-11 items-center text-caption text-fg-muted underline-offset-4 hover:text-fg-heading hover:underline";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-8 md:px-14 md:py-10">
        <p className="text-caption text-fg-muted">{t("internal")}</p>
        <nav aria-label={t("linksLabel")}>
          <ul className="flex flex-wrap gap-x-5">
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
      </div>
    </footer>
  );
}
