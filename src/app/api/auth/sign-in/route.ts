import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { platformConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/auth/next-path";
import { PLATFORM_LOCALE, siteOrigin } from "@/lib/auth/flow";

// Starts Google sign-in server-side (REQ-AUT-001): the PKCE verifier lands
// in a cookie here, where cookies can be written, and the browser never
// needs a Supabase client for this. `next` is validated before it is
// carried through the whole flow (REQ-AUT-005).
const input = z.object({ next: z.string().max(2048).optional() });

export async function POST(request: NextRequest) {
  if (!platformConfigured()) return new NextResponse(null, { status: 404 }); // DEC-038
  const form = await request.formData();
  const parsed = input.safeParse({ next: form.get("next")?.toString() });
  const next = safeNextPath(parsed.success ? parsed.data.next : undefined, PLATFORM_LOCALE);

  const supabase = await createServerClient();
  const callback = new URL("/api/auth/callback", siteOrigin(request.url));
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    return NextResponse.redirect(new URL(`/${PLATFORM_LOCALE}/sign-in?error=1`, request.url), 303);
  }
  return NextResponse.redirect(data.url, 303);
}
