import { notFound } from "next/navigation";

/** Catch-all so unknown paths (including redirected invalid locales like
 * /fr → /ar/fr) render the localized 404. */
export default function CatchAll() {
  notFound();
}
