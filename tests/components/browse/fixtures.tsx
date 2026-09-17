// Shared fixtures for the timeline's component tests — REQ-UIX-021, REQ-UIX-022.
import { cloneElement, isValidElement, type ReactNode } from "react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import browse from "@/messages/ar/browse.json";
import search from "@/messages/ar/search.json";
import sessions from "@/messages/ar/sessions.json";
import app from "@/messages/ar/app.json";
import ui from "@/messages/ar/ui.json";
import type { TimelineData, TimelineSession } from "@/lib/dal/search";

export const messages = { ...browse, ...search, ...sessions, ...app, ...ui };

/** A stand-in for `next-intl/server`'s `getTranslations`, over the real Arabic catalogue. */
export async function translations(namespace?: string) {
  return createTranslator({ locale: "ar", messages, namespace: namespace as never });
}

export function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export const CAT = "11111111-2222-3333-4444-555555555555";
export const VENUE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

export function session(over: Partial<TimelineSession> = {}): TimelineSession {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "كيف اختصرنا وقت التقارير الشهرية",
    state: "published",
    phase: "open",
    seat: "available",
    closingSoon: false,
    startsAt: "2026-09-17T15:00:00Z",
    endsAt: "2026-09-17T16:00:00Z",
    // A one-day session as far as every case in this directory is concerned:
    // the card reads `days` for its LENGTH alone, to decide whether to say a
    // range, so none and one behave identically and an empty list cannot drift
    // out of step with an overridden `startsAt` (wave 9, REQ-SES-015).
    days: [],
    timeZone: "Asia/Riyadh",
    categoryId: CAT,
    categoryName: "إداري",
    venueName: "القاعة الكبرى",
    level: "introductory",
    language: "ar",
    capacity: 60,
    confirmedCount: 42,
    waitlistCount: 0,
    presenters: [
      { memberId: "m-1", displayName: "سعد الحربي" },
      { memberId: "m-2", displayName: "نورة القحطاني" },
    ],
    tags: [{ label: "تقارير", normalised: "تقارير" }],
    mine: null,
    attended: false,
    bookmarked: false,
    posterUrl: null,
    canCheckIn: false,
    ...over,
  };
}

export function timeline(over: Partial<TimelineData> = {}): TimelineData {
  return {
    status: "upcoming",
    pinned: null,
    items: [],
    total: 0,
    exists: { upcoming: true, ended: true },
    dropOne: null,
    options: {
      categories: [{ id: CAT, name: "إداري" }],
      venues: [{ id: VENUE, name: "القاعة الكبرى" }],
      companies: [],
      tags: [{ label: "تقارير", normalised: "تقارير", count: 5 }],
      presenters: ["سعد الحربي"],
    },
    orgTimeZone: "Asia/Riyadh",
    ...over,
  };
}

/**
 * Resolves a server component tree for jsdom: every ASYNC function component is
 * called and awaited, depth first, props that hold elements included. jsdom
 * renders with the client React, which cannot render an async component itself;
 * client components are left for it to render.
 */
export async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
  if (!isValidElement(node)) return node;
  const type = node.type as unknown;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolveServer(await (type as (props: unknown) => Promise<ReactNode>)(node.props));
  }
  const props = { ...(node.props as Record<string, unknown>) };
  let changed = false;
  for (const [key, value] of Object.entries(props)) {
    if (isValidElement(value) || Array.isArray(value)) {
      props[key] = await resolveServer(value as ReactNode);
      changed = true;
    }
  }
  return changed ? cloneElement(node, props) : node;
}
