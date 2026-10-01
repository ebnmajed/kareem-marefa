// SCR-012's phone top row (REQ-UIX-061, DEC-205 §1, DEC-209 §2): the breadcrumb, or while live the story's
// state — which opens NOTHING: no link, no button, until wave 19's viewer.
import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/sessions.json";
import ui from "@/messages/ar/ui.json";
import type { EventSession } from "@/lib/dal/sessions";

const messages = { ...ar, ...ui };
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));
const { EventTopRow } = await import("@/components/sessions/event-top-row");

const SESSION = { id: "s1", categoryId: "c1", categoryName: "إداري" } as unknown as EventSession;

async function mount(phase: "open" | "live") {
  const element = await EventTopRow({ session: SESSION, phase, bookmark: <button type="button">حفظ</button>, share: null });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("EventTopRow", () => {
  it("open: back, and the breadcrumb to the list and the category", async () => {
    await mount("open");
    expect(screen.getByRole("link", { name: "رجوع" })).toHaveAttribute("href", "/ar/app/sessions");
    expect(screen.getByRole("link", { name: "إداري" })).toHaveAttribute("href", "/ar/app/sessions?category=c1");
  });

  it("★ live: the story's state is text — «شاهد القصة» is neither a link nor a button", async () => {
    await mount("live");
    expect(screen.getByText("شاهد القصة")).toBeInTheDocument();
    expect(screen.getByText("شاهد القصة").closest("a, button")).toBeNull();
    expect(screen.queryByRole("link", { name: /القصة/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /القصة/ })).toBeNull();
  });
});
