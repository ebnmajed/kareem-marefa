"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ImageIcon } from "@/components/ui/icons";

// The gallery's `empty-state` demo — contract 4 (DEC-183 §5, DEC-186 §5). Every
// state, from literal fixtures. The lead renders it inside the playground's
// scope. A client module only because one action is a click handler.

export function EmptyStateDemo() {
  return (
    <div className="flex flex-col gap-4">
      <EmptyState
        title="لا جلسات بعد"
        description="كل جلسة تبدأ باقتراح. اقترح أول جلسة لفريقك، وستظهر هنا حين تُنشر."
        action={{ label: "اقترح جلسة", href: "/ar/ui" }}
      />
      <EmptyState
        title="لا نتائج لهذا البحث"
        description="جرّب كلمة أخرى، أو امسح عامل التصفية وحده."
        action={{ label: "امسح الكل", href: "/ar/ui" }}
        clearFilter={{ label: "امسح عامل التصفية: فني", href: "/ar/ui" }}
      />
      <EmptyState icon={<ImageIcon />} title="لا صور بعد" action={{ label: "ارفع صورة", onClick: () => {} }} size="sm" />
    </div>
  );
}
