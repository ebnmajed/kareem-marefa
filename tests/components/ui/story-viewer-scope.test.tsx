// `<StoryViewer>` inside the playground's scope — REQ-STO-007, REQ-STO-009. Born inside it: semantic names only, the
// one motion the lead's `story-frame-in` keyframe (motion-safe, never a moment), an RTL check, axe on every state.
// `story-viewer.test.tsx` is the behaviour.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StoryViewerProps } from "@/components/ui";
import { StoryViewer } from "@/components/ui/story-viewer";

const RAW = /\b(?:navy|silver|slate)-|#[0-9a-fA-F]{3,8}\b|\bduration-\d|\b(?:bg|text|border)-(?:black|white)\b/;

const labels: StoryViewerProps["labels"] = {
  dialog: "قصة الجلسة: العرض في 5 شرائح",
  previous: "الإطار السابق",
  next: "الإطار التالي",
  pause: "أوقف مؤقتًا",
  resume: "تابِع",
  close: "إغلاق",
  add: "أضف",
  paused: "متوقفة",
  position: (c, t) => `الإطار ${c} من ${t}`,
};

const frames = (withExtras: boolean) =>
  [1, 2, 3].map((n) => ({
    id: `f${n}`,
    content: <p>{`إطار ${n}`}</p>,
    durationMs: 5000,
    action: withExtras ? { label: "افتح الجلسة", href: "/app/sessions/x" } : undefined,
    reactions: withExtras
      ? { label: "التفاعلات", onToggle: () => {}, items: [{ kind: "heart", label: "أعجبني", count: 3, pressed: true, icon: <span aria-hidden>❤️</span> }] }
      : undefined,
    moderation: withExtras ? { menuLabel: "المزيد", items: [{ label: "بلّغ", onSelect: () => {} }] } : undefined,
  }));

function show(extra: Partial<StoryViewerProps> = {}, withExtras = true) {
  return render(
    // The action is the house `Link`, which reads the locale.
    <NextIntlClientProvider locale="ar" messages={{}}>
    <Direction.Provider dir="rtl">
      <div className="theme-play" dir="rtl">
        <StoryViewer
          open
          stories={[{ id: "s", title: "العرض في 5 شرائح", meta: "سارة القحطاني · مواهب", glyph: "م", teamColor: "#35D0FF", startIndex: 0, frames: frames(withExtras), onAdd: () => {} }]}
          storyIndex={0}
          onClose={() => {}}
          labels={labels}
          {...extra}
        />
      </div>
    </Direction.Provider>
    </NextIntlClientProvider>,
  );
}

const viewer = () => document.querySelector("[data-story-viewer]") as HTMLElement;

describe("StoryViewer inside the scope", () => {
  it("every class it draws is a semantic name", () => {
    show();
    for (const el of viewer().querySelectorAll("[class]")) expect(el.getAttribute("class"), el.tagName).not.toMatch(RAW);
  });

  it("the ink ground outside, the void frame inside, the controls on the chrome token", () => {
    show();
    expect(viewer()).toHaveClass("bg-canvas");
    expect(viewer().querySelector("[data-frame-id]")).toHaveClass("bg-void");
    expect(viewer().querySelector('button[aria-label="الإطار التالي"]')).toHaveClass("bg-chrome");
  });

  it("the only motion is the frame's slide, motion-safe, through the lead's keyframe and the duration token; nothing scales on hover", () => {
    show();
    const moving = [...viewer().querySelectorAll("[class*='animate-']")];
    expect(moving).toHaveLength(1);
    expect(moving[0].getAttribute("class")).toMatch(/motion-safe:animate-\[story-frame-in_var\(--dur-base\)/);
    for (const el of viewer().querySelectorAll("[class]")) expect(el.getAttribute("class")).not.toMatch(/hover:scale|transition/);
  });

  it("from lg the same viewer, centred at phone width — no class that only a wide screen draws", () => {
    show();
    const frame = viewer().querySelector("[data-frame-id]")!;
    expect(frame).toHaveClass("max-w-[24.375rem]");
    for (const el of viewer().querySelectorAll("[class]")) expect(el.getAttribute("class")).not.toMatch(/\b(?:lg|xl|md):(?!hidden)/);
  });

  it.each([
    ["running, with every control", {}, true],
    ["paused from outside", { paused: true }, true],
    ["a bare frame", {}, false],
  ] as const)("is accessible — %s", async (_n, extra, withExtras) => {
    show(extra, withExtras);
    const { violations } = await axe.run(viewer(), { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
