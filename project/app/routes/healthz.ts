import { getStore } from "~/.server/store";

/**
 * Liveness for the uptime check and the release script: 200 once the database
 * has opened (a refused or broken database makes this fail), never cached.
 */
export function loader() {
  getStore();
  return new Response("ok\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
