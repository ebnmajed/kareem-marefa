// SCR-051's index route — the detail beside the queue. ★ When an item is open but its detail cannot be read, the page
// still draws the heading split-view labels the section by — never a section pointing at a missing id (axe's
// aria-prohibited-attr, the a11y sweep's finding here). An empty queue draws nothing: split-view names no section then.
// ★ A story frame first in the queue (wave 26, REQ-STO-015) opens the frame's detail, not a photo's.
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import photos from "@/messages/ar/photos.json";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: photos, namespace: namespace as "photos" }),
}));
const dal = vi.hoisted(() => ({
  listPhotoQueue: vi.fn(),
  getPhotoForModeration: vi.fn(),
  getStoryFrameForModeration: vi.fn(),
}));
vi.mock("@/lib/dal/admin-moderation", () => ({ ...dal, FRAME_SEGMENT: "frame-" }));
vi.mock("@/app/[locale]/app/admin/moderation/photos/_components/frame-detail", () => ({ FrameDetail: ({ frame }: { frame: { frameId: string } }) => <article data-frame={frame.frameId} /> }));
vi.mock("@/app/[locale]/app/admin/moderation/photos/_components/photo-detail", () => ({ PhotoDetail: ({ photo }: { photo: { photoId: string } }) => <article data-photo={photo.photoId} /> }));

const { default: Page } = await import("@/app/[locale]/app/admin/moderation/photos/page");

async function show(kind?: string) {
  render(await Page({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(kind ? { kind } : {}) }));
}

describe("SCR-051 index", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an empty queue draws nothing", async () => {
    dal.listPhotoQueue.mockResolvedValue({ takedowns: [], reports: [], closed: [] });
    await show();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("an open item whose detail cannot be read still renders the heading the section is labelled by", async () => {
    dal.listPhotoQueue.mockResolvedValue({ takedowns: [{ photoId: "gone" }], reports: [], closed: [] });
    dal.getPhotoForModeration.mockResolvedValue(null);
    await show();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAttribute("id", "photo-title");
    expect(heading).toHaveClass("sr-only");
  });

  it("a story frame first in the queue opens the frame's detail", async () => {
    dal.listPhotoQueue.mockResolvedValue({ takedowns: [], reports: [{ photoId: "frame-abc", frameId: "abc" }], closed: [] });
    dal.getStoryFrameForModeration.mockResolvedValue({ frameId: "abc" });
    await show("reports");
    expect(dal.getStoryFrameForModeration).toHaveBeenCalledWith("ar", "abc");
    expect(document.querySelector('[data-frame="abc"]')).not.toBeNull();
    expect(dal.getPhotoForModeration).not.toHaveBeenCalled();
  });

  it("a photograph first in the queue opens the photo's detail, as before", async () => {
    dal.listPhotoQueue.mockResolvedValue({ takedowns: [{ photoId: "p1" }], reports: [], closed: [] });
    dal.getPhotoForModeration.mockResolvedValue({ photoId: "p1" });
    await show();
    expect(document.querySelector('[data-photo="p1"]')).not.toBeNull();
  });
});
