// `<StoryCapture>` — REQ-STO-011, DEC-093. A hold is a gesture, so video is started and stopped by TAPS in «فيديو»;
// the shutter's name says what the next tap does; the gallery takes a file; the notice is at the point of upload.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StoryCaptureProps } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";

const labels: StoryCaptureProps["labels"] = {
  dialog: "أضف إلى القصة",
  close: "إغلاق",
  photoMode: "صورة",
  videoMode: "فيديو",
  shutterPhoto: "التقط صورة",
  recordStart: "ابدأ التسجيل",
  recordStop: "أوقف التسجيل",
  gallery: "من الاستوديو",
  flip: "قلب الكاميرا",
  caption: "تعليق",
  submit: "انشر",
  retake: "أعد",
  notice: "تُشارَك مع الجميع في المؤسسة",
  elapsed: (s, l) => `0:${String(s).padStart(2, "0")} / 0:${l}`,
};

function show(extra: Partial<StoryCaptureProps> = {}) {
  const props: StoryCaptureProps = {
    open: true,
    state: "idle",
    mode: "photo",
    onModeChange: vi.fn(),
    preview: <div />,
    elapsedSeconds: 0,
    limitSeconds: 15,
    onShutter: vi.fn(),
    onHoldStart: vi.fn(),
    onHoldEnd: vi.fn(),
    onPick: vi.fn(),
    onFlip: vi.fn(),
    caption: "",
    onCaptionChange: vi.fn(),
    captionMaxLength: 100,
    onSubmit: vi.fn(),
    onRetake: vi.fn(),
    onClose: vi.fn(),
    labels,
    ...extra,
  };
  render(<StoryCapture {...props} />);
  return props;
}

describe("DEC-093 — video by taps alone", () => {
  it("the mode switch is a radio group of two 44 px targets", async () => {
    const user = userEvent.setup();
    const props = show();
    const video = screen.getByRole("radio", { name: "فيديو" });
    expect(video).toHaveClass("min-h-11");
    await user.click(video);
    expect(props.onModeChange).toHaveBeenCalledWith("video");
  });

  it("in «فيديو» the shutter is tap to start and tap to stop, pressed while recording", async () => {
    const user = userEvent.setup();
    const props = show({ mode: "video" });
    const start = screen.getByRole("button", { name: "ابدأ التسجيل" });
    expect(start).toHaveAttribute("aria-pressed", "false");
    await user.click(start);
    expect(props.onShutter).toHaveBeenCalledTimes(1);
  });

  it("recording: the shutter says stop and the elapsed figure shows against the limit", () => {
    show({ mode: "video", state: "recording", elapsedSeconds: 7 });
    expect(screen.getByRole("button", { name: "أوقف التسجيل" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("0:07 / 0:15")).toBeInTheDocument();
  });

  it("in «صورة» a tap takes the photograph; a hold is the enhancement, and its release is not also a photograph", () => {
    vi.useFakeTimers();
    const props = show();
    const shutter = screen.getByRole("button", { name: "التقط صورة" });
    fireEvent.pointerDown(shutter, { button: 0 });
    vi.advanceTimersByTime(300);
    expect(props.onHoldStart).toHaveBeenCalled();
    fireEvent.pointerUp(shutter);
    fireEvent.click(shutter);
    expect(props.onHoldEnd).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("the rest", () => {
  it("the gallery takes a file", () => {
    const props = show();
    const input = screen.getByLabelText("من الاستوديو") as HTMLInputElement;
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onPick).toHaveBeenCalledWith(file);
  });

  it("review: the caption, retake and submit; the notice says where it goes", async () => {
    const user = userEvent.setup();
    const props = show({ state: "review" });
    expect(screen.getByLabelText("تعليق")).toHaveAttribute("maxLength", "100");
    await user.click(screen.getByRole("button", { name: "انشر" }));
    expect(props.onSubmit).toHaveBeenCalled();
    expect(screen.getByText("تُشارَك مع الجميع في المؤسسة")).toBeInTheDocument();
  });

  it("a message is a status — «جارٍ التجهيز», never «نُشرت» (DEC-139)", () => {
    show({ state: "processing", message: "جارٍ التجهيز" });
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التجهيز");
    expect(screen.getByRole("button", { name: "انشر" })).toHaveAttribute("aria-disabled", "true");
  });

  it("the dialog is named and closes", async () => {
    const user = userEvent.setup();
    const props = show();
    expect(screen.getByRole("dialog", { name: "أضف إلى القصة" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
