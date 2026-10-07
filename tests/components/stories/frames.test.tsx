// The frame bodies — REQ-STO-004, REQ-STO-013, DEC-124. Every figure read from `sessions'` DTO; Western digits; a
// video that is not visible says so to its author and plays nothing; the recap withholds the rating below the minimum.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/components/stories/actions", () => ({}));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
import stories from "@/messages/ar/stories.json";
import { FrameBody, frameAge, frameDurationMs, videoLength } from "@/components/stories/frames";
import { ringShape } from "@/components/stories/story-rings-client";
import type { StoryFrame, StorySession } from "@/lib/dal/stories";

const messages = stories;
const t = createTranslator({ locale: "ar", messages, namespace: "stories" });
const NOW = "2026-10-05T18:00:00Z";
const base = { triggeredAt: "2026-10-05T17:57:00Z", expiresAt: "2026-10-06T17:57:00Z", seen: false, dayId: null, dayPosition: null, action: { kind: "open_session", href: "/app/sessions/s" } } as const;
const session: StorySession = {
  sessionId: "s",
  title: "العرض في 5 شرائح",
  teamColor: "#35D0FF",
  presenter: { memberId: "p", name: "سارة القحطاني", avatarUrl: null, teamColor: "#35D0FF", company: "مواهب" },
  timeZone: "Asia/Riyadh",
  phase: "live",
  ring: "live",
  frames: [],
  firstUnseenIndex: 0,
};
const media = { photos: { ph: "https://x.test/p.webp" }, videos: { v: { videoUrl: "https://x.test/v.mp4", posterUrl: "https://x.test/v.webp", durationMs: 12_000 } } };

function show(frame: StoryFrame) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <FrameBody frame={frame} session={session} media={media} now={NOW} locale="ar" />
    </NextIntlClientProvider>,
  );
}

describe("the frame bodies", () => {
  it("the age and a video's length are Western digits", () => {
    expect(frameAge(t as never, base.triggeredAt, NOW)).toBe("قبل 3 دقائق");
    expect(videoLength(t as never, 12)).toBe("0:12");
    expect(frameAge(t as never, base.triggeredAt, NOW)).not.toMatch(/[٠-٩]/);
  });

  it("STO-07's durations: a photo 5 s, a video its own length, text 6 s", () => {
    expect(frameDurationMs({ ...base, id: "x", kind: "photo", photoId: "ph", uploader: null, caption: null }, media)).toBe(5000);
    expect(frameDurationMs({ ...base, id: "v", kind: "video", state: "visible", author: null, caption: null, durationSeconds: 12 }, media)).toBe(12_000);
    expect(frameDurationMs({ ...base, id: "m", kind: "materials", materialsCount: 3 }, media)).toBe(6000);
  });

  it("an attendee's photograph shows who posted it, its age and its caption", () => {
    show({ ...base, id: "x", kind: "photo", photoId: "ph", uploader: { memberId: "r", name: "ريم الشهري", avatarUrl: null, teamColor: "#FF4FB8", company: null }, caption: "الشريحة الثالثة" });
    expect(screen.getByText("ريم الشهري")).toBeInTheDocument();
    expect(screen.getByText("الشريحة الثالثة")).toBeInTheDocument();
    // The caption is shown, so the photograph is not named by it a second time.
    const img = document.querySelector('img[src="https://x.test/p.webp"]');
    expect(img).toHaveAttribute("alt", "");
  });

  it("a video that is not visible plays nothing and says «جارٍ التجهيز» or «تعذّر»", () => {
    const { container, rerender } = show({ ...base, id: "p1", kind: "video", state: "processing", author: null, caption: null, durationSeconds: null });
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التجهيز");
    expect(container.querySelector("video")).toBeNull();
    rerender(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <FrameBody frame={{ ...base, id: "p1", kind: "video", state: "failed", author: null, caption: null, durationSeconds: null }} session={session} media={media} now={NOW} locale="ar" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("تعذّر");
  });

  it("a visible video plays its rendition with its poster and its length", () => {
    const { container } = show({ ...base, id: "v", kind: "video", state: "visible", author: null, caption: null, durationSeconds: 12 });
    expect(container.querySelector("video")).toHaveAttribute("poster", "https://x.test/v.webp");
    expect(screen.getByText("0:12")).toBeInTheDocument();
  });

  it("the recap withholds the rating below the minimum (REQ-RAT-006)", () => {
    show({ ...base, id: "r", kind: "recap", attended: 28, rating: { state: "withheld", count: 2, minimum: 3 }, materialsCount: 3, photoIds: [] });
    expect(screen.getByText("بعد 3")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
  });
});

describe("the ring's shape — no fifth state (DEC-251 §4.5)", () => {
  it("unseen is upcoming before completion and recap after; live and seen are themselves", () => {
    expect(ringShape({ ring: "unseen", phase: "upcoming" }, false)).toBe("upcoming");
    expect(ringShape({ ring: "unseen", phase: "completed" }, false)).toBe("recap");
    expect(ringShape({ ring: "live", phase: "live" }, true)).toBe("live");
    expect(ringShape({ ring: "seen", phase: "completed" }, false)).toBe("seen");
    expect(ringShape({ ring: "unseen", phase: "completed" }, true)).toBe("seen");
  });
});

describe("`StoryLive.dc.html` — the live frame as drawn", () => {
  const live: StoryFrame = { ...base, id: "l", kind: "live", checkedInCount: 23, venueName: "قاعة الرياض", endsAt: "2026-10-05T16:30:00Z" };

  // DEC-278 (a ledger line): the viewer draws no discs at the edges any more, so the frame keeps the ordinary gutter.
  it("stands on the TEAM ground with ink text, centred both ways, with the ordinary gutter", () => {
    const { container } = show(live);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("bg-team", "text-on-team", "items-center", "justify-center", "text-center", "px-6");
    // The title's `text-h1` colours itself from --fg-heading, so the ground re-points it at the ink.
    expect(root).toHaveClass("[--fg-heading:var(--color-on-team)]");
  });

  it("draws the count's NUMERAL large and «في القاعة» small; the accessible text is the whole phrase", () => {
    const { container } = show(live);
    const numeral = [...container.querySelectorAll("bdi")].find((el) => el.textContent === "23")!;
    expect(numeral).toHaveClass("text-[4rem]");
    expect(numeral).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("في القاعة")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".sr-only")).toHaveTextContent("23 في القاعة");
  });

  it("with no team colour, the neutral raised ground — never ink on a missing colour", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <FrameBody frame={live} session={{ ...session, teamColor: null }} media={media} now={NOW} locale="ar" />
      </NextIntlClientProvider>,
    );
    expect(document.querySelector(".bg-raised")).not.toBeNull();
    expect(document.querySelector(".bg-team")).toBeNull();
  });
});

// DEC-278 — the owner's screenshot: a published frame printed the session's title twice, once on the poster and once
// over it. A rendered poster is now the frame alone; with no poster the frame still says what it is in text.
describe("the published frame", () => {
  const published = (posterUrl: string | null): StoryFrame => ({ ...base, id: "pub", kind: "published", startsAt: "2026-10-14T13:30:00Z", venueName: "قاعة الرياض", posterUrl });

  it("with a rendered poster: the poster alone, named by the title — no title drawn over it", () => {
    const { container } = show(published("https://x.test/story.webp"));
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://x.test/story.webp");
    expect(img).toHaveAttribute("alt", session.title);
    expect(img).toHaveClass("object-contain");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.textContent).not.toContain(session.title);
  });

  it("with no poster: the title, once, in text", () => {
    const { container } = show(published(null));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByRole("heading", { name: session.title })).toHaveLength(1);
  });
});
