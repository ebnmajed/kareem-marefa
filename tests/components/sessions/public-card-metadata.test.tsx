// The public session card's Open Graph tags — the owner's decision of
// 2026-09-15.
//
// Everything here is about what a crawler receives, which is the one part of
// this feature nobody can see by looking at the page: a relative `og:image`,
// a missing `secure_url` or a description with a stray separator all render
// perfectly in a browser and badly in WhatsApp.
import { describe, expect, it } from "vitest";
import {
  buildPublicCardMetadata,
  cardDescription,
  ogLocale,
  publicCardImagePath,
  publicCardPath,
  siteOrigin,
  type PublicCardMeta,
} from "@/components/sessions/public-card-metadata";

const ORIGIN = "https://kareem.pp.sa";

const card: PublicCardMeta = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "كيف نكتب تقريرًا يُقرأ",
  startsAt: "2026-09-16T15:00:00.000Z",
  timeZone: "Asia/Riyadh",
  venueName: "قاعة الابتكار",
  orgName: "نادي المعرفة",
  hasImage: true,
  imageWidth: 1200,
  imageHeight: 630,
};

const build = (over: Partial<PublicCardMeta> = {}, locale = "ar") =>
  buildPublicCardMetadata({ ...card, ...over }, { locale, origin: ORIGIN, imageAlt: "ملصق الجلسة" });

// next's Metadata types allow a bare string or an array; the tags are what
// matters, so read them the way Next serialises them.
const firstImage = (meta: ReturnType<typeof build>) => {
  const images = meta.openGraph && "images" in meta.openGraph ? meta.openGraph.images : undefined;
  return (Array.isArray(images) ? images[0] : images) as { url: string; secureUrl: string; width: number; height: number; alt: string };
};

describe("the card's image", () => {
  it("is an ABSOLUTE url, in both `url` and `secure_url`", () => {
    const image = firstImage(build());
    // A relative og:image resolves against metadataBase for `url` but is
    // passed through verbatim for `secure_url` — so a relative one is simply
    // no image in half the crawlers.
    expect(image.url).toBe(`${ORIGIN}/api/s/${card.id}/og`);
    expect(image.secureUrl).toBe(`${ORIGIN}/api/s/${card.id}/og`);
    expect(image.url.startsWith("https://")).toBe(true);
  });

  it("carries the artifact's own pixel size, not an assumed one", () => {
    const image = firstImage(build({ imageWidth: 1600, imageHeight: 840 }));
    expect([image.width, image.height]).toEqual([1600, 840]);
  });

  it("falls back to the platform's own 1200×630 card when the poster has not rendered", () => {
    const image = firstImage(build({ hasImage: false, imageWidth: null, imageHeight: null }));
    expect(image.url).toBe(`${ORIGIN}/og.png`);
    expect([image.width, image.height]).toEqual([1200, 630]);
  });

  it("is the same image on the twitter card", () => {
    const meta = build();
    const twitter = meta.twitter as { card: string; images: Array<{ url: string }> };
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.images[0].url).toBe(firstImage(meta).url);
  });
});

describe("the description", () => {
  it("is the date, the venue and the org, in Western digits and the org's time zone", () => {
    const text = cardDescription(card, "ar");
    // 18:00 in Riyadh, not 15:00 in UTC — and Western digits, always
    // (REQ-INT-006, DEC-124), although `ar`'s CLDR default is Arabic-Indic.
    expect(text).toContain("قاعة الابتكار");
    expect(text).toContain("نادي المعرفة");
    expect(text).toContain("6:00");
    expect(text).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  it("drops a missing part instead of leaving a stray separator", () => {
    expect(cardDescription({ ...card, venueName: null }, "ar")).not.toContain(" ·  · ");
    expect(cardDescription({ ...card, startsAt: null, venueName: null }, "ar")).toBe("نادي المعرفة");
  });
});

describe("the rest of the tags", () => {
  it("names the ORG as the site, not the platform", () => {
    expect((build().openGraph as { siteName: string }).siteName).toBe("نادي المعرفة");
  });

  it("points at the card, canonically, and never at the event page", () => {
    const meta = build();
    const url = `${ORIGIN}/ar/s/${card.id}`;
    expect((meta.openGraph as { url: string }).url).toBe(url);
    expect(meta.alternates?.canonical).toBe(url);
    // ★ The public URL is deliberately NOT the members-only event page's.
    expect(url).not.toContain("/app/sessions/");
  });

  it("is not indexed — the owner opened these fields to whoever HOLDS the link", () => {
    expect(robotsOf(build())).toEqual({ index: false, follow: false });
  });

  it("emits a territory-qualified og:locale", () => {
    expect(ogLocale("ar")).toBe("ar_SA");
    expect(ogLocale("en")).toBe("en_US");
    expect((build({}, "en").openGraph as { locale: string }).locale).toBe("en_US");
  });

  it("uses the session's title verbatim as the title", () => {
    expect(build().title).toBe(card.title);
  });
});

describe("the paths and the origin", () => {
  it("builds the two paths in one place", () => {
    expect(publicCardPath("ar", card.id)).toBe(`/ar/s/${card.id}`);
    expect(publicCardImagePath(card.id)).toBe(`/api/s/${card.id}/og`);
  });

  it("resolves the origin the way the locale layout does, empty SITE_URL included", () => {
    expect(siteOrigin({ SITE_URL: "https://kareem.pp.sa" } as unknown as NodeJS.ProcessEnv)).toBe("https://kareem.pp.sa");
    expect(siteOrigin({ SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" } as unknown as NodeJS.ProcessEnv)).toBe("https://x.vercel.app");
    expect(siteOrigin({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toBe("http://localhost:3000");
    expect(siteOrigin({} as unknown as NodeJS.ProcessEnv)).toBe("https://kareem.pp.sa");
  });
});

function robotsOf(meta: ReturnType<typeof build>) {
  return meta.robots as { index: boolean; follow: boolean };
}
