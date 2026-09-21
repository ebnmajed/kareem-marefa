import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Typographic logo placeholder — the Arabic mark always leads, in both
 * locales. Never letter-spaced (Arabic is a connected script); only the
 * Latin sub-line takes tracking.
 */
export function Wordmark({ variant = "header" }: { variant?: "header" | "footer" }) {
  const locale = useLocale();

  if (variant === "footer") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span lang="ar" dir="rtl" className="text-lg font-semibold text-fg-heading">
          كريم معرفة
        </span>
        <span
          lang="en"
          dir="ltr"
          className="text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-silver-400"
        >
          Knowledge Kareem
        </span>
      </div>
    );
  }

  return (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-field text-fg-heading"
    >
      <span lang="ar" dir="rtl" className="whitespace-nowrap text-[1.375rem] font-semibold leading-none">
        كريم معرفة
      </span>
      {locale === "en" && (
        <>
          {/* Below `sm` the header also carries the door into the platform (REQ-UIX-025), and at
              390 px the Latin line wraps beside it. The Arabic mark leads in both locales, so the
              Latin line is the one that yields. */}
          <span aria-hidden="true" className="h-4 w-px bg-edge-strong max-sm:hidden" />
          <span
            lang="en"
            dir="ltr"
            className="whitespace-nowrap text-[0.8125rem] font-medium uppercase tracking-[0.14em] text-silver-400 max-sm:hidden"
          >
            Knowledge Kareem
          </span>
        </>
      )}
    </Link>
  );
}
