import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Direction } from "radix-ui";
import { routing } from "@/i18n/routing";
import { plexArabic, plexSans } from "@/lib/fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  // og:image is emitted as an ABSOLUTE URL off metadataBase; if it resolves to
  // localhost, link-preview crawlers (WhatsApp, etc.) can't fetch it. Prefer an
  // explicit SITE_URL (set to https://kareem.pp.sa on Vercel so the card sits on
  // the custom domain, not the *.vercel.app one), then Vercel's production
  // domain, then localhost in dev / the real domain in prod builds.
  // `||` (not `??`) so an empty SITE_URL="" env still falls through.
  const siteUrl =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://kareem.pp.sa");

  // Served from public/ and referenced explicitly (relative URLs resolve
  // against metadataBase). We can't use the app/opengraph-image file
  // convention here: a static image inside the dynamic [locale] segment
  // fails to prerender on this Next version.
  const ogImage = {
    url: "/og.png",
    // secureUrl is passed through verbatim (NOT resolved against metadataBase),
    // so it MUST be absolute.
    secureUrl: `${siteUrl}/og.png`,
    type: "image/png",
    width: 1200,
    height: 630,
    alt: "كريم معرفة | Knowledge Kareem — شارك المعرفة.. واصنع الأثر",
  };

  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      siteName: locale === "ar" ? "كريم معرفة" : "Knowledge Kareem",
      locale,
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0B1220",
  // Opt into edge-to-edge so env(safe-area-inset-*) is non-zero on notched
  // phones; every fixed element (Header top, MobileCta bottom) then pads for
  // the notch/home-indicator itself. NEVER add maximumScale/userScalable —
  // pinch-zoom must stay (a11y).
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${plexArabic.variable} ${plexSans.variable}`}
    >
      <body>
        {/* Sting gate — must run synchronously before first paint so the
            opening sting shows without a hero flash. Plays only on the
            landing page, once per session, JS on, motion allowed. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;if(!/^\\/(ar|en)\\/?$/.test(location.pathname))return;if(sessionStorage.getItem('km-sting'))return;document.documentElement.setAttribute('data-sting','1');}catch(e){}})();`,
          }}
        />
        <NextIntlClientProvider>
          {/* Radix primitives read their direction from here, not from the
              DOM — a popover or a select with no provider assumes LTR and
              opens on the wrong side in Arabic (DEC-019, 10 §2.1). It renders
              no markup, so the frozen routes are byte-identical. */}
          <Direction.Provider dir={locale === "ar" ? "rtl" : "ltr"}>
            {/* The chrome belongs to each surface: (marketing) renders the
                header, main and footer; (auth) and app render their own
                (DEC-038). */}
            {children}
          </Direction.Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
