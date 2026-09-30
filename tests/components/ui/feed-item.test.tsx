// `<FeedItem>` — REQ-UIX-055, REQ-UIX-056, REQ-UIX-057, DEC-206 §4.52 – §4.55. Three variants of one article;
// every word from props; what is absent is absent on purpose. RTL document.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { FeedItem } from "@/components/ui/feed-item";
import { StarIcon } from "@/components/ui/icons";

// The house `Link` needs next-intl's context, as `card.test.tsx` gives it.
function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
}
const renderIn = (ui: ReactElement) => render(ui, { wrapper: Wrap });

const photo = (n: number) => ({ src: `https://example.test/p${n}.webp`, alt: `صورة ${n}`, width: 800, height: 600 });

describe("FeedItem — achievement", () => {
  it("draws the sentence, the company and the time, and offers nothing to press (§4.53)", () => {
    const { container } = renderIn(
      <FeedItem variant="achievement" icon={<StarIcon />} context="أيك" time="قبل ساعتين">
        <bdi>فهد العنزي</bdi> نال شارة <b>أول حضور</b>
      </FeedItem>,
    );
    const article = container.querySelector("article")!;
    expect(article).toHaveAttribute("data-variant", "achievement");
    expect(article).toHaveTextContent("فهد العنزي نال شارة أول حضور");
    expect(article).toHaveTextContent("أيك");
    expect(article).toHaveTextContent("قبل ساعتين");
    expect(within(article).queryByRole("button")).not.toBeInTheDocument();
  });

  it("with no company, the time stands alone and no separator is drawn before it", () => {
    const { container } = renderIn(
      <FeedItem variant="achievement" icon={<StarIcon />} time="أمس">
        نلت شارة
      </FeedItem>,
    );
    expect(container.querySelector('[data-slot="meta"]')!.textContent).toBe("أمس");
  });
});

describe("FeedItem — announcement", () => {
  it("draws the source line and the body whole, bidi-isolated, with no author, action or reaction", () => {
    const body = "موسم الشتاء يبدأ 12 أكتوبر: ثلاث جلسات كل أسبوع.";
    const { container } = renderIn(<FeedItem variant="announcement" sourceLabel="إعلان من الإدارة" time="أمس" body={body} />);
    const article = container.querySelector("article")!;
    expect(article).toHaveTextContent("إعلان من الإدارة");
    expect(article.querySelector('bdi[dir="auto"]')).toHaveTextContent(body);
    expect(within(article).queryByRole("button")).not.toBeInTheDocument();
    expect(within(article).queryByRole("link")).not.toBeInTheDocument();
  });

  it("never clamps: no line-clamp and no hidden overflow on the body", () => {
    const { container } = renderIn(<FeedItem variant="announcement" sourceLabel="إعلان" time="أمس" body={"سطر\nسطر ثانٍ"} />);
    const p = container.querySelector("article p:last-of-type")!;
    expect(p.className).not.toMatch(/line-clamp|overflow-hidden|truncate/);
  });
});

describe("FeedItem — recap", () => {
  const base = { variant: "recap" as const, title: "الأرقام التي تكذب", href: "/app/sessions/s1", doneLabel: "اكتملت", time: "أمس", meta: "28 حاضرًا" };

  it("the title is a heading holding the link to the session", () => {
    renderIn(<FeedItem {...base} photos={[]} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(within(heading).getByRole("link", { name: "الأرقام التي تكذب" })).toHaveAttribute("href", expect.stringContaining("/app/sessions/s1"));
    expect(heading).toHaveTextContent("اكتملت");
  });

  it("draws three photographs at most, lazily, and no strip with none", () => {
    const { container, rerender } = renderIn(<FeedItem {...base} photos={[photo(1), photo(2), photo(3), photo(4), photo(5)]} />);
    const imgs = container.querySelectorAll('[data-slot="photos"] img');
    expect(imgs).toHaveLength(3);
    for (const img of imgs) expect(img).toHaveAttribute("loading", "lazy");
    rerender(<FeedItem {...base} photos={[]} />);
    expect(container.querySelector('[data-slot="photos"]')).toBeNull();
  });

  it("«المواد» is a link to the materials, never a download (§4.55); absent, nothing is drawn", () => {
    const { rerender } = renderIn(<FeedItem {...base} photos={[]} materials={{ href: "/app/sessions/s1#materials", label: "المواد" }} />);
    const link = screen.getByRole("link", { name: "المواد" });
    expect(link).toHaveAttribute("href", expect.stringContaining("#materials"));
    expect(link).not.toHaveAttribute("download");
    rerender(<FeedItem {...base} photos={[]} />);
    expect(screen.queryByRole("link", { name: "المواد" })).not.toBeInTheDocument();
  });

  it("renders the caller's reactions in its last row", () => {
    renderIn(<FeedItem {...base} photos={[]} reactions={<button type="button">إعجاب 63</button>} />);
    expect(screen.getByRole("button", { name: "إعجاب 63" })).toBeInTheDocument();
  });
});
