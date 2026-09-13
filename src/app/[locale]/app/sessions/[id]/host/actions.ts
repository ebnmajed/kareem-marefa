"use server";

import { redirect } from "next/navigation";
import { revokeCode } from "@/lib/dal/checkin";

export async function revokeCodeAction(locale: string, sessionId: string) {
  await revokeCode(locale, sessionId);
  redirect(`/${locale}/app/sessions/${sessionId}/host?revoked=1`);
}
