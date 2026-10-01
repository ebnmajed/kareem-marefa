import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PublicCardFooter, PublicCardFrame, PublicCardHeader } from "@/components/browse/public-card-frame";
import { dayCountLabel, dayRange } from "@/components/sessions/day-label";
import { formatDate, formatDateTime, formatTime, sameDay } from "@/components/sessions/numerals";
import { buildPublicCardMetadata, publicCardImagePath, siteOrigin } from "@/components/sessions/public-card-metadata";
import { SessionStatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CalendarIcon, PinIcon } from "@/components/ui/icons";
import { Poster } from "@/components/ui/poster";
import { getPublicSessionCard } from "@/lib/dal/sessions";
import { platformConfigured } from "@/lib/supabase/env";
import { sessionPhase } from "@/lib/session-status";

// `/{locale}/s/{id}` — SCR-007, THE PUBLIC SESSION CARD — rebuilt in wave 18
// from `PublicCard.dc.html` (`M10a.md` §4, REQ-UIX-059, STORY-UIX-043). The
// only page of the platform a stranger may read about a session.
//
// ★ WHY THIS IS NOT THE EVENT PAGE'S URL. The event page is a MEMBER'S page —
// the abstract, the presenters, the seats, the discussion. Two URLs make the
// boundary a ROUTE instead of a conditional: this file can only render what
// `session_public_card()` returns, because nothing else is reachable from here.
// A link-preview crawler fetching the event page gets the sign-in redirect; this
// page is what a pasted link previews.
//
// ★ DEC-066's ALLOWLIST WINS OVER THE ARTBOARD (DEC-206 §4.42, REQ-UIX-059). The
// artboard draws the seats, the presenter and the company; none is drawn, and
// `session_public_card()` is not changed — they never arrive.
//
// Regions, in the artboard's order: the brand row (the wordmark, «من تنظيم …») ·
// the poster · the clock's badge · the `h1` · the time and the place · the one
// action · the members-only line · the legal footer.
//
// ★ THE POSTER IS WHOLE, AT ITS OWN RATIO (DEC-207 §1.4). The only rendered
// artefact `anon` may read is the `og` render, 1200 × 630 — so a rendered poster
// is shown whole at that ratio, never cropped to the artboard's 4:5
// (REQ-UIX-026). The 4:5 box is the typographic placeholder's, before a render
// exists; it carries no amount (§4.46) and names no company (§4.42).
//
// ★★ THE 404 IS A REAL 404, AND THIS FILE IS WHAT KEEPS IT ONE (DEC-134 item 4):
//   · no `loading.tsx` anywhere under `src/app/[locale]/s/`, ever;
//   · no `<Suspense>` in this page above the `notFound()`;
//   · `platformConfigured()` and `card(id)` are the first two awaits.
// A draft, a cancelled session and an unknown id are the same 404 (DEC-207, N2).
//
// ★ THE BADGE COMES FROM THE CLOCK ALONE (DEC-141, DEC-206 §4.43). The function
// returns no state and no seats, so the phase is `sessionPhase()` over a
// published session's times: `live` and `ended` are said; an open card shows no
// badge, because «التسجيل مفتوح» would be a claim about seats it cannot see.

const card = cache(getPublicSessionCard);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!platformConfigured()) return { robots: { index: false, follow: false } };
  const data = await card(id);
  if (!data) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "sessions.card" });
  return buildPublicCardMetadata(data, { locale, origin: siteOrigin(), imageAlt: t("posterAlt") });
}

export default async function PublicSessionCardPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Defence in depth: the proxy answers 404 for the public platform routes while
  // the platform is unconfigured (DEC-038); this page never reaches
  // `supabaseEnv()` and serves a 500 on a public URL of a live site.
  if (!platformConfigured()) notFound();

  const data = await card(id);
  if (!data) notFound();

  const [t, tDays, shell] = await Promise.all([getTranslations("sessions.card"), getTranslations("sessions.days"), getTranslations("app.shell")]);

  // ★ A RANGE WHEN THE SESSION SPANS SEVERAL DAYS (REQ-SES-015), from the stored
  // window and the COUNT the function returns — never `session_days`, which is
  // granted to `authenticated` and this page answers `anon`.
  const spans = data.dayCount > 1;
  const when = !data.startsAt
    ? null
    : spans && data.endsAt
      ? dayRange(data.startsAt, data.endsAt, data.timeZone, tDays, locale)
      : formatDateTime(data.startsAt, data.timeZone, locale);
  const until =
    !spans && data.startsAt && data.endsAt
      ? sameDay(data.startsAt, data.endsAt, data.timeZone)
        ? formatTime(data.endsAt, data.timeZone, locale)
        : formatDateTime(data.endsAt, data.timeZone, locale)
      : null;
  const dayCount = spans ? dayCountLabel(data.dayCount, tDays) : null;

  // The days are PASSED (contract 9 of wave 9): with the stored window alone a
  // three-day workshop read «جارية الآن» through both of its nights.
  const phase = sessionPhase({ state: "published", startsAt: data.startsAt, endsAt: data.endsAt, days: data.days });
  const ended = phase === "ended";
  const signInHref = `/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/app/sessions/${data.id}`)}`;

  return (
    <PublicCardFrame>
      <PublicCardHeader homeLabel={shell("brand")} aside={t.rich("presentedBy", { org: data.orgName, bdi: (c) => <bdi>{c}</bdi> })} />

      <main className="flex flex-col gap-3 px-3 pt-1">
        {data.hasImage ? (
          // The poster first — it is the thing that was shared. A plain <img>, not
          // next/image: the bytes come from a Route Handler over a private bucket,
          // so there is nothing for the optimiser to cache. The box is reserved at
          // the render's own ratio so the card does not jump when it lands. The
          // ended wash is on the IMAGE only; the badge below is never dimmed (DEC-123).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicCardImagePath(data.id)}
            alt={t("posterAlt")}
            className={`block w-full rounded-tile bg-raised ${ended ? "grayscale opacity-45" : ""}`}
            width={data.imageWidth ?? undefined}
            height={data.imageHeight ?? undefined}
            style={{ aspectRatio: data.imageWidth && data.imageHeight ? `${data.imageWidth} / ${data.imageHeight}` : "1200 / 630" }}
          />
        ) : (
          <div className={ended ? "grayscale opacity-45" : undefined}>
            {/* No company may be named here (§4.42), so the placeholder's name line is the org's —
                the one name on the allowlist — and it carries no amount (§4.46). */}
            <Poster
              title={data.title}
              date={data.startsAt ? formatDate(data.startsAt, data.timeZone, locale) : undefined}
              teamColor={null}
              teamName={data.orgName}
            />
          </div>
        )}

        {phase === "live" || ended ? (
          <div className="flex items-center gap-2">
            <SessionStatusBadge phase={phase} />
          </div>
        ) : null}

        <h1 className="font-display text-play-sm leading-[1.4] font-extrabold text-fg-heading">
          <bdi>{data.title}</bdi>
        </h1>

        {/* The icon rows. A `<dl>` whose terms are for a screen reader: the glyph says it to the eye. */}
        <dl className="flex flex-col gap-2 text-body-sm text-fg-body">
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">{t("whenLabel")}</dt>
            <CalendarIcon aria-hidden="true" className="mt-1 shrink-0 text-[1.125rem] text-fg-muted" />
            <dd>
              {when ? (
                <>
                  <bdi>{when}</bdi>
                  {/* ★ Where the line may break, and nowhere else: the ordinary space BEFORE
                      the «·», outside the clause; «· حتى 8:27 م» is one unbreakable clause
                      (wave 7's capture broke inside the start time otherwise). */}
                  {until ? (
                    <>
                      {" "}
                      <span className="whitespace-nowrap text-fg-muted">
                        {"· "}
                        {t.rich("toTime", { value: until, bdi: (c) => <bdi>{c}</bdi> })}
                      </span>
                    </>
                  ) : null}
                  {dayCount ? (
                    <>
                      {" "}
                      <span className="whitespace-nowrap text-fg-muted">
                        {"· "}
                        <bdi>{dayCount}</bdi>
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                t("notScheduled")
              )}
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">{t("whereLabel")}</dt>
            <PinIcon aria-hidden="true" className="mt-1 shrink-0 text-[1.125rem] text-fg-muted" />
            {/* The NAME, and no address and no map link: a stranger is told which hall,
                never how to find the side door (12 T3). */}
            <dd>{data.venueName ? <bdi>{data.venueName}</bdi> : t("noVenue")}</dd>
          </div>
        </dl>

        {/* ★ REQ-SES-008, kept by DEC-207 (N3): said once, plainly, so nobody arrives expecting a link. */}
        <p className="text-caption text-fg-muted">{t("inPersonNote")}</p>

        {/* ONE primary action, honest about what is behind it — and after the session has
            ended it no longer promises a seat (DEC-207, Q3). An anchor, not the house Link:
            sign-in is a document navigation. */}
        <a href={signInHref} className={buttonClass("primary", "lg", "mt-1 w-full")}>
          {ended ? t("signInEnded") : t("signIn")}
        </a>
        <p className="text-center text-caption text-fg-muted">{t.rich("membersOnly", { org: data.orgName, bdi: (c) => <bdi>{c}</bdi> })}</p>
      </main>

      <PublicCardFooter privacy={shell("privacy")} terms={shell("terms")} />
    </PublicCardFrame>
  );
}
