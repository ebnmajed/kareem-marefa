import { headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { renderEmail, SAMPLE_CASES, SAMPLE_MEMBER, SAMPLE_ORG } from "@kareem/mail-runtime";

// `/ar/ui/emails` — the seven approved emails, rendered by THE renderer from the sample set (`REQ-NTF-018`,
// `DEC-289`). A dev surface beside the gallery, behind the same edge gate (`proxy.ts`: 404 unless
// `KAREEM_GALLERY=1` or a development server), reading no data.
//
// Each mail is drawn twice — at 600 px, the design's width, and at 390 px, a phone — in a sandboxed frame with no
// scripts, so what is here is what a client receives. The sample poster is the site's own `og.png`, since the
// sample session has no render.
//
// ★ IT NEVER SENDS. The app may not send mail (`@kareem/mail-runtime`'s rule); sending these seven to an address
// through the local sink is the worker's: `npm --prefix worker run mail:previews -- you@example.com`, then open
// Mailpit at http://localhost:54324.

export const metadata = { robots: { index: false, follow: false } };

const DESIGNED: readonly [string, string][] = [
  ["new-session", "MSG-session_published"],
  ["booking-confirmed", "MSG-rsvp_confirmed"],
  ["reminder-week", "MSG-reminder_7d"],
  ["reminder-tomorrow", "MSG-reminder_1d"],
  ["activity-comment", "MSG-session_comment"],
  ["weekly-leaderboard", "MSG-leaderboard_weekly"],
  ["after-session", "MSG-check_in_confirmed.certificate"],
];

export default async function EmailPreviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const mails = DESIGNED.map(([name, id]) => {
    const sample = SAMPLE_CASES.find((c) => c.id === id);
    if (!sample) return null;
    const rendered = renderEmail({
      key: sample.key,
      payload: { ...sample.payload, ...(sample.payload.poster_wide ? { poster_url: `${origin}/og.png` } : {}) },
      member: sample.member ?? SAMPLE_MEMBER,
      org: SAMPLE_ORG,
      appUrl: origin,
      unsubscribeUrl: `${origin}/${locale}/unsubscribe?t=preview`,
    });
    return { name, subject: rendered.subject, html: rendered.html, text: rendered.text };
  }).filter((m): m is NonNullable<typeof m> => m !== null);

  return (
    <main id="main" className="mx-auto flex max-w-[1100px] flex-col gap-12 bg-canvas px-4 py-8 text-fg-body">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[1.75rem] font-extrabold text-fg-heading">البريد</h1>
        <p className="text-body-sm text-fg-muted" dir="ltr">
          npm --prefix worker run mail:previews -- you@example.com
        </p>
      </header>
      {mails.map((mail) => (
        <section key={mail.name} data-email-preview={mail.name} aria-labelledby={`h-${mail.name}`} className="flex flex-col gap-3">
          <h2 id={`h-${mail.name}`} className="text-title text-fg-heading">
            <bdi>{mail.subject}</bdi>
          </h2>
          <div className="flex flex-wrap items-start gap-6">
            <iframe title={`${mail.name} — 600`} data-width="600" sandbox="" srcDoc={mail.html} className="h-[1500px] w-[664px] max-w-full rounded-panel border border-edge" />
            <iframe title={`${mail.name} — 390`} data-width="390" sandbox="" srcDoc={mail.html} className="h-[1500px] w-[390px] rounded-panel border border-edge" />
          </div>
          <details>
            <summary className="text-body-sm text-fg-muted">النص</summary>
            <pre className="whitespace-pre-wrap text-body-sm">{mail.text}</pre>
          </details>
        </section>
      ))}
    </main>
  );
}
