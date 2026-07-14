import { connection } from "next/server";
import { createFormToken } from "@/lib/anti-spam";

/**
 * Signed timestamp for the min-time-to-submit check. `await connection()`
 * is load-bearing: without it the page prerenders at build time and every
 * visitor would receive the same frozen token, silently disabling the check
 * (and handing bots a forever-valid signature). This is what makes
 * /register dynamic; the landing page stays static.
 */
export async function FormToken() {
  await connection();
  return <input type="hidden" name="form_token" value={createFormToken()} />;
}
