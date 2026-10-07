// «نضيف جلساتك إلى تقويم Google؟» — the home's calendar prompt (DEC-276, REQ-CAL-003). The DAL, the OAuth client
// and the cookie store are mocked; the copy is the real Arabic.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/calendar.json";

const cookie = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }) }));
vi.mock("@/app/api/calendar/oauth", () => ({ oauthClient: vi.fn() }));
vi.mock("@/lib/dal/calendar", () => ({ getCalendarConnection: vi.fn() }));
vi.mock("@/components/calendar/actions", () => ({ dismissCalendarPrompt: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "calendar.prompt" }),
}));

const { oauthClient } = await import("@/app/api/calendar/oauth");
const { getCalendarConnection } = await import("@/lib/dal/calendar");
const { CalendarConnectPrompt } = await import("@/components/calendar/calendar-connect-prompt");

async function show() {
  const el = await CalendarConnectPrompt({ locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {el}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(oauthClient).mockReturnValue({ clientId: "id", clientSecret: "secret" });
  vi.mocked(getCalendarConnection).mockResolvedValue(null);
});

describe("CalendarConnectPrompt", () => {
  it("asks while never connected: the question, «اربط» into the Route Handler, and «لاحقًا»", async () => {
    await show();
    expect(screen.getByRole("heading", { name: "نضيف جلساتك إلى تقويم Google؟", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "نعم، اربط تقويمي" })).toHaveAttribute("href", "/api/calendar/connect?locale=ar");
    expect(screen.getByRole("button", { name: "لاحقًا" })).toBeInTheDocument();
  });

  it("renders nothing once a calendar was ever linked — connected or disconnected", async () => {
    vi.mocked(getCalendarConnection).mockResolvedValue({ provider: "google", connectedAt: "2026-10-01T00:00:00Z", disconnectedAt: null } as never);
    expect((await show()).container).toBeEmptyDOMElement();
    vi.mocked(getCalendarConnection).mockResolvedValue({ provider: "google", connectedAt: "2026-10-01T00:00:00Z", disconnectedAt: "2026-10-02T00:00:00Z" } as never);
    expect((await show()).container).toBeEmptyDOMElement();
  });

  it("renders nothing after «لاحقًا» on this device", async () => {
    cookie.value = "dismissed";
    expect((await show()).container).toBeEmptyDOMElement();
  });

  it("renders nothing when the OAuth client is not configured — «اربط» would land on an error", async () => {
    vi.mocked(oauthClient).mockReturnValue(null);
    expect((await show()).container).toBeEmptyDOMElement();
  });
});
