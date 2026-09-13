// Setup for the `components` Vitest project (vitest.config.ts).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when the runner exposes a global
// `afterEach`; Vitest does not by default, so unmount explicitly.
afterEach(() => {
  cleanup();
});
