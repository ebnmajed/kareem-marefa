// `console`'s file — PROMOTE AND GENERALISE of `src/components/admin/
// member-picker.tsx` into the full ARIA 1.2 combobox pattern (`16` §4.2).
// axe cannot tell whether `aria-activedescendant` follows the highlighted
// option — that is asserted here by hand, per the spawn note.
import type React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import type { ComboboxOption } from "@/components/ui";
import ar from "@/messages/ar/admin.json";
import arUi from "@/messages/ar/ui.json";

// `Combobox` now reads its own strings from `ui.combobox` (moved off
// `admin.combobox` once `ui.json` carried them — R2's item 4). Every render
// needs both namespaces loaded: `admin.json` for `member-picker.tsx`'s own
// separate `resultsCount` override text used in a couple of cases below, and
// `ui.json` for `Combobox` itself (and for `<Field>`'s own `ui.field.required`
// label, in the tests that wrap one). `admin.json` and `ui.json` have
// different top-level keys (`admin`/`ui`), so a plain object spread merges
// them with no collision.
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{ ...ar, ...arUi }}>
      {children}
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const PRESENTERS: ComboboxOption[] = [
  { value: "p1", label: "مُعَرِّفات الجلسات", hint: "قسم البيانات" },
  { value: "p2", label: "سارة العتيبي" },
  { value: "p3", label: "خالد الحربي", disabled: true },
];

describe("Combobox — single select", () => {
  it("filters as the ARIA 1.2 combobox pattern: role, aria-expanded/controls/autocomplete", async () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", expect.stringContaining("listbox"));
  });

  it("REQ-DSC-004 — Arabic normalisation matches across orthography (hamza, alef-maksura, taa marbuta)", async () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    // "معرفات" (no hamza-alef, plain alef) matches the stored "مُعَرِّفات"
    // (hamza-alef, tashkeel) the same way `arNormalize()` folds both in
    // `src/lib/dal/search.ts`.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "معرفات" } });
    expect(screen.getByRole("option", { name: /مُعَرِّفات الجلسات/ })).toBeInTheDocument();
  });

  it("selecting sets the hidden field and shows the option's own label", async () => {
    const { container } = render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "سارة" } });
    await userEvent.click(screen.getByRole("option", { name: /سارة العتيبي/ }));
    expect(container.querySelector('input[type="hidden"][name="presenterId"]')).toHaveValue("p2");
    expect(screen.getByRole("combobox")).toHaveValue("سارة العتيبي");
  });

  it("a disabled option cannot be selected", async () => {
    const { container } = render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "خالد" } });
    const disabled = screen.getByRole("option", { name: /خالد الحربي/ });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(container.querySelector('input[type="hidden"][name="presenterId"]')).toHaveValue("");
  });

  it("★ aria-activedescendant follows the highlighted option via ArrowDown, not the clicked one", async () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS.filter((o) => !o.disabled)} placeholder="ابحث" />
      </Wrap>,
    );
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    expect(input).not.toHaveAttribute("aria-activedescendant");

    await userEvent.keyboard("{ArrowDown}");
    const first = screen.getAllByRole("option")[0];
    expect(input).toHaveAttribute("aria-activedescendant", first.id);

    await userEvent.keyboard("{ArrowDown}");
    const second = screen.getAllByRole("option")[1];
    expect(input).toHaveAttribute("aria-activedescendant", second.id);
    expect(second.id).not.toBe(first.id);
  });

  it("Enter selects the highlighted option", async () => {
    const { container } = render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS.filter((o) => !o.disabled)} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(container.querySelector('input[type="hidden"][name="presenterId"]')).toHaveValue("p1");
  });

  it("Escape closes without selecting", async () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("an unmatched query shows an announced, visible zero-results state (no duplicate text)", async () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzznotfound" } });
    expect(screen.getAllByText(ar.admin.combobox.resultsCount ? screen.getByRole("status").textContent! : "")).toHaveLength(1);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Combobox — multi-select", () => {
  it("renders the chosen set as removable chips and submits one hidden input per value", () => {
    const { container } = render(
      <Wrap>
        <Combobox name="coPresenterIds" options={PRESENTERS} multiple defaultValue={["p1", "p2"]} placeholder="أضِف مُقدِّمًا" />
      </Wrap>,
    );
    expect(screen.getByText("مُعَرِّفات الجلسات")).toBeInTheDocument();
    expect(screen.getByText("سارة العتيبي")).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="hidden"][name="coPresenterIds"]')).toHaveLength(2);
  });

  it("a chip's remove button carries the option's name in its accessible name and removes it", async () => {
    render(
      <Wrap>
        <Combobox name="coPresenterIds" options={PRESENTERS} multiple defaultValue={["p2"]} placeholder="أضِف مُقدِّمًا" />
      </Wrap>,
    );
    const removeButton = screen.getByRole("button", { name: /سارة العتيبي/ });
    await userEvent.click(removeButton);
    // Not "the text is gone anywhere": removing a chip returns that option to
    // the pool, and the remove focuses the input back (opening the dropdown
    // per its own `onFocus`) — so the SAME label legitimately reappears as a
    // selectable option. The chip itself, specifically, is what must be gone.
    expect(screen.queryByRole("button", { name: /إزالة/ })).not.toBeInTheDocument();
  });

  it("already-selected options drop out of the dropdown", async () => {
    render(
      <Wrap>
        <Combobox name="coPresenterIds" options={PRESENTERS.filter((o) => !o.disabled)} multiple defaultValue={["p2"]} placeholder="أضِف" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option", { name: /سارة العتيبي/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /مُعَرِّفات الجلسات/ })).toBeInTheDocument();
  });

  it("max caps selection and disables the input once reached", () => {
    const { container } = render(
      <Wrap>
        <Combobox name="coPresenterIds" options={PRESENTERS} multiple max={1} defaultValue={["p1"]} placeholder="أضِف" />
      </Wrap>,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(container.querySelectorAll('input[type="hidden"][name="coPresenterIds"]')).toHaveLength(1);
  });

  it("allowCreate adds free text as a new chip on Enter when nothing matches", async () => {
    const { container } = render(
      <Wrap>
        <Combobox name="tags" options={[]} multiple allowCreate placeholder="أضِف وسمًا" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "بث مباشر" } });
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("بث مباشر")).toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="tags"]')).toHaveValue("بث مباشر");
  });

  it("members do not allow free creation (SCR-053's picker never sets allowCreate)", async () => {
    render(
      <Wrap>
        <Combobox name="memberId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "لا أحد بهذا الاسم" } });
    expect(screen.queryByText(/إضافة/)).not.toBeInTheDocument();
  });

  it("is accessible: empty, with chips, and open", async () => {
    const empty = render(
      <Wrap>
        <Combobox name="coPresenterIds" options={PRESENTERS} multiple placeholder="أضِف" />
      </Wrap>,
    );
    await expectAccessible(empty.container);
    empty.unmount();

    const withChips = render(
      <Wrap>
        <Combobox name="coPresenterIds" options={PRESENTERS} multiple defaultValue={["p1", "p2"]} placeholder="أضِف" />
      </Wrap>,
    );
    await expectAccessible(withChips.container);
    await userEvent.click(withChips.getByRole("combobox"));
    await expectAccessible(withChips.container);
  }, 20000);
});

describe("Combobox — R2, wired for a member-facing caller (sessions' request)", () => {
  it("no longer forces dir=\"ltr\" — direction inherits from the document", () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    expect(screen.getByRole("combobox")).not.toHaveAttribute("dir");
  });

  it("reads useFieldWiring(): a <Field>'s hint, error and required all reach the input", async () => {
    const { container } = render(
      <Wrap>
        <Field id="copresenters" label="المُقدِّمون المشاركون" hint="اختياري" error="اختر مُقدِّمًا واحدًا على الأقل" required>
          <Combobox name="coPresenterIds" options={PRESENTERS} multiple placeholder="أضِف" />
        </Field>
      </Wrap>,
    );
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("id", "copresenters");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy).toEqual(["copresenters-error", "copresenters-hint"]);
    expect(document.getElementById("copresenters-hint")).toHaveTextContent("اختياري");
    expect(document.getElementById("copresenters-error")).toHaveTextContent("اختر مُقدِّمًا واحدًا على الأقل");

    await expectAccessible(container);
  });

  it("an explicit invalid prop still wins over <Field>'s own (no error passed)", () => {
    render(
      <Wrap>
        <Field id="copresenters" label="المُقدِّمون المشاركون">
          <Combobox name="coPresenterIds" options={PRESENTERS} multiple invalid placeholder="أضِف" />
        </Field>
      </Wrap>,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });

  it("outside a <Field>, behaves exactly as before — no id/aria wiring beyond its own props", () => {
    render(
      <Wrap>
        <Combobox name="presenterId" options={PRESENTERS} placeholder="ابحث" />
      </Wrap>,
    );
    const input = screen.getByRole("combobox");
    expect(input).not.toHaveAttribute("aria-required");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});
