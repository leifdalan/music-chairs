import { describe, expect, it } from "vitest";

import { DISPLAY_NAME_MAX, GROUP_NAME_MAX, validateName } from "../app/lib/names";

describe("validateName", () => {
  it("trims surrounding whitespace", () => {
    expect(validateName("  Thursday Quartet  ", "Group name", GROUP_NAME_MAX)).toEqual({
      ok: true,
      value: "Thursday Quartet",
    });
  });

  it.each([[""], ["   "], ["\t\n"], [null], [undefined]])("refuses %j as empty", (raw) => {
    expect(validateName(raw, "Your name", DISPLAY_NAME_MAX)).toEqual({
      ok: false,
      error: "Your name is required.",
    });
  });

  it("refuses a name longer than the limit", () => {
    expect(validateName("x".repeat(DISPLAY_NAME_MAX + 1), "Your name", DISPLAY_NAME_MAX)).toEqual({
      ok: false,
      error: `Your name must be at most ${DISPLAY_NAME_MAX} characters.`,
    });
  });

  it("accepts a name exactly at the limit", () => {
    const name = "x".repeat(GROUP_NAME_MAX);
    expect(validateName(name, "Group name", GROUP_NAME_MAX)).toEqual({ ok: true, value: name });
  });

  it("counts a single-code-point emoji as one character", () => {
    const name = "🎻".repeat(DISPLAY_NAME_MAX);
    expect(validateName(name, "Your name", DISPLAY_NAME_MAX)).toEqual({ ok: true, value: name });
  });
});
