import type { MetadataRoute } from "next";

/** Internal-facing site on the public internet — keep it out of search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
