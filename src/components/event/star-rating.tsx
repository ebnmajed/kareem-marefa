"use client";

// Star input (SCR-015, REQ-RAT-002). ★ Stars fill FROM THE RIGHT in RTL —
// `09`'s own warning is that mirroring the icon while keeping left-to-right
// fill logic makes a 5-star intent land as 1 star, silently. The fix here is
// to do NOTHING physical: plain `flex-direction: row` already starts at
// the inline-start edge — the right in an RTL document, the left in LTR —
// so star #1 in DOM order renders at the document's start edge in either
// direction, and "fill stars 1..value" therefore fills from the right in
// Arabic and from the left in English with the SAME code and the SAME DOM
// order. Adding `flex-row-reverse` here would UNDO that and reintroduce
// exactly the bug this component exists to avoid — the temptation is real
// enough that it is written out.

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function StarRating({
  label,
  name,
  value,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {STAR_VALUES.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={String(star)}
          disabled={disabled}
          onClick={() => onChange(star)}
          className={`flex size-11 items-center justify-center text-2xl leading-none ${star <= value ? "text-[var(--color-navy-950)]" : "text-fg-muted"}`}
        >
          {star <= value ? "★" : "☆"}
        </button>
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
