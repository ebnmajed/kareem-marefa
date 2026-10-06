"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { BRAND_COLOUR_TOKENS, DESIGN_COLOUR_NAMES, resolveColour } from "@kareem/designer-runtime";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { bindPath, colourPath } from "@/components/designer/inspector-ops";

// The studio's colour control — REQ-DSG-021 as DEC-272 amends it (the owner, 2026-10-06: «remove the hardcoding of the
// colors of the templates and make them fully editable and the brand colors become something like an accent for quick
// select»). The database has accepted any colour since `0195`, and the renderer passes a literal straight through
// (`resolveColour`), so this is the last place the old rule lived.
//
//   · ★ THE BRAND COLOURS ARE ONE-TAP SWATCHES, AND THEY STAY LINKED: a swatch stores `{{brand.<token>}}`, exactly as the
//     old select did, so a later brand-kit change repaints every layer that chose it. The design's own constants
//     (`{{design.*}}`, `design-colours.ts`) are swatches too — the baseline templates bind them.
//   · ★ ANY COLOUR: a native colour picker and a `#rrggbb` field store the LITERAL. The field applies as soon as what is
//     typed is a whole colour; a malformed value is refused AT THE FIELD (on leaving it), never stored.
//   · The current value is said in words — the token's name, or the code in `<bdi dir="ltr">` — never by colour alone.
//     A legacy value that is neither a token nor a hex (DEC-096-era documents) is shown as what it is.
//   · Each set of swatches is a radiogroup with a roving tab stop; the arrows follow the page's direction. 28 px targets
//     (SC 2.5.8). A colour from data reaches an element as `--team` (the one door, `globals.css`), never a class.

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** `ff9a2e`, `#FF9A2E` → `#ff9a2e`; anything else → `null`. */
export function normaliseHex(raw: string): string | null {
  const trimmed = raw.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX_RE.test(withHash) ? withHash.toLowerCase() : null;
}

export interface ColourControlProps {
  label: string;
  /** What the document stores: a `{{brand.*}}` / `{{design.*}}` binding or a literal colour. */
  value: string;
  disabled: boolean;
  onValue: (next: string) => void;
  /** The resolved brand values (`brand.canvas` → `#…`), for the swatches' paint. Without it a brand swatch is named but
   *  drawn neutral — the choice it stores is the same. */
  values?: Record<string, string>;
}

interface Swatch {
  path: string;
  name: string;
}

export function ColourControl({ label, value, disabled, onValue, values = {} }: ColourControlProps) {
  const t = useTranslations("designer.inspector.colour");
  const tb = useTranslations("designer.inspector.background");
  const current = colourPath(value);

  const brand: Swatch[] = BRAND_COLOUR_TOKENS.map((name) => ({ path: `brand.${name}`, name: tb(`tokens.${name}`) }));
  const design: Swatch[] = DESIGN_COLOUR_NAMES.map((name) => ({ path: `design.${name}`, name: tb(`designTokens.${name}`) }));
  const paint = (path: string) => resolveColour({ values }, bindPath(path), "");
  const resolved = current ? paint(current) : value;
  const literalHex = current ? null : normaliseHex(value);
  const currentName = current ? [...brand, ...design].find((s) => s.path === current)?.name ?? current : null;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="text-label text-fg-heading">
        {label}
      </legend>
      <p className="flex items-center gap-2 text-body-sm text-fg-heading">
        <span aria-hidden="true" className="size-6 shrink-0 rounded-full border border-edge bg-team" style={swatchStyle(resolved)} />
        <span className="sr-only">{t("current")}: </span>
        {currentName ? <span>{currentName}</span> : <bdi dir="ltr">{literalHex ?? value}</bdi>}
      </p>
      <SwatchGroup label={tb("groups.brand")} swatches={brand} checked={current} disabled={disabled} paint={paint} onPick={(path) => onValue(bindPath(path))} />
      <SwatchGroup label={tb("groups.design")} swatches={design} checked={current} disabled={disabled} paint={paint} onPick={(path) => onValue(bindPath(path))} />
      <CustomColour
        label={t("custom")}
        value={literalHex ?? normaliseHex(resolved) ?? ""}
        isLiteral={current === null}
        disabled={disabled}
        onValue={onValue}
      />
    </fieldset>
  );
}

function swatchStyle(colour: string): CSSProperties | undefined {
  return colour ? ({ "--team": colour } as CSSProperties) : undefined;
}

function SwatchGroup({
  label,
  swatches,
  checked,
  disabled,
  paint,
  onPick,
}: {
  label: string;
  swatches: Swatch[];
  checked: string | null;
  disabled: boolean;
  paint: (path: string) => string;
  onPick: (path: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = swatches.findIndex((s) => s.path === checked);
  const stop = checkedIndex >= 0 ? checkedIndex : 0;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const back = event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft");
    let next: number | null = null;
    if (forward) next = (index + 1) % swatches.length;
    else if (back) next = (index - 1 + swatches.length) % swatches.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = swatches.length - 1;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onPick(swatches[next]!.path);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden="true" className="text-caption text-fg-muted">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {swatches.map((swatch, i) => {
          const on = swatch.path === checked;
          return (
            <button
              key={swatch.path}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={swatch.name}
              title={swatch.name}
              tabIndex={i === stop ? 0 : -1}
              disabled={disabled}
              onClick={() => onPick(swatch.path)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex size-8 items-center justify-center rounded-full border-2 disabled:cursor-not-allowed disabled:opacity-60 ${on ? "border-fg-heading" : "border-transparent hover:border-edge-strong"}`}
            >
              <span aria-hidden="true" className="block size-6 rounded-full border border-edge bg-team" style={swatchStyle(paint(swatch.path))} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Any colour: the native picker and the `#rrggbb` field, both storing the literal. */
function CustomColour({
  label,
  value,
  isLiteral,
  disabled,
  onValue,
}: {
  label: string;
  value: string;
  isLiteral: boolean;
  disabled: boolean;
  onValue: (next: string) => void;
}) {
  const t = useTranslations("designer.inspector.colour");
  const seed = isLiteral ? value : "";
  const [draft, setDraft] = useState(seed);
  const [refused, setRefused] = useState(false);
  // Re-seeded when the stored value changes from OUTSIDE (a swatch, undo, another layer) — adjusted during render, never
  // by remounting, which would drop the focus mid-typing and close the native picker mid-drag.
  const [seenSeed, setSeenSeed] = useState(seed);
  if (seed !== seenSeed) {
    setSeenSeed(seed);
    if (normaliseHex(draft) !== seed) {
      setDraft(seed);
      setRefused(false);
    }
  }

  const type = (raw: string) => {
    setDraft(raw);
    const hex = normaliseHex(raw);
    if (hex) {
      setRefused(false);
      onValue(hex);
    }
  };

  return (
    <Field
      label={label}
      error={refused ? t.rich("invalidHex", { bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi> }) : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="relative inline-flex size-11 shrink-0 overflow-clip rounded-full border border-edge bg-team" style={swatchStyle(value)}>
          <input
            type="color"
            aria-label={t("picker")}
            disabled={disabled}
            value={value || "#000000"}
            onChange={(e) => type(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <Input
          type="text"
          dir="ltr"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          placeholder="#rrggbb"
          aria-label={t("hex")}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setRefused(false);
            type(e.target.value);
          }}
          onBlur={() => setRefused(draft.trim() !== "" && normaliseHex(draft) === null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setRefused(draft.trim() !== "" && normaliseHex(draft) === null);
            }
          }}
          invalid={refused}
          className="flex-1"
        />
      </div>
    </Field>
  );
}
