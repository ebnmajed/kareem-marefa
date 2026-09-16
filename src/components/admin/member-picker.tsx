"use client";

import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { formatNumber } from "@/components/sessions/numerals";
import type { ComboboxOption } from "@/components/ui";

// The member picker of SCR-053's manual adjustment and SCR-054's manual badge
// award — a thin wrapper over `ui/combobox` (Arabic-normalised matching, the
// ARIA 1.2 pattern), with a member's email as the second line.
//
// ★ Wave 8: a CONTROL, used inside `<Field>`, like `Input`. It drew its own
// `<label>` with an asterisk — never «مطلوب» (REQ-UIX-011) — and no error or
// hint; `ui/combobox` reads the Field's id, description and invalid state
// itself (wave 7, R2), so the Field now owns the label and this owns only the
// options.

export interface PickableMember {
  id: string;
  displayName: string | null;
  email: string;
}

export function MemberPicker({
  members,
  name,
  placeholder,
  noMatches,
  defaultValue,
}: {
  members: PickableMember[];
  name: string;
  placeholder: string;
  noMatches: string;
  /** A member id, for a form handed back after a refusal. */
  defaultValue?: string;
}) {
  const t = useTranslations("admin.combobox");
  const options: ComboboxOption[] = members.map((m) => ({
    value: m.id,
    label: m.displayName ?? m.email,
    hint: m.displayName ? m.email : undefined,
  }));

  return (
    <Combobox
      name={name}
      options={options}
      placeholder={placeholder}
      defaultValue={defaultValue ? [defaultValue] : undefined}
      // The zero-results case says «لا يوجد عضو مطابق»; a count falls back to
      // the combobox's own announcement.
      resultsLabel={(count) => (count === 0 ? noMatches : t("resultsCount", { count, value: formatNumber(count) }))}
    />
  );
}
