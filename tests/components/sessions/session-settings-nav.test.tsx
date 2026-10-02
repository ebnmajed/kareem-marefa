// The session settings hub's strip — REQ-SES-020, DEC-178. Real ar/sessions.json;
// the DAL and the route segment mocked.
//
// A NEW file (wave-13 rule 7).
import { render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/sessions.json";
import type { SessionSettingsNav as NavDTO } from "@/lib/dal/sessions";

const SESSION = "00000000-0000-4000-8000-0000000000cc";
const state: { segment: string | null; nav: NavDTO | null } = { segment: "schedule", nav: null };

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as never }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSelectedLayoutSegment: () => state.segment,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/dal/sessions", () => ({ getSessionSettingsNav: async () => state.nav }));

const { SessionSettingsNav } = await import("@/components/sessions/session-settings-nav");

async function mount() {
  const element = await SessionSettingsNav({ locale: "ar", sessionId: SESSION });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {element}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.segment = "schedule";
  state.nav = { items: ["schedule", "attendance", "certificates", "survey", "event"] };
});

describe("the hub's strip", () => {
  it("is a named navigation of links, in the order a session is lived", async () => {
    await mount();
    const nav = screen.getByRole("navigation", { name: "إعدادات الجلسة" });
    const links = within(nav).getAllByRole("link");
    // wave 21 (ledger L21-S3, an expectation named in W21.7): REQ-SES-020's order, and the event page is «المحتوى» —
    // «صفحة الجلسة» moved into the hub's header (DEC-227 §5.3).
    expect(links.map((a) => a.textContent)).toEqual(["الجدولة", "المحتوى", "الحضور", "الاستبانة", "الشهادات"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      `/app/admin/sessions/${SESSION}/schedule`,
      `/app/sessions/${SESSION}`,
      `/app/admin/sessions/${SESSION}/attendance`,
      `/app/admin/sessions/${SESSION}/survey`,
      `/app/admin/sessions/${SESSION}/certificates`,
    ]);
    // Links, not a tablist (REQ-SES-020 names aria-current).
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("marks exactly the current screen, from the route segment", async () => {
    state.segment = "certificates";
    await mount();
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["الشهادات"]);
  });

  it("never marks the event page — it is a way out of the hub", async () => {
    state.segment = null;
    await mount();
    expect(screen.getAllByRole("link").filter((a) => a.hasAttribute("aria-current"))).toEqual([]);
  });

  it("shows only what the DAL says the viewer may open", async () => {
    state.nav = { items: ["attendance", "certificates", "event"] };
    await mount();
    // wave 21 (ledger L21-S3): the same order and label change.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["المحتوى", "الحضور", "الشهادات"]);
  });

  it("renders nothing for a viewer the DAL does not answer for", async () => {
    state.nav = null;
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });

  it("scrolls inside itself rather than wrapping", async () => {
    await mount();
    const list = screen.getByRole("list");
    expect(list.className).toMatch(/\boverflow-x-auto\b/);
    expect(list.className).not.toMatch(/\bflex-wrap\b/);
    for (const link of screen.getAllByRole("link")) expect(link.className).toMatch(/\bh-11\b/);
  });
});
