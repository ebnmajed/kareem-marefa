"use client";

import { useState } from "react";
import type { StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";

// The gallery's `story-capture` demo — contract 2 (DEC-251), REQ-STO-011, DEC-293. Every state from props, each opened
// by a button: the three choices, a refusal (a file over the ceiling), the review with a caption, uploading at 42 %, a
// failed upload with «أعد المحاولة», processing. The take is a solid ground: no camera and no file in the gallery.

const STATES: { key: string; label: string; state: StoryCaptureState; message?: string; progress?: number }[] = [
  { key: "choose", label: "اختر", state: "choose" },
  { key: "refused", label: "أكبر من المسموح", state: "refused", message: "أكبر من 50 ميغابايت" },
  { key: "review", label: "مراجعة", state: "review" },
  { key: "uploading", label: "جارٍ الرفع", state: "uploading", message: "جارٍ الرفع 42%", progress: 0.42 },
  { key: "error", label: "تعذّر الرفع", state: "error", message: "لا اتصال" },
  { key: "processing", label: "جارٍ التجهيز", state: "processing", message: "جارٍ التجهيز" },
];

export function StoryCaptureDemo() {
  const [open, setOpen] = useState<string | null>(null);
  const [caption, setCaption] = useState("الشريحة الثالثة 🔥");
  const current = STATES.find((s) => s.key === open);
  return (
    <div data-demo="story-capture" className="flex flex-wrap gap-2 p-2">
      {STATES.map((s) => (
        <button key={s.key} type="button" onClick={() => setOpen(s.key)} className="min-h-11 rounded-pill border border-edge px-4 text-label font-bold">
          {s.label}
        </button>
      ))}
      {current ? (
        <StoryCapture
          open
          state={current.state}
          preview={<div className="h-full w-full bg-surface" />}
          onPick={() => setOpen("review")}
          caption={caption}
          onCaptionChange={setCaption}
          captionMaxLength={100}
          onSubmit={() => {}}
          onRetake={() => setOpen("choose")}
          onClose={() => setOpen(null)}
          progress={current.progress}
          message={current.message}
          labels={{
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
          }}
        />
      ) : null}
    </div>
  );
}
