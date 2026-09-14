"use server";

import { redirect } from "next/navigation";
import { disconnectCalendar } from "@/lib/dal/calendar";

// REQ-CAL-007 — disconnect DELETES the row, immediately. There is no update
// path on `calendar_connections` for any client role, so "mark disconnected
// and keep the token" is not a thing this action could do even by accident.

export async function disconnect() {
  try {
    await disconnectCalendar("ar");
  } catch {
    redirect("/ar/app/me/calendar?error=disconnect");
  }
  redirect("/ar/app/me/calendar?disconnected=1");
}
