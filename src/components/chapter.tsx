import type { ReactNode } from "react";

/** Arabic-Indic for AR, Latin for EN — the numeral belongs to the script. */
const NUMERALS: Record<string, string[]> = {
  ar: ["٠١", "٠٢", "٠٣", "٠٤"],
  en: ["01", "02", "03", "04"],
};

/**
 * One chapter of the page, hung off the spine.
 *
 * The rail (numeral · node · line) is the network made structural: its line
 * segments stack across chapters into a single hairline running the length of
 * the page, drawing itself as you scroll. It carries no information — it is
 * aria-hidden, and the chapter numerals are decorative, so screen readers get
 * a clean heading outline.
 */
export function Chapter({
  n,
  locale,
  children,
  className = "",
}: {
  n: number;
  locale: string;
  children: ReactNode;
  className?: string;
}) {
  const numeral = (NUMERALS[locale] ?? NUMERALS.en)[n - 1];

  return (
    <div className={`chapter mx-auto w-full max-w-6xl px-6 md:px-8 ${className}`}>
      <div className="chapter-rail" aria-hidden="true">
        <span className="text-index">{numeral}</span>
        <span className="chapter-node" />
        <span className="chapter-line" />
      </div>
      <div>{children}</div>
    </div>
  );
}
