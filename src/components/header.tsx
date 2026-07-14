"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "@/components/wordmark";
import { LanguageToggle } from "@/components/language-toggle";

export function Header() {
  const t = useTranslations("header");
  const locale = useLocale();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`theme-dark fixed inset-x-0 top-0 z-40 transition-colors duration-150 ${
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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:h-[4.5rem] md:px-8">
        <Wordmark />
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link
            href="/register"
            className="hidden h-10 items-center rounded-field bg-white px-5 text-label text-navy-950 transition-colors duration-150 hover:bg-silver-200 sm:flex"
          >
            {t("cta")}
          </Link>
        </div>
      </div>
    </header>
  );
}
