import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { PLATFORM_LOCALE } from "@/lib/auth/flow";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL(`/${PLATFORM_LOCALE}/sign-in`, request.url), 303);
}
