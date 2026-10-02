// The shared render for SCR-044's board tests (wave 21) — not a test file itself.
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import { AttendanceBoard, type BoardRow } from "@/app/[locale]/app/admin/sessions/[id]/attendance/_components/attendance-board";
import type { ManualMarkState, RemoveState } from "@/app/[locale]/app/admin/sessions/[id]/attendance/actions";
import checkinAr from "@/messages/ar/checkin.json";
import uiAr from "@/messages/ar/ui.json";
import adminAr from "@/messages/ar/admin.json";

export const messages = { ...checkinAr, ...uiAr, ...adminAr };

export function row(over: Partial<BoardRow> & Pick<BoardRow, "memberId" | "name">): BoardRow {
  return {
    avatarUrl: null,
    teamColor: null,
    reservation: "confirmed",
    time: null,
    method: null,
    status: "absent",
    removal: null,
    days: null,
    complete: false,
    canMark: false,
    canRevoke: false,
    ...over,
  };
}

export const SARA = row({ memberId: "m1", name: "سارة العتيبي", status: "present", time: "6:33 م", method: { kind: "code" }, canRevoke: true });
export const KHALID = row({ memberId: "m2", name: "خالد الحربي", canMark: true });

export function renderBoard(
  props: Partial<{
    rows: BoardRow[];
    candidates: { value: string; label: string }[];
    dayId: string | null;
    paysOnCompletion: boolean;
    manyDays: boolean;
    csvHref: string | null;
    markAction: (p: ManualMarkState, f: FormData) => Promise<ManualMarkState>;
    removeAction: (p: RemoveState, f: FormData) => Promise<RemoveState>;
    filters: ReactNode;
    emptyAction: { label: string; href: string };
    clearFilter: { label: string; href: string };
    sheetRequested: boolean;
  }> = {},
) {
  const rows = props.rows ?? [SARA, KHALID];
  const candidates = props.candidates ?? rows.filter((r) => r.canMark).map((r) => ({ value: r.memberId, label: r.name ?? r.memberId }));
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <AttendanceBoard
        rows={rows}
        candidates={candidates}
        dayId={props.dayId === undefined ? "d1" : props.dayId}
        sessionTitle="جلسة اختبار"
        paysOnCompletion={props.paysOnCompletion ?? false}
        canMark={candidates.length > 0}
        manyDays={props.manyDays ?? false}
        csvHref={props.csvHref === undefined ? "/api/admin/exports/attendance/s1" : props.csvHref}
        markAction={props.markAction ?? vi.fn(async () => ({ error: null, done: true }))}
        removeAction={props.removeAction ?? vi.fn(async () => ({ error: null, done: true }))}
        filters={props.filters ?? null}
        emptyAction={props.emptyAction ?? { label: "تسجيل يدوي", href: "/app/admin/sessions/s1/attendance?manual=1" }}
        clearFilter={props.clearFilter}
        sheetRequested={props.sheetRequested}
      />
    </NextIntlClientProvider>,
  );
}
