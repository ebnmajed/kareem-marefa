import type { MetadataRoute } from "next";

// Link-unfurl / social-preview crawlers. These must reach both the HTML (for
// og tags) and /og.png, so they get an explicit Allow group that overrides the
// blanket search block below (robots.txt matches the most-specific UA group).
const previewBots = [
  "facebookexternalhit",
  "WhatsApp",
  "Twitterbot",
  "Slackbot",
  "Slackbot-LinkExpanding",
  "TelegramBot",
  "Discordbot",
  "LinkedInBot",
  "redditbot",
];

/**
 * Internal-facing site: keep it out of search, but let social crawlers scrape
 * the page + OG image so WhatsApp/email/Slack render a rich link preview.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: previewBots, allow: "/" },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
