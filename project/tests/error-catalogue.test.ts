// The error-state catalogue (plan/phase-35.md): the local-only fault switch
// never takes effect outside a local machine, and the committed catalogue has
// every Phase 34 inventory state.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { crashRequested, faultRefusal, faultsOn, googleBase } from "../app/.server/faults";
import { catalogueStates } from "../scripts/error-catalogue/states";
import { INVENTORY } from "./error-states/inventory";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const LOCAL = {
  MUSIC_CHAIRS_FAULTS: "1",
  MUSIC_CHAIRS_PUBLIC_URL: "http://localhost:3990",
  MUSIC_CHAIRS_FAKE_GOOGLE: "http://127.0.0.1:3989",
};

describe("the fault switch", () => {
  it("is off unless MUSIC_CHAIRS_FAULTS is exactly 1, and then Google is Google", () => {
    expect(faultsOn({})).toBe(false);
    expect(faultsOn({ MUSIC_CHAIRS_FAULTS: "true" })).toBe(false);
    expect(faultRefusal({ MUSIC_CHAIRS_FAKE_GOOGLE: "http://127.0.0.1:1" })).toBeNull();
    // A fake address alone changes nothing.
    expect(googleBase({ MUSIC_CHAIRS_FAKE_GOOGLE: "http://127.0.0.1:3989" })).toEqual({
      accounts: "https://accounts.google.com",
      oauth: "https://oauth2.googleapis.com",
      apis: "https://www.googleapis.com",
      people: "https://people.googleapis.com",
    });
  });

  it("sends every Google call to the local fake when on", () => {
    expect(faultRefusal(LOCAL)).toBeNull();
    expect(new Set(Object.values(googleBase(LOCAL)))).toEqual(new Set(["http://127.0.0.1:3989"]));
  });

  it("refuses anything but local addresses, as production would set", () => {
    const refused = (overrides: Record<string, string | undefined>) =>
      faultRefusal({ ...LOCAL, ...overrides });
    expect(refused({ MUSIC_CHAIRS_PUBLIC_URL: "https://rehearse.dalan.dev" })).toMatch(
      /MUSIC_CHAIRS_PUBLIC_URL/,
    );
    expect(refused({ MUSIC_CHAIRS_PUBLIC_URL: undefined })).toMatch(/MUSIC_CHAIRS_PUBLIC_URL/);
    expect(refused({ MUSIC_CHAIRS_PUBLIC_URL: "https://localhost:3990" })).toMatch(/PUBLIC_URL/);
    expect(refused({ MUSIC_CHAIRS_FAKE_GOOGLE: undefined })).toMatch(/MUSIC_CHAIRS_FAKE_GOOGLE/);
    expect(refused({ MUSIC_CHAIRS_FAKE_GOOGLE: "http://fake.example:80" })).toMatch(/FAKE_GOOGLE/);
    // Refused, it never reaches the fake.
    expect(
      googleBase({ ...LOCAL, MUSIC_CHAIRS_PUBLIC_URL: "https://rehearse.dalan.dev" }).oauth,
    ).toBe("https://oauth2.googleapis.com");
  });

  it("stops the server from loading in production with the switch set", async () => {
    vi.stubEnv("MUSIC_CHAIRS_FAULTS", "1");
    vi.stubEnv("MUSIC_CHAIRS_PUBLIC_URL", "https://rehearse.dalan.dev");
    vi.stubEnv("MUSIC_CHAIRS_FAKE_GOOGLE", "http://127.0.0.1:3989");
    vi.resetModules();
    // google.ts, which every Google route loads, brings the refusal with it.
    await expect(import("../app/.server/google")).rejects.toThrow(/refusing to start/);
  });

  it("crashes a page on the fault cookie only in fault mode", () => {
    const request = new Request("http://localhost/", {
      headers: { Cookie: "a=1; mc_fault=crash" },
    });
    expect(crashRequested(request)).toBe(false);
    vi.stubEnv("MUSIC_CHAIRS_FAULTS", "1");
    expect(crashRequested(request)).toBe(true);
    expect(crashRequested(new Request("http://localhost/"))).toBe(false);
  });
});

const CATALOGUE = join(__dirname, "../error-catalogue");

describe("the committed catalogue", () => {
  const { states, unreached } = catalogueStates(INVENTORY);
  const manifest = JSON.parse(readFileSync(join(CATALOGUE, "manifest.json"), "utf8")) as {
    states: { key: string; outcome: string; images: Record<string, string> }[];
  };
  const readme = readFileSync(join(CATALOGUE, "README.md"), "utf8");
  const name = (state: { key: string; outcome: string }) => `${state.key} ${state.outcome}`;

  it("has a way to reach every inventory outcome", () => {
    expect(unreached).toEqual([]);
    const inventory = INVENTORY.flatMap((call) =>
      call.outcomes.map((outcome) => `${call.key} ${outcome.id}`),
    );
    expect(inventory.filter((id) => !states.some((state) => name(state) === id))).toEqual([]);
  });

  it("photographs every state at phone and desktop widths, light and dark, and lists each", () => {
    const photographed = new Map(manifest.states.map((entry) => [name(entry), entry]));
    const problems: string[] = [];
    for (const state of states) {
      const entry = photographed.get(name(state));
      if (!entry) {
        problems.push(`${name(state)}: not in the catalogue`);
        continue;
      }
      const variants = ["phone-light", "phone-dark", "desktop-light", "desktop-dark"];
      for (const variant of variants) {
        const image = entry.images[variant];
        if (!image || !existsSync(join(CATALOGUE, image))) {
          problems.push(`${name(state)}: no ${variant} picture`);
        }
      }
      if (!readme.includes(`### ${state.key} · ${state.outcome}`)) {
        problems.push(`${name(state)}: not in README.md`);
      }
    }
    // Nothing photographed that the inventory no longer has.
    for (const entry of manifest.states) {
      if (!states.some((state) => name(state) === name(entry))) {
        problems.push(`${name(entry)}: no longer a state`);
      }
    }
    expect(problems).toEqual([]);
  });
});
