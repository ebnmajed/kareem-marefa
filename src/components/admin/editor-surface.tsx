"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Link } from "@/components/ui/link";
import { Sheet } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";

// Where a console list's create and edit forms live (`DEC-232` §5.5): the URL is
// the state — `?new=1` or `?edit=<id>` — and the page renders this only when the
// URL asks for it, so the form works without JS, as `042`'s creation region does.
//
// With JS it is the artboards' sheet: `ui/sheet`, inline-end, named by the
// form's title, closing back to the list's URL. Without JS (or before
// hydration) it is a region in the page under the same title, with a link back.
// `useSyncExternalStore`'s server snapshot is `false`, so the server and the
// hydrating client agree on the region, and the sheet takes over in the same
// pass; after a client navigation the snapshot is `true` at once — no flash.

const subscribe = () => () => {};

export function EditorSurface({ id, title, closeHref, closeLabel, children }: { id: string; title: string; closeHref: string; closeLabel: string; children: ReactNode }) {
  const router = useRouter();
  const enhanced = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!enhanced) {
    return (
      <section id={id} aria-labelledby={`${id}-heading`} className="mt-6 max-w-2xl rounded-card border border-edge p-5">
        <h2 id={`${id}-heading`} className="text-h3 text-fg-heading">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <Link href={closeHref} className="mt-4 inline-block text-body-sm text-fg-heading underline underline-offset-4">
          {closeLabel}
        </Link>
      </section>
    );
  }

  return (
    <Sheet open side="inline-end" title={title} onOpenChange={(open) => (open ? undefined : router.replace(closeHref, { scroll: false }))}>
      {children}
      <Link href={closeHref} className="mt-4 inline-block text-body-sm text-fg-heading underline underline-offset-4">
        {closeLabel}
      </Link>
    </Sheet>
  );
}
