import { setRequestLocale } from "next-intl/server";
import { Wordmark } from "@/components/wordmark";

// SCR-005's shell — `/legal/**`, PUBLIC (REQ-NFR-015, 12 §6, DEC-051).
//
// No session, no gate, no DAL: a privacy policy that requires signing in to
// read is not a privacy policy. `proxy.ts` gives these routes the platform's
// CSP nonce and 404s them while the app is unconfigured (DEC-051 decision 3);
// nothing else stands between a reader and this text.
//
// A reading measure, not the app's 6xl container: legal text at full width is
// text nobody finishes.
export default async function LegalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="min-h-dvh bg-canvas text-fg-body">
      <header className="border-b border-edge">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 md:px-8">
          <Wordmark />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-16">
        {children}
      </main>
    </div>
  );
}
