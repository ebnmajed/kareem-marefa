// The `ImpersonationBanner` slot — SCR-085, REQ-ADM-002, REQ-ADM-019, wave 8
// (`docs/plan/notes/platform.md` W8.1, F7). An async Server Component awaited
// directly, with the DAL mocked and the real `ar/platform.json`.
//
// Three properties no screenshot proves: it renders nothing without a live
// session (it sits on every console screen and on `/no-access`), the org's name
// is bidi-isolated, and the end is a CLOCK TIME — a countdown rendered in a
// layout goes stale on the first client-side navigation.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/platform.json";

vi.mock("@/lib/dal/platform", () => ({ getMyActiveImpersonation: vi.fn() }));
vi.mock("@/components/platform/actions", () => ({ stopImpersonationAction: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserClient: () => ({ auth: { refreshSession: vi.fn(async () => ({})) } }) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "platform.banner" }),
}));

const { getMyActiveImpersonation } = await import("@/lib/dal/platform");
const { ImpersonationBanner } = await import("@/components/platform/impersonation-banner");

async function renderBanner() {
  const element = await ImpersonationBanner({ locale: "ar" });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("ImpersonationBanner", () => {
  it("renders nothing without a live session", async () => {
    vi.mocked(getMyActiveImpersonation).mockResolvedValue(null);
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("names the org in a <bdi>, ends at a clock time in Western digits, and carries the one stop control", async () => {
    vi.mocked(getMyActiveImpersonation).mockResolvedValue({
      id: "4b7a0c5e-1f7d-4d0e-9d3a-2a4c3b1e0f00",
      orgId: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11",
      orgName: "Acme للاستشارات",
      // 11:32 UTC is 14:32 in Riyadh.
      expiresAt: "2026-09-17T11:32:00.000Z",
      minutesRemaining: 42,
    });
    await renderBanner();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("جلسة استثنائية");
    const org = screen.getByText("Acme للاستشارات");
    expect(org.tagName).toBe("BDI");

    const ends = screen.getByText(/تنتهي عند/);
    expect(ends).toHaveTextContent(/2:32/);
    expect(ends.textContent).not.toMatch(/[٠-٩۰-۹]/);
    // ★ Never a countdown (F7).
    expect(status).not.toHaveTextContent(/تنتهي خلال|42/);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "أنهِ الجلسة" })).toBeInTheDocument();
  });

  it("★ says what the session does, not more: it names the org, the org's own log, and that the org's screens do not open", async () => {
    vi.mocked(getMyActiveImpersonation).mockResolvedValue({
      id: "4b7a0c5e-1f7d-4d0e-9d3a-2a4c3b1e0f00",
      orgId: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11",
      orgName: "مؤسسة التجربة",
      expiresAt: "2026-09-17T11:32:00.000Z",
      minutesRemaining: 42,
    });
    await renderBanner();
    const status = screen.getByRole("status");
    // DEC-055 option C: the session browses nothing, so nothing here says it does.
    expect(status).not.toHaveTextContent(/تتصفح|محدود بالقراءة/);
    expect(status).toHaveTextContent("سجل تدقيق المؤسسة نفسها");
    expect(status).toHaveTextContent("شاشات المؤسسة لا تُفتح أثناء هذه الجلسة.");
    // On a phone the stop control is its own full-width row (sync 4's 390 px capture).
    expect(screen.getByRole("button", { name: "أنهِ الجلسة" })).toHaveClass("w-full", "sm:w-auto");
  });

  it("is axe-clean with a live session", async () => {
    vi.mocked(getMyActiveImpersonation).mockResolvedValue({
      id: "4b7a0c5e-1f7d-4d0e-9d3a-2a4c3b1e0f00",
      orgId: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11",
      orgName: "مؤسسة التجربة",
      expiresAt: "2026-09-17T11:32:00.000Z",
      minutesRemaining: 42,
    });
    const { container } = await renderBanner();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});
