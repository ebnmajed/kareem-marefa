import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { ChevronIcon, DownloadIcon } from "@/components/ui/icons";
import { getSessionPosterDownloads, type PosterDownload } from "@/lib/dal/posters";
import { formatBytes, formatNumber } from "./numerals";
import { DownloadFailedNotice } from "./download-failed-notice";

// «تنزيل الملصق» — REQ-DSG-027, read with DEC-176 («I just need a simple
// download») and DEC-178. On the event page (in the action card) and on the
// hub (SCR-043's poster section).
//
// ★ ONE PRIMARY FILE, THE REST BEHIND A DISCLOSURE — never a 12-row menu.
// `designer`'s DTO names the primary: the 4:5 master as PNG, always.
//
// ★ A FILE THAT IS NOT THERE YET IS NEVER A LINK. Pending reads as pending,
// failed as failed; nothing polls (DEC-146) — the next render says ready.
//
// ★ EVERY HREF IS THE DTO'S, AND EVERY ONE IS A PLAIN `<a>`. It points at
// `designer`'s route, which audits the download (contract 3) and then
// redirects to the one signer's URL. A `<Link>` would prefetch it, and a
// prefetch of an audited route is a download nobody asked for. This file never
// touches storage or a signer. A refused or failed download comes back here
// with `?download=failed`, which `DownloadFailedNotice` reads.
//
// `null` from the DTO — no poster yet, or a viewer who is neither staff nor an
// accepted presenter of this session — renders nothing.

function ratio(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

const FORMAT_LABEL: Record<PosterDownload["format"], string> = { png: "PNG", webp: "WebP", pdf: "PDF" };

export async function SessionDownload({ sessionId, locale, placement }: { sessionId: string; locale: string; placement: "event" | "hub" }) {
  const [downloads, t, tPreset] = await Promise.all([
    getSessionPosterDownloads(locale, sessionId),
    getTranslations("sessions.download"),
    // `designer`'s preset names — read, never written (one writer per file).
    getTranslations("designer.presets.name"),
  ]);
  if (!downloads) return null;

  const { primary, others } = downloads;
  const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;
  const presetName = (d: PosterDownload) => tPreset(d.preset);

  return (
    <div className="space-y-2" data-session-download={placement}>
      {primary.state === "ready" && primary.href ? (
        <div className="space-y-1">
          <a href={primary.href} className={buttonClass("secondary", "md", "w-full")}>
            <DownloadIcon className="text-[1.125rem]" />
            <span>{t("primary")}</span>
          </a>
          <p className="text-caption text-fg-muted">
            {t.rich("meta", {
              format: FORMAT_LABEL[primary.format],
              ratio: ratio(primary.widthPx, primary.heightPx) ?? "",
              size: primary.byteSize !== null ? formatBytes(primary.byteSize, locale) : "",
              bdi,
            })}
          </p>
        </div>
      ) : primary.state === "failed" ? (
        <div className="space-y-1">
          <p className="text-label text-fg-heading">{t("failed")}</p>
          {placement === "hub" ? <p className="text-body-sm text-fg-muted">{t("failedHint")}</p> : null}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-label text-fg-heading">{t("pending")}</p>
          <p className="text-body-sm text-fg-muted">{t("pendingHint")}</p>
        </div>
      )}

      {downloads.updating ? <p className="text-caption text-fg-muted">{t("updating")}</p> : null}

      <Suspense fallback={null}>
        <DownloadFailedNotice message={t("downloadFailed")} />
      </Suspense>

      {others.length > 0 ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-body-sm text-fg-heading [&::-webkit-details-marker]:hidden">
            <ChevronIcon direction="down" className="text-[1rem] group-open:rotate-180" />
            <span className="underline underline-offset-4">{t("others", { count: others.length, value: formatNumber(others.length) })}</span>
          </summary>
          <ul className="mt-1 divide-y divide-edge">
            {others.map((d) => {
              const key = `${d.preset}-${d.format}`;
              const format = FORMAT_LABEL[d.format];
              return (
                <li key={key} className="flex min-h-11 items-center justify-between gap-3 py-1">
                  <span className="min-w-0 text-body-sm text-fg-body">
                    {t.rich("row", { preset: presetName(d), format, bdi })}
                    {d.state === "ready" && d.byteSize !== null ? (
                      <span className="text-fg-muted">
                        {" · "}
                        <bdi>{formatBytes(d.byteSize, locale)}</bdi>
                      </span>
                    ) : null}
                  </span>
                  {d.state === "ready" && d.href ? (
                    <a
                      href={d.href}
                      aria-label={t("rowDownloadLabel", { preset: presetName(d), format })}
                      className="inline-flex min-h-11 shrink-0 items-center px-2 text-body-sm text-fg-heading underline underline-offset-4"
                    >
                      {t("rowDownload")}
                    </a>
                  ) : (
                    <span className="shrink-0 text-body-sm text-fg-muted">{d.state === "failed" ? t("rowFailed") : t("rowPending")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
