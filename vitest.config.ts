import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    // 'server-only' throws outside a react-server environment; this condition
    // resolves it (and server modules) the way Next's server bundle does.
    conditions: ["react-server"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
