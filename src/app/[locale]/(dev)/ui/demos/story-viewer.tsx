"use client";

import { useRef, useState } from "react";
import type { StoryViewerStory } from "@/components/ui";
import { StoryViewer } from "@/components/ui/story-viewer";

// The gallery's `story-viewer` demo — contract 2 (DEC-251), REQ-STO-007, REQ-STO-009. A full-screen dialog cannot sit
// in a column, so each state is a button that opens it: a run of three stories (live, an attendee's photograph with a
// caption, a recap), one opened on its last frame, one held paused from outside, and one with «أضف». From literal
// fixtures; strings in Arabic; no DAL, no session. Every gesture's control is visible in every state (DEC-093).

const labels = {
  dialog: "قصة الجلسة: العرض في 5 شرائح",
  previous: "الإطار السابق",
  next: "الإطار التالي",
  pause: "أوقف مؤقتًا",
  resume: "تابِع",
  close: "إغلاق",
  add: "أضف",
  paused: "متوقفة",
  position: (c: number, t: number) => `الإطار ${c} من ${t}`,
};

const reactions = (pressed: string | null) => ({
  label: "التفاعلات",
  onToggle: () => {},
  items: [
    { kind: "heart", label: "أعجبني", count: 12, pressed: pressed === "heart", icon: <span aria-hidden>❤️</span> },
    { kind: "fire", label: "رائع", count: 4, pressed: pressed === "fire", icon: <span aria-hidden>🔥</span> },
    { kind: "clap", label: "تصفيق", count: 0, pressed: false, icon: <span aria-hidden>👏</span> },
    { kind: "idea", label: "فكرة", count: 1, pressed: false, icon: <span aria-hidden>💡</span> },
  ],
});

function Body({ eyebrow, title, line }: { eyebrow: string; title: string; line: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-3 bg-canvas px-6">
      <span className="self-start rounded-pill bg-chrome px-3 py-1 text-label font-bold">{eyebrow}</span>
      <p className="font-display text-h2 font-extrabold">
        <bdi>{title}</bdi>
      </p>
      <p className="text-body text-fg-muted">{line}</p>
    </div>
  );
}

const STORIES: StoryViewerStory[] = [
  {
    id: "live",
    title: "العرض في 5 شرائح",
    meta: "سارة القحطاني · مواهب · قبل 12 دقيقة",
    glyph: "م",
    teamColor: "#35D0FF",
    startIndex: 0,
    frames: [
      { id: "l1", durationMs: 6000, content: <Body eyebrow="جارية الآن" title="العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية" line="23 في القاعة · قاعة الرياض · حتى 7:30 م" />, action: { label: "افتح الجلسة", href: "#" }, reactions: reactions("fire") },
      {
        id: "l2",
        durationMs: 5000,
        content: <Body eyebrow="فهد العنزي · قبل دقيقة" title="الشريحة الثالثة 🔥" line="صورة من القاعة" />,
        action: { label: "افتح الجلسة", href: "#" },
        reactions: reactions(null),
        moderation: { menuLabel: "المزيد", items: [{ label: "أزلني", onSelect: () => {} }, { label: "بلّغ", onSelect: () => {} }] },
      },
    ],
  },
  {
    id: "recap",
    title: "الأرقام التي تكذب",
    meta: "محمد الدوسري · جذر · أمس",
    glyph: "ج",
    teamColor: "#FFD23F",
    startIndex: 0,
    frames: [{ id: "r1", durationMs: 6000, content: <Body eyebrow="اكتملت" title="الأرقام التي تكذب: قراءة تقارير الأداء" line="28 حضروا · 4.6 التقييم · 3 مواد" />, action: { label: "حمّل المواد", href: "#" }, reactions: reactions("heart") }],
  },
  {
    id: "failed",
    title: "تحليل البيانات",
    meta: "هند الزهراني · مواهب",
    glyph: "م",
    teamColor: null,
    startIndex: 0,
    frames: [{ id: "x1", durationMs: 6000, content: <Body eyebrow="فيديو" title="تعذّر" line="يراه ناشره وحده" /> }],
  },
];

const CASES = [
  { key: "run", label: "قصة من أولها", stories: STORIES, index: 0 },
  { key: "last", label: "على الإطار الأخير", stories: STORIES.map((s, i) => (i === 0 ? { ...s, startIndex: 1 } : s)), index: 0 },
  { key: "add", label: "مع «أضف»", stories: STORIES.map((s, i) => (i === 0 ? { ...s, onAdd: () => {} } : s)), index: 0 },
  { key: "held", label: "متوقفة من الخارج", stories: STORIES, index: 1, paused: true },
  { key: "failed", label: "إطار تعذّر", stories: STORIES, index: 2 },
] as const;

export function StoryViewerDemo() {
  const [open, setOpen] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const current = CASES.find((c) => c.key === open);
  return (
    <div data-demo="story-viewer" className="flex flex-wrap gap-2 p-2">
      {CASES.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={(e) => {
            opener.current = e.currentTarget;
            setOpen(c.key);
          }}
          className="min-h-11 rounded-pill border border-edge px-4 text-label font-bold"
        >
          {c.label}
        </button>
      ))}
      {current ? (
        <StoryViewer
          open
          stories={[...current.stories]}
          storyIndex={current.index}
          onClose={() => setOpen(null)}
          returnFocusTo={opener}
          paused={"paused" in current ? current.paused : false}
          labels={labels}
        />
      ) : null}
    </div>
  );
}
