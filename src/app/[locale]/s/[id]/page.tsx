import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime, formatTime, sameDay } from "@/components/sessions/numerals";
import { buildPublicCardMetadata, publicCardImagePath, siteOrigin } from "@/components/sessions/public-card-metadata";
import { SessionStatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { getPublicSessionCard } from "@/lib/dal/sessions";
import { platformConfigured } from "@/lib/supabase/env";
import { sessionPhase } from "@/lib/session-status";

// `/{locale}/s/{id}` — THE PUBLIC SESSION CARD. The owner's decision of
// 2026-09-15, and the only page of the platform a stranger may read about a
// session.
//
// ★ WHY THIS IS NOT THE EVENT PAGE'S URL, which is the question anyone
// reading this will ask first:
//
//   The event page (`/app/sessions/{id}`) is a MEMBER'S page. It carries the
//   abstract, the presenters by name, the capacity and the seats left, the
//   RSVP panel, the pre-session tasks, the materials, the photos, every
//   comment and the ratings. None of that was opened. Making the same URL
//   serve two different documents depending on who asks is how a page ends up
//   leaking one of them: every later addition to the event page — a slot, a
//   count, a name — would have to be re-audited against «what does the signed
//   out branch render», forever, by whoever adds it.
//
//   Two URLs make the boundary a ROUTE instead of a conditional. This file
//   can only render what `session_public_card()` returns, because nothing
//   else is reachable from here; the event page can only be reached with a
//   session, because the proxy and `requireSession()` say so. Neither has a
//   branch that can be got wrong.
//
//   It also survives being pasted. A link-preview crawler fetching
//   `/app/sessions/{id}` gets the sign-in redirect and previews the sign-in
//   page — which is exactly what the owner asked us to fix.
//
// ★ SIX FIELDS, AND THE REST IS NOT IN THE DTO (REQ-SES-008 included: no
// stream link, no join affordance, because there is none in the product).
// The abstract, the presenters and the attendance are not withheld by this
// component — they never arrive.
//
// ★★ THE 404 IS A REAL 404, AND THIS FILE IS WHAT KEEPS IT ONE (DEC-134 item
// 4). Under `/app`, a `loading.tsx` wraps every page in Suspense, the response
// has started streaming before any gate runs, and `notFound()` can only answer
// 200 with `noindex`. A crawler reads the STATUS, so this route must not stream
// before it knows the card exists:
//
//   · no `loading.tsx` anywhere under `src/app/[locale]/s/`, ever;
//   · no `<Suspense>` in this page above the `notFound()`;
//   · `platformConfigured()` and `card(id)` are the first two awaits.
//
// `not-found.tsx` beside this file is not a Suspense boundary; it renders the
// Arabic page without changing the status.
//
// ★ THE BADGE COMES FROM THE CLOCK ALONE (DEC-141). The function returns no
// state and no seats — DEC-066's allowlist — so the phase is `sessionPhase()`
// over a `published` session's times: `live` and `ended` are said; `open`
// shows nothing, because «التسجيل مفتوح» would be a claim about seats the card
// cannot see.

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

  // Defence in depth, the same line `/verify/[code]` carries: the proxy
  // answers 404 for the public platform routes while the platform is
  // unconfigured (DEC-038), and this page must never reach `supabaseEnv()`
  // and serve a 500 on a public URL of a live site whatever the matcher does.
  if (!platformConfigured()) notFound();

  const data = await card(id);
  // A draft, a cancelled session and a uuid that names nothing are the same
  // page — the function gave the same answer for all three.
  if (!data) notFound();

  const t = await getTranslations("sessions.card");
  const when = data.startsAt ? formatDateTime(data.startsAt, data.timeZone, locale) : null;
  const until =
    data.startsAt && data.endsAt
      ? sameDay(data.startsAt, data.endsAt, data.timeZone)
        ? formatTime(data.endsAt, data.timeZone, locale)
        : formatDateTime(data.endsAt, data.timeZone, locale)
      : null;
  const signInHref = `/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/app/sessions/${data.id}`)}`;
  // Clock only, over a published session's times — see the header.
  const phase = sessionPhase({ state: "published", startsAt: data.startsAt, endsAt: data.endsAt });
  const ended = phase === "ended";

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      <Card density="grid">
        {data.hasImage ? (
          // The poster first — it is the thing that was shared. A plain <img>,
          // not next/image: the bytes come from a Route Handler that reads a
          // private bucket, so there is nothing for the optimiser to cache.
          // Not `CardMedia` either: it crops to three fixed ratios, and the
          // `og` render is designed at its own. The box is reserved at that
          // ratio so the card does not jump when it lands. The ended wash is
          // on the IMAGE only; the badge below is never dimmed (DEC-123).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicCardImagePath(data.id)}
            alt={t("posterAlt")}
            className={`block w-full bg-silver-100 ${ended ? "grayscale opacity-45" : ""}`}
            width={data.imageWidth ?? undefined}
            height={data.imageHeight ?? undefined}
            style={{ aspectRatio: data.imageWidth && data.imageHeight ? `${data.imageWidth} / ${data.imageHeight}` : "1200 / 630" }}
          />
        ) : (
          // No render yet: the house typographic placeholder, never nothing —
          // navy-only (R7): posters are dark (DEC-125), and the first thing a
          // stranger sees of a shared link should not be a silver block.
          <CardMedia placeholderFrom={data.title} placeholderTone="dark" aspect="16/9" dimmed={ended} />
        )}
        <CardBody className="gap-3 p-5 sm:p-6">
          {phase === "live" || ended ? <SessionStatusBadge phase={phase} /> : null}
          <p className="text-body-sm text-fg-muted">{t.rich("presentedBy", { org: data.orgName, bdi: (c) => <bdi>{c}</bdi> })}</p>
          <h1 className="text-h1 text-fg-heading">
            <bdi>{data.title}</bdi>
          </h1>

          <dl className="mt-2 flex flex-col gap-4 border-t border-edge pt-4">
            <div>
              <dt className="text-label text-fg-heading">{t("whenLabel")}</dt>
              <dd className="mt-1 text-body text-fg-body">
                {when ? (
                  <>
                    <bdi>{when}</bdi>
                    {/* ★ Where the line may break, and nowhere else. A time is
                        joined to its «م» at the source (`numerals.ts`, U+00A0);
                        «· حتى 8:27 م» is one unbreakable clause; and the ONLY
                        break opportunity is the ordinary space BEFORE the «·»,
                        which sits outside the clause. Wave 7's capture showed
                        «… في 6:57» / «م · حتى 8:27 م» — the clause had its
                        leading space inside it, so the line broke inside the
                        start time instead. */}
                    {until ? (
                      <>
                        {" "}
                        <span className="whitespace-nowrap text-fg-muted">
                          {"·\u00A0"}
                          {t.rich("toTime", { value: until, bdi: (c) => <bdi>{c}</bdi> })}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  t("notScheduled")
                )}
              </dd>
            </div>
            <div>
              <dt className="text-label text-fg-heading">{t("whereLabel")}</dt>
              {/* The NAME, and no address and no map link: a stranger is told
                  which hall, never how to find the side door (12 T3). */}
              <dd className="mt-1 text-body text-fg-body">{data.venueName ? <bdi>{data.venueName}</bdi> : t("noVenue")}</dd>
            </div>
          </dl>

          {/* ★ REQ-SES-008. Said once, plainly, so nobody arrives expecting a
              link to join from home. */}
          <p className="text-body-sm text-fg-muted">{t("inPersonNote")}</p>
        </CardBody>
      </Card>

      {/* ONE primary action, and it is honest about what is behind it. An
          anchor, not the house Link: sign-in is a document navigation. */}
      <div className="mt-8 flex flex-col gap-4">
        <p className="text-body text-fg-body">{t.rich("membersOnly", { org: data.orgName, bdi: (c) => <bdi>{c}</bdi> })}</p>
        <a href={signInHref} className={buttonClass("primary", "lg", "w-full sm:w-fit")}>
          {t("signIn")}
        </a>
      </div>
    </main>
  );
}
