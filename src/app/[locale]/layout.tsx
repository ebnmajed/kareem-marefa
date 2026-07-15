import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { plexArabic, plexSans } from "@/lib/fonts";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
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
  // explicit SITE_URL, then Vercel's production domain, then localhost for dev.
  // `||` (not `??`) so an empty SITE_URL="" env still falls through.
  const siteUrl =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    "http://localhost:3000";

  return {
    metadataBase: new URL(siteUrl),
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
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
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
