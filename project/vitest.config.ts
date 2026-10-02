import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Tests run headlessly in Node. The React Router Vite plugin builds the app;
// it is deliberately absent here so route modules are tested as plain modules.
export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Each test file gets a private in-memory database unless it points the
    // store at a file of its own (see tests/routes.ts).
    env: { MUSIC_CHAIRS_DB: ":memory:" },
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
