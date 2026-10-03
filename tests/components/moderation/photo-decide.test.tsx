// SCR-051's decision (REQ-UIX-104, REQ-EVT-012, REQ-EVT-014, REQ-UIX-013) — the deleted takedown card's cases carried
// against the control that replaced it (notes/content.md W22.8): «احذف نهائيًا» confirms in a dialog naming the
// session with its reason at the field; the other decision is one press; after either, focus moves to the next row.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { Decide } from "@/app/[locale]/app/admin/moderation/photos/_components/decide";
import type { ModerationState } from "@/app/[locale]/app/admin/moderation/state";
import { SplitView } from "@/components/ui/split-view";
import photos from "@/messages/ar/photos.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...photos, ...ui };
type Remove = (prev: ModerationState, fd: FormData) => Promise<ModerationState>;
type Run = () => Promise<ModerationState>;

function mount(remove: Remove, run: Run, label = "أعدها للعرض") {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <SplitView
        label="صور بانتظار القرار"
        narrow="list"
        currentId="p1"
        items={[
          { id: "p1", href: "/app/admin/moderation/photos/p1", children: "صورة من «الأرقام التي تكذب»" },
          { id: "p2", href: "/app/admin/moderation/photos/p2", children: "صورة من «العرض في 5 شرائح»" },
        ]}
        detail={<Decide sessionTitle="الأرقام التي تكذب" remove={remove} other={{ label, run }} />}
      />
    </NextIntlClientProvider>,
  );
}

const done: ModerationState = { error: null, done: true };

describe("SCR-051 · Decide", () => {
  it("«أعدها للعرض» is one press, with no dialog, and focus lands on the next photo", async () => {
    const run = vi.fn<Run>().mockResolvedValue(done);
    mount(vi.fn<Remove>(), run);
    await userEvent.click(screen.getByRole("button", { name: "أعدها للعرض" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: "صورة من «العرض في 5 شرائح»" })).toHaveFocus());
  });

  it("a reported photo's other decision is «تجاهل»", async () => {
    const run = vi.fn<Run>().mockResolvedValue(done);
    mount(vi.fn<Remove>(), run, "تجاهل");
    await userEvent.click(screen.getByRole("button", { name: "تجاهل" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("★ «احذف نهائيًا» confirms in a dialog naming the session, and the reason travels", async () => {
    const remove = vi.fn<Remove>().mockResolvedValue(done);
    mount(remove, vi.fn<Run>());
    await userEvent.click(screen.getByRole("button", { name: "احذف نهائيًا" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف صورة من «الأرقام التي تكذب»؟" });
    await userEvent.type(within(dialog).getByLabelText("السبب — يُسجَّل في سجل التدقيق", { exact: false }), "تخالف السياسة");
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect((remove.mock.calls[0][1] as FormData).get("reason")).toBe("تخالف السياسة");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cancelling never calls the action; a missing reason is said at the field and the dialog stays", async () => {
    const remove = vi.fn<Remove>().mockResolvedValue({ error: "reason_required", done: false });
    mount(remove, vi.fn<Run>());
    await userEvent.click(screen.getByRole("button", { name: "احذف نهائيًا" }));
    let dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "تراجع" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "احذف نهائيًا" }));
    dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "احذف" }));
    expect(await within(dialog).findByText("اكتب السبب أولًا.")).toBeVisible();
  });

  it("has no axe violations, closed or with the dialog open", async () => {
    const { container } = mount(vi.fn<Remove>(), vi.fn<Run>());
    const rules = { rules: { "color-contrast": { enabled: false } } };
    expect((await axe.run(container, rules)).violations).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "احذف نهائيًا" }));
    await screen.findByRole("dialog");
    expect((await axe.run(container, rules)).violations).toEqual([]);
  }, 20000);
});
