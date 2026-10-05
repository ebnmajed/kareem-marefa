import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/language-toggle";
import { ButtonLink } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// The public site's header — SCR-000, SCR-001 (`Landing.dc.html`, `Register.dc.html`), REQ-UIX-114, REQ-UIX-120.
// In the artboard's order: the mark · the two in-page links · «تسجيل الدخول» · «سجّل اهتمامك».
//
// ★ It is in the page's flow, not fixed over it: the artboard draws a bar, and a bar that does not float needs
// no scroll listener, no sentinel and no client code — so this is a server component now.
//
// ★ TWO DOORS, NEVER ONE (REQ-UIX-025, DEC-126). «تسجيل الدخول» is the way into the platform and is in the first
// viewport at every width, a real 44 px target (`qa:contract` §8). The platform is Arabic-only, so the door goes
// straight to the Arabic sign-in from both locales. «سجّل اهتمامك» is the pre-launch interest list (DEC-002).
//
// ★ THE LANGUAGE LINK STAYS HERE, though the artboard draws it only in the footer: `qa:contract` §1 switches
// language from the header, on `/register`, and that suite is not edited for a drawing (DEC-252).
//
// ★ The mark leads to the landing (REQ-UIX-120) and is still: the reveal is the cold start's, in `IntroSting`.
const navLink = "inline-flex min-h-11 items-center px-2 text-body-sm font-semibold text-fg-muted hover:text-fg-heading max-md:hidden";

export function Header() {
  const t = useTranslations("header");
  const locale = useLocale();

  return (
    <header className="pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-surface focus:px-4 focus:py-2 focus:text-fg-heading"
      >
        {locale === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
      </a>
      <div className="mx-auto flex h-[4.5rem] max-w-[80rem] items-center gap-2 px-5 md:gap-4 md:px-14">
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Logo height={36} />
        </Link>
        <span className="flex-1" />
        <nav aria-label={t("nav")} className="flex items-center gap-1 md:gap-3">
          <Link href="/#about" className={navLink}>
            {t("about")}
          </Link>
          <Link href="/#how" className={navLink}>
            {t("how")}
          </Link>
          <LanguageToggle />
          <Link
            href="/sign-in"
            locale="ar"
            hrefLang="ar"
            className="inline-flex min-h-11 items-center px-2 text-body-sm font-bold whitespace-nowrap text-fg-heading underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
          {/* `max-sm:hidden`, not `hidden sm:inline-flex`: the button's own `inline-flex` wins over `hidden` by
              emit order (DEC-111's trap). On a phone the hero and the register band carry it. */}
          <ButtonLink href="/register" size="md" className="whitespace-nowrap max-sm:hidden">
            {t("cta")}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
