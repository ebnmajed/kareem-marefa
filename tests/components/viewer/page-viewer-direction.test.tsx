// ★★ The live defect, on the record before the file is deleted (DEC-213 §4, DEC-214 §1, REQ-UIX-065).
//
// `components/viewer/page-viewer.tsx:160` and `:166` gave the two buttons `rtl ? advance : retreat` — mirrored
// in behaviour and not in name — and `disabled={rtl ? index === 0 : …}` on «الصفحة التالية». So in Arabic, on
// page 1, the button named «next» is DISABLED and a member who reads by tapping cannot move forward at all.
//
// This is the direction case `tests/components/ui/page-viewer.test.tsx` holds against the rebuilt primitive, run
// here against TODAY's file and declared `it.fails`: it is green only while the defect exists. It is deleted in
// the same commit as the file it proves wrong.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/materials.json";
import { PageViewer, type ViewerPageDTO } from "@/components/viewer/page-viewer";

const pages: ViewerPageDTO[] = [1, 2, 3].map((n) => ({
  pageNumber: n,
  imageUrl: `https://x.test/${n}.webp`,
  thumbnailUrl: `https://x.test/t${n}.webp`,
  width: 1600,
  height: 900,
}));

describe("the old viewer's buttons, in Arabic", () => {
  it.fails("★ «الصفحة التالية» moves the page from 1 to 2, and «الصفحة السابقة» back to 1", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <PageViewer pages={pages} rtl title="عرض تجريبي" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("صفحة 1 من 3");
    await user.click(screen.getByRole("button", { name: "الصفحة التالية" }));
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("صفحة 2 من 3");
    await user.click(screen.getByRole("button", { name: "الصفحة السابقة" }));
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("صفحة 1 من 3");
  });

  it("the reason, stated directly: on page 1 the button named «next» is disabled", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <PageViewer pages={pages} rtl title="عرض تجريبي" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "الصفحة التالية" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeEnabled();
  });
});
