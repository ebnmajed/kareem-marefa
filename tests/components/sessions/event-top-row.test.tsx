// SCR-012's phone top row (REQ-UIX-061, DEC-205 §1, DEC-209 §2): the breadcrumb, or while live the story's state.
// Wave 26 (REQ-STO-008, DEC-251 §4.7): given the page's story entry, the row draws it; with none — no frame the member
// may see — the state stays text and opens nothing.
import type { ReactNode } from "react";
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

async function mount(phase: "open" | "live", story?: ReactNode) {
  const element = await EventTopRow({ session: SESSION, phase, bookmark: <button type="button">حفظ</button>, share: null, story });
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

  it("★ live with no story: the state is text — «شاهد القصة» is neither a link nor a button", async () => {
    await mount("live");
    expect(screen.getByText("شاهد القصة")).toBeInTheDocument();
    expect(screen.getByText("شاهد القصة").closest("a, button")).toBeNull();
    expect(screen.queryByRole("link", { name: /القصة/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /القصة/ })).toBeNull();
  });

  it("live with a story: the row draws the page's entry in the breadcrumb's place", async () => {
    await mount(
      "live",
      <button type="button" aria-haspopup="dialog">
        شاهد القصة
      </button>,
    );
    expect(screen.getByRole("button", { name: "شاهد القصة" })).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("link", { name: "إداري" })).toBeNull();
    // ★ The phone's entry: its row is display:none from lg, so the desktop's is the only one there (DEC-251 §4.7).
    expect(screen.getByRole("button", { name: "شاهد القصة" }).closest(".lg\\:hidden")).not.toBeNull();
  });

  it("open, even given a story: the breadcrumb — the entry is a live session's", async () => {
    await mount("open", <button type="button">شاهد القصة</button>);
    expect(screen.queryByRole("button", { name: "شاهد القصة" })).toBeNull();
    expect(screen.getByRole("link", { name: "إداري" })).toBeInTheDocument();
  });
});
