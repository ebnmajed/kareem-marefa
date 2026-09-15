"use client";

// ★★ THE ONE FILE IN THE PRODUCT THAT MAY HARD-CODE ARABIC AND dir="rtl".
// `16` §7.4, REQ-UIX-016, DEC-091.
//
// `global-error.tsx` REPLACES THE ROOT LAYOUT when it renders. There is no
// `NextIntlClientProvider` and no `<html lang>` above it, so `getTranslations`
// is unavailable BY CONSTRUCTION — not by oversight, and not something a later
// refactor should "fix" by importing next-intl here. It would throw, and the
// thing it would throw inside is the last-resort error page.
//
// It also has to supply `<html>` and `<body>` itself, which is why the
// direction and the language are attributes here rather than inherited.
//
// What it replaced: every `/app/**` route is dynamic and touches the DAL. A
// Supabase timeout, an RLS 42501, a `getClaims()` union landing on the
// no-session branch, an expired signed URL — any of them rendered Next's
// default error page: English, left-to-right, no shell, no wordmark, to a
// member of an Arabic-first product. It was the single least Arabic surface in
// the application and nobody had ever seen it.
//
// Two sentences, one link, hand-written, reviewed once. No stack trace, and
// the digest is small and last — it is for a support conversation, never the
// headline. `route-coverage --kind=error` asserts this file exists, contains
// `dir="rtl"`, and does NOT reference next-intl.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "#ffffff",
          color: "#33415c",
          // The font stack, not the variable: `next/font` sets its custom
          // property on the root layout's <html>, and this file replaced it.
          fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif",
          lineHeight: 1.7,
          textAlign: "start",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ margin: "0 0 0.75rem", fontSize: "1.75rem", lineHeight: 1.4, color: "#0b1220", fontWeight: 600 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ margin: "0 0 1.5rem" }}>
            تعذّر تحميل الصفحة. جرّب مرة أخرى، وإن تكرر الأمر عد إلى الصفحة الرئيسية.
          </p>
          <p style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: 0 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "0 1.75rem",
                borderRadius: "6px",
                border: "none",
                background: "#0b1220",
                color: "#ffffff",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              أعد المحاولة
            </button>
            <a
              href="/ar/app"
              style={{
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 1.75rem",
                borderRadius: "6px",
                border: "1px solid #c9ced6",
                color: "#0b1220",
                textDecoration: "none",
              }}
            >
              العودة إلى المنصة
            </a>
          </p>
          {error.digest ? (
            <p style={{ marginTop: "2rem", fontSize: "0.9375rem", color: "#5b6780" }}>
              رمز الخطأ: <bdi>{error.digest}</bdi>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
