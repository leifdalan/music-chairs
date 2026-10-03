import { describe, expect, it } from "vitest";

import { loader } from "../app/routes/healthz";

describe("healthz", () => {
  it("answers ok without caching once the database is open", async () => {
    const response = loader();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok\n");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
