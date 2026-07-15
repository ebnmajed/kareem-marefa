"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Shows the OTHER language's name in its own script, as a real link to the
 * same page in the other locale. Known tradeoff: toggling on /register
 * navigates and discards a half-filled form.
 */
export function LanguageToggle() {
  const pathname = usePathname(); // locale-stripped: "/" or "/register"
  const locale = useLocale();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      dir={other === "ar" ? "rtl" : "ltr"}
      className="flex h-11 items-center rounded-full border border-edge-strong px-4 text-label text-fg-body transition-colors duration-150 hover:bg-silver-300/10 active:bg-silver-300/20"
    >
      {other === "ar" ? "العربية" : "English"}
    </Link>
  );
}
