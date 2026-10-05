// «أضف»'s camera and recorder behind `ui/story-capture` (REQ-STO-011, DEC-093) — with a FAKE stream and a fake
// MediaRecorder, so the tap-only path is proven where jsdom has no camera: the shutter starts and stops a recording by
// taps; a refused camera says so and keeps its reason (`data-camera-error`), and the gallery stays open.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import stories from "@/messages/ar/stories.json";
import { CaptureFlow } from "@/components/stories/capture-flow";

vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));

class FakeRecorder {
  static isTypeSupported = (t: string) => t.startsWith("video/webm");
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream, public options: { mimeType: string }) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "video/webm" }) });
    this.onstop?.();
  }
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
}

function show() {
  return render(
    <NextIntlClientProvider locale="ar" messages={stories}>
      <CaptureFlow sessionId="11111111-1111-4111-8111-111111111111" onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("CaptureFlow", () => {
  it("records and stops a video by taps alone, on a stream that resolved", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    show();
    await act(async () => {});
    await user.click(screen.getByRole("radio", { name: "فيديو" }));
    const start = screen.getByRole("button", { name: "ابدأ التسجيل" });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(screen.getByRole("button", { name: "أوقف التسجيل" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "أوقف التسجيل" }));
    expect(document.querySelector("[data-story-capture]")).toHaveAttribute("data-state", "review");
  });

  it("a refused camera says so, keeps its reason, and leaves the gallery open", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("blocked by Permissions-Policy", "NotAllowedError")) },
    });
    show();
    await act(async () => {});
    expect(await screen.findByRole("status")).toHaveTextContent("لا وصول إلى الكاميرا");
    expect(document.querySelector("[data-camera-error]")).toHaveAttribute("data-camera-error", "NotAllowedError");
    expect(screen.getByRole("button", { name: "التقط صورة" })).toBeDisabled();
    expect(screen.getByLabelText("من الاستوديو")).toBeEnabled();
  });
});
