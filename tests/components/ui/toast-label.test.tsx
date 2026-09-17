// `ui/toast` — what a screen reader says BEFORE a toast.
//
// Radix names the toast region «Notification» unless told otherwise, and it
// prefixes every announcement with that word. So since M9 an Arabic toast was
// announced «Notification تتم معالجة الصورة الآن…» — an English word in front
// of every Arabic message, in the one place a sighted reviewer never looks.
// Wave 9 found it by accident: a strict-mode locator matched the live region.
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "@/components/ui/toast";

function Trigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show({ title: "تتم معالجة الصورة الآن…" })}>
      أظهر
    </button>
  );
}

function mount(label?: string) {
  return render(
    <ToastProvider closeLabel="إغلاق الإشعار" label={label}>
      <Trigger />
    </ToastProvider>,
  );
}

describe("ToastProvider — the announced label", () => {
  it("announces the localised word, and no English one", async () => {
    mount("إشعار");
    await act(async () => screen.getByRole("button", { name: "أظهر" }).click());
    const region = await screen.findByRole("region");
    expect(region.getAttribute("aria-label") ?? "").toContain("إشعار");
    expect(document.body.textContent ?? "").not.toContain("Notification");
  });

  it("an omitted label keeps Radix's default — so a bare provider in a component test still mounts", async () => {
    mount();
    await act(async () => screen.getByRole("button", { name: "أظهر" }).click());
    expect(await screen.findByText("تتم معالجة الصورة الآن…")).toBeInTheDocument();
  });
});
