"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { CALENDAR_PROMPT_COOKIE } from "./prompt-cookie";

// «لاحقًا» on the home's calendar prompt (DEC-276): the prompt is gone from this device for a year. Nothing about
// the member is written — the calendar page still offers «اربط».
export async function dismissCalendarPrompt(): Promise<void> {
  const store = await cookies();
  store.set(CALENDAR_PROMPT_COOKIE, "dismissed", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}
