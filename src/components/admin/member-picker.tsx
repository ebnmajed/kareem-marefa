"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { formatNumber } from "@/components/sessions/numerals";
import type { ComboboxOption } from "@/components/ui";

// `scoring.md`'s carried-over item (console.md, wave-3 story order item 2):
// SCR-053's manual-adjustment form took a raw UUID typed into a text field.
// This picker filled that gap in wave 3; wave 5 (`16` §4.2, `.claude/agents/
// console.md`) PROMOTES the same shape into `ui/combobox.tsx` — the full
// ARIA 1.2 combobox pattern, Arabic-normalised matching, multi-select. This
// file is now a thin wrapper over that primitive, so there is one
// implementation and not two, kept at its EXACT original external shape
// (`members`, `name`, `label`, `required`, `placeholder`, `noMatches`)
// because its one caller, `src/app/[locale]/app/admin/scoring/page.tsx`, is
// not in this track's M9 edit list.

export interface PickableMember {
  id: string;
  displayName: string | null;
  email: string;
}

export function MemberPicker({
  members,
  name,
  label,
  required,
  placeholder,
  noMatches,
}: {
  members: PickableMember[];
  name: string;
  label: string;
  required?: boolean;
  placeholder: string;
  noMatches: string;
}) {
  const inputId = useId();
  const t = useTranslations("admin.combobox");
  const options: ComboboxOption[] = members.map((m) => ({
    value: m.id,
    label: m.displayName ?? m.email,
    hint: m.displayName ? m.email : undefined,
  }));

  return (
    <div>
      <label htmlFor={inputId} className="text-label text-fg-heading">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-error">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1">
        <Combobox
          id={inputId}
          name={name}
          options={options}
          placeholder={placeholder}
          // The zero-results case keeps the exact copy this screen shipped
          // with wave 3 («لا يوجد عضو مطابق»); a non-zero count falls back to
          // `ui/combobox`'s own generic announcement, since this form never
          // had one before and this is a strict addition, not a regression.
          resultsLabel={(count) => (count === 0 ? noMatches : t("resultsCount", { count, value: formatNumber(count, "western") }))}
        />
      </div>
    </div>
  );
}
