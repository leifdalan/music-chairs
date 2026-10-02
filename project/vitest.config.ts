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
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
