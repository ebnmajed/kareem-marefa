// SCR-012's desktop aside (REQ-UIX-061, A33 rule 3, DEC-206 §4.56, §4.71): the room with the map as a LINK,
// and «من يحضر» as a count — faces only when the page passed some, which it does for staff and presenters alone.
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/sessions.json";
import type { EventSession } from "@/lib/dal/sessions";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as never }),
}));
const { EventAside } = await import("@/components/sessions/event-aside");

const SESSION = { id: "s1", capacity: 40, venue: { name: "قاعة الرياض", address: "الدور الثالث", mapUrl: "https://maps.example/x" } } as unknown as EventSession;

describe("EventAside", () => {
  it("the room: name, address, the map as a new-tab link, the capacity and «الحضور في القاعة فقط»", async () => {
    render(await EventAside({ session: SESSION, phase: "open", reserved: 12, attended: null, faces: [] }));
    const map = screen.getByRole("link", { name: "افتح الموقع على الخريطة" });
    expect(map).toHaveAttribute("rel", "noreferrer noopener");
    expect(map).toHaveAttribute("target", "_blank");
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/40 مقعدًا/)).toBeInTheDocument();
  });

  it("★ a member sees how many, never who", async () => {
    render(await EventAside({ session: SESSION, phase: "open", reserved: 12, attended: null, faces: [] }));
    expect(screen.getByText("12 محجوزًا")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="faces"]')).toBeNull();
  });

  it("staff and presenters, whom RLS answers, see the faces beside the count", async () => {
    render(await EventAside({ session: SESSION, phase: "live", reserved: 12, attended: 3, faces: [{ memberId: "m1", displayName: "سارة", avatarUrl: null, teamColor: "#35d0ff" }] }));
    expect(screen.getByRole("group", { name: "من يحضر" })).toBeInTheDocument();
  });

  it("★ «لفريقك» states the rule with the member's company — only when the page passes it (the rule on)", async () => {
    render(await EventAside({ session: SESSION, phase: "open", reserved: 12, attended: null, faces: [], team: { name: "صنف" } }));
    const team = screen.getByRole("region", { name: "لفريقك" });
    expect(team).toHaveTextContent("حضورك يرفع نسبة مشاركة صنف في سباق الشركات.");
    expect(team.textContent).not.toMatch(/الجولة|\d/);
  });

  it("no team, or an ended session: no «لفريقك»", async () => {
    const { unmount } = render(await EventAside({ session: SESSION, phase: "open", reserved: 12, attended: null, faces: [] }));
    expect(screen.queryByRole("region", { name: "لفريقك" })).toBeNull();
    unmount();
    render(await EventAside({ session: SESSION, phase: "ended", reserved: 12, attended: 3, faces: [], team: { name: "صنف" } }));
    expect(screen.queryByRole("region", { name: "لفريقك" })).toBeNull();
  });
});
