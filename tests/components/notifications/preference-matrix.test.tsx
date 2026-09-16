// `PreferenceMatrix` — SCR-026, REQ-NTF-003. Same direct-await pattern as
// notification-list.test.tsx (an async server component; see that file's
// header for why the parent page is not rendered this way).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/notifications.json";
import type { Locale } from "@/i18n/routing";
import type { CategoryPreference } from "@/lib/dal/notifications";

vi.mock("@/app/[locale]/app/me/notifications/actions", () => ({ savePreference: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "notifications" }),
}));

const { PreferenceMatrix } = await import("@/components/notifications/preference-matrix");

const switchableRow: CategoryPreference = {
  category: "my_sessions",
  switchable: true,
  available: { inApp: true, email: true },
  enabled: { inApp: true, email: false },
  alwaysOn: ["MSG-session_cancelled"],
};

const fixedRow: CategoryPreference = {
  category: "reminders",
  switchable: false,
  available: { inApp: true, email: true },
  enabled: { inApp: true, email: true },
  alwaysOn: [],
};

async function renderMatrix(rows: CategoryPreference[]) {
  const element = await PreferenceMatrix({ rows, locale: "ar" as Locale });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("PreferenceMatrix", () => {
  it("renders a switchable category's two channel toggles and its always-on exception", async () => {
    await renderMatrix([switchableRow]);
    expect(screen.getByRole("button", { name: /جلساتي — داخل التطبيق — مُفعّل/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /جلساتي — البريد الإلكتروني — موقوف/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/أُلغيت جلسة حجزت فيها/)).toBeInTheDocument();
  });

  it("renders a fixed category as a statement, never a disabled switch — 09 SCR-026's own rule", async () => {
    await renderMatrix([fixedRow]);
    expect(screen.getByText("يصلك دائمًا")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /التذكيرات/ })).not.toBeInTheDocument();
  });

  it("shows 'not available' rather than an off switch for a channel no message in the category uses", async () => {
    await renderMatrix([{ ...switchableRow, available: { inApp: true, email: false } }]);
    expect(screen.getByText("لا يُرسل على هذه القناة")).toBeInTheDocument();
  });

  it("is axe-clean with a mixed matrix", async () => {
    const { container } = await renderMatrix([switchableRow, fixedRow]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
