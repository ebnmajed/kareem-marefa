// A recap on the home — REQ-UIX-055, DEC-206 §4.54 – §4.55. Its photographs are named in words (an `alt` holds no
// markup), «المواد» is drawn only when there is material, and the attended figure is a count. RTL document.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import feedAr from "@/messages/ar/feed.json";
import browseAr from "@/messages/ar/browse.json";
import type { SessionPost } from "@/components/browse/session-post";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "browse"
      ? createTranslator({ locale: "ar", messages: browseAr, namespace: "browse" })
      : createTranslator({ locale: "ar", messages: feedAr, namespace: namespace as "feed" }),
}));
vi.mock("@/components/feed/actions", () => ({ toggleSessionLike: vi.fn() }));

const { RecapPost } = await import("@/components/feed/recap-post");

const post = {
  id: "22222222-2222-2222-2222-222222222222",
  title: "الأرقام التي تكذب",
  href: "/app/sessions/22222222-2222-2222-2222-222222222222",
  phase: "ended",
  day: "2026-09-29",
  startsAt: "2026-09-29T15:00:00Z",
  endsAt: "2026-09-29T17:00:00Z",
  presenters: [{ memberId: "m", displayName: "محمد الدوسري", avatarUrl: null, company: { id: "c", name: "جذر", teamColor: null } }],
  attendedCount: 28,
  likeCount: 63,
  likedByMe: false,
} as unknown as SessionPost;

async function show(hasMaterials: boolean, over: Partial<SessionPost> = {}) {
  const ui = await RecapPost({
    post: { ...post, ...over } as SessionPost,
    extra: { count: 3, photos: [{ id: "p1", url: "https://example.test/1.webp", width: 800, height: 600 }], hasMaterials },
    locale: "ar",
    now: new Date("2026-09-30T12:00:00Z"),
    today: "2026-09-30",
  });
  return render(
    <NextIntlClientProvider locale="ar" messages={feedAr}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RecapPost", () => {
  it("names its photographs in words, with no markup and no message key", async () => {
    await show(true);
    expect(screen.getByRole("img", { name: "صورة من جلسة الأرقام التي تكذب" })).toBeInTheDocument();
  });

  it("says who presented, how many attended and how many photographs, and yesterday", async () => {
    const { container } = await show(true);
    expect(container).toHaveTextContent("محمد الدوسري · جذر · 28 حاضرًا · 3 صور");
    expect(container).toHaveTextContent("أمس");
  });

  it("★ a co-presented session is not one person's: «وآخر» after the lead, the others unnamed", async () => {
    const more = (n: number) => Array.from({ length: n }, (_, i) => ({ memberId: `x${i}`, displayName: `مقدّم ${i}`, avatarUrl: null, company: null }));
    const lead = post.presenters[0]!;
    const { container, unmount } = await show(true, { presenters: [lead, ...more(1)] });
    expect(container).toHaveTextContent("محمد الدوسري وآخر · جذر");
    expect(container).not.toHaveTextContent("مقدّم 0");
    unmount();
    const three = await show(true, { presenters: [lead, ...more(2)] });
    expect(three.container).toHaveTextContent("محمد الدوسري وآخران · جذر");
  });

  it("«المواد» links to the materials only when there is one", async () => {
    const { unmount } = await show(true);
    expect(screen.getByRole("link", { name: "المواد" })).toHaveAttribute("href", expect.stringContaining("#materials"));
    unmount();
    await show(false);
    expect(screen.queryByRole("link", { name: "المواد" })).not.toBeInTheDocument();
  });
});
