// SCR-013's ★ requirement: arrow keys follow the READING DIRECTION, not the
// physical key. Real ar/materials.json through NextIntlClientProvider.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/materials.json";
import { PageViewer, type ViewerPageDTO } from "@/components/viewer/page-viewer";

const pages: ViewerPageDTO[] = [
  { pageNumber: 1, imageUrl: "https://x.test/1.webp", thumbnailUrl: "https://x.test/t1.webp" },
  { pageNumber: 2, imageUrl: "https://x.test/2.webp", thumbnailUrl: "https://x.test/t2.webp" },
  { pageNumber: 3, imageUrl: "https://x.test/3.webp", thumbnailUrl: "https://x.test/t3.webp" },
];

function renderViewer(rtl: boolean) {
  return render(
    <NextIntlClientProvider locale={rtl ? "ar" : "en"} messages={ar}>
      <PageViewer pages={pages} rtl={rtl} title="عرض تجريبي" />
    </NextIntlClientProvider>,
  );
}

function expectPage(text: string) {
  expect(screen.getByTestId("page-indicator")).toHaveTextContent(text);
}

describe("PageViewer", () => {
  it("starts on page 1 of 3", () => {
    renderViewer(true);
    expectPage("صفحة 1 من 3");
  });

  it("★ RTL: the LEFT arrow key advances (reading direction), the RIGHT arrow goes back", async () => {
    const user = userEvent.setup();
    renderViewer(true);
    expectPage("صفحة 1 من 3");

    await user.keyboard("{ArrowLeft}");
    expectPage("صفحة 2 من 3");

    await user.keyboard("{ArrowLeft}");
    expectPage("صفحة 3 من 3");

    await user.keyboard("{ArrowRight}");
    expectPage("صفحة 2 من 3");
  });

  it("★ LTR: the RIGHT arrow key advances, the LEFT arrow goes back — the opposite of RTL", async () => {
    const user = userEvent.setup();
    renderViewer(false);
    expectPage("صفحة 1 من 3");

    await user.keyboard("{ArrowRight}");
    expectPage("صفحة 2 من 3");

    await user.keyboard("{ArrowLeft}");
    expectPage("صفحة 1 من 3");
  });

  it("Home and End jump to the first and last page regardless of direction", async () => {
    const user = userEvent.setup();
    renderViewer(true);
    await user.keyboard("{End}");
    expectPage("صفحة 3 من 3");
    await user.keyboard("{Home}");
    expectPage("صفحة 1 من 3");
  });

  it("Page Down advances and Page Up retreats, independent of reading direction", async () => {
    const user = userEvent.setup();
    renderViewer(true);
    await user.keyboard("{PageDown}");
    expectPage("صفحة 2 من 3");
    await user.keyboard("{PageUp}");
    expectPage("صفحة 1 من 3");
  });

  it("never advances past the last page or retreats before the first", async () => {
    const user = userEvent.setup();
    renderViewer(true);
    await user.keyboard("{Home}");
    await user.keyboard("{ArrowRight}"); // retreat from page 1 — stays put
    expectPage("صفحة 1 من 3");
    await user.keyboard("{End}");
    await user.keyboard("{ArrowLeft}"); // advance from the last page — stays put
    expectPage("صفحة 3 من 3");
  });

  it("clicking a thumbnail jumps straight to that page", async () => {
    const user = userEvent.setup();
    renderViewer(true);
    await user.click(screen.getByRole("button", { name: "الانتقال إلى الصفحة 3" }));
    expectPage("صفحة 3 من 3");
  });

  it("renders the no-pages state instead of crashing on an empty list", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <PageViewer pages={[]} rtl title="فارغ" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("لا توجد صفحات لعرضها.")).toBeInTheDocument();
  });
});
