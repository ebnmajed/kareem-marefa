// `<StoryCapture>` inside the playground's scope — REQ-STO-011. Semantic names only, no motion, axe on every state.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StoryCaptureProps, StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";

const RAW = /\b(?:navy|silver|slate)-|#[0-9a-fA-F]{3,8}\b|\bduration-\d|\b(?:bg|text|border)-(?:black|white)\b/;
const labels: StoryCaptureProps["labels"] = {
  dialog: "أضف إلى القصة", close: "إغلاق", photoMode: "صورة", videoMode: "فيديو", shutterPhoto: "التقط صورة",
  recordStart: "ابدأ التسجيل", recordStop: "أوقف التسجيل", gallery: "من الاستوديو", flip: "قلب الكاميرا",
  caption: "تعليق", submit: "انشر", retake: "أعد", notice: "تُشارَك مع الجميع في المؤسسة", elapsed: () => "0:07 / 0:15",
};

function show(state: StoryCaptureState, mode: "photo" | "video" = "photo") {
  render(
    <div className="theme-play" dir="rtl">
      <StoryCapture
        open state={state} mode={mode} onModeChange={() => {}} preview={<div />} elapsedSeconds={7} limitSeconds={15}
        onShutter={() => {}} onPick={() => {}} onFlip={() => {}} caption="" onCaptionChange={() => {}} captionMaxLength={100}
        onSubmit={() => {}} onRetake={() => {}} onClose={() => {}} message={state === "idle" ? undefined : "جارٍ التجهيز"} labels={labels}
      />
    </div>,
  );
  return document.querySelector("[data-story-capture]") as HTMLElement;
}

describe("StoryCapture inside the scope", () => {
  it("semantic names only, and nothing moves", () => {
    const root = show("idle");
    for (const el of root.querySelectorAll("[class]")) {
      expect(el.getAttribute("class"), el.tagName).not.toMatch(RAW);
      expect(el.getAttribute("class")).not.toMatch(/animate-|transition|hover:scale/);
    }
  });

  it.each([
    ["idle", "photo"],
    ["recording", "video"],
    ["review", "photo"],
    ["processing", "photo"],
    ["refused", "video"],
  ] as const)("is accessible — %s", async (state, mode) => {
    const root = show(state, mode);
    const { violations } = await axe.run(root, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
