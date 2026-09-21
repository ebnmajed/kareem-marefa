"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Wordmark } from "@/components/wordmark";
import { LanguageToggle } from "@/components/language-toggle";
import { ButtonLink } from "@/components/ui/button";

export function Header() {
  const t = useTranslations("header");
  const locale = useLocale();
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // A 1px sentinel in normal flow (absolute, no positioned ancestor → it
  // scrolls with the document). The header background/blur toggles when it
  // leaves the top of the viewport — no per-frame scroll handler. The header
  // is global (also on /register, which has no hero), hence a self-owned
  // sentinel rather than observing a page element.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-6 h-px w-px"
      />
      <header
        className={`theme-dark fixed inset-x-0 top-0 z-40 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] transition-colors duration-150 ${
          scrolled
            ? "border-b border-edge bg-navy-950/90 backdrop-blur-md"
            : "border-b border-transparent !bg-transparent"
        }`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-fg-heading"
        >
          {locale === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
        </a>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 md:h-[4.5rem] md:px-8">
          <Wordmark />
          {/* ★ Two doors, never one (REQ-UIX-025, DEC-126). «تسجيل الدخول» is the way into the
              platform and is visible at EVERY width — outlined, so it cannot be mistaken for the
              filled «سجّل اهتمامك», which is the pre-launch interest list and stays (DEC-002).
              The platform is Arabic-only (the proxy sends /en/sign-in to Arabic), so the door
              goes straight there from both locales rather than through a redirect. */}
          <nav aria-label={t("nav")} className="flex items-center gap-1 sm:gap-3">
            <LanguageToggle />
            <ButtonLink href="/sign-in" locale="ar" hrefLang="ar" variant="secondary" size="md" className="whitespace-nowrap px-4">
              {t("signIn")}
            </ButtonLink>
            {/* `max-sm:hidden`, not `hidden sm:inline-flex`: the button's own `inline-flex` sets the same
                property and wins over `hidden` by emit order (DEC-111's trap). A media variant is
                emitted after the base utilities, so it holds. On a phone the sticky CTA carries it. */}
            <ButtonLink href="/register" size="md" className="whitespace-nowrap max-sm:hidden">
              {t("cta")}
            </ButtonLink>
          </nav>
        </div>
      </header>
    </>
  );
}
