"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/components/ui/link";

// The directory's «more» — DEC-213 §5.110. ★ A LINK FIRST: `?page=N+1` with every filter, so without JavaScript
// it is a plain link and a cold URL renders the same list. With JavaScript, scrolling it into view follows it in
// place — no timer, no interval, no nudge (DEC-146): an `IntersectionObserver` and one `router.replace`, which keeps
// the scroll position and leaves one history entry per filter, not one per page.
export function AutoMore({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let followed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (followed || !entries.some((e) => e.isIntersecting)) return;
        followed = true;
        router.replace(href, { scroll: false });
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [href, router]);
  return (
    <span ref={ref}>
      <Link href={href} className="font-bold text-fg-heading underline underline-offset-4">
        {label}
      </Link>
    </span>
  );
}
