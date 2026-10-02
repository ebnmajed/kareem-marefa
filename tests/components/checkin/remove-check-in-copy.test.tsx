// REQ-PTS-015, DEC-174 Q3 — the revoke's dialog says what is TRUE when it is shown. Before completion nothing has been
// paid, so the member «won't earn» the points; after it, the compensating entry of REQ-CHK-017 is the truth.
// ★ Re-pointed in wave 21 (DEC-208): the dialog is the row menu's now, and `paysOnCompletion` is required — the old
// third case («without the prop the form keeps its old copy») has no caller left to protect; a ledger line says so.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderBoard } from "./attendance-board-fixture";

async function openDialog(paysOnCompletion: boolean) {
  renderBoard({ paysOnCompletion });
  await userEvent.click(screen.getAllByRole("button", { name: "إجراءات سارة العتيبي" })[0]);
  await userEvent.click(await screen.findByRole("menuitem", { name: "ألغِ الحضور" }));
  return screen.findByRole("dialog");
}

describe("the revoke's copy (REQ-PTS-015)", () => {
  it("before completion: «won't earn», never «reversed»", async () => {
    const dialog = await openDialog(true);
    expect(dialog).toHaveTextContent("لن تُحتسب له نقاط الحضور");
    expect(dialog).not.toHaveTextContent("تُعكس");
  });

  it("after completion: the compensating entry — points reversed, certificate revoked", async () => {
    const dialog = await openDialog(false);
    expect(dialog).toHaveTextContent("تُعكس نقاطه وتُلغى شهادته");
    expect(dialog).not.toHaveTextContent("لن تُحتسب");
  });
});
