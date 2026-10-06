// «أضف إلى القصة» on the event page (REQ-STO-011, DEC-269): one button that opens the same capture the viewer's «أضف»
// opens, and closing it reads the page again. The capture itself is `capture-flow.test.tsx`'s.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import stories from "@/messages/ar/stories.json";

const refresh = vi.fn();
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));
vi.mock("@/components/stories/capture-flow", () => ({
  CaptureFlow: ({ sessionId, onClose }: { sessionId: string; onClose: () => void }) => (
    <div role="dialog" aria-label="capture">
      <span>{sessionId}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

const { AddToStory } = await import("@/components/stories/add-to-story");

describe("AddToStory", () => {
  it("opens the capture for this session, and closing it refreshes the page", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="ar" messages={stories}>
        <AddToStory sessionId="s-1" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "أضف إلى القصة" }));
    expect(screen.getByRole("dialog", { name: "capture" })).toHaveTextContent("s-1");
    await user.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
