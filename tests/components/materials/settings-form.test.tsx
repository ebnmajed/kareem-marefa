// `SettingsForm` — REQ-MAT-005/006. `ui/select`/`ui/checkbox` are `sessions`'
// files (imported here, never edited — per-file ownership, `16` §17 /
// DEC-085); this file only tests `SettingsForm`'s own logic: the optimistic
// update, the network-failure revert, and the toast. First dedicated test
// for this component — it previously had none of its own.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/materials.json";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/components/materials/actions", () => ({
  saveMaterialSettings: vi.fn().mockResolvedValue({ ok: true }),
}));

const { SettingsForm } = await import("@/components/materials/settings-form");

function renderForm(props: Partial<Parameters<typeof SettingsForm>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ToastProvider closeLabel="إغلاق">
        <SettingsForm locale="ar" materialId="m1" phase="after" allowDownload={false} {...props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SettingsForm", () => {
  // ★ The lead's real-build finding, materials capture 296aec4 row 8: this
  // row used to be a raw native `<select>` and a raw native checkbox — a
  // blue browser-default box beside the system's own controls at 390 px.
  // Now `ui/select` (native under the hood, still role="combobox" — `16`
  // §4.2 keeps the platform control deliberately) and `ui/checkbox`
  // (self-labelling — its own wrapping `<label>` IS the accessible name).
  it("renders the system select and the self-labelling checkbox", () => {
    renderForm();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "السماح بالتحميل" })).toBeInTheDocument();
  });

  it("changes the phase optimistically, before the action resolves", async () => {
    const { saveMaterialSettings } = await import("@/components/materials/actions");
    renderForm({ phase: "after" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "before" } });
    expect(screen.getByRole("combobox")).toHaveValue("before"); // optimistic — no await yet
    await waitFor(() => expect(saveMaterialSettings).toHaveBeenCalledWith("ar", "m1", { phase: "before" }));
  });

  it("changes allowDownload optimistically, before the action resolves", async () => {
    const { saveMaterialSettings } = await import("@/components/materials/actions");
    renderForm({ allowDownload: false });
    fireEvent.click(screen.getByRole("checkbox", { name: "السماح بالتحميل" }));
    expect(screen.getByRole("checkbox")).toBeChecked(); // optimistic — no await yet
    await waitFor(() => expect(saveMaterialSettings).toHaveBeenCalledWith("ar", "m1", { allowDownload: true }));
  });

  // ★ No `useOptimistic` here (unlike `comment-item.tsx`'s `toggleLike`) —
  // the revert on a network-level failure is explicit, a captured `previous`
  // value set back on catch.
  it("reverts the phase select and toasts on a network-level failure", async () => {
    const { saveMaterialSettings } = await import("@/components/materials/actions");
    vi.mocked(saveMaterialSettings).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderForm({ phase: "after" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "before" } });
    await screen.findByText("تعذّر حفظ هذا الإعداد. حاول مرة أخرى.");
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("after"));
  });

  it("reverts the checkbox and toasts on a network-level failure", async () => {
    const { saveMaterialSettings } = await import("@/components/materials/actions");
    vi.mocked(saveMaterialSettings).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderForm({ allowDownload: false });
    fireEvent.click(screen.getByRole("checkbox", { name: "السماح بالتحميل" }));
    await screen.findByText("تعذّر حفظ هذا الإعداد. حاول مرة أخرى.");
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  });

  it("is accessible", async () => {
    const { container } = renderForm();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
