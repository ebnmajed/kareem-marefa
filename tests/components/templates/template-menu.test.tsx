// SCR-055's card menu (wave 23, REQ-UIX-108, REQ-DSG-008, REQ-UIX-013) — with the server actions mocked.
//
// ★ LEDGER C-8 (wave 27, DEC-254 §3): every card is the org's own — the platform card and its «انسخ لتعدّل» are gone
// with the platform library, and the copy action is `duplicate`, not `duplicateFromPlatform`. A card opens, copies,
// sets the default in one move, publishes while a draft exists, renames and retires — the retire confirm naming the
// template and how many sessions use it. A result is a toast from the action's own answer.
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arTemplates from "@/messages/ar/templates.json";
import arUi from "@/messages/ar/ui.json";

const actions = {
  duplicate: vi.fn(),
  editTemplate: vi.fn(),
  makeDefault: vi.fn(),
  publishVersion: vi.fn(),
  rename: vi.fn(),
  setRetired: vi.fn(),
};
vi.mock("@/app/[locale]/app/admin/templates/actions", () => ({
  duplicate: (...a: unknown[]) => actions.duplicate(...a),
  editTemplate: (...a: unknown[]) => actions.editTemplate(...a),
  makeDefault: (...a: unknown[]) => actions.makeDefault(...a),
  publishVersion: (...a: unknown[]) => actions.publishVersion(...a),
  rename: (...a: unknown[]) => actions.rename(...a),
  setRetired: (...a: unknown[]) => actions.setRetired(...a),
}));
const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const menu = await import("@/components/templates/template-menu");
const { OrgTemplateMenu } = menu;

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arTemplates, ...arUi }}>
    <div dir="rtl">{children}</div>
  </NextIntlClientProvider>
);

const org = (over: Partial<React.ComponentProps<typeof OrgTemplateMenu>> = {}) =>
  render(
    <OrgTemplateMenu locale="ar" purpose="certificate" templateId="t1" name="ورقي" isDefault={false} retired={false} hasDraft={false} usageCount={2} {...over} />,
    { wrapper: Wrap },
  );

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ status: "ok", kind: "defaultSet", at: 1 });
  show.mockReset();
});

describe("SCR-055's card menu", () => {
  it("★ there is no platform card any more — the module exports the org card alone", () => {
    expect(Object.keys(menu)).toEqual(["OrgTemplateMenu"]);
  });

  it("copying one's own template names the copy in a dialog and calls `duplicate`", async () => {
    const user = userEvent.setup();
    org();
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    await user.click(screen.getByRole("menuitem", { name: "انسخ" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("ورقي");
    expect(screen.queryByText("انسخ لتعدّل")).toBeNull();
    await user.click(screen.getByRole("button", { name: "انسخ" }));
    expect(actions.duplicate).toHaveBeenCalledWith("ar", "certificate", "t1", expect.any(FormData));
  });

  it("★ an org card sets its kind's default in one move, and the toast is the action's answer", async () => {
    const user = userEvent.setup();
    org();
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["افتح في المصمّم", "انسخ", "اجعله الافتراضي", "غيّر الاسم", "أحِله للتقاعد"]);
    await user.click(screen.getByRole("menuitem", { name: "اجعله الافتراضي" }));
    expect(actions.makeDefault).toHaveBeenCalledWith("ar", "certificate", "t1");
    expect(show).toHaveBeenCalledWith({ tone: "success", title: "صار هذا القالب الافتراضي لعائلته." });
  });

  it("the default carries no «اجعله الافتراضي»; a draft adds «انشر إصدارًا جديدًا»; a retired one is restored, not opened", async () => {
    const user = userEvent.setup();
    const { unmount } = org({ isDefault: true, hasDraft: true });
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    const names = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(names).not.toContain("اجعله الافتراضي");
    expect(names).toContain("انشر إصدارًا جديدًا");
    await user.keyboard("{Escape}");
    unmount();

    org({ retired: true });
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    const retired = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(retired).toEqual(["انسخ", "غيّر الاسم", "أعِده للخدمة"]);
  });

  it("REQ-UIX-013: retiring confirms by name and says how many sessions use it", async () => {
    const user = userEvent.setup();
    actions.setRetired.mockResolvedValue({ status: "ok", kind: "retired", at: 1 });
    org();
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    await user.click(screen.getByRole("menuitem", { name: "أحِله للتقاعد" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("ورقي");
    expect(dialog).toHaveTextContent("مستخدم في جلستين");
    await user.click(screen.getByRole("button", { name: "أحِله للتقاعد" }));
    expect(actions.setRetired).toHaveBeenCalledWith("ar", "certificate", "t1", true);
    expect(show).toHaveBeenCalledWith({ tone: "success", title: "أُحيل القالب للتقاعد." });
  });

  it("★ D6: retiring the last template of a kind is refused, and the toast says why in one line", async () => {
    const user = userEvent.setup();
    actions.setRetired.mockResolvedValue({ status: "last_template", at: 1 });
    org();
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    await user.click(screen.getByRole("menuitem", { name: "أحِله للتقاعد" }));
    await user.click(screen.getByRole("button", { name: "أحِله للتقاعد" }));
    expect(show).toHaveBeenCalledWith({ tone: "error", title: "لا يمكن إحالته للتقاعد: هو آخر قالب منشور لهذا النوع." });
    // The confirm stays open: nothing was retired.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a refused name stays at the field (noValidate), and nothing is toasted as success", async () => {
    const user = userEvent.setup();
    actions.rename.mockResolvedValue({ status: "invalid_field", field: "name", error: "nameRequired", at: 1 });
    org();
    await user.click(screen.getByRole("button", { name: "إجراءات أخرى" }));
    await user.click(screen.getByRole("menuitem", { name: "غيّر الاسم" }));
    await user.clear(screen.getByLabelText(/الاسم/));
    await user.click(screen.getByRole("button", { name: "احفظ" }));
    expect(await screen.findByText("اكتب اسمًا للقالب.")).toBeInTheDocument();
    expect(show).not.toHaveBeenCalled();
  });
});
