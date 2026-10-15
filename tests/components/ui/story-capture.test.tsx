// `<StoryCapture>` — REQ-STO-011, DEC-093, DEC-293. No live camera: three file inputs open the phone's own camera app
// (photo, video) and the gallery; each is one big labelled button, a tap. The screen after the take: the review, the
// caption, «إعادة» and «انشر», the upload's progress, a failure that keeps the take; the notice at the point of upload.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StoryCaptureProps } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";

const labels: StoryCaptureProps["labels"] = {
  dialog: "أضف إلى القصة",
  close: "إغلاق",
  photo: "صورة",
  video: "فيديو",
  gallery: "من الاستوديو",
  caption: "تعليق",
  submit: "انشر",
  retake: "إعادة",
  retry: "أعد المحاولة",
  notice: "تُشارَك مع الجميع في المؤسسة",
};

function show(extra: Partial<StoryCaptureProps> = {}) {
  const props: StoryCaptureProps = {
    open: true,
    state: "choose",
    preview: <div data-testid="take" />,
    onPick: vi.fn(),
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

describe("DEC-293 — the phone's own camera, through three file inputs", () => {
  it("«صورة» opens the camera for a photograph: image/*, capture=environment", () => {
    show();
    const input = screen.getByLabelText("صورة") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("capture", "environment");
  });

  it("«فيديو» opens the camera for a video: video/*, capture=environment", () => {
    show();
    const input = screen.getByLabelText("فيديو") as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "video/*");
    expect(input).toHaveAttribute("capture", "environment");
  });

  it("«من الاستوديو» opens the gallery: either kind, and NO capture", () => {
    show();
    const input = screen.getByLabelText("من الاستوديو") as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "image/*,video/*");
    expect(input).not.toHaveAttribute("capture");
  });

  it("a chosen file is handed over with the button it came from, and the input is cleared for the next pick", () => {
    const props = show();
    const input = screen.getByLabelText("فيديو") as HTMLInputElement;
    const file = new File(["x"], "IMG_1.MOV", { type: "video/quicktime" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onPick).toHaveBeenCalledWith(file, "video");
    expect(input.value).toBe("");
  });

  it("no live camera, no shutter, no flip, no countdown — and no take drawn while choosing", () => {
    show();
    expect(document.querySelector("[data-story-capture] video")).toBeNull();
    expect(screen.queryByRole("button", { name: /التقط|التسجيل|قلب/ })).toBeNull();
    expect(screen.queryByTestId("take")).toBeNull();
    expect(screen.queryByLabelText("تعليق")).toBeNull();
  });

  it("refused: the word, and the three choices again", () => {
    show({ state: "refused", message: "أكبر من 50 ميغابايت" });
    expect(screen.getByRole("status")).toHaveTextContent("أكبر من 50 ميغابايت");
    expect(screen.getByLabelText("صورة")).toBeInTheDocument();
    expect(screen.getByLabelText("من الاستوديو")).toBeInTheDocument();
  });
});

describe("the screen after the take", () => {
  it("review: the take, the caption, «إعادة» back to the choices and «انشر»; the notice says where it goes", async () => {
    const user = userEvent.setup();
    const props = show({ state: "review" });
    expect(screen.getByTestId("take")).toBeInTheDocument();
    expect(screen.getByLabelText("تعليق")).toHaveAttribute("maxLength", "100");
    await user.click(screen.getByRole("button", { name: "انشر" }));
    expect(props.onSubmit).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "إعادة" }));
    expect(props.onRetake).toHaveBeenCalled();
    expect(screen.getByText("تُشارَك مع الجميع في المؤسسة")).toBeInTheDocument();
  });

  it("uploading: a progress bar with its figure; the take cannot be retaken mid-flight", () => {
    show({ state: "uploading", progress: 0.42, message: "جارٍ الرفع 42%" });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ الرفع 42%");
    expect(screen.getByRole("button", { name: "إعادة" })).toBeDisabled();
  });

  it("★ error: the take is kept — «إعادة» and «أعد المحاولة», which submits again", async () => {
    const user = userEvent.setup();
    const props = show({ state: "error", message: "لا اتصال" });
    expect(screen.getByTestId("take")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(props.onSubmit).toHaveBeenCalled();
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
