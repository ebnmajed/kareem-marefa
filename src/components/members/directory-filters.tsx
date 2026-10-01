import { getTranslations } from "next-intl/server";
import { TagChip } from "@/components/ui/tag-chip";
import type { DirectoryPage } from "@/lib/dal/members";
import { directoryHref, type DirectoryState } from "@/components/members/directory-query";

// The directory's filter rows — `Directory.dc.html:28-34`, REQ-PRF-005, DEC-213 §5.107.
//
// The companies, «الكل» first and current when no company is chosen, each with its team dot (the NAME is the
// label, so colour is never the only channel); then the interests — ★ only when the org has any recorded, so no
// empty control is drawn. Each chip is a LINK to the next state (`?company=`, `?interest=`), so it works without
// JavaScript; choosing one goes back to the first page. An admin gets one more chip: the deactivated members.
// The rows scroll sideways on their own; nothing on a text line is clipped.
export async function DirectoryFilters({ state, data }: { state: DirectoryState; data: DirectoryPage }) {
  const t = await getTranslations("members.directory");
  const row = "flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]";
  return (
    <div className="flex flex-col gap-2">
      {data.companies.length > 0 ? (
        <nav aria-label={t("companies")}>
          <ul className={row}>
            <li className="shrink-0">
              <TagChip label={t("all")} href={directoryHref(state, { companyId: undefined, page: 1 })} selected={!state.companyId} />
            </li>
            {data.companies.map((c) => (
              <li key={c.id} className="shrink-0">
                <TagChip label={c.name} teamColor={c.teamColor} href={directoryHref(state, { companyId: c.id, page: 1 })} selected={state.companyId === c.id} />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {data.interests.length > 0 ? (
        <nav aria-label={t("interests")}>
          <ul className={row}>
            <li className="shrink-0">
              <TagChip label={t("allInterests")} href={directoryHref(state, { interestId: undefined, page: 1 })} selected={!state.interestId} />
            </li>
            {data.interests.map((i) => (
              <li key={i.id} className="shrink-0">
                <TagChip label={i.name} href={directoryHref(state, { interestId: i.id, page: 1 })} selected={state.interestId === i.id} />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {data.canShowDeactivated ? (
        <div>
          <TagChip
            label={state.includeDeactivated ? t("hideDeactivated") : t("showDeactivated")}
            href={directoryHref(state, { includeDeactivated: !state.includeDeactivated, page: 1 })}
            selected={Boolean(state.includeDeactivated)}
          />
        </div>
      ) : null}
    </div>
  );
}
