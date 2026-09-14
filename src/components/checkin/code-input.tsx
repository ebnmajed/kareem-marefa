"use client";

import { useRef, useState } from "react";

// SCR-014's six-character code entry — "the most operationally important
// input in the product": six boxes ≥ 44 px, per-character focus advance,
// backspace-to-previous, paste support, autocorrect/autocapitalize off.
// The code is Latin and enters left-to-right inside an RTL page — each box
// is `dir="ltr"`; the surrounding labels stay RTL. A single hidden field
// carries the assembled value so the existing Server Action (which reads
// FormData's `code` field) doesn't change.
const LENGTH = 6;

export function CodeInput({ name, id, defaultValue }: { name: string; id: string; defaultValue?: string }) {
  const [chars, setChars] = useState<string[]>(() => {
    const seed = (defaultValue ?? "").toUpperCase().split("");
    return Array.from({ length: LENGTH }, (_, i) => seed[i] ?? "");
  });
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setChar(index: number, value: string) {
    setChars((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    const value = raw.toUpperCase().slice(-1);
    setChar(index, value);
    if (value && index < LENGTH - 1) boxRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[index] && index > 0) {
      boxRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!pasted) return;
    e.preventDefault();
    setChars(Array.from({ length: LENGTH }, (_, i) => pasted[i] ?? ""));
    boxRefs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  return (
    <div>
      <input type="hidden" name={name} value={chars.join("")} />
      <div className="flex gap-2" dir="ltr" role="group" aria-labelledby={`${id}-label`}>
        {chars.map((char, i) => (
          <input
            key={i}
            ref={(el) => {
              boxRefs.current[i] = el;
            }}
            id={i === 0 ? id : undefined}
            value={char}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={1}
            className="h-14 w-full min-w-11 rounded-field border border-edge-strong bg-canvas text-center text-h2 text-fg-heading uppercase"
          />
        ))}
      </div>
    </div>
  );
}
