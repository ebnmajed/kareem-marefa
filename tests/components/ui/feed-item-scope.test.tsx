// `<FeedItem>` inside the playground's scope — REQ-UIX-057. Born inside it: semantic names only, and every
// variant passes axe on the scope's ground. New cases live here; `feed-item.test.tsx` is the behaviour.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
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

const RAW = /\b(?:navy|silver|slate)-|#[0-9a-fA-F]{3,8}\b|\bduration-\d/;

function all() {
  return (
    <div className="theme-play">
      <FeedItem variant="achievement" icon={<StarIcon />} context="أيك" time="قبل ساعتين">
        <bdi>فهد العنزي</bdi> نال شارة <b>أول حضور</b>
      </FeedItem>
      <FeedItem variant="announcement" sourceLabel="إعلان من الإدارة" time="أمس" body="موسم الشتاء يبدأ 12 أكتوبر." />
      <FeedItem
        variant="recap"
        title="الأرقام التي تكذب"
        href="/app/sessions/s1"
        doneLabel="اكتملت"
        time="أمس"
        meta="28 حاضرًا، 3 صور"
        photos={[{ src: "https://example.test/p.webp", alt: "صورة من الجلسة" }]}
        materials={{ href: "/app/sessions/s1#materials", label: "المواد" }}
      />
    </div>
  );
}

describe("FeedItem inside the scope", () => {
  it("every class it draws is a semantic name: no raw palette, no hex, no literal duration", () => {
    const { container } = renderIn(all());
    for (const el of container.querySelectorAll("[class]")) expect(el.getAttribute("class"), el.tagName).not.toMatch(RAW);
  });

  it("the achievement and the recap sit on the surface, the announcement on the raised surface", () => {
    const { container } = renderIn(all());
    expect(container.querySelector('[data-variant="achievement"]')).toHaveClass("bg-surface", "rounded-panel", "border-edge");
    expect(container.querySelector('[data-variant="recap"]')).toHaveClass("bg-surface");
    expect(container.querySelector('[data-variant="announcement"]')).toHaveClass("bg-raised");
  });

  it("nothing scales on hover and nothing animates", () => {
    const { container } = renderIn(all());
    expect(container.innerHTML).not.toMatch(/hover:scale|animate-|transition/);
  });

  it("every variant is accessible inside the scope", async () => {
    const { container } = renderIn(all());
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
