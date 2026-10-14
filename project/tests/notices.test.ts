// Every notice has a tone, and failures read as problems (plan/phase-38.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { scrollToClear } from "../app/components/failure-alert";
import { Notice } from "../app/components/notice";
import { gravest, noticeText, NOTICE_TONES, NOTICES, type NoticeKey } from "../app/lib/notices";

const tone = (wanted: string) =>
  (Object.keys(NOTICE_TONES) as NoticeKey[]).filter((key) => NOTICE_TONES[key] === wanted).sort();

describe("notice tones", () => {
  it("give every notice a tone", () => {
    expect(Object.keys(NOTICE_TONES).sort()).toEqual(Object.keys(NOTICES).sort());
  });

  it("call what failed or was refused a problem, and what was done but not fully a warning", () => {
    expect(tone("problem")).toEqual(
      [
        "signin-failed",
        "signin-expired",
        "google-unavailable",
        "account-taken",
        "calendar-wrong-account",
        "calendar-failed",
        "calendar-unsaved",
        "contacts-wrong-account",
        "contacts-failed",
        "link-gone",
      ].sort(),
    );
    expect(tone("warning")).toEqual(
      [
        "signin-calendar-declined",
        "unverified-email",
        "calendar-partial-busy",
        "calendar-partial-write",
        "contacts-partial",
      ].sort(),
    );
  });

  it("show notices together in the most severe of their tones", () => {
    expect(gravest([])).toBe("info");
    expect(gravest(["info", "warning"])).toBe("warning");
    expect(gravest(["warning", "problem", "info"])).toBe("problem");
    const at = (search: string) => new Request(`https://site.test/x${search}`);
    expect(noticeText(at("?notice=linked"), ["linked", "link-gone"])).toEqual({
      text: NOTICES.linked,
      tone: "info",
    });
    expect(
      noticeText(at("?notice=calendar-partial-busy&notice=calendar-failed"), [
        "calendar-partial-busy",
        "calendar-failed",
      ])?.tone,
    ).toBe("problem");
    // Only the keys asked for.
    expect(noticeText(at("?notice=link-gone"), ["linked"])).toBeNull();
  });

  it("render a problem as an alert in its tone, and the rest as status", () => {
    const html = (wanted: "info" | "warning" | "problem") =>
      renderToString(createElement(Notice, { tone: wanted, children: "Words" }));
    expect(html("problem")).toBe('<p class="notice notice-problem" role="alert">Words</p>');
    expect(html("warning")).toBe('<p class="notice notice-warning" role="status">Words</p>');
    expect(html("info")).toBe('<p class="notice notice-info" role="status">Words</p>');
  });
});

describe("failed saves", () => {
  // A proxy: the cards appear only in the browser, where the browser gate
  // checks they float; here, that every card goes to the root's slot.
  it("float with the toasts, on every page", () => {
    const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
    const alert = read("app/components/failure-alert.tsx");
    expect(alert).not.toMatch(/floating\??:|\bfloating[,}]/);
    expect(alert).toContain(
      'const slot = typeof document !== "undefined" && document.getElementById("failure-slot");',
    );
    for (const path of ["app/components/request-dates.tsx", "app/routes/request.tsx"]) {
      expect(read(path), path).toMatch(/<FailureAlert\b/);
    }
  });
});

describe("a floating card over the focused control", () => {
  it("scrolls just enough to show the control above it", () => {
    expect(scrollToClear(700, 800)).toBe(0);
    expect(scrollToClear(793, 800)).toBe(1);
    expect(scrollToClear(850, 800)).toBe(58);
  });
});
