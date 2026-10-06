import type { MetadataRoute } from "next";

// `/manifest.webmanifest` — what a phone uses when the app is added to the home screen (DEC-273). Arabic and RTL
// first, like everything else; it opens on the app, which redirects a visitor who is not signed in to sign-in. The
// colours are the ink ground the shell and the icon already wear (`viewport.themeColor`, `icon.svg`).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "كريم معرفة | Knowledge Kareem",
    short_name: "كريم معرفة",
    description: "شارك المعرفة.. واصنع الأثر",
    lang: "ar",
    dir: "rtl",
    start_url: "/ar/app",
    scope: "/",
    display: "standalone",
    background_color: "#0B0C12",
    theme_color: "#0B0C12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
