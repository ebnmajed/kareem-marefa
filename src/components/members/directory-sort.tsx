import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { directoryHref, type DirectoryState } from "@/components/members/directory-query";

// The directory's order — `Directory.dc.html:20`: «الأنشط أولًا» (sessions delivered, then the name — DEC-213
// §5.106, DEC-214 §2) or «الاسم». The two items are LINKS to the next state, marked current; ordering is the DAL's.
export async function DirectorySort({ state }: { state: DirectoryState }) {
  const t = await getTranslations("members.directory");
  const current = t(`order.${state.order}`);
  return (
    <Menu
      align="end"
      trigger={
        <Button variant="secondary" size="sm" aria-label={t("orderLabel", { order: current })}>
          {current}
          <ChevronIcon direction="down" className="ms-1 text-[0.75rem]" />
        </Button>
      }
      items={(["active", "name"] as const).map((order) => ({
        label: t(`order.${order}`),
        href: directoryHref(state, { order, page: 1 }),
        current: state.order === order,
      }))}
    />
  );
}
