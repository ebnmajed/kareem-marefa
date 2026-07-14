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
 * aria-hidden, and the numerals are decorative, so the heading outline a
 * screen reader sees stays clean.
 *
 * The section's vertical rhythm is `pad`, applied to the *body* column rather
 * than the section, so the rail spans the section edge to edge and consecutive
 * chapters' segments meet. Padding the section instead would break the line
 * into floating dashes — the one thing the whole idea can't survive.
 */
export function Chapter({
  n,
  locale,
  pad,
  children,
  className = "",
}: {
  n: number;
  locale: string;
  /** Vertical rhythm for this chapter. Vary it — equal spacing reads as a template. */
  pad: string;
  children: ReactNode;
  className?: string;
}) {
  const numeral = (NUMERALS[locale] ?? NUMERALS.en)[n - 1];

  return (
    <div
      className={`chapter mx-auto w-full max-w-6xl px-6 md:px-8 ${className}`}
      style={{ "--chapter-pad": pad } as React.CSSProperties}
    >
      {/* node before numeral so the node lands at inline-start 0 and sits ON
          the spine; the numeral is re-ordered ahead of it on mobile. */}
      <div className="chapter-rail" aria-hidden="true">
        <span className="chapter-mark">
          <span className="chapter-node" />
          <span className="text-index">{numeral}</span>
        </span>
        <span className="chapter-line" />
      </div>
      <div className="chapter-body">{children}</div>
    </div>
  );
}
