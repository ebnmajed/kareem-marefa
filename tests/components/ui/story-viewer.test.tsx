// `<StoryViewer>` — REQ-STO-007, REQ-STO-009, DEC-093. Every gesture has a visible single-pointer control AND a key;
// the clock advances a frame; focus is held and returned; the run moves to the next story and closes after the last.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, type ReactNode } from "react";
import { Direction } from "radix-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryViewerProps, StoryViewerStory } from "@/components/ui";
import { StoryViewer } from "@/components/ui/story-viewer";

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

function story(id: string, n: number, startIndex = 0): StoryViewerStory {
  return {
    id,
    title: `جلسة ${id}`,
    meta: "سارة القحطاني · مواهب",
    glyph: "م",
    teamColor: "#35D0FF",
    startIndex,
    frames: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i + 1}`, content: <p>{`${id} إطار ${i + 1}`}</p>, durationMs: 5000 })),
  };
}

function Harness({ dir = "rtl", ...props }: Partial<StoryViewerProps> & { dir?: "rtl" | "ltr"; children?: ReactNode }) {
  const ring = useRef<HTMLButtonElement | null>(null);
  return (
    <Direction.Provider dir={dir}>
      <button ref={ring} type="button">
        الحلقة
      </button>
      <StoryViewer open stories={[story("a", 3), story("b", 2, 1)]} storyIndex={0} onClose={() => {}} returnFocusTo={ring} labels={labels} {...props} />
    </Direction.Provider>
  );
}

const shown = () => document.querySelector("[data-frame-id]")?.getAttribute("data-frame-id");

afterEach(() => vi.useRealTimers());

describe("DEC-093 — every gesture has a visible control that is not a gesture", () => {
  it("next and previous are always-visible buttons, each 44 px, named", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    expect(shown()).toBe("a-1");
    await user.click(within(dialog).getByRole("button", { name: "الإطار التالي" }));
    expect(shown()).toBe("a-2");
    await user.click(within(dialog).getByRole("button", { name: "الإطار السابق" }));
    expect(shown()).toBe("a-1");
    for (const name of ["الإطار التالي", "الإطار السابق", "أوقف مؤقتًا", "إغلاق"]) expect(within(dialog).getByRole("button", { name })).toHaveClass("size-11");
  });

  it("pause is a button that says its state, and swaps its name", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const pause = screen.getByRole("button", { name: "أوقف مؤقتًا" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    await user.click(pause);
    expect(screen.getByRole("button", { name: "تابِع" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("متوقفة")).toBeInTheDocument();
  });

  it("close is a button, and calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the keys — SC 2.1.1, the arrows following the reading direction", () => {
  it("in RTL ← is next and → is previous; Home and End go to the ends", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(shown()).toBe("a-2");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(shown()).toBe("a-1");
    fireEvent.keyDown(dialog, { key: "End" });
    expect(shown()).toBe("a-3");
    fireEvent.keyDown(dialog, { key: "Home" });
    expect(shown()).toBe("a-1");
  });

  it("in LTR → is next", () => {
    render(<Harness dir="ltr" />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(shown()).toBe("a-2");
  });

  it("Space pauses and resumes; on a focused button it is the button's", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: " " });
    expect(screen.getByRole("button", { name: "تابِع" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(screen.getByRole("button", { name: "الإطار التالي" }), { key: " " });
    expect(screen.getByRole("button", { name: "تابِع" })).toBeInTheDocument();
  });

  it("Escape closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the run", () => {
  it("past a story's last frame moves to the next story at ITS first unseen frame, and closes after the last", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "End" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(shown()).toBe("b-2");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens on the story's first unseen frame", () => {
    render(<Harness storyIndex={1} />);
    expect(shown()).toBe("b-2");
  });

  it("reports each frame shown once", () => {
    const onFrameShown = vi.fn();
    render(<Harness onFrameShown={onFrameShown} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(onFrameShown.mock.calls.map((c) => c[1])).toEqual(["a-1", "a-2"]);
  });

  it("the clock advances a frame after its duration, and a paused clock does not", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    render(<Harness />);
    act(() => vi.advanceTimersByTime(5200));
    expect(shown()).toBe("a-2");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: " " });
    act(() => vi.advanceTimersByTime(8000));
    expect(shown()).toBe("a-2");
  });

  it("a clock held from outside (a sheet over the viewer) does not advance", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    render(<Harness paused />);
    act(() => vi.advanceTimersByTime(8000));
    expect(shown()).toBe("a-1");
  });
});

describe("the gestures — enhancements over the controls", () => {
  function tap(x: number, y = 400, upY = y) {
    const layer = document.querySelector("[data-story-taps]") as HTMLElement;
    layer.getBoundingClientRect = () => ({ left: 0, right: 390, top: 0, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(layer, { clientX: x, clientY: y });
    fireEvent.pointerUp(layer, { clientX: x, clientY: upY });
  }

  it("in RTL a tap on the start third (the right) goes back, elsewhere forward", () => {
    render(<Harness />);
    tap(100);
    expect(shown()).toBe("a-2");
    tap(350);
    expect(shown()).toBe("a-1");
  });

  it("a swipe down closes", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    tap(200, 300, 420);
    expect(onClose).toHaveBeenCalled();
  });

  it("the gestures' layer is nothing to assistive technology", () => {
    render(<Harness />);
    expect(document.querySelector("[data-story-taps]")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the dialog", () => {
  it("is named, and announces the position", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: labels.dialog })).toBeInTheDocument();
    expect(screen.getByText("الإطار 1 من 3")).toBeInTheDocument();
  });

  it("returns focus to the ring on close", () => {
    const { rerender } = render(<Harness />);
    rerender(<Harness open={false} />);
    expect(screen.getByRole("button", { name: "الحلقة" })).toHaveFocus();
  });
});
