// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. Token migration, not a behaviour change: every class `combobox.tsx`
// had before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. Not wrapped in `<PlayScope>` — see
// `data-table-scope.test.tsx`'s header comment (`next/font/google` has no
// jsdom alias in `vitest.config.ts`, a lead-only file; jsdom applies no CSS
// either way, so the assertion is the class string's presence).
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui";
import ar from "@/messages/ar/admin.json";
import arUi from "@/messages/ar/ui.json";

function Wrap({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider locale="ar" messages={{ ...ar, ...arUi }}>{children}</NextIntlClientProvider>;
}

const OPTIONS: ComboboxOption[] = [
  { value: "p1", label: "سارة العتيبي" },
  { value: "p2", label: "خالد الحربي" },
];

describe("Combobox — the playground's scope, token-only", () => {
  it("a multi-select chip keeps its resting fill and gains the scope's raised step", () => {
    render(
      <Wrap>
        <Combobox name="presenters" options={OPTIONS} multiple defaultValue={["p1"]} />
      </Wrap>,
    );
    const chip = screen.getByText("سارة العتيبي").closest("span");
    expect(chip).toHaveClass("bg-silver-100");
    expect(chip).toHaveClass("pg:bg-raised");
  });

  it("the chip's remove control keeps its resting-state class and gains the scope's hover step", () => {
    render(
      <Wrap>
        <Combobox name="presenters" options={OPTIONS} multiple defaultValue={["p1"]} />
      </Wrap>,
    );
    const remove = screen.getByRole("button", { name: /سارة العتيبي/ });
    expect(remove).toHaveClass("hover:bg-silver-200");
    expect(remove).toHaveClass("pg:hover:bg-hover");
  });

  it("the popup drops its shadow inside the scope, keeping the line that already told it apart", async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <Combobox name="presenter" options={OPTIONS} />
      </Wrap>,
    );
    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("shadow-lg");
    expect(listbox).toHaveClass("pg:shadow-none");
    expect(listbox).toHaveClass("border", "border-edge-strong");
  });

  it("a highlighted option keeps its resting fill and gains the scope's hover step", async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <Combobox name="presenter" options={OPTIONS} />
      </Wrap>,
    );
    await user.click(screen.getByRole("combobox"));
    const first = screen.getAllByRole("option")[0];
    await user.hover(first);
    expect(first).toHaveClass("bg-silver-100");
    expect(first).toHaveClass("pg:bg-hover");
  });
});
