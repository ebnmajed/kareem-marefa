"use client";

import type { ReactNode } from "react";
import type { AdminRailLink } from "@/components/ui";
import { AdminRail } from "@/components/ui/admin-rail";

// `admin-rail`'s gallery entry — REQ-UIX-084, REQ-UIX-085, DEC-226. Literals only: an admin's twenty destinations in
// the artboard's six ruled groups with three queue badges, a moderator's, and a plain member's (nothing). It carries
// NO scope of its own: the gallery renders it on each of the scope's grounds.

const l = (key: string, href: string, label: string, extra: Partial<AdminRailLink> = {}): AdminRailLink => ({ key, href: `/app/admin${href}`, label, ...extra });

const ADMIN: AdminRailLink[][] = [
  [
    l("dashboard", "", "لوحة التحكم", { exact: true }),
    l("proposals", "/proposals", "المقترحات", { count: 4, countLabel: "4 مقترحات بانتظار القرار" }),
    l("sessions", "/sessions", "الجلسات", { count: 2, countLabel: "جلستان لم تُجدولا" }),
    l("surveys", "/surveys", "الاستبانات"),
  ],
  [l("members", "/members", "الأعضاء"), l("companies", "/companies", "الشركات"), l("categories", "/categories", "التصنيفات"), l("venues", "/venues", "الأماكن")],
  [l("moderationComments", "/moderation/comments", "التعليقات", { count: 2, countLabel: "بلاغان على التعليقات" }), l("moderationPhotos", "/moderation/photos", "الصور"), l("moderationReports", "/moderation/reports", "البلاغات", { count: 1, countLabel: "بلاغ واحد على الصور" })],
  [l("scoring", "/scoring", "النقاط"), l("recognition", "/recognition", "الشارات والمستويات"), l("reminders", "/reminders", "التذكيرات")],
  [l("templates", "/templates", "القوالب"), l("emails", "/emails", "البريد"), l("branding", "/branding", "الهوية البصرية")],
  [l("exports", "/exports", "التصدير"), l("audit", "/audit", "سجل التدقيق"), l("settings", "/settings", "الإعدادات")],
];

const MODERATOR: AdminRailLink[][] = [
  [l("sessions", "/sessions", "الجلسات"), l("surveys", "/surveys", "الاستبانات")],
  [],
  [l("moderationComments", "/moderation/comments", "التعليقات", { count: 2, countLabel: "بلاغان على التعليقات" }), l("moderationPhotos", "/moderation/photos", "الصور"), l("moderationReports", "/moderation/reports", "البلاغات")],
  [],
  [],
  [l("audit", "/audit", "سجل التدقيق")],
];

function State({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      {children}
    </figure>
  );
}

export function AdminRailDemo() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <State title="مشرف المؤسسة — الجلسات الحالية">
        <AdminRail groups={ADMIN} label="لوحة الإدارة" pathname="/app/admin/sessions" className="w-[13.75rem]" />
      </State>
      <State title="منظِّم — ستة مسارات">
        <AdminRail groups={MODERATOR} label="لوحة الإدارة" pathname="/app/admin/moderation/comments" className="w-[13.75rem]" />
      </State>
      <State title="عضو — لا شيء">
        <AdminRail groups={[[], []]} label="لوحة الإدارة" pathname="/app/admin" />
      </State>
    </div>
  );
}
