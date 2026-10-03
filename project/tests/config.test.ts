import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import config from "../react-router.config";

const deploy = JSON.parse(
  readFileSync(new URL("../deploy/config.json", import.meta.url), "utf8"),
) as { domain: string };

describe("React Router configuration", () => {
  it("accepts form submissions from the public domain behind the HTTPS proxy", () => {
    // Behind Caddy the app sees http://<domain> while browsers send
    // Origin: https://<domain>; without this entry every submission is refused.
    expect(config.allowedActionOrigins).toEqual([deploy.domain]);
    expect(deploy.domain).toBe("rehearse.dalan.dev");
  });
});
