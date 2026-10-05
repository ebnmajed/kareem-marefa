// SCR-044's «قصص الحضور» — REQ-STO-017, REQ-EVT-014. Every attendee frame with its author named in text, its kind
// and length; «أزل» asks for a reason in a sheet and posts the frame and the reason to the bound action.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import stories from "@/messages/ar/stories.json";
import photos from "@/messages/ar/photos.json";
import { ToastProvider } from "@/components/ui/toast";
import type { RemoveAttendeeFrameState } from "@/components/stories/state";
import { AttendeeStoriesClient } from "@/components/stories/attendee-stories-client";
import type { AttendeeStoryFrame } from "@/lib/dal/story-frames";

vi.mock("server-only", () => ({}));

const frames: AttendeeStoryFrame[] = [
  { id: "v1", kind: "video", state: "visible", triggeredAt: "2026-10-05T18:00:00Z", hidden: false, authorName: "فهد العنزي", authorTeamColor: "#9B7CFF", thumbUrl: null, durationMs: 12_000 },
  { id: "p1", kind: "photo", state: "visible", triggeredAt: "2026-10-05T17:00:00Z", hidden: true, authorName: "ريم الشهري", authorTeamColor: "#FF4FB8", thumbUrl: null, durationMs: null },
  { id: "v2", kind: "video", state: "failed", triggeredAt: "2026-10-05T16:00:00Z", hidden: false, authorName: "خالد الغامدي", authorTeamColor: null, thumbUrl: null, durationMs: null },
];

type Action = (prev: RemoveAttendeeFrameState, form: FormData) => Promise<RemoveAttendeeFrameState>;
function show(removeAction: Action & { mock?: unknown } = vi.fn<Action>(async () => ({ outcome: "removed", frameId: "v1" }))) {
  render(
    <NextIntlClientProvider locale="ar" messages={{ ...stories, ...photos }}>
      <ToastProvider closeLabel="إغلاق">
        <AttendeeStoriesClient frames={frames} title="قصص الحضور · 3" removeAction={removeAction} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return removeAction as ReturnType<typeof vi.fn<Action>>;
}

async function remove(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "أزل — فيديو 0:12 — فهد العنزي" }));
  const sheet = await screen.findByRole("dialog", { name: "أزل" });
  await user.type(within(sheet).getByRole("textbox", { name: /سبب الإزالة/ }), "محتوى لا يخص الجلسة");
  await user.click(within(sheet).getByRole("button", { name: "أزل" }));
  return sheet;
}

describe("«قصص الحضور»", () => {
  it("names every frame's author and kind in text — never by a ring's colour alone (the ring as drawn, the name in «أزل»)", () => {
    show();
    const strip = screen.getByRole("region", { name: "قصص الحضور · 3" });
    const tiles = within(strip).getAllByRole("listitem");
    expect(tiles).toHaveLength(3);
    expect(within(tiles[0]).getByRole("button", { name: "أزل — فيديو 0:12 — فهد العنزي" })).toBeInTheDocument();
    expect(within(tiles[0]).getByText("0:12")).toBeInTheDocument();
    expect(within(tiles[1]).getByText("صورة")).toBeInTheDocument();
    expect(within(tiles[1]).getByText("مخفية")).toBeInTheDocument();
    expect(within(tiles[2]).getByText("تعذّر")).toBeInTheDocument();
  });

  it("«أزل» opens a sheet whose reason is required, and posts the frame and the reason", async () => {
    const user = userEvent.setup();
    const action = show();
    await user.click(screen.getByRole("button", { name: "أزل — فيديو 0:12 — فهد العنزي" }));
    const sheet = await screen.findByRole("dialog", { name: "أزل" });
    await user.type(within(sheet).getByRole("textbox", { name: /سبب الإزالة/ }), "محتوى لا يخص الجلسة");
    await user.click(within(sheet).getByRole("button", { name: "أزل" }));
    expect(action).toHaveBeenCalledTimes(1);
    const form = (action.mock.calls[0] as unknown[])[1] as FormData;
    expect(form.get("frameId")).toBe("v1");
    expect(form.get("reason")).toBe("محتوى لا يخص الجلسة");
  });

  it("a removal that wrote says «سُجّل القرار» and closes the sheet", async () => {
    const user = userEvent.setup();
    show();
    await remove(user);
    expect(await screen.findByText("سُجّل القرار", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "أزل" })).toBeNull();
  });

  it.each([
    ["not_authorized", "لا تملك صلاحية هذا الإجراء."],
    ["not_found", "تعذّر العثور عليه."],
    ["error", "تعذّر تنفيذ الإجراء — حاول مرة أخرى."],
  ] as const)("a refusal (%s) is SAID and the sheet stays open — never a silent close", async (outcome, text) => {
    const user = userEvent.setup();
    show(vi.fn<Action>(async () => ({ outcome, frameId: "v1" })));
    const sheet = await remove(user);
    expect(await screen.findByText(text, { exact: true })).toBeInTheDocument();
    expect(sheet).toBeInTheDocument();
    expect(screen.queryByText("سُجّل القرار", { exact: true })).toBeNull();
  });

  it("a missing reason is said at its field, and the sheet stays open", async () => {
    const user = userEvent.setup();
    show(vi.fn<Action>(async () => ({ outcome: "reason_required", frameId: "v1" })));
    const sheet = await remove(user);
    // The action resolves after the click: wait for its answer, never read it in the same tick.
    await waitFor(() => expect(within(sheet).getByRole("textbox", { name: /سبب الإزالة/ })).toHaveAttribute("aria-invalid", "true"));
  });
});
