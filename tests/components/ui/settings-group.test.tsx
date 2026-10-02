// `ui/settings-group` — REQ-UIX-081, DEC-216 §2.1, DEC-218 §2, `M10c.md` §6b.
//
// The behaviour, not the picture: a switch row is a form that saves on change and reverts on a refusal, with the
// reason beside it; a link row navigates; an action row carries the screen's own control; the title is always the
// group's name and is drawn only when asked. jsdom's document is RTL (`vitest.config.ts`).
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import axe from "axe-core";
import type { SettingsRow, SettingsSwitchState } from "@/components/ui";
import { SettingsGroup } from "@/components/ui/settings-group";

// `ui/link` is next-intl's locale-aware link, which reads the locale from the provider.
const WithLocale = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{}}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: WithLocale });

function switchRow(action: (prev: SettingsSwitchState, fd: FormData) => Promise<SettingsSwitchState>, checked = true): SettingsRow {
  return {
    kind: "switch",
    id: "reminders",
    label: "تذكيرات الجلسات",
    checked,
    action,
    hidden: { category: "reminders" },
    errorLabel: "تعذّر حفظ التفضيل. حاول مرة أخرى.",
    saveLabel: "حفظ",
  };
}

const LINKS: SettingsRow[] = [
  { kind: "link", id: "calendar", label: "تقويم Google", value: "متصل", href: "/app/me/calendar" },
  { kind: "link", id: "connect", label: "اربط", href: "/api/calendar/connect", external: true },
];

describe("SettingsGroup", () => {
  it("names its section by the title, drawn by default and kept as the name when hidden", () => {
    const { rerender } = render(<SettingsGroup title="الإشعارات" rows={LINKS} />);
    expect(screen.getByRole("region", { name: "الإشعارات" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "الإشعارات" })).not.toHaveClass("sr-only");

    rerender(<SettingsGroup title="الإشعارات" showTitle={false} headingLevel="h3" rows={LINKS} />);
    expect(screen.getByRole("region", { name: "الإشعارات" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "الإشعارات" })).toHaveClass("sr-only");
  });

  it("a switch row posts its own value with its hidden fields when it changes", async () => {
    const action = vi.fn(async (_prev: SettingsSwitchState, fd: FormData) => ({ checked: fd.get("enabled") === "on", failed: false }));
    render(<SettingsGroup title="الإشعارات" rows={[switchRow(action)]} />);
    const control = screen.getByRole("switch", { name: "تذكيرات الجلسات" });
    expect(control).toBeChecked();

    await act(async () => {
      fireEvent.click(control);
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const posted = action.mock.calls[0][1];
    expect(posted.get("category")).toBe("reminders");
    expect(posted.get("enabled")).toBeNull(); // switched OFF: an unchecked box posts nothing
    await waitFor(() => expect(screen.getByRole("switch", { name: "تذكيرات الجلسات" })).not.toBeChecked());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("★ a refused save returns the switch to the server's value and says so beside it", async () => {
    const action = vi.fn(async () => ({ checked: true, failed: true }));
    render(<SettingsGroup title="الإشعارات" rows={[switchRow(action)]} />);
    const control = screen.getByRole("switch", { name: "تذكيرات الجلسات" });

    await act(async () => {
      fireEvent.click(control);
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذّر حفظ التفضيل"));
    expect(screen.getByRole("switch", { name: "تذكيرات الجلسات" })).toBeChecked();
  });

  it("works without JavaScript: the row is a form with a <noscript> submit and the switch's name", () => {
    const { container } = render(<SettingsGroup title="الإشعارات" rows={[switchRow(vi.fn())]} />);
    const form = container.querySelector("form")!;
    expect(form.querySelector('input[type="hidden"][name="category"]')).toHaveAttribute("value", "reminders");
    expect(form.querySelector('input[role="switch"]')).toHaveAttribute("name", "enabled");
    expect(form.querySelector("noscript")).not.toBeNull();
  });

  it("a link row is the whole row; an external one is a plain anchor, the value drawn before the chevron", () => {
    render(<SettingsGroup title="روابط" rows={LINKS} />);
    const calendar = screen.getByRole("link", { name: /تقويم Google/ });
    expect(calendar).toHaveTextContent("متصل");
    expect(calendar.getAttribute("href")).toMatch(/\/app\/me\/calendar$/);
    expect(screen.getByRole("link", { name: "اربط" })).toHaveAttribute("href", "/api/calendar/connect");
    // The chevron points forward, and mirrors in RTL.
    expect(calendar.querySelector("svg")).toHaveAttribute("data-direction", "forward");
  });

  it("an action row carries the screen's control and a second line in <bdi>", () => {
    render(
      <SettingsGroup
        title="لم تُضف"
        rows={[{ kind: "action", id: "s1", label: "العرض في 5 شرائح", detail: "اليوم 6:30 م", control: <button type="button">أعد المحاولة</button> }]}
      />,
    );
    const row = screen.getByRole("listitem");
    expect(within(row).getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
    expect(within(row).getByText("اليوم 6:30 م").tagName).toBe("BDI");
  });

  it("is axe-clean with every kind of row", async () => {
    const { container } = render(
      <SettingsGroup
        title="الإعدادات"
        rows={[switchRow(vi.fn()), ...LINKS, { kind: "action", id: "a", label: "تقويم Google", value: "متصل", control: <button type="button">افصل</button> }]}
      />,
    );
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
