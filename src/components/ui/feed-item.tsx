import type { FeedItemAchievementProps, FeedItemAnnouncementProps, FeedItemProps, FeedItemRecapProps } from "@/components/ui";
import { MegaphoneIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";

// content's file — REQ-UIX-055, REQ-UIX-056, REQ-UIX-057, DEC-206 §4.52 – §4.55, DEC-207.
// One feed item that is not a session post: a colleague's achievement, an org's
// announcement, a completed session's recap. Born inside the playground: it reads
// the scope's semantic names only, and nothing moves.
//
// ★ It decides nothing. Every word arrives as a prop, already in the org's words
// and Western digits; which items exist, and for whom, is the feed's read model's.
//
// ★ What is absent on purpose:
//   · an achievement carries NO reaction (§4.53) — a colleague's badge is news, not
//     a post to like;
//   · an announcement carries no author, no action and no reaction (REQ-UIX-056);
//   · a recap's «المواد» is a LINK to the session's materials, never a download: a
//     download is an audited route (§4.55, DEC-177), and the link carries no arrow.
//
// ★ A recap's photographs are square tiles, cropped, the gallery's own deliberate
// crop (REQ-UIX-026 is the poster's rule; a photo strip is a preview and the whole
// photograph is one tap away in the lightbox). Three at most, lazily loaded.
//
// Text is never clamped and a text line never clips (tashkeel): the body wraps.

const FRAME = "flex rounded-panel border border-edge p-3 sm:p-4";

function Meta({ parts }: { parts: (string | null | undefined)[] }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  return (
    <p data-slot="meta" className="flex flex-wrap items-center gap-x-1.5 text-caption text-fg-muted">
      {shown.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-x-1.5">
          {i > 0 ? <span aria-hidden>·</span> : null}
          <bdi>{part}</bdi>
        </span>
      ))}
    </p>
  );
}

function Achievement({ icon, children, context, time, className = "" }: FeedItemAchievementProps) {
  return (
    <article data-variant="achievement" className={`${FRAME} items-center gap-3 bg-surface ${className}`}>
      <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-tile bg-raised text-2xl text-accent">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body text-fg-body">{children}</p>
        <Meta parts={[context, time]} />
      </div>
    </article>
  );
}

function Announcement({ sourceLabel, body, time, className = "" }: FeedItemAnnouncementProps) {
  return (
    <article data-variant="announcement" className={`${FRAME} flex-col gap-2 bg-raised ${className}`}>
      <div className="flex items-center gap-2">
        {/* Decoration: the source line says what this is in words. */}
        <MegaphoneIcon className="text-base text-accent" />
        <Meta parts={[sourceLabel, time]} />
      </div>
      <p className="whitespace-pre-line break-words text-body font-semibold text-fg-heading">
        <bdi dir="auto">{body}</bdi>
      </p>
    </article>
  );
}

function Recap({ title, href, doneLabel, meta, photos, reactions, materials, time, className = "" }: FeedItemRecapProps) {
  const strip = photos.slice(0, 3);
  return (
    <article data-variant="recap" className={`${FRAME} flex-col gap-2.5 bg-surface ${className}`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="flex flex-wrap items-baseline gap-x-2 text-body font-bold text-fg-heading">
          <Link href={href} quiet className="underline-offset-4 hover:underline">
            <bdi>{title}</bdi>
          </Link>
          <span className="text-caption font-semibold text-accent">{doneLabel}</span>
        </h3>
        <div className="text-caption text-fg-muted">{meta}</div>
        <Meta parts={[time]} />
      </div>
      {strip.length > 0 ? (
        <ul data-slot="photos" className="grid grid-cols-3 gap-1.5">
          {strip.map((photo) => (
            <li key={photo.src} className="aspect-square overflow-hidden rounded-tile bg-raised">
              {/* A signed URL from a private bucket, as `CardMedia` takes one: nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.src}
                alt={photo.alt}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {reactions || materials ? (
        <div className="flex flex-wrap items-center gap-2">
          {reactions}
          {materials ? (
            <Link
              href={materials.href}
              quiet
              className="ms-auto inline-flex min-h-11 items-center rounded-pill bg-accent px-4 text-label font-bold text-on-accent"
            >
              {materials.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function FeedItem(props: FeedItemProps) {
  if (props.variant === "achievement") return <Achievement {...props} />;
  if (props.variant === "announcement") return <Announcement {...props} />;
  return <Recap {...props} />;
}
