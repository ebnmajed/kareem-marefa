// `session-cta`'s `booked.between` — wave 16, R4 (DEC-197), `16` §5.4.2, REQ-UIX-033.
//
// Once a seat is held the calendar is the event page's primary, and it sits
// BETWEEN the fact and the cancel: status → calendar → cancel, on screen and in
// the tab order. The gate at a9bd97df found the slot typed and never drawn —
// the card lost «أضِف إلى تقويمك» after a reservation. This pins it.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionCta } from "@/components/ui/session-cta";

const never = async () => {};

describe("session-cta · booked.between", () => {
  it("draws the node between the face and the cancel, in DOM (and so tab) order", () => {
    const { container } = render(
      <SessionCta
        state={{ kind: "booked", cancel: { label: "إلغاء الحجز", act: { action: never } }, between: <button type="button">أضِف إلى تقويمك</button> }}
        label="تم تأكيد حجزك"
        chip="28 من 30"
      />,
    );
    const calendar = screen.getByRole("button", { name: "أضِف إلى تقويمك" });
    const cancel = screen.getByRole("button", { name: "إلغاء الحجز" });
    const face = container.querySelector('[data-part="face"]')!;
    expect(face.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(calendar.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("absent, nothing is drawn — the booked state is as it was", () => {
    render(<SessionCta state={{ kind: "booked", cancel: { label: "إلغاء الحجز", act: { action: never } } }} label="تم تأكيد حجزك" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
