import type { PhotoQueue, PhotoQueueKind } from "@/lib/dal/admin-moderation";

// SCR-051's three lists, read from `?kind=` — on the client by the queue, on the server by the index page, so both
// open the same first photo.

export type PhotoFilter = PhotoQueueKind | "closed";

export function photoFilter(raw: string | string[] | null | undefined): PhotoFilter {
  return raw === "reports" || raw === "closed" ? raw : "takedowns";
}

export function photoIdsOf(queue: PhotoQueue, filter: PhotoFilter): string[] {
  return (filter === "closed" ? queue.closed : queue[filter]).map((item) => item.photoId);
}
