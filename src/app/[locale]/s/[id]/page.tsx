import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime, formatTime, sameDay } from "@/components/sessions/numerals";
import { buildPublicCardMetadata, publicCardImagePath, siteOrigin } from "@/components/sessions/public-card-metadata";
import { getPublicSessionCard } from "@/lib/dal/sessions";
import { platformConfigured } from "@/lib/supabase/env";

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
  const when = data.startsAt ? formatDateTime(data.startsAt, data.numerals, data.timeZone, locale) : null;
  const until =
    data.startsAt && data.endsAt
      ? sameDay(data.startsAt, data.endsAt, data.timeZone)
        ? formatTime(data.endsAt, data.numerals, data.timeZone, locale)
        : formatDateTime(data.endsAt, data.numerals, data.timeZone, locale)
      : null;
  const signInHref = `/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/app/sessions/${data.id}`)}`;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      {/* The poster first — it is the thing that was shared. A plain <img>,
          not next/image: the bytes come from a Route Handler that reads a
          private bucket, so there is nothing for the optimiser to cache and
          no remote pattern to declare. The box is reserved at the artifact's
          OWN ratio so the card does not jump when it lands. */}
      {data.hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicCardImagePath(data.id)}
          alt={t("posterAlt")}
          className="w-full rounded-card border border-edge bg-silver-100"
          width={data.imageWidth ?? undefined}
          height={data.imageHeight ?? undefined}
          style={{ aspectRatio: data.imageWidth && data.imageHeight ? `${data.imageWidth} / ${data.imageHeight}` : "1200 / 630" }}
        />
      ) : null}

      <p className={`text-body-sm text-fg-muted ${data.hasImage ? "mt-6" : ""}`}>
        {t.rich("presentedBy", { org: data.orgName, bdi: (c) => <bdi>{c}</bdi> })}
      </p>

      <h1 className="mt-2 text-h1 text-fg-heading">
        <bdi>{data.title}</bdi>
      </h1>

      <dl className="mt-6 flex flex-col gap-4 border-t border-edge pt-6">
        <div>
          <dt className="text-label text-fg-heading">{t("whenLabel")}</dt>
          <dd className="mt-1 text-body text-fg-body">
            {when ? (
              <>
                <bdi>{when}</bdi>
                {until ? (
                  <span className="text-fg-muted">
                    {" · "}
                    {t("toTime", { value: until })}
                  </span>
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
      <p className="mt-4 text-body-sm text-fg-muted">{t("inPersonNote")}</p>

      {/* ONE primary action, and it is honest about what is behind it. */}
      <div className="mt-8 border-t border-edge pt-8">
        <p className="text-body text-fg-body">{t.rich("membersOnly", { org: data.orgName, bdi: (c) => <bdi>{c}</bdi> })}</p>
        <a
          href={signInHref}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-field bg-fg-heading px-6 py-3 text-label text-silver-050"
        >
          {t("signIn")}
        </a>
      </div>
    </main>
  );
}
