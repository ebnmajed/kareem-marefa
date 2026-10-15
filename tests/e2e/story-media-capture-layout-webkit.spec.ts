// The same checks as `story-media-capture-layout.spec.ts`, in WebKit — Safari's engine, the owner's phone. A worker
// option, so it is set at the top of its own file. Skipped in CI, where WebKit is not installed, unless E2E_WEBKIT=1.
import { test } from "@playwright/test";
import { suite } from "./story-media-layout";

test.use({ browserName: "webkit", isMobile: false, hasTouch: true });
test.skip(!!process.env.CI && process.env.E2E_WEBKIT !== "1", "WebKit is not installed in CI");
suite("webkit");
