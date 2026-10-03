import { readFileSync } from "node:fs";

import type { Config } from "@react-router/dev/config";

// The site's public domain, kept in one place with the deploy settings.
const { domain } = JSON.parse(
  readFileSync(new URL("./deploy/config.json", import.meta.url), "utf8"),
) as { domain: string };

export default {
  ssr: true,
  // Caddy terminates HTTPS and talks to the app over plain HTTP, so the app
  // sees `http://<domain>` while browsers send `Origin: https://<domain>`.
  // React Router refuses such form submissions as cross-site unless the host
  // is listed here; local development has no proxy and needs no entry.
  allowedActionOrigins: [domain],
} satisfies Config;
