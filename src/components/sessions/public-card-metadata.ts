import type { Metadata } from "next";
import { formatDateTime, type NumeralSystem } from "@/components/sessions/numerals";

// The Open Graph and Twitter tags of the public session card (SCR-012's
// public half, the owner's decision of 2026-09-15).
//
// A PURE module with no data access, because the thing worth testing is the
// composition and not the fetch: which URL the crawler is handed, that it is
// ABSOLUTE, what the description says when there is no venue yet, and that
// the fallback image is the platform's own rather than nothing.
//
// ★ ABSOLUTE URLS, ALWAYS. `metadataBase` resolves a relative `og:image`, but
// `og:image:secure_url` is passed through verbatim, and a crawler that gets a
// relative URL simply shows no image. The locale layout learned this for
// `/og.png`; the card pays the same rent.
//
// ★ NOT INDEXED. The layout already sets `robots: index: false`, and this
// repeats it rather than inheriting it silently: the owner opened these six
// fields to whoever HOLDS THE LINK. Being found by searching for the venue is
// a different decision, and it is not this one. Preview crawlers
// (facebookexternalhit, Twitterbot, LinkedInBot, WhatsApp) read the OG tags
// regardless of the robots directive, so the previews still work.

/** The site origin, resolved exactly as the locale layout resolves it.
 *  `||` and not `??`, so an empty `SITE_URL=""` falls through. */
export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (env.NODE_ENV === "development" ? "http://localhost:3000" : "https://kareem.pp.sa")
  );
}

/** `/{locale}/s/{id}` — the public card's path. It is NOT the event page's
 *  path, and `publicCardPath` is the only place that shape is written. */
export function publicCardPath(locale: string, id: string): string {
  return `/${locale}/s/${id}`;
}

/** `/api/s/{id}/og` — the image a crawler fetches. Unlocalised: it is bytes. */
export function publicCardImagePath(id: string): string {
  return `/api/s/${id}/og`;
}

export interface PublicCardMeta {
  id: string;
  title: string;
  startsAt: string | null;
  timeZone: string;
  numerals: NumeralSystem;
  venueName: string | null;
  orgName: string;
  hasImage: boolean;
  imageWidth: number | null;
  imageHeight: number | null;
}

export interface PublicCardMetaOptions {
  locale: string;
  origin: string;
  /** The alt text for the image, translated by the caller. */
  imageAlt: string;
}

/** `ar` → `ar_SA`. The OG locale is a territory-qualified tag, not a language. */
export function ogLocale(locale: string): string {
  return locale === "en" ? "en_US" : "ar_SA";
}

/** «الأربعاء ١٦ سبتمبر ٢٠٢٦ في ٦:٠٠ م · قاعة الابتكار · نادي المعرفة».
 *
 *  The parts that exist, in that order, separated by « · ». A session with no
 *  venue yet is not published, so in practice the venue is always there — but
 *  a description that reads «· · نادي المعرفة» because a part was null is the
 *  kind of thing that only ever shows up in somebody's WhatsApp. */
export function cardDescription(card: PublicCardMeta, locale: string): string {
  const when = card.startsAt ? formatDateTime(card.startsAt, card.numerals, card.timeZone, locale) : null;
  return [when, card.venueName, card.orgName].filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

export function buildPublicCardMetadata(card: PublicCardMeta, { locale, origin, imageAlt }: PublicCardMetaOptions): Metadata {
  const url = `${origin}${publicCardPath(locale, card.id)}`;
  const description = cardDescription(card, locale);
  // A session with no rendered poster falls back to the platform's own card
  // image rather than to no image at all: a preview with a picture is opened
  // and one without it mostly is not, and `/og.png` is a frozen 1200×630 that
  // is already on the domain (REQ-NFR-019).
  const image = card.hasImage
    ? {
        url: `${origin}${publicCardImagePath(card.id)}`,
        secureUrl: `${origin}${publicCardImagePath(card.id)}`,
        type: "image/png",
        width: card.imageWidth ?? 1200,
        height: card.imageHeight ?? 630,
        alt: imageAlt,
      }
    : { url: `${origin}/og.png`, secureUrl: `${origin}/og.png`, type: "image/png", width: 1200, height: 630, alt: imageAlt };

  return {
    title: card.title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: {
      title: card.title,
      description,
      url,
      // The publisher is the ORG, not the platform: the reader knows «نادي
      // المعرفة», and the product's own name on a session card would be a
      // brand the reader has no relationship with.
      siteName: card.orgName,
      locale: ogLocale(locale),
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title: card.title, description, images: [image] },
  };
}
