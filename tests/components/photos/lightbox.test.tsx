// REQ-EVT-016 — the lightbox, driven by taps (DEC-093's sixth place), with the
// real ar/en photos.json through NextIntlClientProvider. The e2e gate
// (`wave14-content-lightbox.spec.ts`) proves the same with `page.click()` on a
// real build; this file pins the behaviour a build hides: focus returning to the
// opening tile, the ends staying focusable, a prop update mid-view, the swipe's
// direction in each script.
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/photos.json";
import en from "@/messages/en/photos.json";
import { LightboxTile, PhotoLightbox, type LightboxPhoto } from "@/components/photos/lightbox";

const photo = (id: string): LightboxPhoto => ({ id, url: `https://storage.test/${id}.jpg`, width: 1200, height: 800 });
const THREE = [photo("p1"), photo("p2"), photo("p3")];

function Gallery({ photos, tiles = ["p1", "p2", "p3"] }: { photos: LightboxPhoto[]; tiles?: string[] }) {
  return (
    <PhotoLightbox photos={photos}>
      <ul>
        {tiles.map((id) => (
          <li key={id}>
            <LightboxTile photoId={id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://storage.test/${id}.jpg`} alt="" />
            </LightboxTile>
          </li>
        ))}
      </ul>
    </PhotoLightbox>
  );
}

function renderIn(locale: "ar" | "en", ui: React.ReactElement) {
  const messages = locale === "ar" ? ar : en;
  const wrap = (node: React.ReactElement) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
  const result = render(wrap(ui));
  return { ...result, rerenderIn: (node: React.ReactElement) => result.rerender(wrap(node)) };
}

const shown = () => screen.getByRole("dialog").querySelector("img[data-photo-id]")?.getAttribute("data-photo-id");

describe("PhotoLightbox (REQ-EVT-016)", () => {
  it("names each tile by its place in the sequence; a photograph outside it (hidden) gets no button", () => {
    renderIn("ar", <Gallery photos={[photo("p1"), photo("p3")]} />);
    expect(screen.getByRole("button", { name: "افتح الصورة 1 من 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "افتح الصورة 2 من 2" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the tapped photograph whole, says «2 من 3», and announces it", () => {
    renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 2 من 3" }));
    const dialog = screen.getByRole("dialog", { name: "صور الجلسة" });
    expect(shown()).toBe("p2");
    const img = within(dialog).getByRole("img", { name: "الصورة 2 من 3" });
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
    expect(dialog).toHaveTextContent("2 من 3");
    expect(dialog.querySelector('[aria-live="polite"]')).toHaveTextContent("الصورة 2 من 3");
  });

  it("moves forward and back with the always-visible tap targets; the ends stay focusable, aria-disabled", () => {
    renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 3" }));
    const previous = screen.getByRole("button", { name: "الصورة السابقة" });
    const next = screen.getByRole("button", { name: "الصورة التالية" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(previous).not.toBeDisabled();

    fireEvent.click(next);
    expect(shown()).toBe("p2");
    fireEvent.click(next);
    expect(shown()).toBe("p3");
    expect(next).toHaveAttribute("aria-disabled", "true");
    next.focus();
    fireEvent.click(next);
    expect(shown()).toBe("p3");
    expect(next).toHaveFocus();

    fireEvent.click(previous);
    fireEvent.click(previous);
    expect(shown()).toBe("p1");
    expect(screen.getByRole("dialog").querySelector('[aria-live="polite"]')).toHaveTextContent("الصورة 1 من 3");
  });

  it("offers the photograph through the audited route — a plain link, never `download`, never a signed URL", () => {
    renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 3 من 3" }));
    const link = screen.getByRole("link", { name: "تنزيل الصورة" });
    expect(link).toHaveAttribute("href", "/api/photos/p3/download");
    expect(link).not.toHaveAttribute("download");
  });

  it("returns focus to the tile that opened it, after moving, when Escape closes it", async () => {
    renderIn("ar", <Gallery photos={THREE} />);
    const opener = screen.getByRole("button", { name: "افتح الصورة 2 من 3" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "الصورة التالية" }));
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Radix's FocusScope hands focus back on the next task after unmount.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("closes on the letterbox around the photograph, not on the photograph", () => {
    renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 3" }));
    fireEvent.click(screen.getByRole("img", { name: "الصورة 1 من 3" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lightbox-stage"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("follows the visual axis on the arrow keys: in Arabic ArrowLeft is next", () => {
    renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 3" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(shown()).toBe("p2");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(shown()).toBe("p1");
  });

  it("layers a swipe on top: a rightward swipe is next in Arabic, a leftward one in English; a short one is a tap", () => {
    const swipe = (dx: number) => {
      const stage = screen.getByTestId("lightbox-stage");
      fireEvent.pointerDown(stage, { clientX: 200, clientY: 300 });
      fireEvent.pointerUp(stage, { clientX: 200 + dx, clientY: 305 });
    };

    const a = renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 3" }));
    swipe(120);
    expect(shown()).toBe("p2");
    swipe(20);
    expect(shown()).toBe("p2");
    a.unmount();

    renderIn("en", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "Open photo 1 of 3" }));
    swipe(-120);
    expect(shown()).toBe("p2");
  });

  it("after a refresh removes the photograph on screen, shows the one now in its place; with none left, it closes", () => {
    const { rerenderIn } = renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 2 من 3" }));
    rerenderIn(<Gallery photos={[photo("p1"), photo("p3")]} tiles={["p1", "p3"]} />);
    expect(shown()).toBe("p3");
    expect(screen.getByRole("dialog")).toHaveTextContent("2 من 2");

    rerenderIn(<Gallery photos={[]} tiles={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerenderIn(<Gallery photos={THREE} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the photograph on screen on its first URL when a refresh re-signs every URL", () => {
    const { rerenderIn } = renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 3" }));
    rerenderIn(<Gallery photos={THREE.map((p) => ({ ...p, url: `${p.url}?token=new` }))} />);
    expect(screen.getByRole("img", { name: "الصورة 1 من 3" })).toHaveAttribute("src", "https://storage.test/p1.jpg");
  });

  it("is accessible while open", async () => {
    renderIn("ar", <Gallery photos={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "افتح الصورة 1 من 3" }));
    const results = await axe.run(document.body);
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
