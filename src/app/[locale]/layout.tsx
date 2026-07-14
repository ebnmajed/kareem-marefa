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

  return {
    metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale,
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0B1220",
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
