import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import type { ShellAttention } from "@/lib/dal/shell";

// «يحتاج انتباهك» — staff only, under the week (`M10a.md` §5, DEC-206 §4.58). The four queues the navigation
// rail counts, from the lead's `getShellData()`, each a link to its queue. A queue with nothing in it is not
// listed; with nothing anywhere the strip is not drawn. A member never reaches this: `attention` is null.

const QUEUES = [
  { key: "proposals", href: "/app/admin/proposals" },
  { key: "unscheduled", href: "/app/admin/sessions" },
  { key: "photoReports", href: "/app/admin/moderation/reports" },
  { key: "commentReports", href: "/app/admin/moderation/reports" },
] as const;

export async function StaffStrip({ attention }: { attention: ShellAttention | null }) {
  if (!attention || attention.total === 0) return null;
  const t = await getTranslations("feed.staff");
  const shown = QUEUES.filter((q) => attention[q.key] > 0);
  return (
    <section aria-labelledby="feed-staff-title">
      <Panel className="flex flex-col gap-2">
        <h2 id="feed-staff-title" className="text-label font-bold text-fg-heading">
          {t("title")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {shown.map((q) => (
            <li key={q.key}>
              <Link href={q.href} className="inline-flex min-h-11 items-center rounded-pill border border-edge bg-surface px-3 text-label font-semibold text-fg-heading hover:bg-hover">
                {t(q.key, { count: attention[q.key], value: formatNumber(attention[q.key]) })}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
