// SCR-044's empty list names the next move (REQ-UIX-012, the lead's ruling on K32): `EmptyState`'s action is required,
// and the page picks it per state — the manual mark, the host screen, or the session page — always as an href.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderBoard } from "./attendance-board-fixture";

describe("the empty attendance list", () => {
  it("offers the page's next move as a link, never a dead end", () => {
    renderBoard({ rows: [], candidates: [], emptyAction: { label: "شاشة التقديم", href: "/app/sessions/s1/host" } });
    expect(screen.getByText("لا حجوزات ولا تسجيلات حضور بعد.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شاشة التقديم" }).getAttribute("href")).toContain("/app/sessions/s1/host");
  });

  it("a chip that filtered the list to nothing offers «الكل» beside it", () => {
    renderBoard({ rows: [], candidates: [], emptyAction: { label: "صفحة الجلسة", href: "/app/sessions/s1" }, clearFilter: { label: "الكل", href: "/app/admin/sessions/s1/attendance" } });
    expect(screen.getByRole("link", { name: "صفحة الجلسة" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الكل" })).toBeInTheDocument();
  });

  it("`?manual=1` opens the manual-mark sheet on arrival when anyone may be marked", async () => {
    renderBoard({ sheetRequested: true });
    expect(await screen.findByRole("dialog", { name: "تسجيل حضور يدوي" })).toBeInTheDocument();
  });

  it("…and does not when nobody may be", () => {
    renderBoard({ sheetRequested: true, candidates: [] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
