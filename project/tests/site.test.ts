import { describe, expect, it } from "vitest";

import { pageMeta, siteName, siteTagline } from "../app/lib/site";

describe("pageMeta", () => {
  it("titles the home page with the site name alone", () => {
    expect(pageMeta()).toEqual([
      { title: siteName },
      { name: "description", content: siteTagline },
    ]);
  });

  it("brands a named page with the site name", () => {
    expect(pageMeta("Availability")[0]).toEqual({ title: "Availability · music-chairs" });
  });
});
