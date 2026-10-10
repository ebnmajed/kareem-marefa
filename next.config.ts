import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// ★ DEC-284 — the client router reuses a page's server answer instead of asking again on every visit. `dynamic`: a page
// reached by an ordinary link is kept 30 s (Next 16's default is 0 — every return to a tab re-rendered it). `static`:
// a page fetched by a full prefetch (`router.prefetch`, `src/components/shell/instant-nav.tsx`) is kept 60 s. A write
// still refreshes what it changed: every action revalidates its own paths, which clears these entries.
const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 60,
    },
  },
};

export default withNextIntl(nextConfig);
