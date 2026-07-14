"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Sticky bottom CTA bar, landing page + mobile only, appearing once the
 * hero's own CTA has scrolled away. Never rendered on the form page
 * (it would collide with the keyboard and cover errors).
 */
export function MobileCta() {
  const t = useTranslations("hero");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="theme-dark fixed inset-x-0 bottom-0 z-40 border-t border-edge !bg-navy-950/95 p-3 backdrop-blur-md md:hidden">
      <Link
        href="/register"
        className="flex h-12 w-full items-center justify-center rounded-field bg-white text-label text-navy-950"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
