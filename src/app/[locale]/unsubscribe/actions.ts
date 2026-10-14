"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { applyEmailUnsubscribe } from "@/lib/dal/email-unsubscribe";

// The footer link's confirmation — `REQ-NTF-019`. The token is the whole authority (`0224`); this validates its
// shape and hands it over, then shows the page's outcome by URL, so a reload never re-posts.
const Input = z.object({ locale: z.enum(["ar", "en"]), token: z.string().min(1).max(200) });

export async function unsubscribeAction(formData: FormData): Promise<void> {
  const parsed = Input.safeParse({ locale: formData.get("locale"), token: formData.get("token") });
  if (!parsed.success) redirect("/ar/unsubscribe?state=invalid");
  const { locale, token } = parsed.data;
  const outcome = await applyEmailUnsubscribe(token);
  redirect(`/${locale}/unsubscribe?${outcome.ok ? `state=done&c=${encodeURIComponent(outcome.category)}` : "state=invalid"}`);
}
