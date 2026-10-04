"use client";

import { useState } from "react";
import type { StoryCaptureMode, StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";

// The gallery's `story-capture` demo — contract 2 (DEC-251), REQ-STO-011, DEC-093. Every state from props, each opened
// by a button: idle in «صورة» and in «فيديو», recording at 0:07, review with a caption, processing, refused (a
// gallery video over 15 seconds), the camera denied. The preview is a solid ground: no camera in the gallery.

const STATES: { key: string; label: string; state: StoryCaptureState; mode: StoryCaptureMode; message?: string; elapsed?: number }[] = [
  { key: "photo", label: "صورة", state: "idle", mode: "photo" },
  { key: "video", label: "فيديو", state: "idle", mode: "video" },
  { key: "recording", label: "يسجّل", state: "recording", mode: "video", elapsed: 7 },
  { key: "review", label: "مراجعة", state: "review", mode: "photo" },
  { key: "processing", label: "جارٍ التجهيز", state: "processing", mode: "video", message: "جارٍ التجهيز" },
  { key: "refused", label: "أطول من 15 ثانية", state: "refused", mode: "video", message: "أطول من 15 ثانية" },
  { key: "denied", label: "بلا كاميرا", state: "denied", mode: "photo", message: "لا وصول إلى الكاميرا" },
];

const pad = (n: number) => `0:${String(n).padStart(2, "0")}`;

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
          mode={current.mode}
          onModeChange={() => {}}
          preview={<div className="h-full w-full bg-surface" />}
          elapsedSeconds={current.elapsed ?? 0}
          limitSeconds={15}
          onShutter={() => {}}
          onPick={() => {}}
          onFlip={() => {}}
          caption={caption}
          onCaptionChange={setCaption}
          captionMaxLength={100}
          onSubmit={() => {}}
          onRetake={() => {}}
          onClose={() => setOpen(null)}
          message={current.message}
          labels={{
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
            elapsed: (s, l) => `${pad(s)} / ${pad(l)}`,
          }}
        />
      ) : null}
    </div>
  );
}
