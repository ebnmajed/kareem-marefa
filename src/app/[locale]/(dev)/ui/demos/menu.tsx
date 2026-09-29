"use client";

import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { GearIcon, DownloadIcon } from "@/components/ui/icons";

// The gallery's `menu` demo — contract 4 (DEC-183 §5, DEC-186). Every state,
// from literal fixtures: no DAL, no session. The lead renders it inside the
// playground's scope.

export function MenuDemo() {
  return (
    <div data-demo="menu" className="flex flex-wrap items-start gap-6">
      <Menu
        trigger={<Button variant="secondary">القائمة</Button>}
        items={[
          { label: "لوحة المؤسسة", icon: <GearIcon />, href: "/ar/ui", current: true },
          { label: "التصاميم", href: "/ar/ui" },
          { label: "تنزيل", icon: <DownloadIcon />, onSelect: () => {}, startsGroup: true },
          { label: "معطّل", onSelect: () => {}, disabled: true },
          { label: "حذف", onSelect: () => {}, tone: "error" },
        ]}
      />
    </div>
  );
}
