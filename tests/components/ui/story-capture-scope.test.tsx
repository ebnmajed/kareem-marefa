// `<StoryCapture>` inside the playground's scope — REQ-STO-011, DEC-293. Semantic names only, no motion, axe on every state.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StoryCaptureProps, StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";

const RAW = /\b(?:navy|silver|slate)-|#[0-9a-fA-F]{3,8}\b|\bduration-\d|\b(?:bg|text|border)-(?:black|white)\b/;
const labels: StoryCaptureProps["labels"] = {
  dialog: "أضف إلى القصة", close: "إغلاق", photo: "صورة", video: "فيديو", gallery: "من الاستوديو",
  caption: "تعليق", submit: "انشر", retake: "أعد", retry: "أعد المحاولة", notice: "تُشارَك مع الجميع في المؤسسة",
};

function show(state: StoryCaptureState) {
  render(
    <div className="theme-play" dir="rtl">
      <StoryCapture
        open state={state} preview={<div />} onPick={() => {}} caption="" onCaptionChange={() => {}} captionMaxLength={100}
        onSubmit={() => {}} onRetake={() => {}} onClose={() => {}} progress={state === "uploading" ? 0.4 : undefined}
        message={state === "choose" || state === "review" ? undefined : "جارٍ التجهيز"} labels={labels}
      />
    </div>,
  );
  return document.querySelector("[data-story-capture]") as HTMLElement;
}

describe("StoryCapture inside the scope", () => {
  it.each(["choose", "review"] as const)("semantic names only, and nothing moves — %s", (state) => {
    const root = show(state);
    for (const el of root.querySelectorAll("[class]")) {
      expect(el.getAttribute("class"), el.tagName).not.toMatch(RAW);
      expect(el.getAttribute("class")).not.toMatch(/animate-|transition|hover:scale/);
    }
  });

  it.each(["choose", "refused", "review", "uploading", "error", "processing"] as const)("is accessible — %s", async (state) => {
    const root = show(state);
    const { violations } = await axe.run(root, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
