import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RsvpPanel } from "@/components/checkin/rsvp-panel";
import { Comments } from "@/components/event/comments";
import { Ratings } from "@/components/event/ratings";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { getSessionForEvent } from "@/lib/dal/sessions";
import { requireSession } from "@/lib/dal/session";

// SCR-012 · /app/sessions/[id] ★ — the event page.
//
// The one surface three teammates share, and the reason `slots.ts` exists
// (TEAM.md §2, DEC-040). The three slots below are server components owned by
// `checkin` and `event`; this page passes **ids, never rows**, so each of them
// fetches its own data through its own DAL and none of us has to agree on a
// shape beyond `SlotProps`. The placeholders in components/sessions/slots/ are
// gone now that all three are real.
//
// Order is REQ-SES-013 and 09 SCR-012, in this exact sequence:
//   1 الملصق (M6 — no poster exists yet)   2 التاريخ · الوقت · المكان · المُقدِّم
//   3 the ONE primary action + السعة       4 آخر موعد للحجز / للإلغاء
//   5 النبذة · اللغة · التصنيف             6 المهام التحضيرية (M5)
//   7 المواد (M5)                          8 التعليقات
//   9 الصور (M5)                          10 التقييم
//
// ★ REQ-SES-008: no stream URL, no join link, no remote-attendance affordance.
// There is none in the DTO either, because there is none in the product.
//
// Who may see this is `sessions_read`, not a check here: a draft is visible to
// staff and its own presenters and to nobody else, and no row is a 404.

export default async function EventPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [me, session, prefs, t] = await Promise.all([
    requireSession(locale, `/${locale}/app/sessions/${id}`),
    getSessionForEvent(locale, id),
    getOrgPrefs(locale),
    getTranslations("sessions.event"),
  ]);
  if (!session) notFound();

  const when = (iso: string | null) => (iso ? formatDateTime(iso, prefs.numerals, session.timeZone, locale) : null);
  const published = ["published", "in_progress", "completed", "archived", "cancelled"].includes(session.state);

  return (
    <article className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start md:gap-10">
      <div className="min-w-0">
        {/* 1. الملصق — M6 (REQ-DSG-002, DEC-012). Nothing renders rather than a
            grey box pretending a poster is coming. */}

        {session.state === "cancelled" ? (
          <div role="alert" className="rounded-field border-2 border-edge-strong p-5">
            <p className="text-h2 text-fg-heading">{t("cancelledTitle")}</p>
            {session.cancellationReason ? (
              <>
                <p className="mt-3 text-label text-fg-heading">{t("cancelledReason")}</p>
                <p className="mt-1 text-body text-fg-body">
                  <bdi>{session.cancellationReason}</bdi>
                </p>
              </>
            ) : null}
            <p className="mt-3 text-body-sm text-fg-muted">{t("cancelledNote")}</p>
          </div>
        ) : null}
        {!published ? (
          <p role="status" className="rounded-field border border-edge bg-silver-100 p-4 text-body-sm text-fg-body">
            {t("unpublishedNote")} · {t("stateLabel")}: {t(`state.${session.state}`)}
          </p>
        ) : null}

        <h1 className={`text-h1 text-fg-heading ${session.state === "cancelled" || !published ? "mt-6" : ""}`}>
          <bdi>{session.title}</bdi>
        </h1>

        {/* 2. Date, time, place with its map, presenter — before anything else. */}
        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-label text-fg-heading">{t("whenLabel")}</dt>
            <dd className="mt-1 text-body text-fg-body">
              {session.startsAt ? (
                <>
                  <bdi>{when(session.startsAt)}</bdi>
                  {session.endsAt ? <span className="text-fg-muted"> · {t("toTime", { value: when(session.endsAt) ?? "" })}</span> : null}
                </>
              ) : (
                t("notScheduled")
              )}
            </dd>
          </div>
          <div>
            <dt className="text-label text-fg-heading">{t("whereLabel")}</dt>
            <dd className="mt-1 text-body text-fg-body">
              {session.venue ? (
                <>
                  <bdi>{session.venue.name}</bdi>
                  {session.venue.address ? (
                    <span className="text-fg-muted">
                      {" · "}
                      <bdi>{session.venue.address}</bdi>
                    </span>
                  ) : null}
                  {session.venue.mapUrl ? (
                    <a
                      href={session.venue.mapUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                      className="mt-1 block text-body-sm text-fg-heading underline underline-offset-4"
                    >
                      {t("mapLink")}
                    </a>
                  ) : null}
                </>
              ) : (
                t("noVenue")
              )}
              {/* REQ-SES-008, said plainly and once. */}
              <span className="mt-1 block text-body-sm text-fg-muted">{t("inPersonNote")}</span>
            </dd>
          </div>
          {session.presenters.length > 0 ? (
            <div>
              <dt className="text-label text-fg-heading">{session.presenters.length > 1 ? t("presentersLabel") : t("presenterLabel")}</dt>
              <dd className="mt-1 text-body text-fg-body">
                {session.presenters.map((p, i) => (
                  <span key={p.memberId}>
                    {i > 0 ? "، " : ""}
                    <Link href={`/app/members/${p.memberId}`} className="underline underline-offset-4">
                      <bdi>{p.displayName}</bdi>
                    </Link>
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          <div>
            {/* REQ-SES-011 is explicit that «لغة الجلسة» appears BEFORE the
                RSVP action, not below it. 09's numbering puts it at 5 with the
                abstract; 01-prd.md is the only document that may define a
                requirement, so its acceptance wins and the language sits here,
                above the action in reading order on every width. */}
            <dt className="text-label text-fg-heading">{t("languageLabel")}</dt>
            <dd className="mt-1 text-body text-fg-body">
              {session.language === "ar" ? t("languageAr") : t("languageEn")}
              {session.categoryName ? (
                <span className="text-fg-muted">
                  {" · "}
                  <bdi>{session.categoryName}</bdi>
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      {/* 3 and 4 — the ONE primary action, then the two deadlines stated
          plainly. On mobile it is `sticky bottom-0`, which keeps it in the
          thumb zone through the whole scroll while staying a single element in
          reading order (REQ-SES-013). On desktop it is a sticky rail beside
          the content. The safe-area inset matters on a notched phone. */}
      <aside
        className="sticky bottom-0 z-10 mt-8 border-t border-edge bg-canvas pt-4 md:top-6 md:mt-0 md:border-t-0 md:pt-0"
        style={{ paddingBlockEnd: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <RsvpPanel sessionId={session.id} memberId={me.memberId} locale={locale} />

        {session.capacity !== null ? (
          <p className="mt-3 text-body-sm text-fg-muted">
            {t("capacityLabel")}: <bdi>{t("seats", { count: session.capacity, value: formatNumber(session.capacity, prefs.numerals) })}</bdi>
          </p>
        ) : null}
        {session.rsvpDeadlineAt ? (
          <p className="mt-1 text-body-sm text-fg-muted">
            {t("rsvpDeadlineLabel")}: <bdi>{when(session.rsvpDeadlineAt)}</bdi>
          </p>
        ) : null}
        {session.cancellationCutoffAt ? (
          <p className="mt-1 text-body-sm text-fg-muted">
            {t("cutoffLabel")}: <bdi>{when(session.cancellationCutoffAt)}</bdi>
          </p>
        ) : null}

        {/* OQ-013, REQ-CHK-014: presenters, admins and moderators only. */}
        {session.viewerIsPresenter || session.viewerIsStaff ? (
          <p className="mt-4">
            <Link href={`/app/sessions/${session.id}/host`} className="text-label text-fg-heading underline underline-offset-4">
              {t("hostView")}
            </Link>
          </p>
        ) : null}
      </aside>

      <div className="min-w-0 md:col-start-1">
        {/* 5. النبذة. The language and the category moved up to section 2 —
            see the note there. */}
        <section aria-labelledby="about" className="mt-10">
          <h2 id="about" className="text-h2 text-fg-heading">
            {t("aboutLabel")}
          </h2>
          <p className="mt-3 whitespace-pre-line text-body text-fg-body">
            <bdi>{session.abstract}</bdi>
          </p>
        </section>

        {/* 6, 7 and 9 — المهام التحضيرية, المواد and الصور are M5 (`content`). */}

        <section aria-labelledby="comments" className="mt-12 border-t border-edge pt-8">
          <h2 id="comments" className="text-h2 text-fg-heading">
            {t("commentsLabel")}
          </h2>
          <Comments sessionId={session.id} memberId={me.memberId} locale={locale} />
        </section>

        <section aria-labelledby="rating" className="mt-12 border-t border-edge pt-8">
          <h2 id="rating" className="text-h2 text-fg-heading">
            {t("ratingLabel")}
          </h2>
          <Ratings sessionId={session.id} memberId={me.memberId} locale={locale} />
        </section>
      </div>
    </article>
  );
}
