// «تنزيل الكل» — REQ-ADM-021, DEC-182. ★ «Ready» is a state read from the
// data, so each state below is what a reload shows: nothing here depends on a
// toast, a timer or a notification having been seen. Every control is a plain
// form POST or a plain <a> to an audited route — never `download`, never a
// signed URL.
import { createTranslator } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/photos.json";
import { AlbumControl } from "@/components/photos/album-control";
import type { PhotoAlbumState } from "@/lib/dal/photos";

// The real catalogue; cast only because `getTranslations`' return type is keyed to the app's
// global message type, which a bare `createTranslator` does not carry.
const t = createTranslator({ locale: "ar", messages: ar, namespace: "photos.album" }) as unknown as Parameters<typeof AlbumControl>[0]["t"];
const SESSION = "5f0c1d7e-2b8e-4b7a-9d3a-0e6f1c2a4b5c";
const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString();

const ready = (over: Partial<PhotoAlbumState> = {}): PhotoAlbumState => ({
  status: "ready",
  photoCount: 12,
  byteSize: 48_000_000,
  parts: 1,
  expiresAt: FUTURE,
  ...over,
});

function show(album: PhotoAlbumState | null, visibleCount = 12) {
  return render(<AlbumControl t={t} sessionId={SESSION} locale="ar" album={album} visibleCount={visibleCount} timeZone="Asia/Riyadh" />);
}

describe("AlbumControl", () => {
  it("offers «تنزيل الكل» as a plain form POST when no album exists", () => {
    const { container } = show(null);
    const button = screen.getByRole("button", { name: "تنزيل الكل" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", `/api/photos/albums/${SESSION}`);
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders nothing when there is no album and nothing visible to put in one", () => {
    const { container } = show(null, 0);
    expect(container).toBeEmptyDOMElement();
  });

  it("while queued or building, says so as a status — no button, no spinner", () => {
    for (const status of ["queued", "building"] as const) {
      const { unmount } = show({ status, photoCount: null, byteSize: null, parts: 0, expiresAt: null });
      expect(screen.getByRole("status")).toHaveTextContent("نُجهّز ملف الصور");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("★ ready: the count, the size and the expiry in Western digits, and one link to the audited route", () => {
    show(ready());
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("12 صورة");
    expect(status).toHaveTextContent("48");
    expect(status.textContent).not.toMatch(/[٠-٩]/);
    const link = screen.getByRole("link", { name: "تنزيل الملف" });
    expect(link).toHaveAttribute("href", `/api/photos/albums/${SESSION}/download?part=1`);
    expect(link).not.toHaveAttribute("download");
    expect(screen.queryByRole("button", { name: "جهّزه من جديد" })).not.toBeInTheDocument();
  });

  it("ready in parts: one link per part, «الجزء 2 من 3»", () => {
    show(ready({ parts: 3 }));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([1, 2, 3].map((n) => `/api/photos/albums/${SESSION}/download?part=${n}`));
    expect(links[1]).toHaveTextContent("الجزء 2 من 3");
  });

  it("ready, but the visible photos changed since: says so and offers to prepare it again", () => {
    show(ready(), 13);
    expect(screen.getByText("تغيّر عدد الصور بعد تجهيز الملف.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "جهّزه من جديد" })).toBeInTheDocument();
  });

  it("stale and failed each say what happened and offer the one way forward", () => {
    const stale = show({ ...ready(), status: "stale" });
    expect(screen.getByRole("status")).toHaveTextContent("أُخفيت صورة بعد تجهيز الملف");
    expect(screen.getByRole("button", { name: "جهّزه من جديد" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    stale.unmount();

    show({ ...ready(), status: "failed" });
    expect(screen.getByRole("status")).toHaveTextContent("تعذّر تجهيز ملف الصور.");
    expect(screen.getByRole("button", { name: "حاول مرة أخرى" })).toBeInTheDocument();
  });

  it("is accessible when ready in parts", async () => {
    const { container } = show(ready({ parts: 2 }), 13);
    const results = await axe.run(container);
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
