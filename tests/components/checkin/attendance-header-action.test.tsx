// SCR-044's header action — `sessions`' contract 4 (REQ-UIX-090, DEC-228 §4.6). One link or null; never a throw.
import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";

const offers = vi.fn<(locale: string, id: string) => Promise<boolean>>();
vi.mock("@/lib/dal/checkin", () => ({ offersHostScreen: (l: string, id: string) => offers(l, id) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => createTranslator({ locale: "ar", messages: checkin, namespace: namespace as "checkin.attendance" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={`/ar${href}`} {...rest}>
      {children}
    </a>
  ),
}));

const { AttendanceHeaderAction } = await import("@/components/checkin/attendance-header-action");
const SESSION = "11111111-1111-4111-8111-111111111111";

async function draw() {
  const node = await AttendanceHeaderAction({ locale: "ar", sessionId: SESSION });
  return render(
    <NextIntlClientProvider locale="ar" messages={checkin}>
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => offers.mockReset());

describe("AttendanceHeaderAction", () => {
  it("is one link to the host view while the session can take attendance", async () => {
    offers.mockResolvedValue(true);
    const { container } = await draw();
    const link = screen.getByRole("link", { name: "شاشة التقديم" });
    expect(link.getAttribute("href")).toBe(`/ar/app/sessions/${SESSION}/host`);
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("h1, h2, h3, nav, section, header, main")).toBeNull();
  });

  it("is null otherwise — completed, archived, cancelled, a member, a failed read", async () => {
    offers.mockResolvedValue(false);
    expect(await AttendanceHeaderAction({ locale: "ar", sessionId: SESSION })).toBeNull();
  });
});
