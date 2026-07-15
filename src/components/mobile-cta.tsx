"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Sticky bottom CTA bar, landing page + mobile only, appearing once the hero
 * has scrolled away. Never rendered on the form page (it would collide with
 * the keyboard and cover errors).
 *
 * Visibility is driven by an IntersectionObserver on the hero — no per-frame
 * scroll handler. Safe-area bottom/side padding lifts it clear of the home
 * indicator under viewport-fit=cover.
 */
export function MobileCta() {
  const t = useTranslations("hero");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div className="theme-dark fixed inset-x-0 bottom-0 z-40 border-t border-edge !bg-navy-950/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-md md:hidden">
      <Link
        href="/register"
        className="flex h-12 w-full items-center justify-center rounded-field bg-white text-label text-navy-950 transition-colors duration-150 active:bg-silver-200"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
